-- Direct Bank Transfer (Qatar first) — extends the EXISTING payments foundation (0024). No new
-- payment ledger, receivable system or Finance module: payments / enquiries / activity_log /
-- payment-proofs / exchange_rates / payment_country_config are reused.
--
-- What this adds (all additive; no existing row is rewritten):
--   1. bank_accounts: classification (personal|corporate), default-per-market, an explicit
--      activation-confirmation record (DB-enforced: an account cannot be active without it),
--      created/updated by. New accounts default to INACTIVE. Reads/writes move to server-side
--      only (the broad "any authenticated user may read active accounts" policy is removed).
--   2. payments: receiving-account link + immutable snapshot of what the client was told,
--      client-entered bank reference/transfer date, a client-visible note, and the status
--      'additional_info_required'.
--   3. bank_transfer_verifications: append-only decision history (approve/reject/info request)
--      with what was actually received, independent-bank-check confirmation, evidence path.
--      One approved verification per payment, and one approved credit per bank reference per
--      receiving account (a bank credit can never be posted twice).
--   4. verify_bank_transfer_payment(): ONE atomic, row-locked decision function (service role
--      only). It blocks currency mismatch, silent overpayment, self-verification and posting
--      beyond the receivable; credits exactly what was received (partial handled).
--   5. enquiries.payment_country (nullable; null = existing Ghana behaviour) and an INACTIVE
--      Qatar row in payment_country_config (bank transfer only — never routed to Paystack).
--   6. payment-proofs storage: staff-wide read narrowed to the owner and Super Admin.
--   7. Verification is restricted to Super Admin and holders of the explicit authority grant
--      'finance.bank_transfer.verify' — enforced INSIDE the database function, not only in the app.
--      A general admin or staff role confers nothing.
begin;

-- ------------------------------------------------------------------ 1. bank_accounts
alter table public.bank_accounts
  add column account_classification text not null default 'corporate' check (account_classification in ('personal', 'corporate')),
  add column is_default boolean not null default false,
  add column activation_confirmed_by uuid references public.profiles (id),
  add column activation_confirmed_at timestamptz,
  add column activation_basis text,
  add column deactivated_at timestamptz,
  add column created_by uuid references public.profiles (id),
  add column updated_by uuid references public.profiles (id);
alter table public.bank_accounts alter column account_classification drop default;
alter table public.bank_accounts alter column is_active set default false;

-- NOT VALID: applies to every new/changed row, never rewrites or invalidates a pre-existing one.
alter table public.bank_accounts
  add constraint bank_accounts_active_requires_confirmation check (not is_active or activation_confirmed_at is not null) not valid,
  add constraint bank_accounts_default_requires_active check (not is_default or is_active) not valid,
  add constraint bank_accounts_personal_requires_basis check (account_classification <> 'personal' or not is_active or char_length(btrim(coalesce(activation_basis, ''))) >= 20) not valid;

create unique index bank_accounts_one_default_per_market on public.bank_accounts (country, currency_code) where is_default;

drop policy if exists "bank_accounts: readable by authenticated" on public.bank_accounts;
drop policy if exists "bank_accounts: admin manage" on public.bank_accounts;
drop policy if exists "bank_accounts: staff manage" on public.bank_accounts;
create policy "bank_accounts: super admin read" on public.bank_accounts
  for select to authenticated using ((select private.has_role('super_admin')));
revoke insert, update, delete on public.bank_accounts from authenticated;
revoke all on public.bank_accounts from anon; -- default privileges would otherwise leave anon with table-level rights (inert behind RLS; removed as defence in depth)
grant select, insert, update on public.bank_accounts to service_role;

-- ------------------------------------------------------------------ 2. payments
alter table public.payments
  add column receiving_bank_account_id uuid references public.bank_accounts (id),
  add column receiving_account_snapshot jsonb,
  add column client_bank_reference text,
  add column client_transfer_date date,
  add column client_visible_note text;

alter table public.payments drop constraint payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('pending', 'awaiting_verification', 'additional_info_required', 'completed', 'failed', 'refunded', 'rejected'));

-- ------------------------------------------------------------------ 3. verification history
create table public.bank_transfer_verifications (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id),
  decision text not null check (decision in ('approved', 'rejected', 'info_requested')),
  decided_by uuid not null references public.profiles (id),
  decided_at timestamptz not null default now(),
  -- what the client was asked to transfer (snapshot at decision time)
  expected_amount numeric(12, 2) not null,
  expected_currency text not null,
  expected_reference_usd numeric(12, 2) not null,
  exchange_rate numeric(14, 6) not null,
  receiving_bank_account_id uuid references public.bank_accounts (id),
  proof_path text,
  -- what the verifier found in the receiving account
  received_amount numeric(12, 2),
  received_currency text,
  bank_reference text,
  received_date date,
  independent_check_confirmed boolean not null default false,
  credited_reference_usd numeric(12, 2),
  excess_received numeric(12, 2),
  internal_notes text,
  client_message text,
  constraint bank_transfer_verifications_approved_complete check (
    decision <> 'approved' or (
      received_amount > 0 and received_currency is not null and char_length(btrim(coalesce(bank_reference, ''))) >= 3
      and received_date is not null and independent_check_confirmed and credited_reference_usd > 0
    )
  ),
  constraint bank_transfer_verifications_rejected_reason check (decision <> 'rejected' or char_length(btrim(coalesce(internal_notes, ''))) >= 5),
  constraint bank_transfer_verifications_info_message check (decision <> 'info_requested' or char_length(btrim(coalesce(client_message, ''))) >= 5)
);
create unique index bank_transfer_verifications_one_approval on public.bank_transfer_verifications (payment_id) where decision = 'approved';
create unique index bank_transfer_verifications_bank_credit_once on public.bank_transfer_verifications (receiving_bank_account_id, lower(btrim(bank_reference)))
  where decision = 'approved' and receiving_bank_account_id is not null;
create index bank_transfer_verifications_payment_idx on public.bank_transfer_verifications (payment_id, decided_at);

alter table public.bank_transfer_verifications enable row level security;
create policy "bank_transfer_verifications: super admin read" on public.bank_transfer_verifications
  for select to authenticated using ((select private.has_role('super_admin')));
-- Append-only: no update/delete is granted to anyone.
revoke all on public.bank_transfer_verifications from authenticated, anon;
grant select on public.bank_transfer_verifications to authenticated;
-- Supabase's default privileges give service_role ALL on new tables; take update/delete away so the
-- history really is append-only even for server code.
revoke all on public.bank_transfer_verifications from service_role;
grant select, insert on public.bank_transfer_verifications to service_role;

-- ------------------------------------------------------------------ 4. the atomic decision
-- Who may verify a bank transfer: a Super Admin, or someone holding the explicit, current,
-- un-revoked global authority grant 'finance.bank_transfer.verify'. NOT a general admin or staff role.
create or replace function private.can_verify_bank_transfers(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles pr
    where pr.id = p_profile and pr.access_status = 'active'
      and (
        exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = p_profile and r.slug = 'super_admin')
        or exists (
          select 1 from public.authority_grants g
          where g.profile_id = p_profile and g.authority = 'finance.bank_transfer.verify' and g.scope_department_id is null
            and g.revoked_at is null and g.effective_at <= now() and (g.expires_at is null or g.expires_at > now())
        )
      )
  );
$$;
revoke all on function private.can_verify_bank_transfers(uuid) from public, anon, authenticated, service_role;

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
begin
  if p_decision not in ('approved', 'rejected', 'info_requested') then raise exception 'invalid_decision'; end if;

  if p_verifier is null or not private.can_verify_bank_transfers(p_verifier) then raise exception 'verifier_not_authorized'; end if;

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
      gateway_reference = btrim(p_bank_reference),
      payment_type = case when v_partial and payment_type in ('full', 'balance') then 'partial' else payment_type end,
      reviewed_by = p_verifier, reviewed_at = v_now,
      review_notes = nullif(btrim(coalesce(p_internal_notes, '')), ''), client_visible_note = null
    where id = p_payment_id;

  return jsonb_build_object('decision', 'approved', 'status', 'completed', 'credited_reference_usd', v_credited, 'excess_received', v_excess, 'partial', v_partial);
end;
$$;
revoke all on function public.verify_bank_transfer_payment(uuid, text, uuid, numeric, text, text, date, boolean, text, text, boolean) from public, anon, authenticated;
grant execute on function public.verify_bank_transfer_payment(uuid, text, uuid, numeric, text, text, date, boolean, text, text, boolean) to service_role;

-- ------------------------------------------------------------------ 5. market flag + inactive Qatar config
alter table public.enquiries
  add column payment_country text check (payment_country is null or payment_country in ('GH', 'QA'));
comment on column public.enquiries.payment_country is
  'Payment market for this client''s Pay Now flow. NULL = existing behaviour (Ghana / Paystack). QA = Direct Bank Transfer into the active default Qatar receiving account. Set deliberately by an authorised administrator.';

-- Bank transfer only (never a Paystack route) and INACTIVE until an administrator activates it.
insert into public.payment_country_config (country, default_currency_code, gateway_provider, is_active)
  values ('QA', 'QAR', 'bank_transfer', false)
  on conflict (country) do nothing;

-- ------------------------------------------------------------------ 6. proof storage read narrowed
drop policy if exists "payment-proofs: owner or staff read" on storage.objects;
create policy "payment-proofs: owner or super admin read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (
      (select private.has_role('super_admin'))
      or exists (
        select 1 from public.payments
        where payments.id::text = (storage.foldername(name))[1]
        and payments.user_id = auth.uid()
      )
    )
  );

commit;
