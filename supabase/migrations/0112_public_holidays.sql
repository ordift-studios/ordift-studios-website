-- Ordift Studios Compliance/COMP-SYS-1, Phase B7 Step 2 (2026-09-15) —
-- PUBLIC HOLIDAY / WORKING-DAY CALENDAR foundation, READ-ONLY phase.
--
-- No table anywhere in this codebase has ever modeled an actual
-- holiday DATE before this (grep-confirmed against every migration and
-- against attendance_records.day_type, migration 0088, whose
-- 'public_holiday' value has always been set manually per attendance
-- record with nothing backing it). This is genuinely new,
-- foundational infrastructure — not a duplicate of anything existing.
--
-- Jurisdiction-aware by construction: keyed to the real, existing,
-- extensible public.employment_jurisdictions table (already used by
-- employing_entities and employment_terms_history) rather than either
-- of the two incompatible in-code jurisdiction enums this codebase
-- already has (WorkforceJurisdiction: GH/QA/GB/DE_EU/US/OTHER, used by
-- the Legal Suite's compliance classification; SupportedJurisdiction:
-- ghana/qatar/united_kingdom/international_other, used by
-- jurisdictionRouting.ts) — neither of which includes Canada, and
-- reconciling that pre-existing inconsistency is out of this task's
-- scope. Adding Qatar/UK/US/Canada later means inserting new
-- employment_jurisdictions rows, never a code or schema change.
--
-- A reference/configuration table, not a per-person append-only
-- history (unlike employment_terms_history) — public holidays are
-- facts about a jurisdiction's calendar, not about an individual's
-- employment. update is granted (like grades, engagement_types,
-- member_number_classifications) rather than insert-only, but every
-- row still carries created_by/verified_by/verified_at so a future
-- controlled admin write function (not built in this READ-ONLY phase)
-- can be auditable rather than silently overwriting; superseded_by_id
-- lets a genuine correction be recorded as a new row linked from the
-- old one instead of destroying the prior value outright.
--
-- ZERO rows are seeded here. Ghana public holiday dates are NOT
-- fabricated from unverified general knowledge — per explicit
-- instruction, this environment has no verified official Ghana
-- Government/Gazette source to cite. The architecture is real; the
-- data is CONFIGURATION REQUIRED before the calendar can show any real
-- Ghana public holiday to the Founder or to Mishael.

begin;

create table public.public_holidays (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  employment_jurisdiction_id uuid not null references public.employment_jurisdictions (id),
  holiday_date date not null,
  observed_date date,
  holiday_year integer not null,
  name text not null,
  location_scope text,
  source_reference text,
  source_authority text,
  source_published_at date,
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'verified', 'disputed')),
  effective_status text not null default 'active' check (effective_status in ('active', 'superseded', 'cancelled')),
  superseded_by_id uuid references public.public_holidays (id),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  verified_at timestamptz,
  verified_by uuid references public.profiles (id)
);

comment on table public.public_holidays is
  'Jurisdiction-aware official public holiday dates — the source-of-truth the Working-Day Resolver (src/lib/organization/workingDayCalendar.ts) reads to classify a date as PUBLIC_HOLIDAY, distinct from an employee''s own scheduled/rest days. holiday_date is the statutory date; observed_date is populated only when an official substitute-day rule applies (e.g. a holiday falling on a weekend observed the following Monday) — the calendar treats BOTH dates as non-ordinary-working where officially applicable, never guessed. verification_status defaults to unverified: a row must be positively marked verified (verified_by/verified_at) before it should be treated as authoritative for payroll-affecting decisions. Never delete a row — a real correction supersedes it (effective_status = superseded, superseded_by_id set) so history remains auditable.';
comment on column public.public_holidays.location_scope is 'Optional sub-jurisdiction/region scope where a holiday is not nationwide within its employment_jurisdiction — NULL means the holiday applies across the whole jurisdiction.';

create index public_holidays_jurisdiction_date_idx on public.public_holidays (employment_jurisdiction_id, holiday_date);
-- At most one ACTIVE row per (jurisdiction, date) — a correction must
-- supersede the old row rather than create a second live truth for the
-- same calendar date, mirroring the same "at most one active" pattern
-- already established for member_numbers (migration 0019).
create unique index public_holidays_one_active_per_jurisdiction_date on public.public_holidays (employment_jurisdiction_id, holiday_date) where effective_status = 'active';

alter table public.public_holidays enable row level security;

-- Read-only for every authenticated user by design (Section 19: an
-- employee viewing their own calendar must see applicable public
-- holidays) — this is jurisdiction-wide public information, not
-- per-person sensitive data, so no "own or admin" restriction applies
-- here the way it does for employment_terms_history.
create policy "public_holidays: read for authenticated" on public.public_holidays
  for select
  to authenticated
  using (true);

grant select on public.public_holidays to authenticated;
grant select, insert, update on public.public_holidays to service_role;

commit;
