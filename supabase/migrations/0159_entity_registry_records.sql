-- Legal-entity registry: per-entity registrations and permits, document metadata, authorised signatories, and evidence-backed
-- expense records. SCHEMA ONLY — this migration inserts no entity, no registration number and no amount; the Qatar facts are
-- entered in a separate, separately approved data step.
--
-- Extends the existing public.employing_entities / employing_entity_sensitive_details / employing_entity_documents (0080, 0105, 0109).
-- Nothing existing is rewritten. Every new table is Super-Admin-only to read, written only by server code, and keyed to ONE entity,
-- so the Ghana and Qatar entities keep separate registration, permit, signatory and expense records.
--
--   entity_registrations   one row per registration/permit/card/certificate: kind, status, dates, identifier. Core facts are immutable;
--                          only status (and verification) can change, so history is kept (a new permit supersedes a pending one).
--   employing_entity_documents  + file hash, filename, type, size, dates, and a link to a related document: exact duplicate, partial overlap, or
--                          an updated VERSION of an earlier one (the earlier original is never replaced or deleted)
--   entity_signatories     who may sign for the entity (name, position, authority) — NO identity numbers; the identity document stays in the vault
--   booking_contracting_entities  which legal entity contracts for a booking/quotation/agreement, chosen explicitly and recorded (versioned, append-only).
--                          Existing bookings have no row and stay exactly as they are.
--   entity_expenses        a government fee or other cost, one row per receipt line, linked to its receipt document. NOT a bank transaction,
--                          payable, reimbursement or payment instruction: nothing here moves or requests money.
begin;

-- ------------------------------------------------------------------ document metadata (additive, nullable)
alter table public.employing_entity_documents
  add column if not exists original_filename text,
  add column if not exists mime_type text,
  add column if not exists size_bytes bigint,
  add column if not exists file_sha256 text check (file_sha256 is null or file_sha256 ~ '^[0-9a-f]{64}$'),
  add column if not exists issued_on date,
  add column if not exists expires_on date,
  add column if not exists issuing_authority text,
  add column if not exists relation text check (relation is null or relation in ('exact_duplicate_of', 'partial_overlap_of', 'new_version_of')),
  add column if not exists related_document_id uuid references public.employing_entity_documents (id);
alter table public.employing_entity_documents add constraint employing_entity_documents_relation_shape
  check ((relation is null) = (related_document_id is null));
create index if not exists employing_entity_documents_hash_idx on public.employing_entity_documents (employing_entity_id, file_sha256) where file_sha256 is not null;

-- ------------------------------------------------------------------ registrations, permits, cards, certificates
create table public.entity_registrations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  employing_entity_id uuid not null references public.employing_entities (id),
  kind text not null check (kind in ('commercial_registration', 'commercial_permit', 'tax_registration', 'establishment_card',
    'trade_name_reservation', 'articles_of_association', 'chamber_membership', 'investment_approval_condition')),
  status text not null check (status in ('active', 'pending', 'not_issued', 'expired', 'superseded', 'revoked')),
  identifier text,                 -- the number exactly as issued; null where nothing has been issued
  issued_on date,
  valid_from date,
  expires_on date,
  issuing_authority text,
  facts jsonb not null default '{}'::jsonb,   -- non-personal particulars as printed (activity, legal form, capital, premises ...)
  note text,
  source_document_id uuid references public.employing_entity_documents (id),
  supersedes_id uuid references public.entity_registrations (id),
  verified_by uuid references public.profiles (id),
  verified_at timestamptz,
  recorded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entity_registrations_issued_has_identifier check (status <> 'active' or kind in ('chamber_membership', 'investment_approval_condition', 'articles_of_association') or identifier is not null),
  constraint entity_registrations_dates_ordered check (expires_on is null or issued_on is null or expires_on >= issued_on),
  constraint entity_registrations_unissued_has_no_identifier check (status not in ('not_issued', 'pending') or identifier is null),
  constraint entity_registrations_verified_pair check ((verified_by is null) = (verified_at is null))
);
create unique index entity_registrations_one_current on public.entity_registrations (employing_entity_id, kind) where status in ('active', 'pending', 'not_issued');
create index entity_registrations_expiry_idx on public.entity_registrations (expires_on) where status = 'active' and expires_on is not null;
comment on table public.entity_registrations is
  'One registration / permit / card / certificate of ONE legal entity. Super-Admin-only. Core facts are immutable; status and verification may change. A commercial permit that has not been issued is a row with status not_issued and no identifier — the system never records a permit number, premises or approval date that was not supplied.';

-- Only status, verification and note may change after insert; a replacement is a new row that names what it supersedes.
create or replace function private.entity_registrations_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'entity_registrations is append-only' using errcode = '42501'; end if;
  if (new.employing_entity_id, new.kind, new.identifier, new.issued_on, new.valid_from, new.expires_on, new.issuing_authority, new.facts, new.source_document_id, new.supersedes_id, new.recorded_by, new.created_at)
     is distinct from
     (old.employing_entity_id, old.kind, old.identifier, old.issued_on, old.valid_from, old.expires_on, old.issuing_authority, old.facts, old.source_document_id, old.supersedes_id, old.recorded_by, old.created_at) then
    raise exception 'entity_registrations: a recorded registration cannot be edited; record a replacement that supersedes it' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function private.entity_registrations_guard() from public;
create trigger entity_registrations_guard before update or delete on public.entity_registrations for each row execute function private.entity_registrations_guard();

alter table public.entity_registrations enable row level security;
create policy "entity_registrations: super admin only" on public.entity_registrations for select to authenticated using ((select private.is_super_admin()));
revoke all on public.entity_registrations from anon, authenticated, service_role;
grant select on public.entity_registrations to authenticated;
grant select, insert, update on public.entity_registrations to service_role;

-- ------------------------------------------------------------------ authorised signatories
create table public.entity_signatories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  employing_entity_id uuid not null references public.employing_entities (id),
  full_name text not null check (char_length(btrim(full_name)) >= 3),
  position text not null,
  authority text,                       -- as stated on the registration, e.g. "full and absolute authority"
  nationality text,
  ownership_percent numeric(5, 2) check (ownership_percent is null or (ownership_percent >= 0 and ownership_percent <= 100)),
  profile_id uuid references public.profiles (id),   -- left null unless the person is positively matched to an account
  effective_from date,
  effective_to date,
  source_document_id uuid references public.employing_entity_documents (id),
  recorded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint entity_signatories_dates check (effective_to is null or effective_from is null or effective_to >= effective_from)
);
comment on table public.entity_signatories is 'Who may act for ONE legal entity, as shown on its registration. Names and positions only: identity numbers are never stored here (they remain in the private document vault).';
alter table public.entity_signatories enable row level security;
create policy "entity_signatories: super admin only" on public.entity_signatories for select to authenticated using ((select private.is_super_admin()));
revoke all on public.entity_signatories from anon, authenticated, service_role;
grant select on public.entity_signatories to authenticated;
grant select, insert on public.entity_signatories to service_role;

-- ------------------------------------------------------------------ expenses backed by a receipt
create table public.entity_expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  employing_entity_id uuid not null references public.employing_entities (id),
  expense_date date not null,
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  category text not null check (category in ('incorporation_registration', 'government_fee', 'professional_fees', 'premises', 'other')),
  line_code text not null,                          -- the line as printed on the receipt, so a line is recorded once
  description text not null,
  receipt_number text not null,                     -- the issuing authority's receipt / transaction number
  receipt_total numeric(14, 2) not null check (receipt_total > 0),
  issuing_authority text not null,
  request_reference text,
  source_document_id uuid references public.employing_entity_documents (id),
  payer_as_shown text,                              -- exactly who the receipt names as payer; nothing inferred
  funding_source_status text not null default 'to_confirm' check (funding_source_status in ('to_confirm', 'company_account', 'founder_personal', 'other_verified')),
  funding_source_note text,
  funding_confirmed_by uuid references public.profiles (id),
  funding_confirmed_at timestamptz,
  accounting_treatment text not null default 'to_be_confirmed',
  status text not null default 'recorded' check (status in ('recorded', 'void')),
  void_reason text,
  recorded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entity_expenses_one_line_per_receipt unique (employing_entity_id, receipt_number, line_code),
  constraint entity_expenses_line_within_total check (amount <= receipt_total),
  constraint entity_expenses_void_reason check ((status = 'void') = (void_reason is not null)),
  constraint entity_expenses_funding_confirmed check ((funding_source_status = 'to_confirm') = (funding_confirmed_by is null))
);
create index entity_expenses_entity_idx on public.entity_expenses (employing_entity_id, expense_date);
comment on table public.entity_expenses is
  'A cost of ONE legal entity, one row per receipt line, linked to its receipt document. NOT a bank transaction, payable, reimbursement or payment instruction. The payer and funding source are recorded only as shown or as later confirmed by a Super Admin — never assumed.';

-- Amounts, dates, receipt and entity are fixed once recorded; only funding confirmation, accounting treatment and voiding may change.
create or replace function private.entity_expenses_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'entity_expenses is append-only: void a mistaken line instead' using errcode = '42501'; end if;
  if (new.employing_entity_id, new.expense_date, new.amount, new.currency, new.category, new.line_code, new.description, new.receipt_number, new.receipt_total,
      new.issuing_authority, new.request_reference, new.source_document_id, new.payer_as_shown, new.recorded_by, new.created_at)
     is distinct from
     (old.employing_entity_id, old.expense_date, old.amount, old.currency, old.category, old.line_code, old.description, old.receipt_number, old.receipt_total,
      old.issuing_authority, old.request_reference, old.source_document_id, old.payer_as_shown, old.recorded_by, old.created_at) then
    raise exception 'entity_expenses: a recorded expense cannot be edited; void it with a reason and record a correction' using errcode = '42501';
  end if;
  if old.status = 'void' then raise exception 'entity_expenses: a voided expense cannot be changed' using errcode = '42501'; end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function private.entity_expenses_guard() from public;
create trigger entity_expenses_guard before update or delete on public.entity_expenses for each row execute function private.entity_expenses_guard();

alter table public.entity_expenses enable row level security;
create policy "entity_expenses: super admin only" on public.entity_expenses for select to authenticated using ((select private.is_super_admin()));
revoke all on public.entity_expenses from anon, authenticated, service_role;
grant select on public.entity_expenses to authenticated;
grant select, insert, update on public.entity_expenses to service_role;

-- ------------------------------------------------------------------ which legal entity contracts (explicit, recorded, never inferred)
create table public.booking_contracting_entities (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  subject_type text not null check (subject_type in ('crew_support_request', 'enquiry', 'quotation', 'agreement')),
  subject_id uuid not null,
  version integer not null check (version >= 1),
  employing_entity_id uuid not null references public.employing_entities (id),
  basis text not null check (char_length(btrim(basis)) >= 5),   -- why this entity, in the chooser's words
  supersedes_id uuid references public.booking_contracting_entities (id),
  chosen_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint booking_contracting_entities_version_unique unique (subject_type, subject_id, version),
  constraint booking_contracting_entities_chain check ((version = 1) = (supersedes_id is null))
);
comment on table public.booking_contracting_entities is
  'The legal entity that contracts with the client for one booking, quotation or agreement. Chosen explicitly by a Super Admin from the entity''s verified record — never inferred from the client''s location or currency. Append-only: a change is a new version that names what it supersedes. A subject with no row is a booking made before this existed; it is left exactly as it was and is not reassigned.';
create or replace function private.booking_contracting_entities_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'booking_contracting_entities is append-only: record a new version instead' using errcode = '42501';
end $$;
revoke all on function private.booking_contracting_entities_guard() from public;
create trigger booking_contracting_entities_guard before update or delete on public.booking_contracting_entities for each row execute function private.booking_contracting_entities_guard();
alter table public.booking_contracting_entities enable row level security;
create policy "booking_contracting_entities: super admin only" on public.booking_contracting_entities for select to authenticated using ((select private.is_super_admin()));
revoke all on public.booking_contracting_entities from anon, authenticated, service_role;
grant select on public.booking_contracting_entities to authenticated;
grant select, insert on public.booking_contracting_entities to service_role;

commit;
