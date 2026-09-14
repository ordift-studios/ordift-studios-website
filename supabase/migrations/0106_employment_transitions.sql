-- Ordift Studios Compliance/COMP-SYS-1, Phase B6 Step 2 (2026-09-15) —
-- INTERNATIONAL EMPLOYMENT TRANSITIONS architecture.
--
-- Extends the existing effective-dated employment_terms_history table
-- (migration 0086) rather than inventing a parallel "transitions"
-- table — every transition genuinely IS a new snapshot row already;
-- this migration only adds the ability to classify WHY a snapshot was
-- taken and to flag one as needing enhanced review.
--
-- Deliberately does NOT touch position_id/grade_id/manager_id: Position
-- assignment already drives Department, Craft, and Grade together as
-- one governed decision (assignStaffPosition(), src/lib/organization/assignPosition.ts,
-- "do not leave the old independent manual Grade selector as the
-- normal workflow" — an existing, prior Founder decision), and the
-- authoritative reporting line is derived from Position's own
-- reporting chain, not from this table's manager_id column. A country
-- transfer recorded through this migration's new mechanism and a
-- promotion recorded through assignStaffPosition() are therefore
-- ALREADY two structurally separate, independently-audited actions —
-- exactly the "distinct auditable actions even if approved at the same
-- time" requirement, without this migration needing to touch Position/
-- Grade at all.

begin;

-- transition_type/notes/enhanced_review_required are all set in the
-- SAME single insert that creates the snapshot row
-- (recordEmploymentTransition(), employmentTermsHistory.ts) — this
-- table grants service_role INSERT only, never UPDATE (see migration
-- 0086's own comment: "Insert-only for service_role — append-only/
-- immutable at the database level"), so no code path may ever UPDATE a
-- row here once created, including this migration's own new columns.
alter table public.employment_terms_history
  add column if not exists transition_type text,
  add column if not exists currency text,
  add column if not exists enhanced_review_required boolean not null default false,
  add column if not exists notes text;

comment on column public.employment_terms_history.transition_type is 'Nullable — populated only for a snapshot recorded through recordEmploymentTransition() (employmentTermsHistory.ts). Historical rows recorded before this column existed, or via the older generic recordEmploymentTermsSnapshot() (e.g. source=''position_assignment''), have no transition_type and are not reclassified retroactively. One of EMPLOYMENT_TRANSITION_TYPES: permanent_international_transfer | temporary_international_assignment | secondment_inter_entity_assignment | temporary_relocation | repatriation | employing_entity_change | work_location_change | jurisdiction_change | payroll_currency_change | immigration_work_authorization_dependency | compensation_change. Deliberately excludes role/title, grade, and reporting-line changes — those remain governed exclusively by assignStaffPosition(), never duplicated here.';
comment on column public.employment_terms_history.currency is 'The currency this snapshot''s basic_salary is paid in — kept independent of employing_entities.default_currency because a temporary international assignment or secondment can genuinely be paid in a different currency than the employing entity''s default (e.g. a Ghana entity temporarily paying a seconded employee in USD). Nullable/pending where genuinely undecided, never inferred from the entity.';
comment on column public.employment_terms_history.enhanced_review_required is 'Computed by doesTransitionRequireEnhancedReview() (employmentTermsHistory.ts) at the moment a transition is recorded — true for every genuinely international/inter-entity transition type, so it can never silently inherit the previous jurisdiction''s legal/immigration/payroll rules without a flagged review. Whether that review has been COMPLETED is tracked separately in employment_transition_reviews below, never by updating this row.';

-- ============================================================
-- employment_transition_reviews — append-only completion events
-- ============================================================
-- A transition's own row can never be updated to mark review complete
-- (see above) — completion is instead its own append-only event,
-- exactly the same "record a new fact, never mutate an old one"
-- principle this whole table already follows.
create table public.employment_transition_reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  employment_terms_history_id uuid not null references public.employment_terms_history (id) unique,
  completed_at timestamptz not null default now(),
  completed_by uuid not null references public.profiles (id),
  notes text
);

comment on table public.employment_transition_reviews is 'Append-only record that the enhanced legal/immigration/payroll/jurisdiction review for one employment_terms_history transition was completed — unique on employment_terms_history_id so a transition can be marked reviewed at most once. Existence of a row here (joined against employment_terms_history.enhanced_review_required) is what "reviewed" means; the transition row itself is never updated.';

alter table public.employment_transition_reviews enable row level security;

create policy "employment_transition_reviews: staff read" on public.employment_transition_reviews
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.employment_transition_reviews to authenticated;
grant select, insert on public.employment_transition_reviews to service_role;

commit;
