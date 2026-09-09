-- Ordift Talent — Opportunity <-> Talent candidacy foundation (2026-09-09).
--
-- Read-only design pass completed first (see the design report this
-- migration follows): inspected talent_opportunities, model_profiles,
-- talent_profile_categories, staff_onboarding.stage (0066), and
-- signature_signatories (0070) for existing many-to-many-with-
-- lifecycle conventions before writing anything here. Zero rows exist
-- in talent_opportunities as of this migration (confirmed via a
-- read-only count immediately before writing it, same discipline as
-- 0072/0073's own header comments) — this is a genuinely additive,
-- zero-risk table.
--
-- Foundation only, same discipline as 0072/0073: no engine function,
-- no server action, no UI, and no final status taxonomy exist yet.
-- status is unconstrained text with a single seeded value
-- ('candidate') — the richer future taxonomy (e.g.
-- shortlisted/contacted/selected/declined/unavailable) is deliberately
-- NOT invented here; it belongs in a later TypeScript lifecycle
-- module, mirroring talentOpportunityLifecycle.ts, once the
-- Opportunities milestone actually needs it.
--
-- Deliberately excluded from this first migration (anticipated, not
-- required now): notes, a decline-reason column, and any
-- milestone-specific timestamp beyond the one generic
-- status_changed_at/status_changed_by pair — avoiding the speculative-
-- workflow overbuild explicitly ruled out for this milestone.
--
-- profile_id references model_profiles(id), never profiles(id) — a
-- deliberate correction, not an oversight: talent_profile_categories'
-- own profile_id -> profiles(id) FK caused a real PostgREST
-- relationship-ambiguity failure once another table's ambiguity
-- stopped masking it (see the Talent onboarding-candidate/roster-query
-- incident this session). Referencing model_profiles(id) directly both
-- avoids reproducing that failure mode and correctly enforces, at the
-- schema level, that a candidacy can only exist for someone who
-- already has a Talent Profile.
--
-- No engagement_id column: provenance from a future confirmed booking
-- back to the originating candidacy is intentionally carried on the
-- OTHER side of that future relationship, via engagements' own,
-- already-existing, already-generic entity_type/entity_id columns
-- (migration 0049) — the same mechanism already used for
-- project/workshop/enquiry provenance elsewhere. Nothing on
-- public.engagements changes in this migration; no automatic
-- engagement or payment_obligation creation exists anywhere here or is
-- implied by this table's existence.
begin;

create table public.talent_opportunity_candidates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  opportunity_id uuid not null references public.talent_opportunities (id) on delete cascade,
  profile_id uuid not null references public.model_profiles (id) on delete cascade,
  status text not null default 'candidate',
  status_changed_at timestamptz,
  status_changed_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  unique (opportunity_id, profile_id)
);

comment on table public.talent_opportunity_candidates is
  'A talent''s candidacy/participation in an internal casting opportunity — many-to-many between talent_opportunities and model_profiles. status is unconstrained text (foundation only; no taxonomy or transition rules exist yet beyond the seeded "candidate" default) — see this migration''s header for what is deliberately deferred. Never linked directly to an engagement: a future confirmed booking retains provenance back to its originating candidacy via engagements.entity_type/entity_id (0049), not via a column here.';

create index talent_opportunity_candidates_opportunity_idx on public.talent_opportunity_candidates (opportunity_id);
create index talent_opportunity_candidates_profile_idx on public.talent_opportunity_candidates (profile_id);

alter table public.talent_opportunity_candidates enable row level security;

-- Admin-only visibility, matching talent_opportunities' own current
-- policy exactly (0072) — that table has no self-read policy at all
-- today, so a talent seeing their own candidacy rows here would be
-- inconsistent with the parent record's own visibility. Revisit only
-- if/when opportunities themselves ever become talent-visible.
create policy "talent_opportunity_candidates: admin read" on public.talent_opportunity_candidates
  for select
  to authenticated
  using ((select private.is_admin_or_super_admin()));

grant select on public.talent_opportunity_candidates to authenticated;
grant select, insert, update, delete on public.talent_opportunity_candidates to service_role;

create trigger talent_opportunity_candidates_set_updated_at
  before update on public.talent_opportunity_candidates
  for each row execute function public.set_updated_at();

commit;
