-- Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 14 (2026-09-14) —
-- CONFLICTS, OUTSIDE WORK, GIFTS AND ANTI-BRIBERY (Ghana), OS-HR-GH-004
-- section 4.
--
-- INSPECTION SUMMARY: 4.3 ("Cash bribes, kickbacks, secret commissions,
-- personal payments or valuable benefits... are prohibited and
-- reportable") names no distinct reporting workflow beyond
-- "reportable" — this is exactly what the existing speak_up_reports
-- channel (migration 0089, admin-only read, anonymous-capable
-- whistleblowing) already exists for. No new anti-bribery reporting
-- table is created here; a suspected bribery/kickback concern is
-- reported through speak_up_reports, reusing existing infrastructure
-- rather than duplicating it.
--
-- 4.2's "Country/entity declaration thresholds are configurable" is the
-- same CONFIGURATION-REQUIRED pattern already proven by
-- ghana_statutory_configuration (migration 0091): an effective-dated
-- config table, seeded with zero rows — no real gift/hospitality value
-- threshold is invented anywhere in this migration or its accompanying
-- code.

begin;

create table public.outside_work_disclosures (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  description text not null,
  requires_approval boolean not null default true,
  status text not null default 'disclosed',
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decision_notes text,
  disclosed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.outside_work_disclosures is
  'OS-HR-GH-004 4.1: "Freelancing/outside work is not automatically prohibited. Potential conflicts must be disclosed/approved where required." status: disclosed | approved | declined. requires_approval defaults true — not every disclosure legally needs formal approval, but the default assumption is that it does, never the reverse.';

create index outside_work_disclosures_profile_idx on public.outside_work_disclosures (profile_id);

alter table public.outside_work_disclosures enable row level security;

create policy "outside_work_disclosures: read own or admin" on public.outside_work_disclosures
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.outside_work_disclosures to authenticated;
grant select, insert, update on public.outside_work_disclosures to service_role;

create trigger outside_work_disclosures_set_updated_at
  before update on public.outside_work_disclosures
  for each row execute function public.set_updated_at();

create table public.gift_hospitality_thresholds (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  jurisdiction text not null,
  employing_entity_id uuid references public.employing_entities (id),
  threshold_amount numeric not null check (threshold_amount > 0),
  currency text not null,
  effective_from date not null,
  notes text not null,
  configured_by uuid not null references public.profiles (id),
  configured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.gift_hospitality_thresholds is
  'CONFIGURATION REQUIRED — deliberately seeded with zero rows by this migration, the same pattern already proven by ghana_statutory_configuration (migration 0091). OS-HR-GH-004 4.2: "Country/entity declaration thresholds are configurable." No real threshold value is invented anywhere in this system — a person with the actual authoritative figure for a given jurisdiction/entity must insert the first row (with a documented source in notes) before any declaration can be compared against it. Append-only, effective-dated: employing_entity_id is nullable for a jurisdiction-wide threshold, or set for an entity-specific override.';

create index gift_hospitality_thresholds_jurisdiction_idx on public.gift_hospitality_thresholds (jurisdiction, effective_from desc);

alter table public.gift_hospitality_thresholds enable row level security;

create policy "gift_hospitality_thresholds: admin read" on public.gift_hospitality_thresholds
  for select
  to authenticated
  using ((select private.is_admin_or_super_admin()));

grant select on public.gift_hospitality_thresholds to authenticated;
grant select, insert on public.gift_hospitality_thresholds to service_role;

create table public.gift_hospitality_declarations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  declared_by uuid not null references public.profiles (id),
  direction text not null,
  description text not null,
  counterparty text not null,
  estimated_value numeric,
  currency text,
  occurred_at date,
  business_justification text,
  applicable_threshold_id uuid references public.gift_hospitality_thresholds (id),
  exceeds_threshold boolean,
  status text not null default 'declared',
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.gift_hospitality_declarations is
  'direction: given | received (unconstrained text). status: declared | approved | declined | flagged. exceeds_threshold is null whenever no applicable gift_hospitality_thresholds row exists yet for the relevant jurisdiction/entity as of occurred_at — declareGiftOrHospitality() (src/lib/organization/conflictsGifts.ts) never invents a default threshold to force a true/false answer; a null value here honestly reflects "not yet configured," distinct from an actual false. OS-HR-GH-004 4.2: "Modest ordinary hospitality/token gifts may be permitted where they do not influence or reasonably appear to influence a business decision" — business_justification records that judgment, never an automatic classification.';

create index gift_hospitality_declarations_profile_idx on public.gift_hospitality_declarations (profile_id);

alter table public.gift_hospitality_declarations enable row level security;

create policy "gift_hospitality_declarations: read own or admin" on public.gift_hospitality_declarations
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.gift_hospitality_declarations to authenticated;
grant select, insert, update on public.gift_hospitality_declarations to service_role;

create trigger gift_hospitality_declarations_set_updated_at
  before update on public.gift_hospitality_declarations
  for each row execute function public.set_updated_at();

commit;
