-- Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 1 (2026-09-14) —
-- EFFECTIVE-DATED EMPLOYMENT TERMS HISTORY.
--
-- Additive only. Does not replace or restructure public.staff_details —
-- that table remains the fast "current assignment" cache it already is,
-- read throughout the admin UI. This table adds what staff_details has
-- never had: a durable, append-only, effective-dated history of
-- employment terms, so a later query can answer "what were this
-- person's terms as of a given date" without staff_details' own
-- UPDATE-in-place overwriting the answer (confirmed by direct code
-- reading of assignStaffPosition(), which upserts staff_details in
-- place — position/grade/department/manager changes today are
-- reconstructable only from activity_log's narrative text, never from a
-- queryable historical row).
--
-- Each row is a FULL snapshot as of effective_from, not a sparse delta
-- — src/lib/organization/employmentTermsHistory.ts's
-- recordEmploymentTermsSnapshot() merges a partial change onto the
-- immediately-prior snapshot before inserting, so "current terms" is
-- always answerable by reading the single latest row, and "terms as of
-- date X" by reading the latest row with effective_from <= X.
--
-- Job title/position, G1-G10 grade, salary, reporting line and system
-- authority are deliberately five separate concepts, never merged: this
-- table carries the first four; authority_grants (unchanged, untouched
-- by this migration) remains the sole source of system/approval
-- authority, exactly preserving the existing "employment does not grant
-- authority" principle already stated in OS-LGL-007 Clause 1.5 and
-- Schedule B.

begin;

create table public.employment_terms_history (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  effective_from date not null,
  employing_entity_id uuid references public.employing_entities (id),
  employment_jurisdiction_id uuid references public.employment_jurisdictions (id),
  work_location text,
  position_id uuid references public.positions (id),
  department_id uuid references public.departments (id),
  grade_id uuid references public.grades (id),
  manager_id uuid references public.profiles (id),
  work_pattern text,
  basic_salary numeric,
  allowances jsonb,
  source text not null,
  recorded_at timestamptz not null default now(),
  recorded_by uuid references public.profiles (id)
);

comment on table public.employment_terms_history is
  'Append-only, effective-dated employment-terms snapshots — one full picture of a person''s terms as of effective_from per row, never a sparse delta and never updated once inserted. "Current terms" = the row with the latest effective_from (ties broken by recorded_at) for a profile_id; "terms as of date X" = the latest row with effective_from <= X. source: free text identifying what produced this snapshot (e.g. "position_assignment", "onboarding_start") — unconstrained, application-validated, same precedent as activity_log.action. Deliberately excludes system/approval authority (see authority_grants, unchanged) and job title/grade are recorded here only as a factual record, never as a source of authority.';
comment on column public.employment_terms_history.allowances is
  'jsonb — structure intentionally undefined at this phase (no allowance-type catalogue exists yet); null until a real allowance-recording workflow is built. Never fabricated.';

create index employment_terms_history_profile_effective_idx on public.employment_terms_history (profile_id, effective_from desc, recorded_at desc);

alter table public.employment_terms_history enable row level security;

-- Same "own or admin" read tier already established for staff_details
-- (migration 0002) — a person may see their own employment-terms
-- history (their own salary/grade/entity history is normal self-service
-- visibility), an admin may see everyone's.
create policy "employment_terms_history: read own or admin" on public.employment_terms_history
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.employment_terms_history to authenticated;
-- Insert-only for service_role — append-only/immutable at the database
-- level, same pattern as signature_events/requirement_evaluations.
grant select, insert on public.employment_terms_history to service_role;

commit;
