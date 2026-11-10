-- 0187 — payment arrangements and direct payments for equipment acquisitions that are NOT financed by an instalment provider. Byte-for-byte the rehearsed proposal body below; applied to Production only after the Founder's written approval of this file's SHA-256.
-- Depends on migration 0186 (live). Rollback (refuses if any row exists): supabase/proposals/ROLLBACK_acquisition_payment_arrangements.sql. Rehearsals: supabase/proposals/rehearse_payment_arrangements.sh and rehearse_payment_concurrency.sh.
--
-- WHY. 0186 records the PURCHASE (entity_equipment_acquisitions) and an optional instalment FINANCING agreement. A purchase paid outright, by deposit and balance, on supplier credit, or not yet paid had nowhere to record
-- how it is to be paid or what was paid. This adds exactly that and nothing else; cost, what is owed and payments stay apart, and nothing here creates an expense, a classification or a bank verification.
--   entity_acquisition_terms     the ARRANGEMENT (paid_in_full / deposit_and_balance / supplier_credit / unpaid). Append-only versions: a change supersedes the current row. NO row = "arrangement to confirm" (the safe default).
--                                An acquisition with a financing agreement is 'financed' by derivation and cannot carry terms.
--   entity_acquisition_payments  the PAYMENTS (kind full/deposit/balance/part; METHOD cash/company card/bank transfer/cheque/other is separate from the arrangement). Needs evidence (a stored document of the same
--                                entity OR a written note). A recorded payment is "reported, awaiting statement": there is deliberately NO statement-verification column in this migration.
--   record_acquisition_bundle    ONE atomic call for a non-financed purchase: purchase + terms + first payment (all or nothing).
-- Invariants live in the DATABASE (triggers that lock the acquisition row), so they hold for every writer and under concurrency: payments can never exceed the net price; a financed acquisition refuses direct payments
-- (no double counting); no payment while the arrangement is 'unpaid'; same entity and currency; documents from the same entity; append-only (a payment can only be voided, with a reason).
-- Existing objects: only the CHECK list of allowed audit event types on entity_finance_events is widened (the table is empty in Production). Nothing else existing is altered.
begin;

alter table public.entity_finance_events drop constraint entity_finance_events_event_type_check;
alter table public.entity_finance_events add constraint entity_finance_events_event_type_check
  check (event_type in ('acquisition_recorded', 'financing_recorded', 'instalment_paid', 'classification_decided', 'funding_confirmed', 'bank_evidence_linked', 'voided', 'terms_set', 'payment_recorded', 'payment_voided'));

-- ---------------------------------------------------------------------------------------------------------------- terms
create table public.entity_acquisition_terms (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  employing_entity_id uuid not null references public.employing_entities (id),
  acquisition_id uuid not null references public.entity_equipment_acquisitions (id),
  arrangement text not null check (arrangement in ('paid_in_full', 'deposit_and_balance', 'supplier_credit', 'unpaid')),
  balance_due_on date,                                              -- as stated on the supplier's document; never invented
  supplier_terms text check (supplier_terms is null or char_length(btrim(supplier_terms)) between 3 and 500),
  note text check (note is null or char_length(note) <= 1000),
  status text not null default 'current' check (status in ('current', 'superseded')),
  set_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint terms_due_shape check (case arrangement when 'supplier_credit' then balance_due_on is not null when 'paid_in_full' then balance_due_on is null when 'unpaid' then balance_due_on is null else true end)
);
create unique index terms_one_current on public.entity_acquisition_terms (acquisition_id) where status = 'current';
comment on table public.entity_acquisition_terms is 'How ONE non-financed acquisition is to be paid. Absent row = arrangement to confirm. Never a payment, an expense or a classification.';

create or replace function private.terms_guard() returns trigger language plpgsql set search_path = '' as $$
declare a record;
begin
  if tg_op = 'DELETE' then raise exception 'entity_acquisition_terms is append-only' using errcode = '42501'; end if;
  if tg_op = 'UPDATE' then
    if (new.employing_entity_id, new.acquisition_id, new.arrangement, new.balance_due_on, new.supplier_terms, new.note, new.set_by, new.created_at) is distinct from
       (old.employing_entity_id, old.acquisition_id, old.arrangement, old.balance_due_on, old.supplier_terms, old.note, old.set_by, old.created_at) or old.status <> 'current' or new.status <> 'superseded' then
      raise exception 'terms can only be superseded by a newer version' using errcode = '42501'; end if;
    return new;
  end if;
  select * into a from public.entity_equipment_acquisitions where id = new.acquisition_id for update;
  if not found or a.status <> 'recorded' then raise exception 'the acquisition is not a recorded acquisition' using errcode = '42501'; end if;
  if a.employing_entity_id <> new.employing_entity_id then raise exception 'the acquisition belongs to another entity' using errcode = '42501'; end if;
  if new.status <> 'current' then raise exception 'new terms are always current' using errcode = '42501'; end if;
  if exists (select 1 from public.entity_financing_obligations o where o.acquisition_id = a.id and o.status <> 'void') then
    raise exception 'a financed acquisition is paid through its instalments and cannot carry payment terms' using errcode = '42501'; end if;
  if new.balance_due_on is not null and new.balance_due_on < a.purchase_date then raise exception 'the balance due date cannot be before the purchase date' using errcode = '42501'; end if;
  if new.arrangement = 'unpaid' and exists (select 1 from public.entity_acquisition_payments p where p.acquisition_id = a.id and p.status = 'recorded') then
    raise exception 'payments are already recorded, so the arrangement cannot be "unpaid"' using errcode = '42501'; end if;
  return new;
end $$;
revoke all on function private.terms_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------- payments
create table public.entity_acquisition_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  employing_entity_id uuid not null references public.employing_entities (id),
  acquisition_id uuid not null references public.entity_equipment_acquisitions (id),
  kind text not null check (kind in ('full', 'deposit', 'balance', 'part')),
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  paid_on date not null,
  method text not null check (method in ('cash', 'company_credit_card', 'company_debit_card', 'bank_transfer', 'cheque', 'other')),
  method_note text check (method_note is null or char_length(btrim(method_note)) between 3 and 200),
  reference text check (reference is null or char_length(btrim(reference)) between 1 and 80),     -- cheque number, transfer reference ...
  evidence_document_id uuid references public.employing_entity_documents (id),
  evidence_note text check (evidence_note is null or char_length(evidence_note) <= 1000),
  status text not null default 'recorded' check (status in ('recorded', 'void')),
  void_reason text,
  voided_by uuid references public.profiles (id),
  voided_at timestamptz,
  recorded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint payments_evidence check (evidence_document_id is not null or char_length(btrim(coalesce(evidence_note, ''))) >= 10),
  constraint payments_other_method check (method <> 'other' or char_length(btrim(coalesce(method_note, ''))) >= 3),
  constraint payments_void_shape check ((status = 'void') = (void_reason is not null and voided_by is not null and voided_at is not null))
);
create index payments_acquisition_idx on public.entity_acquisition_payments (acquisition_id, paid_on);
comment on table public.entity_acquisition_payments is 'A payment made for ONE non-financed acquisition: reported with evidence, awaiting statement. Never an expense, never bank-verified here.';

create or replace function private.payments_guard() returns trigger language plpgsql set search_path = '' as $$
declare a record; paid numeric;
begin
  if tg_op = 'DELETE' then raise exception 'entity_acquisition_payments is append-only: void a mistaken payment instead' using errcode = '42501'; end if;
  if tg_op = 'UPDATE' then
    if (new.employing_entity_id, new.acquisition_id, new.kind, new.amount, new.currency, new.paid_on, new.method, new.method_note, new.reference, new.evidence_document_id, new.evidence_note, new.recorded_by, new.created_at) is distinct from
       (old.employing_entity_id, old.acquisition_id, old.kind, old.amount, old.currency, old.paid_on, old.method, old.method_note, old.reference, old.evidence_document_id, old.evidence_note, old.recorded_by, old.created_at)
       or old.status <> 'recorded' or new.status <> 'void' then
      raise exception 'a recorded payment cannot be edited; void it with a reason and record a correction' using errcode = '42501'; end if;
    return new;
  end if;
  -- INSERT: lock the acquisition first so two simultaneous payments are checked one after the other
  select * into a from public.entity_equipment_acquisitions where id = new.acquisition_id for update;
  if not found or a.status <> 'recorded' then raise exception 'the acquisition is not a recorded acquisition' using errcode = '42501'; end if;
  if a.employing_entity_id <> new.employing_entity_id then raise exception 'the acquisition belongs to another entity' using errcode = '42501'; end if;
  if a.currency <> new.currency then raise exception 'the payment currency (%) must be the acquisition currency (%)', new.currency, a.currency using errcode = '42501'; end if;
  if new.status <> 'recorded' then raise exception 'a new payment is always recorded' using errcode = '42501'; end if;
  if new.paid_on > current_date then raise exception 'the payment date cannot be in the future' using errcode = '42501'; end if;
  if exists (select 1 from public.entity_financing_obligations o where o.acquisition_id = a.id and o.status <> 'void') then
    raise exception 'a financed acquisition is paid through its instalments; direct payments would count the same money twice' using errcode = '42501'; end if;
  if exists (select 1 from public.entity_acquisition_terms t where t.acquisition_id = a.id and t.status = 'current' and t.arrangement = 'unpaid') then
    raise exception 'the arrangement is "unpaid"; change the arrangement before recording a payment' using errcode = '42501'; end if;
  if new.evidence_document_id is not null and not private.finance_doc_ok(new.evidence_document_id, new.employing_entity_id, array['other_financial_document', 'supplier_invoice', 'purchase_receipt']) then
    raise exception 'payment evidence must be a financial document in THIS entity''s vault' using errcode = '42501'; end if;
  select coalesce(sum(p.amount), 0) into paid from public.entity_acquisition_payments p where p.acquisition_id = a.id and p.status = 'recorded';
  if paid + new.amount > a.net_amount then
    raise exception 'payments would total % but the net price is % (already paid %)', paid + new.amount, a.net_amount, paid using errcode = '42501'; end if;
  if new.kind = 'full' and (paid > 0 or new.amount <> a.net_amount) then raise exception 'a full payment must equal the net price and be the only payment' using errcode = '42501'; end if;
  if exists (select 1 from public.entity_acquisition_payments p where p.acquisition_id = a.id and p.status = 'recorded' and p.amount = new.amount and p.paid_on = new.paid_on and p.method = new.method
             and coalesce(btrim(p.reference), '') = coalesce(btrim(new.reference), '')) then
    raise exception 'an identical payment (same amount, date, method and reference) is already recorded' using errcode = '23505'; end if;
  return new;
end $$;
revoke all on function private.payments_guard() from public, anon, authenticated;

create trigger terms_guard before insert or update or delete on public.entity_acquisition_terms for each row execute function private.terms_guard();
create trigger payments_guard before insert or update or delete on public.entity_acquisition_payments for each row execute function private.payments_guard();

-- ---------------------------------------------------------------------------------------------------------------- privileges
alter table public.entity_acquisition_terms enable row level security;
alter table public.entity_acquisition_payments enable row level security;
create policy "entity_acquisition_terms: super admin only" on public.entity_acquisition_terms for select to authenticated using ((select private.is_super_admin()));
create policy "entity_acquisition_payments: super admin only" on public.entity_acquisition_payments for select to authenticated using ((select private.is_super_admin()));
revoke all on public.entity_acquisition_terms, public.entity_acquisition_payments from anon, authenticated, service_role;
grant select on public.entity_acquisition_terms, public.entity_acquisition_payments to authenticated;
grant select, insert, update on public.entity_acquisition_terms, public.entity_acquisition_payments to service_role;

-- ---------------------------------------------------------------------------------------------------------------- the three write paths (service_role only; Super Admin re-checked; audit inside the same transaction)
create or replace function public.set_acquisition_terms(p_acquisition uuid, p_arrangement text, p_due date, p_supplier_terms text, p_note text, p_actor uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare a record; t_id uuid;
begin
  if not private.actor_is_super_admin(p_actor) then raise exception 'only a Super Admin can set payment terms' using errcode = '42501'; end if;
  select * into a from public.entity_equipment_acquisitions where id = p_acquisition for update;
  if not found or a.status <> 'recorded' then raise exception 'the acquisition is not a recorded acquisition' using errcode = '42501'; end if;
  update public.entity_acquisition_terms set status = 'superseded' where acquisition_id = a.id and status = 'current';
  insert into public.entity_acquisition_terms (employing_entity_id, acquisition_id, arrangement, balance_due_on, supplier_terms, note, set_by)
    values (a.employing_entity_id, a.id, p_arrangement, p_due, nullif(btrim(p_supplier_terms), ''), nullif(btrim(p_note), ''), p_actor) returning id into t_id;
  insert into public.entity_finance_events (employing_entity_id, acquisition_id, event_type, actor_profile_id, detail)
    values (a.employing_entity_id, a.id, 'terms_set', p_actor, jsonb_build_object('termsId', t_id, 'arrangement', p_arrangement, 'balanceDueOn', p_due));
  return t_id;
end $$;
revoke all on function public.set_acquisition_terms(uuid, text, date, text, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.set_acquisition_terms(uuid, text, date, text, text, uuid) to service_role;

create or replace function public.record_acquisition_payment(p_acquisition uuid, p_kind text, p_amount numeric, p_paid_on date, p_method text, p_method_note text, p_reference text, p_evidence_doc uuid, p_evidence_note text, p_actor uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare a record; pay_id uuid;
begin
  if not private.actor_is_super_admin(p_actor) then raise exception 'only a Super Admin can record a payment' using errcode = '42501'; end if;
  select * into a from public.entity_equipment_acquisitions where id = p_acquisition;
  if not found then raise exception 'the acquisition is not a recorded acquisition' using errcode = '42501'; end if;
  insert into public.entity_acquisition_payments (employing_entity_id, acquisition_id, kind, amount, currency, paid_on, method, method_note, reference, evidence_document_id, evidence_note, recorded_by)
    values (a.employing_entity_id, a.id, p_kind, p_amount, a.currency, p_paid_on, p_method, nullif(btrim(p_method_note), ''), nullif(btrim(p_reference), ''), p_evidence_doc, nullif(btrim(p_evidence_note), ''), p_actor) returning id into pay_id;
  insert into public.entity_finance_events (employing_entity_id, acquisition_id, event_type, actor_profile_id, detail)
    values (a.employing_entity_id, a.id, 'payment_recorded', p_actor, jsonb_build_object('paymentId', pay_id, 'kind', p_kind, 'amount', p_amount, 'paidOn', p_paid_on, 'method', p_method, 'evidenceDocument', p_evidence_doc, 'bankVerified', false));
  return pay_id;
end $$;
revoke all on function public.record_acquisition_payment(uuid, text, numeric, date, text, text, text, uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.record_acquisition_payment(uuid, text, numeric, date, text, text, text, uuid, text, uuid) to service_role;

create or replace function public.void_acquisition_payment(p_payment uuid, p_reason text, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare p record;
begin
  if not private.actor_is_super_admin(p_actor) then raise exception 'only a Super Admin can void a payment' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'a written reason of at least 10 characters is required' using errcode = '42501'; end if;
  select * into p from public.entity_acquisition_payments where id = p_payment;
  if not found then raise exception 'that payment is not recorded' using errcode = '42501'; end if;
  perform 1 from public.entity_equipment_acquisitions where id = p.acquisition_id for update;
  update public.entity_acquisition_payments set status = 'void', void_reason = btrim(p_reason), voided_by = p_actor, voided_at = now() where id = p_payment and status = 'recorded';
  if not found then raise exception 'that payment is not recorded' using errcode = '42501'; end if;
  insert into public.entity_finance_events (employing_entity_id, acquisition_id, event_type, actor_profile_id, detail)
    values (p.employing_entity_id, p.acquisition_id, 'payment_voided', p_actor, jsonb_build_object('paymentId', p.id, 'amount', p.amount, 'reason', btrim(p_reason)));
end $$;
revoke all on function public.void_acquisition_payment(uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.void_acquisition_payment(uuid, text, uuid) to service_role;

-- ---------------------------------------------------------------------------------------------------------------- one atomic call for a NON-financed purchase
-- Purchase + terms + first payment in ONE transaction: any refusal (an over-payment, a document from another entity, a missing due date, a duplicate invoice ...) rolls the whole call back, so nothing is left half-recorded.
-- It calls the same audited functions above, so every rule and audit event is the same. A retry after success is refused by the unique invoice index (nothing is duplicated). Financed purchases keep their own atomic path.
create or replace function public.record_acquisition_bundle(p jsonb, p_actor uuid) returns table (new_acquisition_id uuid, new_terms_id uuid, new_payment_id uuid)
language plpgsql security definer set search_path = '' as $$
declare a_id uuid; t_id uuid; pay_id uuid; tr jsonb := p -> 'terms'; py jsonb := p -> 'payment';
begin
  if not private.actor_is_super_admin(p_actor) then raise exception 'only a Super Admin can record an acquisition' using errcode = '42501'; end if;
  if p ? 'financing' and jsonb_typeof(p -> 'financing') <> 'null' then raise exception 'a financed purchase is recorded with its financing agreement, not through the payment bundle' using errcode = '42501'; end if;
  select r.acquisition_id into a_id from public.record_equipment_acquisition(jsonb_build_object('entityId', p -> 'entityId', 'acquisition', p -> 'acquisition'), p_actor) r;
  if tr is not null and jsonb_typeof(tr) = 'object' then
    t_id := public.set_acquisition_terms(a_id, tr ->> 'arrangement', nullif(tr ->> 'balanceDueOn', '')::date, tr ->> 'supplierTerms', tr ->> 'note', p_actor); end if;
  if py is not null and jsonb_typeof(py) = 'object' then
    pay_id := public.record_acquisition_payment(a_id, py ->> 'kind', (py ->> 'amount')::numeric, (py ->> 'paidOn')::date, py ->> 'method', py ->> 'methodNote', py ->> 'reference', nullif(py ->> 'evidenceDocumentId', '')::uuid, py ->> 'evidenceNote', p_actor); end if;
  return query select a_id, t_id, pay_id;
end $$;
revoke all on function public.record_acquisition_bundle(jsonb, uuid) from public, anon, authenticated, service_role;
grant execute on function public.record_acquisition_bundle(jsonb, uuid) to service_role;

commit;
