-- PROPOSAL (NOT a numbered migration, NOT applied to Production, NOT for Production without separate approval): payment verification integrity controls. The number is assigned at release.
-- Rollback: ROLLBACK_payment_integrity_controls.sql. Rehearsals: rehearse_payment_integrity_controls.sh and rehearse_payment_verification_concurrency.py.
--
-- 1. THE RACE (confirmed 9 Nov: two payments of USD 700 on a USD 1,000 receivable, verified at the same instant, both approved, USD 1,400 credited, 25 of 25 rounds). verify_bank_transfer_payment() locked
--    only the payment it was deciding, then read "completed so far" with no lock on the record. It now takes a transaction-scoped advisory lock keyed on the RECEIVABLE (entity type + id) before reading
--    anything, so decisions on the same record run one after another; the later one sees the earlier credit and is refused (would_overpay_receivable) if it no longer fits.
-- 2. A BACKSTOP IN THE TABLE. A trigger refuses ANY bank-transfer row becoming 'completed' (by any code path, not just that function) if it would credit more than the record still owes, under the same lock.
--    It never blocks a card payment: money the provider has already collected cannot be refused. Card over-collection is FLAGGED instead (3).
-- 3. A REVIEW STATE THAT IS NOT A STATUS. payment_review_cases is an additive table: an open case says "a person must look at this payment" (card amount mismatch where the customer may have been charged,
--    a completion that arrived after a failure, a card payment that took the total above what is owed, a provider reference that could not be recorded). Payment statuses, the claim table, the audit log and
--    every existing row are unchanged, so nothing that reads payments.status needs to learn a new value. Cases are opened by functions (idempotent: one open case per payment and reason) and closed only
--    by an authorised person with a written resolution; nothing is deleted.
-- 4. THE BANK'S REFERENCE gets its own column. Verified bank transfers used to write the bank's transaction reference into gateway_reference, the column the card provider's webhook looks payments up by.
--    New verifications write payments.bank_transaction_reference instead. Existing rows are NOT touched (no backfill, no rewrite): readers show bank_transaction_reference, falling back to gateway_reference
--    for bank rows written before this change. The one-approved-credit-per-bank-reference rule lives in bank_transfer_verifications and is unchanged.
-- Compatibility: additive column and table, two triggers, one replaced function (same signature, same errors, same results). No existing row, constraint, index or audit record is modified.
begin;

alter table public.payments add column if not exists bank_transaction_reference text;
comment on column public.payments.bank_transaction_reference is 'The bank''s own transaction reference for a verified bank transfer, kept apart from gateway_reference (which belongs to the card provider). Null on rows written before this column existed: read gateway_reference for those.';

-- ---------------------------------------------------------------- review cases
create table if not exists public.payment_review_cases (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id),
  reason text not null check (reason in ('amount_mismatch', 'completion_conflict', 'over_collection', 'reference_unrecorded')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  detail jsonb not null default '{}'::jsonb,
  opened_source text not null default 'system',
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id),
  resolution text check (resolution in ('confirmed_not_charged', 'refunded_or_credited_manually', 'recorded_as_payment', 'other')),
  resolution_note text,
  constraint payment_review_cases_resolved_complete check (status = 'open' or (resolved_at is not null and resolved_by is not null and resolution is not null and char_length(btrim(coalesce(resolution_note, ''))) >= 10))
);
create unique index if not exists payment_review_cases_one_open_per_reason on public.payment_review_cases (payment_id, reason) where status = 'open';
create index if not exists payment_review_cases_open_idx on public.payment_review_cases (opened_at) where status = 'open';
alter table public.payment_review_cases enable row level security;
drop policy if exists "payment_review_cases: super admin read" on public.payment_review_cases;
create policy "payment_review_cases: super admin read" on public.payment_review_cases for select to authenticated using ((select private.has_role('super_admin')));
revoke all on public.payment_review_cases from authenticated, anon, service_role;
grant select on public.payment_review_cases to authenticated, service_role;        -- writes only through the two functions below

create or replace function public.open_payment_review_case(p_payment_id uuid, p_reason text, p_detail jsonb, p_source text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.payment_review_cases (payment_id, reason, detail, opened_source) values (p_payment_id, p_reason, coalesce(p_detail, '{}'::jsonb), coalesce(nullif(btrim(p_source), ''), 'system'))
    on conflict (payment_id, reason) where status = 'open' do nothing returning id into v_id;
  if v_id is null then select id into v_id from public.payment_review_cases where payment_id = p_payment_id and reason = p_reason and status = 'open'; end if;
  return v_id;
end $$;
revoke all on function public.open_payment_review_case(uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.open_payment_review_case(uuid, text, jsonb, text) to service_role;

create or replace function public.resolve_payment_review_case(p_case_id uuid, p_resolver uuid, p_resolution text, p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.payment_review_cases%rowtype;
begin
  if p_resolver is null or not private.can_verify_bank_transfers(p_resolver) then raise exception 'resolver_not_authorized'; end if;
  select * into v from public.payment_review_cases where id = p_case_id for update;
  if not found then raise exception 'case_not_found'; end if;
  if v.status <> 'open' then raise exception 'case_already_resolved'; end if;
  if p_resolution not in ('confirmed_not_charged', 'refunded_or_credited_manually', 'recorded_as_payment', 'other') then raise exception 'invalid_resolution'; end if;
  if char_length(btrim(coalesce(p_note, ''))) < 10 then raise exception 'note_required'; end if;
  update public.payment_review_cases set status = 'resolved', resolved_at = now(), resolved_by = p_resolver, resolution = p_resolution, resolution_note = btrim(p_note) where id = p_case_id;
  return jsonb_build_object('case_id', p_case_id, 'payment_id', v.payment_id, 'reason', v.reason, 'resolution', p_resolution);
end $$;
revoke all on function public.resolve_payment_review_case(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.resolve_payment_review_case(uuid, uuid, text, text) to service_role;

-- ---------------------------------------------------------------- the lock-protected verification function
create or replace function public.verify_bank_transfer_payment(
  p_payment_id uuid,
  p_decision text,
  p_verifier uuid,
  p_received_amount numeric,
  p_received_currency text,
  p_bank_reference text,
  p_received_date date,
  p_independent_check boolean,
  p_internal_notes text,
  p_client_message text,
  p_acknowledge_excess boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.payments%rowtype;
  v_credited numeric(12, 2);
  v_excess numeric(12, 2) := 0;
  v_partial boolean := false;
  v_due numeric;
  v_paid numeric;
  v_now timestamptz := now();
  v_entity_type text;
  v_entity_id text;
begin
  if p_decision not in ('approved', 'rejected', 'info_requested') then raise exception 'invalid_decision'; end if;

  if p_verifier is null or not private.can_verify_bank_transfers(p_verifier) then raise exception 'verifier_not_authorized'; end if;

  -- INTEGRITY LOCK (9 Nov 2026): serialise every decision on the same RECEIVABLE. The row lock below protects only this one payment, so two payments of one record verified at the same instant
  -- each saw nothing credited yet and both passed the overpay check. The lock is keyed on the record, taken before anything is read, and released automatically when the transaction ends.
  select entity_type, entity_id into v_entity_type, v_entity_id from public.payments where id = p_payment_id;
  if not found then raise exception 'payment_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ordift:payment-entity:' || v_entity_type || ':' || v_entity_id, 0));
  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then raise exception 'payment_not_found'; end if;
  if v_pay.payment_method <> 'bank_transfer' then raise exception 'not_bank_transfer'; end if;
  if v_pay.status <> 'awaiting_verification' then raise exception 'not_awaiting_verification'; end if;
  -- separation of duties: whoever submitted the evidence or is the payer cannot verify it
  if p_verifier = v_pay.user_id or p_verifier = v_pay.submitted_by then raise exception 'verifier_is_submitter'; end if;

  if p_decision = 'rejected' then
    if char_length(btrim(coalesce(p_internal_notes, ''))) < 5 then raise exception 'reason_required'; end if;
    update public.payments set status = 'rejected', reviewed_by = p_verifier, reviewed_at = v_now,
      review_notes = btrim(p_internal_notes), client_visible_note = nullif(btrim(coalesce(p_client_message, '')), '')
     where id = p_payment_id;
    insert into public.bank_transfer_verifications (payment_id, decision, decided_by, decided_at, expected_amount, expected_currency, expected_reference_usd, exchange_rate,
        receiving_bank_account_id, proof_path, independent_check_confirmed, internal_notes, client_message)
      values (p_payment_id, 'rejected', p_verifier, v_now, v_pay.converted_amount, v_pay.payment_currency, v_pay.reference_amount_usd, v_pay.exchange_rate,
        v_pay.receiving_bank_account_id, v_pay.proof_of_payment_asset_path, coalesce(p_independent_check, false), btrim(p_internal_notes), nullif(btrim(coalesce(p_client_message, '')), ''));
    return jsonb_build_object('decision', 'rejected', 'status', 'rejected');
  end if;

  if p_decision = 'info_requested' then
    if char_length(btrim(coalesce(p_client_message, ''))) < 5 then raise exception 'message_required'; end if;
    update public.payments set status = 'additional_info_required', reviewed_by = p_verifier, reviewed_at = v_now,
      review_notes = nullif(btrim(coalesce(p_internal_notes, '')), ''), client_visible_note = btrim(p_client_message)
     where id = p_payment_id;
    insert into public.bank_transfer_verifications (payment_id, decision, decided_by, decided_at, expected_amount, expected_currency, expected_reference_usd, exchange_rate,
        receiving_bank_account_id, proof_path, independent_check_confirmed, internal_notes, client_message)
      values (p_payment_id, 'info_requested', p_verifier, v_now, v_pay.converted_amount, v_pay.payment_currency, v_pay.reference_amount_usd, v_pay.exchange_rate,
        v_pay.receiving_bank_account_id, v_pay.proof_of_payment_asset_path, coalesce(p_independent_check, false), nullif(btrim(coalesce(p_internal_notes, '')), ''), btrim(p_client_message));
    return jsonb_build_object('decision', 'info_requested', 'status', 'additional_info_required');
  end if;

  -- ---- approved: only after the verifier states the receiving account was independently checked
  if not coalesce(p_independent_check, false) then raise exception 'independent_check_required'; end if;
  if p_received_amount is null or p_received_amount <= 0 then raise exception 'received_amount_required'; end if;
  if p_received_currency is null or p_received_currency <> v_pay.payment_currency then raise exception 'currency_mismatch'; end if;
  if char_length(btrim(coalesce(p_bank_reference, ''))) < 3 then raise exception 'bank_reference_required'; end if;
  if p_received_date is null or p_received_date > current_date + 1 then raise exception 'received_date_invalid'; end if;
  if v_pay.receiving_bank_account_id is null then raise exception 'no_receiving_account'; end if;

  p_received_amount := round(p_received_amount, 2);
  if p_received_amount < v_pay.converted_amount - 0.005 then
    v_partial := true;
    v_credited := round(p_received_amount / v_pay.exchange_rate, 2);
  else
    v_credited := v_pay.reference_amount_usd;
    v_excess := greatest(round(p_received_amount - v_pay.converted_amount, 2), 0);
    if v_excess > 0.005 and not coalesce(p_acknowledge_excess, false) then raise exception 'excess_not_acknowledged'; end if;
  end if;
  if v_credited <= 0 then raise exception 'credit_too_small'; end if;

  -- never post more than the receivable still owes
  if v_pay.entity_type = 'enquiry' then
    select amount_due into v_due from public.enquiries where id = v_pay.entity_id::uuid;
  else
    select amount_due into v_due from public.workshop_registrations where id = v_pay.entity_id::uuid;
  end if;
  if v_due is null or v_due <= 0 then raise exception 'no_receivable'; end if;
  select coalesce(sum(case when payment_type = 'refund' then -reference_amount_usd else reference_amount_usd end), 0) into v_paid
    from public.payments where entity_type = v_pay.entity_type and entity_id = v_pay.entity_id and status = 'completed';
  if v_credited > greatest(v_due - v_paid, 0) + 0.005 then raise exception 'would_overpay_receivable'; end if;

  begin
    insert into public.bank_transfer_verifications (payment_id, decision, decided_by, decided_at, expected_amount, expected_currency, expected_reference_usd, exchange_rate,
        receiving_bank_account_id, proof_path, received_amount, received_currency, bank_reference, received_date, independent_check_confirmed,
        credited_reference_usd, excess_received, internal_notes, client_message)
      values (p_payment_id, 'approved', p_verifier, v_now, v_pay.converted_amount, v_pay.payment_currency, v_pay.reference_amount_usd, v_pay.exchange_rate,
        v_pay.receiving_bank_account_id, v_pay.proof_of_payment_asset_path, p_received_amount, p_received_currency, btrim(p_bank_reference), p_received_date, true,
        v_credited, v_excess, nullif(btrim(coalesce(p_internal_notes, '')), ''), nullif(btrim(coalesce(p_client_message, '')), ''));
  exception when unique_violation then
    raise exception 'duplicate_bank_reference';
  end;

  update public.payments set
      status = 'completed',
      reference_amount_usd = v_credited,
      converted_amount = case when v_partial then p_received_amount else converted_amount end,
      amount_collected = p_received_amount,
      settlement_currency = p_received_currency,
      bank_transaction_reference = btrim(p_bank_reference),          -- the bank's reference is kept apart from the card provider's gateway_reference
      payment_type = case when v_partial and payment_type in ('full', 'balance') then 'partial' else payment_type end,
      reviewed_by = p_verifier, reviewed_at = v_now,
      review_notes = nullif(btrim(coalesce(p_internal_notes, '')), ''), client_visible_note = null
    where id = p_payment_id;

  return jsonb_build_object('decision', 'approved', 'status', 'completed', 'credited_reference_usd', v_credited, 'excess_received', v_excess, 'partial', v_partial);
end;
$$;
revoke all on function public.verify_bank_transfer_payment(uuid, text, uuid, numeric, text, text, date, boolean, text, text, boolean) from public, anon, authenticated;
grant execute on function public.verify_bank_transfer_payment(uuid, text, uuid, numeric, text, text, date, boolean, text, text, boolean) to service_role;

-- ---------------------------------------------------------------- the backstops in the table
-- (a) a bank-transfer row may not become 'completed' if it would credit more than the record still owes
create or replace function private.payments_bank_completion_guard() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_due numeric; v_paid numeric;
begin
  if new.payment_method <> 'bank_transfer' or new.status <> 'completed' or new.payment_type = 'refund' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'completed' then return new; end if;           -- already counted: not a new credit
  perform pg_advisory_xact_lock(hashtextextended('ordift:payment-entity:' || new.entity_type || ':' || new.entity_id, 0));
  if new.entity_type = 'enquiry' then select amount_due into v_due from public.enquiries where id = new.entity_id::uuid;
  else select amount_due into v_due from public.workshop_registrations where id = new.entity_id::uuid; end if;
  if v_due is null or v_due <= 0 then return new; end if;                              -- nothing to bound against (the verification function refuses these itself)
  select coalesce(sum(case when payment_type = 'refund' then -reference_amount_usd else reference_amount_usd end), 0) into v_paid
    from public.payments where entity_type = new.entity_type and entity_id = new.entity_id and status = 'completed' and id <> new.id;
  if new.reference_amount_usd > greatest(v_due - v_paid, 0) + 0.005 then raise exception 'would_overpay_receivable'; end if;
  return new;
end $$;
revoke all on function private.payments_bank_completion_guard() from public, anon, authenticated, service_role;
drop trigger if exists payments_bank_completion_guard on public.payments;
create trigger payments_bank_completion_guard before insert or update of status on public.payments for each row execute function private.payments_bank_completion_guard();

-- (b) a CARD payment that takes the total above what is owed is never refused (the money has been collected) but opens a review case
create or replace function private.payments_card_overcollection_flag() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_due numeric; v_total numeric;
begin
  if new.payment_method <> 'gateway' or new.status <> 'completed' or new.payment_type = 'refund' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'completed' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('ordift:payment-entity:' || new.entity_type || ':' || new.entity_id, 0));
  if new.entity_type = 'enquiry' then select amount_due into v_due from public.enquiries where id = new.entity_id::uuid;
  else select amount_due into v_due from public.workshop_registrations where id = new.entity_id::uuid; end if;
  if v_due is null or v_due <= 0 then return new; end if;
  select coalesce(sum(case when payment_type = 'refund' then -reference_amount_usd else reference_amount_usd end), 0) into v_total
    from public.payments where entity_type = new.entity_type and entity_id = new.entity_id and status = 'completed';
  if v_total > v_due + 0.005 then
    insert into public.payment_review_cases (payment_id, reason, detail, opened_source)
      values (new.id, 'over_collection', jsonb_build_object('amountDueUsd', v_due, 'completedTotalUsd', v_total, 'thisPaymentUsd', new.reference_amount_usd), 'database')
      on conflict (payment_id, reason) where status = 'open' do nothing;
  end if;
  return new;
end $$;
revoke all on function private.payments_card_overcollection_flag() from public, anon, authenticated, service_role;
drop trigger if exists payments_card_overcollection_flag on public.payments;
create trigger payments_card_overcollection_flag after insert or update of status on public.payments for each row execute function private.payments_card_overcollection_flag();

commit;
