begin;

-- Sequence 1, E.5 Stage 2I — Internal Staff Onboarding requirement/gating
-- foundation. Deliberately additive only (new table, no change to any
-- existing column) and deliberately thin: requirement CATALOG
-- definitions (key, type, stage, label, required, responsible role)
-- live in code (src/lib/organization/onboardingRequirements.ts),
-- matching this schema's own established convention
-- (BACKGROUND_SCREENING_CATEGORIES, EMPLOYEE_ONBOARDING_STAGES) rather
-- than duplicating them as DB rows. This table stores only the
-- per-onboarding-record STATE of a requirement, and only once a human
-- has actually acted on it (satisfied/waived/verified/recorded) — an
-- applicable catalog requirement with no row here is treated as
-- "pending" by the application layer, never fabricated as a row merely
-- to display it. This is what lets completion gating (Part G) work
-- correctly even for an onboarding record that predates this feature
-- (e.g. Mishael Adjei's, started in Stage 2G): its required catalog
-- items compute as unsatisfied without any write ever being made to
-- his record.
create table public.onboarding_requirements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  onboarding_id uuid not null references public.staff_onboarding (id) on delete cascade,
  requirement_key text not null,
  requirement_type text not null,
  stage text not null,
  required boolean not null default true,
  status text not null default 'pending',
  responsible_role text,
  -- Part D — an agreement/document requirement may need to represent
  -- digital and physical evidence independently and simultaneously
  -- (e.g. Employment Agreement: digitally executed AND a physical
  -- original required/received/verified). Null/false for requirement
  -- types that don't use this axis (task, approval, external_handoff).
  digital_execution_status text,
  physical_original_required boolean not null default false,
  physical_original_received boolean not null default false,
  -- Pointer only (an uploaded-document id, an external reference, a
  -- signature-request id once that integration exists) — never raw
  -- file content, matching public.background_screenings' own
  -- evidence_reference convention exactly.
  evidence_reference text,
  notes text,
  completed_at timestamptz,
  completed_by uuid references public.profiles (id),
  verified_at timestamptz,
  verified_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  unique (onboarding_id, requirement_key)
);

comment on table public.onboarding_requirements is
  'Per-onboarding-record requirement STATE only (Sequence 1, E.5 Stage 2I). Requirement catalog/definitions live in code (src/lib/organization/onboardingRequirements.ts), not here. A row exists only once a human has acted on that requirement; an applicable catalog requirement with no row is treated as pending by the application layer. Every status change is also recorded in activity_log, matching this project''s universal audit convention — this table is not itself the audit trail.';

alter table public.onboarding_requirements enable row level security;

create policy "onboarding_requirements: read own onboarding or admin" on public.onboarding_requirements
  for select
  to authenticated
  using (
    exists (
      select 1 from public.staff_onboarding so
      where so.id = onboarding_requirements.onboarding_id
        and (so.profile_id = (select auth.uid()) or (select private.is_admin_or_super_admin()))
    )
  );

grant select on public.onboarding_requirements to authenticated;
grant select, insert, update, delete on public.onboarding_requirements to service_role;

commit;
