-- PROPOSAL (NOT a numbered migration, NOT applied anywhere): equipment acquisitions with a separately tracked financing obligation.
-- The number is assigned at release (next free after the already-proposed ones). Rollback: ROLLBACK_equipment_acquisitions_and_financing.sql. Rehearsal: rehearse_finance.sh.
--
-- WHY. The finance vault today can store a receipt (employing_entity_documents) and record a COST line (entity_expenses). It cannot say "this is one piece of equipment, bought on one invoice, paid for through a
-- financing provider in instalments". Recording each instalment as an expense would count the same purchase more than once, and recording the whole price as an expense would pre-empt an accounting decision
-- that has not been made. So:
--   entity_equipment_acquisitions   ONE row per purchase (the supplier invoice). Its accounting classification is 'pending_professional_review' until a Super Admin records a decision; this table NEVER creates a cost.
--   entity_financing_obligations    ONE row per financing agreement (e.g. PayLater), linked to exactly one acquisition and to its confirmation document. The amount financed must equal the acquisition's net price.
--   entity_financing_instalments    the instalments. Only an instalment backed by evidence can become 'paid'; every other one stays 'pending'. Their amounts must add up to the amount financed. They are settlements
--                                   of the financing obligation, never new purchases and never new costs.
--   entity_finance_events           append-only audit written inside the same transaction as the change.
-- All documents are the EXISTING private vault's rows (employing_entity_documents: SHA-256, original filename, size, upload time); nothing here stores a file. A document must belong to the same legal entity.
-- Everything is readable by Super Admins only and written only by server code (service role) through public.record_equipment_acquisition() / public.mark_instalment_paid(). Nothing is ever deleted.
-- The OPTIONAL duplicate-expense guard (refuse an entity_expenses line that repeats an acquisition's invoice) is a SEPARATE proposal: PROPOSAL_optional_duplicate_expense_guard.sql. Nothing here touches entity_expenses.

begin;

-- ------------------------------------------------------------------------------------------------------------------------------ helper: a linked document must exist, belong to this entity and be a financial class
create or replace function private.finance_doc_ok(p_doc uuid, p_entity uuid, p_types text[]) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from public.employing_entity_documents d where d.id = p_doc and d.employing_entity_id = p_entity and d.document_type = any (p_types) and d.file_sha256 is not null);
$$;
revoke all on function private.finance_doc_ok(uuid, uuid, text[]) from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------------------------------------------ acquisitions
create table public.entity_equipment_acquisitions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  employing_entity_id uuid not null references public.employing_entities (id),
  supplier_name text not null check (char_length(btrim(supplier_name)) between 2 and 120),
  supplier_branch text,
  invoice_number text not null check (char_length(btrim(invoice_number)) between 1 and 80),
  purchase_date date not null,
  item_description text not null check (char_length(btrim(item_description)) between 3 and 300),
  item_code text,                                           -- the supplier's own item code as printed
  quantity integer not null default 1 check (quantity >= 1),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  list_price_total numeric(14, 2) not null check (list_price_total > 0),
  discount_total numeric(14, 2) not null default 0 check (discount_total >= 0),
  net_amount numeric(14, 2) not null check (net_amount > 0),
  customer_as_shown text,                                   -- exactly who the invoice names as customer; nothing inferred
  invoice_document_id uuid not null references public.employing_entity_documents (id),
  -- who paid is a statement until bank evidence confirms it (same three columns as entity_expenses)
  funding_source_status text not null default 'to_confirm' check (funding_source_status in ('to_confirm', 'company_account', 'founder_personal', 'other_verified')),
  funding_source_note text,
  funding_confirmed_by uuid references public.profiles (id),
  funding_confirmed_at timestamptz,
  bank_evidence_document_id uuid references public.employing_entity_documents (id),
  -- the accounting decision is NOT made here
  accounting_classification text not null default 'pending_professional_review' check (accounting_classification in ('pending_professional_review', 'capital_equipment', 'expensed_small_value')),
  classification_basis text,
  classified_by uuid references public.profiles (id),
  classified_at timestamptz,
  company_asset_id uuid references public.company_assets (id),   -- optional link to the HR issuance register; no cost data is copied there
  status text not null default 'recorded' check (status in ('recorded', 'void')),
  void_reason text,
  recorded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint acquisitions_net_matches check (net_amount = list_price_total - discount_total),
  constraint acquisitions_funding_confirmed check ((funding_source_status = 'to_confirm') = (funding_confirmed_by is null)),
  constraint acquisitions_classified check ((accounting_classification = 'pending_professional_review') = (classified_by is null) and ((classified_by is null) = (classified_at is null))
    and (classified_by is null or char_length(btrim(coalesce(classification_basis, ''))) >= 10)),
  constraint acquisitions_void_reason check ((status = 'void') = (void_reason is not null))
);
create unique index acquisitions_one_per_invoice on public.entity_equipment_acquisitions (employing_entity_id, lower(btrim(supplier_name)), btrim(invoice_number)) where status = 'recorded';
create index acquisitions_entity_idx on public.entity_equipment_acquisitions (employing_entity_id, purchase_date);
comment on table public.entity_equipment_acquisitions is
  'ONE equipment purchase (one supplier invoice) of ONE legal entity. Never creates a cost: the accounting classification stays pending_professional_review until a Super Admin records a decision with its basis. The funding source is a statement until confirmed.';

create or replace function private.acquisitions_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'entity_equipment_acquisitions is append-only: void a mistaken record instead' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if not private.finance_doc_ok(new.invoice_document_id, new.employing_entity_id, array['purchase_receipt', 'supplier_invoice']) then
      raise exception 'the invoice document must be a purchase receipt or supplier invoice in THIS entity''s vault' using errcode = '42501'; end if;
    if new.accounting_classification <> 'pending_professional_review' then raise exception 'a new acquisition starts as pending_professional_review' using errcode = '42501'; end if;
    return new;
  end if;
  if (new.employing_entity_id, new.supplier_name, new.supplier_branch, new.invoice_number, new.purchase_date, new.item_description, new.item_code, new.quantity, new.currency, new.list_price_total,
      new.discount_total, new.net_amount, new.customer_as_shown, new.invoice_document_id, new.recorded_by, new.created_at)
     is distinct from
     (old.employing_entity_id, old.supplier_name, old.supplier_branch, old.invoice_number, old.purchase_date, old.item_description, old.item_code, old.quantity, old.currency, old.list_price_total,
      old.discount_total, old.net_amount, old.customer_as_shown, old.invoice_document_id, old.recorded_by, old.created_at) then
    raise exception 'a recorded acquisition cannot be edited; void it with a reason and record a correction' using errcode = '42501'; end if;
  if old.status = 'void' then raise exception 'a voided acquisition cannot be changed' using errcode = '42501'; end if;
  if old.accounting_classification <> 'pending_professional_review' and new.accounting_classification is distinct from old.accounting_classification then
    raise exception 'the accounting classification was already decided; void and re-record with a reason' using errcode = '42501'; end if;
  if new.bank_evidence_document_id is distinct from old.bank_evidence_document_id then
    if old.bank_evidence_document_id is not null then raise exception 'bank evidence was already linked' using errcode = '42501'; end if;
    if not private.finance_doc_ok(new.bank_evidence_document_id, new.employing_entity_id, array['other_financial_document']) then
      raise exception 'bank evidence must be a financial supporting document in THIS entity''s vault' using errcode = '42501'; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function private.acquisitions_guard() from public, anon, authenticated;
create trigger acquisitions_guard before insert or update or delete on public.entity_equipment_acquisitions for each row execute function private.acquisitions_guard();

-- ------------------------------------------------------------------------------------------------------------------------------ financing obligations
create table public.entity_financing_obligations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  employing_entity_id uuid not null references public.employing_entities (id),
  acquisition_id uuid not null references public.entity_equipment_acquisitions (id),
  provider text not null check (char_length(btrim(provider)) between 2 and 80),
  provider_reference text not null check (char_length(btrim(provider_reference)) between 4 and 80),
  merchant_as_shown text,
  instalment_count integer not null check (instalment_count between 2 and 24),
  financed_amount numeric(14, 2) not null check (financed_amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  plan_started_on date not null,
  confirmation_document_id uuid not null references public.employing_entity_documents (id),
  schedule_basis text not null default 'founder_expected_months' check (schedule_basis in ('founder_expected_months', 'provider_schedule')),
  status text not null default 'active' check (status in ('active', 'settled', 'void')),
  void_reason text,
  recorded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint obligations_void_reason check ((status = 'void') = (void_reason is not null))
);
create unique index obligations_one_per_reference on public.entity_financing_obligations (employing_entity_id, lower(btrim(provider)), btrim(provider_reference)) where status <> 'void';
create unique index obligations_one_active_per_acquisition on public.entity_financing_obligations (acquisition_id) where status <> 'void';
comment on table public.entity_financing_obligations is
  'The financing agreement (for example PayLater) behind ONE acquisition. The provider, not the supplier, is owed. Its instalments settle this obligation; they are never new purchases or costs. schedule_basis says whether the instalment months are the provider''s or only expected.';

create or replace function private.obligations_guard() returns trigger language plpgsql set search_path = '' as $$
declare a record;
begin
  if tg_op = 'DELETE' then raise exception 'entity_financing_obligations is append-only' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    select * into a from public.entity_equipment_acquisitions where id = new.acquisition_id;
    if not found or a.status <> 'recorded' then raise exception 'the acquisition is not a recorded acquisition' using errcode = '42501'; end if;
    if a.employing_entity_id <> new.employing_entity_id then raise exception 'the acquisition belongs to another entity' using errcode = '42501'; end if;
    if a.net_amount <> new.financed_amount or a.currency <> new.currency then raise exception 'the amount financed (% %) must equal the acquisition''s net price (% %)', new.financed_amount, new.currency, a.net_amount, a.currency using errcode = '42501'; end if;
    if not private.finance_doc_ok(new.confirmation_document_id, new.employing_entity_id, array['other_financial_document', 'supplier_invoice', 'purchase_receipt']) then
      raise exception 'the financing confirmation must be a financial document in THIS entity''s vault' using errcode = '42501'; end if;
    if new.confirmation_document_id = a.invoice_document_id then raise exception 'the financing confirmation and the invoice must be two different documents' using errcode = '42501'; end if;
    return new;
  end if;
  if (new.employing_entity_id, new.acquisition_id, new.provider, new.provider_reference, new.merchant_as_shown, new.instalment_count, new.financed_amount, new.currency, new.plan_started_on,
      new.confirmation_document_id, new.schedule_basis, new.recorded_by, new.created_at)
     is distinct from
     (old.employing_entity_id, old.acquisition_id, old.provider, old.provider_reference, old.merchant_as_shown, old.instalment_count, old.financed_amount, old.currency, old.plan_started_on,
      old.confirmation_document_id, old.schedule_basis, old.recorded_by, old.created_at) then
    raise exception 'a recorded financing obligation cannot be edited; void it with a reason and record a correction' using errcode = '42501'; end if;
  if old.status in ('void', 'settled') then raise exception 'a % obligation cannot be changed', old.status using errcode = '42501'; end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function private.obligations_guard() from public, anon, authenticated;
create trigger obligations_guard before insert or update or delete on public.entity_financing_obligations for each row execute function private.obligations_guard();

-- ------------------------------------------------------------------------------------------------------------------------------ instalments
create table public.entity_financing_instalments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  obligation_id uuid not null references public.entity_financing_obligations (id),
  sequence integer not null check (sequence >= 1),
  amount numeric(14, 2) not null check (amount > 0),
  expected_month date not null check (extract(day from expected_month) = 1),     -- the MONTH it is expected; never a promised due date
  status text not null default 'pending' check (status in ('pending', 'paid', 'void')),
  paid_on date,
  paid_amount numeric(14, 2),
  evidence_document_id uuid references public.employing_entity_documents (id),
  bank_evidence_document_id uuid references public.employing_entity_documents (id),
  evidence_note text,
  marked_paid_by uuid references public.profiles (id),
  marked_paid_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now(),
  constraint instalments_unique_sequence unique (obligation_id, sequence),
  constraint instalments_paid_shape check (
    (status = 'paid') = (paid_on is not null and paid_amount is not null and marked_paid_by is not null and marked_paid_at is not null)
    and (status <> 'paid' or evidence_document_id is not null or char_length(btrim(coalesce(evidence_note, ''))) >= 10)),
  constraint instalments_void_reason check ((status = 'void') = (void_reason is not null))
);
comment on table public.entity_financing_instalments is
  'One instalment of a financing obligation. pending until evidence supports payment; only then paid. A settlement of the obligation, not a purchase and not a cost. Amounts of all instalments must add up to the obligation''s financed amount.';

create or replace function private.instalments_guard() returns trigger language plpgsql set search_path = '' as $$
declare o record;
begin
  if tg_op = 'DELETE' then raise exception 'entity_financing_instalments is append-only' using errcode = '42501'; end if;
  select * into o from public.entity_financing_obligations where id = coalesce(new.obligation_id, old.obligation_id);
  if tg_op = 'INSERT' then
    if new.status = 'paid' and not private.finance_doc_ok(new.evidence_document_id, o.employing_entity_id, array['other_financial_document', 'supplier_invoice', 'purchase_receipt']) and new.evidence_document_id is not null then
      raise exception 'instalment evidence must be a financial document in THIS entity''s vault' using errcode = '42501'; end if;
    if new.sequence > o.instalment_count then raise exception 'the obligation has only % instalments', o.instalment_count using errcode = '42501'; end if;
    return new;
  end if;
  if (new.obligation_id, new.sequence, new.amount, new.expected_month, new.created_at) is distinct from (old.obligation_id, old.sequence, old.amount, old.expected_month, old.created_at) then
    raise exception 'an instalment''s sequence, amount and expected month cannot be edited' using errcode = '42501'; end if;
  if old.status = 'paid' then
    if new.status <> 'paid' or (new.paid_on, new.paid_amount, new.evidence_document_id, new.marked_paid_by, new.marked_paid_at, new.evidence_note) is distinct from (old.paid_on, old.paid_amount, old.evidence_document_id, old.marked_paid_by, old.marked_paid_at, old.evidence_note) then
      raise exception 'a paid instalment cannot be changed (only bank evidence may be linked once)' using errcode = '42501'; end if;
    if new.bank_evidence_document_id is distinct from old.bank_evidence_document_id then
      if old.bank_evidence_document_id is not null then raise exception 'bank evidence was already linked' using errcode = '42501'; end if;
      if not private.finance_doc_ok(new.bank_evidence_document_id, o.employing_entity_id, array['other_financial_document']) then raise exception 'bank evidence must be a financial supporting document in THIS entity''s vault' using errcode = '42501'; end if;
    end if;
    return new;
  end if;
  if old.status = 'void' then raise exception 'a voided instalment cannot be changed' using errcode = '42501'; end if;
  if new.status = 'paid' then
    if new.evidence_document_id is not null and not private.finance_doc_ok(new.evidence_document_id, o.employing_entity_id, array['other_financial_document', 'supplier_invoice', 'purchase_receipt']) then
      raise exception 'instalment evidence must be a financial document in THIS entity''s vault' using errcode = '42501'; end if;
    if new.paid_amount <> old.amount then raise exception 'the paid amount (%) must equal the instalment (%)', new.paid_amount, old.amount using errcode = '42501'; end if;
  end if;
  return new;
end $$;
revoke all on function private.instalments_guard() from public, anon, authenticated;
create trigger instalments_guard before insert or update or delete on public.entity_financing_instalments for each row execute function private.instalments_guard();

-- the instalments of one obligation must add up to the amount financed (checked at commit, so they can be inserted together)
create or replace function private.instalments_total_check() returns trigger language plpgsql set search_path = '' as $$
declare o record; s numeric; n integer;
begin
  select * into o from public.entity_financing_obligations where id = new.obligation_id;
  select coalesce(sum(amount), 0), count(*) into s, n from public.entity_financing_instalments where obligation_id = new.obligation_id and status <> 'void';
  if n <> o.instalment_count or s <> o.financed_amount then
    raise exception 'the % instalments (total %) must be exactly % instalments totalling %', n, s, o.instalment_count, o.financed_amount using errcode = '23514'; end if;
  return null;
end $$;
revoke all on function private.instalments_total_check() from public, anon, authenticated;
create constraint trigger instalments_total_check after insert on public.entity_financing_instalments deferrable initially deferred for each row execute function private.instalments_total_check();

-- ------------------------------------------------------------------------------------------------------------------------------ audit (append-only)
create table public.entity_finance_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  employing_entity_id uuid not null references public.employing_entities (id),
  acquisition_id uuid references public.entity_equipment_acquisitions (id),
  obligation_id uuid references public.entity_financing_obligations (id),
  instalment_id uuid references public.entity_financing_instalments (id),
  event_type text not null check (event_type in ('acquisition_recorded', 'financing_recorded', 'instalment_paid', 'classification_decided', 'funding_confirmed', 'bank_evidence_linked', 'voided')),
  actor_profile_id uuid not null references public.profiles (id),
  occurred_at timestamptz not null default clock_timestamp(),
  detail jsonb not null default '{}'::jsonb
);
create index finance_events_acq_idx on public.entity_finance_events (acquisition_id, occurred_at);
create or replace function private.finance_events_guard() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'entity_finance_events is append-only' using errcode = '42501'; end $$;
revoke all on function private.finance_events_guard() from public, anon, authenticated;
create trigger finance_events_guard before update or delete on public.entity_finance_events for each row execute function private.finance_events_guard();

-- ------------------------------------------------------------------------------------------------------------------------------ privileges
alter table public.entity_equipment_acquisitions enable row level security;
alter table public.entity_financing_obligations enable row level security;
alter table public.entity_financing_instalments enable row level security;
alter table public.entity_finance_events enable row level security;
create policy "entity_equipment_acquisitions: super admin only" on public.entity_equipment_acquisitions for select to authenticated using ((select private.is_super_admin()));
create policy "entity_financing_obligations: super admin only" on public.entity_financing_obligations for select to authenticated using ((select private.is_super_admin()));
create policy "entity_financing_instalments: super admin only" on public.entity_financing_instalments for select to authenticated using ((select private.is_super_admin()));
create policy "entity_finance_events: super admin only" on public.entity_finance_events for select to authenticated using ((select private.is_super_admin()));
revoke all on public.entity_equipment_acquisitions, public.entity_financing_obligations, public.entity_financing_instalments, public.entity_finance_events from anon, authenticated, service_role;
grant select on public.entity_equipment_acquisitions, public.entity_financing_obligations, public.entity_financing_instalments, public.entity_finance_events to authenticated;
grant select, insert, update on public.entity_equipment_acquisitions, public.entity_financing_obligations, public.entity_financing_instalments to service_role;
grant select, insert on public.entity_finance_events to service_role;

-- ------------------------------------------------------------------------------------------------------------------------------ the two write paths (one transaction each, audit inside)
create or replace function private.actor_is_super_admin(p uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id join public.profiles pr on pr.id = ur.user_id where ur.user_id = p and r.slug = 'super_admin' and pr.access_status = 'active');
$$;
revoke all on function private.actor_is_super_admin(uuid) from public, anon, authenticated;

-- p: { entityId, acquisition:{supplier,branch,invoiceNumber,purchaseDate,itemDescription,itemCode,quantity,currency,listPrice,discount,net,customerAsShown,invoiceDocumentId,
--      fundingStatus,fundingNote}, financing:{provider,reference,merchant,count,plannedOn,confirmationDocumentId,scheduleBasis,instalments:[{sequence,amount,expectedMonth}]},
--      firstInstalmentPaid:{paidOn,evidenceNote}|null }   Nothing but the instalment named in firstInstalmentPaid is ever marked paid.
create or replace function public.record_equipment_acquisition(p jsonb, p_actor uuid) returns table (acquisition_id uuid, obligation_id uuid)
language plpgsql security definer set search_path = '' as $$
declare a_id uuid; o_id uuid; e uuid := (p ->> 'entityId')::uuid; ac jsonb := p -> 'acquisition'; fi jsonb := p -> 'financing'; i jsonb; i_id uuid; fp jsonb := p -> 'firstInstalmentPaid';
begin
  if not private.actor_is_super_admin(p_actor) then raise exception 'only a Super Admin can record an equipment acquisition' using errcode = '42501'; end if;
  insert into public.entity_equipment_acquisitions (employing_entity_id, supplier_name, supplier_branch, invoice_number, purchase_date, item_description, item_code, quantity, currency, list_price_total, discount_total, net_amount,
      customer_as_shown, invoice_document_id, funding_source_status, funding_source_note, funding_confirmed_by, funding_confirmed_at, recorded_by)
    values (e, ac ->> 'supplier', ac ->> 'branch', ac ->> 'invoiceNumber', (ac ->> 'purchaseDate')::date, ac ->> 'itemDescription', ac ->> 'itemCode', coalesce((ac ->> 'quantity')::int, 1), ac ->> 'currency',
      (ac ->> 'listPrice')::numeric, (ac ->> 'discount')::numeric, (ac ->> 'net')::numeric, ac ->> 'customerAsShown', (ac ->> 'invoiceDocumentId')::uuid,
      coalesce(ac ->> 'fundingStatus', 'to_confirm'), ac ->> 'fundingNote', case when coalesce(ac ->> 'fundingStatus', 'to_confirm') = 'to_confirm' then null else p_actor end,
      case when coalesce(ac ->> 'fundingStatus', 'to_confirm') = 'to_confirm' then null else now() end, p_actor) returning id into a_id;
  insert into public.entity_finance_events (employing_entity_id, acquisition_id, event_type, actor_profile_id, detail)
    values (e, a_id, 'acquisition_recorded', p_actor, jsonb_build_object('invoiceNumber', ac ->> 'invoiceNumber', 'net', ac ->> 'net', 'currency', ac ->> 'currency', 'classification', 'pending_professional_review'));
  if fi is not null then
    insert into public.entity_financing_obligations (employing_entity_id, acquisition_id, provider, provider_reference, merchant_as_shown, instalment_count, financed_amount, currency, plan_started_on, confirmation_document_id, schedule_basis, recorded_by)
      values (e, a_id, fi ->> 'provider', fi ->> 'reference', fi ->> 'merchant', (fi ->> 'count')::int, (ac ->> 'net')::numeric, ac ->> 'currency', (fi ->> 'plannedOn')::date, (fi ->> 'confirmationDocumentId')::uuid,
        coalesce(fi ->> 'scheduleBasis', 'founder_expected_months'), p_actor) returning id into o_id;
    for i in select * from jsonb_array_elements(fi -> 'instalments') loop
      insert into public.entity_financing_instalments (obligation_id, sequence, amount, expected_month) values (o_id, (i ->> 'sequence')::int, (i ->> 'amount')::numeric, (i ->> 'expectedMonth')::date) returning id into i_id;
      if fp is not null and (i ->> 'sequence')::int = coalesce((fp ->> 'sequence')::int, 1) then
        update public.entity_financing_instalments set status = 'paid', paid_on = (fp ->> 'paidOn')::date, paid_amount = (i ->> 'amount')::numeric, evidence_document_id = (fi ->> 'confirmationDocumentId')::uuid,
          evidence_note = fp ->> 'evidenceNote', marked_paid_by = p_actor, marked_paid_at = now() where id = i_id;
        insert into public.entity_finance_events (employing_entity_id, acquisition_id, obligation_id, instalment_id, event_type, actor_profile_id, detail)
          values (e, a_id, o_id, i_id, 'instalment_paid', p_actor, jsonb_build_object('sequence', i ->> 'sequence', 'amount', i ->> 'amount', 'paidOn', fp ->> 'paidOn', 'evidence', 'financing confirmation document'));
      end if;
    end loop;
    insert into public.entity_finance_events (employing_entity_id, acquisition_id, obligation_id, event_type, actor_profile_id, detail)
      values (e, a_id, o_id, 'financing_recorded', p_actor, jsonb_build_object('provider', fi ->> 'provider', 'reference', fi ->> 'reference', 'instalments', fi ->> 'count', 'financed', ac ->> 'net', 'scheduleBasis', coalesce(fi ->> 'scheduleBasis', 'founder_expected_months')));
  end if;
  return query select a_id, o_id;
end $$;
revoke all on function public.record_equipment_acquisition(jsonb, uuid) from public, anon, authenticated, service_role;
grant execute on function public.record_equipment_acquisition(jsonb, uuid) to service_role;

-- later instalments: only with evidence (a document in this entity's vault, or a written note of at least 10 characters)
create or replace function public.mark_instalment_paid(p_instalment uuid, p_paid_on date, p_evidence_document uuid, p_evidence_note text, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare i record; o record;
begin
  if not private.actor_is_super_admin(p_actor) then raise exception 'only a Super Admin can mark an instalment paid' using errcode = '42501'; end if;
  select * into i from public.entity_financing_instalments where id = p_instalment for update;
  if not found or i.status <> 'pending' then raise exception 'that instalment is not pending' using errcode = '42501'; end if;
  select * into o from public.entity_financing_obligations where id = i.obligation_id;
  if p_paid_on is null or p_paid_on > current_date then raise exception 'the payment date must be a past or present date' using errcode = '42501'; end if;
  update public.entity_financing_instalments set status = 'paid', paid_on = p_paid_on, paid_amount = i.amount, evidence_document_id = p_evidence_document, evidence_note = p_evidence_note, marked_paid_by = p_actor, marked_paid_at = now() where id = i.id;
  insert into public.entity_finance_events (employing_entity_id, acquisition_id, obligation_id, instalment_id, event_type, actor_profile_id, detail)
    values (o.employing_entity_id, o.acquisition_id, o.id, i.id, 'instalment_paid', p_actor, jsonb_build_object('sequence', i.sequence, 'amount', i.amount, 'paidOn', p_paid_on, 'evidenceDocument', p_evidence_document));
  if not exists (select 1 from public.entity_financing_instalments where obligation_id = o.id and status = 'pending') then
    update public.entity_financing_obligations set status = 'settled' where id = o.id;
  end if;
end $$;
revoke all on function public.mark_instalment_paid(uuid, date, uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.mark_instalment_paid(uuid, date, uuid, text, uuid) to service_role;

commit;
