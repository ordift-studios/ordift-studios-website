-- Ordift Studios Vendor commercial/rate-card infrastructure (2026-09-15,
-- OS-LGL-009 implementation phase, Part 11).
--
-- Genuinely new schema — no existing table represents "a vendor's own
-- cost/rate information, versioned over time." Reuses everything else:
-- the source evidence document (if a vendor uploads a real rate sheet)
-- is a vendor_documents row (migration 0122), referenced here rather
-- than duplicating Storage/upload machinery; vendor identity is
-- public.profiles (via vendor_profile_id) exactly like every other
-- vendor table.
--
-- STRICT SEPARATION (explicit instruction): this table holds ONLY
-- Vendor-side cost/commercial information. It has no column for, and
-- no code anywhere may add, Ordift internal markup, margin, client
-- quotation, or client selling price — those remain the Pricing/Quote
-- engine's exclusive domain, entirely untouched by this migration.
-- This is deliberately only the integration point a future quotation/
-- job-costing feature could reference (via rate_card_item_id) — no
-- quotation engine is built here.
--
-- vendor_rate_cards is the VERSIONED CONTAINER (one per vendor
-- rate-card submission/revision); vendor_rate_card_items are the
-- individual priced lines within it. A new upload never overwrites a
-- prior one — status/supersedes_id preserve full history, matching
-- this codebase's established append-only-with-status-transition
-- pattern (legal_document_versions, agreement_amendments).

begin;

create table public.vendor_rate_cards (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  vendor_profile_id uuid not null references public.profiles (id),
  currency text not null,
  effective_date date not null,
  status text not null default 'current',
  source_document_id uuid references public.vendor_documents (id),
  version int not null default 1 check (version > 0),
  supersedes_id uuid references public.vendor_rate_cards (id),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

comment on table public.vendor_rate_cards is
  'A versioned container for one vendor''s cost/rate submission, effective from a given date. status: current | superseded | expired (unconstrained text, application-validated, same precedent as leave_requests.status). A newly uploaded rate card never overwrites a prior one — supersedes_id chains to the version it replaces, and historical items remain fully readable so a Work Order issued under an earlier rate card can still show what was actually agreed at the time. Holds ONLY Vendor-side cost information — Ordift markup/margin/client quotation/selling price are never stored here.';

create index vendor_rate_cards_vendor_profile_id_idx on public.vendor_rate_cards (vendor_profile_id);
create index vendor_rate_cards_status_idx on public.vendor_rate_cards (status);

alter table public.vendor_rate_cards enable row level security;

create policy "vendor_rate_cards: read own or staff" on public.vendor_rate_cards
  for select
  to authenticated
  using ((select auth.uid()) = vendor_profile_id or (select private.is_staff_or_admin()));

grant select on public.vendor_rate_cards to authenticated;
grant select, insert, update, delete on public.vendor_rate_cards to service_role;

create table public.vendor_rate_card_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  rate_card_id uuid not null references public.vendor_rate_cards (id) on delete cascade,
  service_item text not null,
  unit_basis text not null,
  base_cost numeric(12, 2) not null check (base_cost >= 0),
  minimum_booking text,
  overtime_rate numeric(12, 2) check (overtime_rate is null or overtime_rate >= 0),
  add_ons jsonb not null default '{}'::jsonb,
  tax_treatment text,
  conditions text,
  created_at timestamptz not null default now()
);

comment on table public.vendor_rate_card_items is
  'Individual priced line items within a vendor_rate_cards submission. unit_basis: hour | half_day | full_day | item | service | other (unconstrained text, application-validated). This is Vendor-side COST only — never Ordift markup/margin/client price, which live entirely in the separate Pricing/Quote engine and are never referenced or duplicated here.';

create index vendor_rate_card_items_rate_card_id_idx on public.vendor_rate_card_items (rate_card_id);

alter table public.vendor_rate_card_items enable row level security;

create policy "vendor_rate_card_items: read own or staff" on public.vendor_rate_card_items
  for select
  to authenticated
  using (
    (select private.is_staff_or_admin())
    or exists (select 1 from public.vendor_rate_cards rc where rc.id = vendor_rate_card_items.rate_card_id and rc.vendor_profile_id = (select auth.uid()))
  );

grant select on public.vendor_rate_card_items to authenticated;
grant select, insert, update, delete on public.vendor_rate_card_items to service_role;

commit;
