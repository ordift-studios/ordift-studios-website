-- Crew Support Phase 2 (2026-10-07): link quotations to Crew Support
-- requests/enquiries, add the Ready/Accepted lifecycle fields, price-source
-- tracking and the FX snapshot.
--
-- SAFETY REVIEW (per Founder instruction before applying):
--   - Additive only: new nullable/defaulted columns, one widened CHECK
--     (adds 'ready'), one partial unique index. No DROP TABLE/COLUMN, no
--     DELETE/TRUNCATE, no UPDATE of existing rows. client_quotations is
--     empty in Production today, and every existing row (none) would keep
--     identical meaning (new columns default to null/false).
--   - client_quotations/client_quotation_items still carry NO cost,
--     margin or crew-pay column (strict commercial separation from
--     0134). Everything added below is selling-side or workflow metadata.
--   - RLS is unchanged (admin-only read; clients read through a
--     server-side ownership-checked projection, never directly).
--   - amount_due is untouched here. It is written, once, from an ACCEPTED
--     quotation by application code (a single authoritative writer).
--
-- Lifecycle for a Crew Support quotation:
--   draft -> ready (reviewed) -> sent (= Issued) -> accepted
--   (declined / expired / superseded exist for later use).

begin;

alter table public.client_quotations
  add column enquiry_id uuid references public.enquiries (id),
  add column crew_support_request_id uuid references public.crew_support_requests (id),
  add column is_test boolean not null default false,
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references public.profiles (id),
  add column issued_at timestamptz,
  add column issued_by uuid references public.profiles (id),
  add column accepted_at timestamptz,
  add column accepted_via text check (accepted_via in ('client_portal', 'staff_recorded')),
  add column accepted_by_profile_id uuid references public.profiles (id),
  add column accepted_by_name text,
  add column acceptance_channel text check (acceptance_channel in ('email', 'whatsapp_message', 'telephone', 'in_person', 'other')),
  add column acceptance_evidence text,
  add column acceptance_received_at timestamptz,
  add column acceptance_recorded_by uuid references public.profiles (id),
  add column usd_total numeric(12, 2) check (usd_total is null or usd_total >= 0),
  add column fx_currency text references public.currencies (code),
  add column fx_rate_to_usd numeric(14, 6),
  add column fx_locked_at timestamptz;

comment on column public.client_quotations.accepted_via is
  'client_portal = the client accepted directly while signed in. staff_recorded = an authorized admin recorded an acceptance the client gave through another channel (acceptance_channel/evidence/received_at/recorded_by are mandatory in that case, enforced in application code and by the check below).';
comment on column public.client_quotations.usd_total is
  'Canonical USD reference total of the quotation. For an ACCEPTED Crew Support quotation this is the value written to enquiries.amount_due.';
comment on column public.client_quotations.fx_rate_to_usd is
  'Snapshot of the exchange rate (1 USD = n fx_currency) locked when the quotation was ISSUED, so the displayed local-currency equivalent never moves with later FX changes.';

alter table public.client_quotations
  add constraint client_quotations_staff_acceptance_check check (
    accepted_via is distinct from 'staff_recorded'
    or (acceptance_channel is not null and acceptance_evidence is not null and acceptance_received_at is not null and acceptance_recorded_by is not null and accepted_by_name is not null)
  );

alter table public.client_quotations drop constraint if exists client_quotations_status_check;
alter table public.client_quotations add constraint client_quotations_status_check
  check (status in ('draft', 'ready', 'sent', 'accepted', 'declined', 'expired', 'superseded'));

create index client_quotations_enquiry_id_idx on public.client_quotations (enquiry_id) where enquiry_id is not null;
create unique index client_quotations_one_live_per_crew_request
  on public.client_quotations (crew_support_request_id)
  where crew_support_request_id is not null and status in ('draft', 'ready', 'sent', 'accepted');

alter table public.client_quotation_items
  add column requirement_id uuid references public.crew_support_requirements (id) on delete set null,
  add column governed_unit_price numeric(12, 2) check (governed_unit_price is null or governed_unit_price >= 0),
  add column adjustment_reason text,
  add column no_governed_rate boolean not null default false;

comment on column public.client_quotation_items.governed_unit_price is
  'INTERNAL. The governed (Rate Card) unit price at the time the line was generated, kept when an authorized admin overrides it, so the override is auditable. Never shown to the client.';
comment on column public.client_quotation_items.adjustment_reason is
  'INTERNAL. Mandatory when source_type = adjusted. Never shown to the client.';
comment on column public.client_quotation_items.no_governed_rate is
  'INTERNAL. True when the line is a manual fallback because no governed Crew Support rate existed for it.';

commit;
