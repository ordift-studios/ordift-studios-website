begin;

-- Sequence 1, E.5 Stage 2M — Employment foundation + onboarding origin.
-- Deliberately additive only: two new lookup tables, and nullable
-- columns on two existing tables. No existing column changes meaning,
-- no existing row is touched, no NOT NULL is added to anything with
-- historical rows.

-- Employing Entity — the legal/business entity employing the person.
-- Deliberately NOT the same concept as public.businesses (that table
-- is a multi-tenant SCOPING primitive, not a legal-employer concept;
-- Ordift could plausibly employ people through more than one legal
-- entity under the same overall business_id scope in the future).
-- Seeded with exactly the one entity that genuinely, actually exists
-- today — Ordift Studios itself — matching the existing precedent
-- (public.businesses' own seed row), not an invented fact.
create table public.employing_entities (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  name text not null,
  slug text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (business_id, slug)
);

comment on table public.employing_entities is
  'The legal/business entity employing a person, distinct from public.businesses (a multi-tenant scoping primitive). Referenced by recruitment_requisitions.employing_entity_id. Seeded with one real entity (Ordift Studios); intentionally has no per-country/tax/statutory fields — this table only establishes WHICH entity employs someone, not what that implies legally.';

alter table public.employing_entities enable row level security;

create policy "employing_entities: staff read" on public.employing_entities
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.employing_entities to authenticated;
grant select, insert, update, delete on public.employing_entities to service_role;

insert into public.employing_entities (name, slug, sort_order) values ('Ordift Studios', 'ordift-studios', 10);

-- Employment Jurisdiction — the jurisdiction governing the employment
-- relationship, where applicable. Deliberately seeded with ZERO rows:
-- Ordift has not yet decided which jurisdictions it formally employs
-- people under, and inventing one (even Ghana, where the Founder is
-- physically based) would be exactly the fabrication this stage's own
-- instruction forbids ("do not infer... from current physical
-- location... leave unresolved/pending"). A Founder/Super Admin adds
-- real jurisdictions here once genuinely decided — no code change
-- needed when that happens.
create table public.employment_jurisdictions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  name text not null,
  slug text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (business_id, slug)
);

comment on table public.employment_jurisdictions is
  'The jurisdiction governing an employment relationship, where applicable. Deliberately empty at creation — no jurisdiction is assumed or hard-coded. No tax/immigration/visa/statutory-payroll logic exists anywhere referencing this table; it only establishes WHICH jurisdiction applies, for future policy to reference.';

alter table public.employment_jurisdictions enable row level security;

create policy "employment_jurisdictions: staff read" on public.employment_jurisdictions
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.employment_jurisdictions to authenticated;
grant select, insert, update, delete on public.employment_jurisdictions to service_role;

-- Hire origin + employment context on the requisition — the single
-- place a hire's Position/Department/Grade/Engagement Type/manager/
-- start date already lives (public.recruitment_requisitions,
-- migration 0046). staff_onboarding deliberately does NOT duplicate
-- any of this — see staff_onboarding.requisition_id below instead.
alter table public.recruitment_requisitions
  add column if not exists hire_origin text not null default 'standard_recruitment',
  add column if not exists direct_hire_profile_id uuid references public.profiles (id),
  add column if not exists employing_entity_id uuid references public.employing_entities (id),
  add column if not exists employment_jurisdiction_id uuid references public.employment_jurisdictions (id),
  add column if not exists work_location text;

-- A Founder Direct Hire must name exactly who is being hired; a
-- standard-recruitment requisition must NOT (that candidate is
-- determined later, via recruitment_applications/interview panels,
-- per the existing architecture) — this constraint keeps the two
-- origins structurally distinct rather than relying on convention.
alter table public.recruitment_requisitions
  add constraint recruitment_requisitions_direct_hire_consistency check (
    (hire_origin = 'founder_direct_hire' and direct_hire_profile_id is not null)
    or (hire_origin = 'standard_recruitment' and direct_hire_profile_id is null)
  );

comment on column public.recruitment_requisitions.hire_origin is
  'standard_recruitment (default, matches every pre-existing row) | founder_direct_hire — see createRecruitmentRequisition()''s dedicated Super-Admin-only enforcement for the latter (src/lib/recruitment/requisitions.ts). Not a bypass: a direct hire still produces a real, approvable requisition through the same decideRequisition() gate as any other.';
comment on column public.recruitment_requisitions.employing_entity_id is
  'Nullable/pending where genuinely undecided — never inferred or fabricated.';
comment on column public.recruitment_requisitions.employment_jurisdiction_id is
  'Nullable/pending where genuinely undecided — never inferred from a person''s physical location or any other assumption.';

-- The one new link staff_onboarding needs: which approved hire
-- definition it originated from. Nullable — every historical
-- onboarding record (created before this migration) has none, and
-- must remain fully readable exactly as before; nothing here is
-- backfilled or fabricated for them.
alter table public.staff_onboarding
  add column if not exists requisition_id uuid references public.recruitment_requisitions (id);

comment on column public.staff_onboarding.requisition_id is
  'The approved recruitment_requisitions row (standard recruitment or Founder Direct Hire) this onboarding originated from. Null for historical records created before this column existed (Sequence 1, E.5 Stage 2M) — genuinely unknown, never backfilled with an invented value. New onboarding records require this (see startStaffOnboarding()''s own enforcement) so an orphan employee onboarding with no approved hire definition cannot be created going forward.';

commit;
