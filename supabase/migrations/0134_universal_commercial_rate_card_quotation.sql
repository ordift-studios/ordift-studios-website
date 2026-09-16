-- Universal Commercial Rate Card & Quotation System (2026-09-16).
--
-- COST SIDE: generalizes the existing vendor_rate_cards/
-- vendor_rate_card_items (migration 0126) to every external provider
-- classification via an additive party_type column — the physical
-- tables are NOT renamed or recreated (Lavish & Cedar's real rate card
-- data must never be put at risk by a same-day rename), so this is a
-- safe, backward-compatible generalization, not a rebuild. Every
-- existing row defaults to party_type = 'vendor', unchanged behavior.
--
-- SELLING SIDE: a genuinely new, separate domain — client_quotations/
-- client_quotation_items. Ordift's extensive existing Pricing engine
-- (corporate_headshot_rates, wedding_event_tier_rates, etc. — over a
-- dozen tables across migrations 0054-0059) already computes what
-- Ordift charges by service category; this is NOT rebuilt. What did
-- not exist is a formal, snapshotted, versioned QUOTATION document —
-- the specific line items and rate actually offered to one client or
-- prospect, frozen at the moment of quoting (the same
-- snapshot-not-live-recompute philosophy this schema already uses for
-- agreement_snapshots). Supports an offline prospect (no Ordift
-- account) via free-text contact fields, with a later, deliberate,
-- non-duplicating association to a genuine client account.
--
-- STRICT COMMERCIAL SEPARATION is structural, not just a UI label:
-- client_quotations/client_quotation_items carry ONLY selling-side
-- fields (selling_rate, discount, tax, total) — no cost/margin column
-- exists on these tables at all, so there is nothing to leak even if a
-- future query bug over-selected columns. Cost-side data
-- (vendor_rate_cards) and selling-side data (client_quotations) remain
-- two separate tables with two separate RLS policies; nothing joins
-- them at the database level.

begin;

alter table public.vendor_rate_cards
  add column if not exists party_type text not null default 'vendor'
    check (party_type in ('vendor', 'supplier', 'contractor', 'instructor', 'model', 'consultant', 'other'));

comment on column public.vendor_rate_cards.party_type is
  'Universal Commercial Rate Card System (2026-09-16) — which kind of external provider this cost-side rate card belongs to. Defaults to vendor (every pre-existing row). The table itself is not renamed: it already correctly holds cost-side-only data for any provider type, matching this generalization exactly.';

create index if not exists vendor_rate_cards_party_type_idx on public.vendor_rate_cards (party_type);

create sequence if not exists public.client_quotation_reference_seq;

-- Same RPC-wrapper pattern as next_legal_agreement_reference_seq()
-- (migration 0069) — PostgREST has no first-class "call nextval on an
-- arbitrary sequence" endpoint, hence the wrapper. service_role only.
create or replace function public.next_client_quotation_reference_seq()
returns bigint
language sql
security definer
set search_path = ''
as $$
  select nextval('public.client_quotation_reference_seq');
$$;

revoke all on function public.next_client_quotation_reference_seq() from public;
revoke all on function public.next_client_quotation_reference_seq() from anon;
grant execute on function public.next_client_quotation_reference_seq() to service_role;

create table public.client_quotations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  quotation_reference text not null,
  -- Exactly one of client_profile_id (a genuine registered Ordift
  -- Client) or prospect_name (an offline/prospective Client with no
  -- account) must be set — enforced below, never both, never neither.
  client_profile_id uuid references public.profiles (id),
  prospect_name text,
  prospect_email text,
  prospect_phone text,
  prospect_company text,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'accepted', 'declined', 'expired', 'superseded')),
  currency text not null,
  subtotal numeric(12, 2) not null default 0 check (subtotal >= 0),
  discount_total numeric(12, 2) not null default 0 check (discount_total >= 0),
  tax_total numeric(12, 2) not null default 0 check (tax_total >= 0),
  total numeric(12, 2) not null default 0 check (total >= 0),
  valid_until date,
  payment_booking_terms text,
  commercial_notes text,
  -- Append-only version chain — same established pattern as
  -- vendor_rate_cards.supersedes_id and legal agreement_amendments: a
  -- revised quotation is a NEW row, never an overwrite of one already
  -- sent to a client.
  version int not null default 1 check (version > 0),
  supersedes_id uuid references public.client_quotations (id),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, quotation_reference),
  constraint client_quotations_client_or_prospect check (
    (client_profile_id is not null and prospect_name is null)
    or (client_profile_id is null and prospect_name is not null)
  )
);

comment on table public.client_quotations is
  'Universal Commercial Rate Card & Quotation System, selling side (2026-09-16). A formal, versioned, snapshotted quotation offered to one client or offline prospect — never a live recomputation of the Pricing engine. Carries ONLY selling-side figures; no provider cost/margin column exists on this table by construction.';

create index client_quotations_client_profile_id_idx on public.client_quotations (client_profile_id);
create index client_quotations_status_idx on public.client_quotations (status);
create index client_quotations_created_at_idx on public.client_quotations (created_at desc);

alter table public.client_quotations enable row level security;

-- Admin-tier read/write, same precedent as enquiries/bookings (now
-- correctly admin-gated — 2026-09-16 access-control fix) and every
-- other commercially-sensitive table. A registered client is deliberately
-- NOT given direct table access here — client-facing delivery is a
-- controlled read (a specific quotation, via a server action / signed
-- view), never a broad RLS SELECT grant on the whole table.
create policy "client_quotations: admin read/write" on public.client_quotations
  for all
  to authenticated
  using ((select private.has_role('admin')) or (select private.is_super_admin()))
  with check ((select private.has_role('admin')) or (select private.is_super_admin()));

grant select, insert, update on public.client_quotations to authenticated;
grant select, insert, update, delete on public.client_quotations to service_role;

create table public.client_quotation_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  quotation_id uuid not null references public.client_quotations (id) on delete cascade,
  service_item text not null,
  description text,
  quantity numeric(10, 2) not null default 1 check (quantity > 0),
  unit_basis text not null,
  selling_rate numeric(12, 2) not null check (selling_rate >= 0),
  discount_percent numeric(5, 2) check (discount_percent is null or (discount_percent >= 0 and discount_percent <= 100)),
  tax_percent numeric(5, 2) check (tax_percent is null or tax_percent >= 0),
  line_total numeric(12, 2) not null check (line_total >= 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.client_quotation_items is
  'Individual priced line items within a client_quotations document. unit_basis: hour | half_day | full_day | item | service | other (unconstrained text, application-validated, same convention as vendor_rate_card_items). Selling-side only — line_total is computed and stored by the application at creation time (quantity * selling_rate, less discount, plus tax), never recomputed live from a cost-side table.';

create index client_quotation_items_quotation_id_idx on public.client_quotation_items (quotation_id);

alter table public.client_quotation_items enable row level security;

create policy "client_quotation_items: admin read/write" on public.client_quotation_items
  for all
  to authenticated
  using ((select private.has_role('admin')) or (select private.is_super_admin()))
  with check ((select private.has_role('admin')) or (select private.is_super_admin()));

grant select, insert, update, delete on public.client_quotation_items to authenticated;
grant select, insert, update, delete on public.client_quotation_items to service_role;

create trigger client_quotations_set_updated_at
  before update on public.client_quotations
  for each row execute function public.set_updated_at();

commit;
