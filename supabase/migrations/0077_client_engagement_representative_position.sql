-- E.5 Real-World Validation, Stage 2D (2026-09-11) — Position catalogue
-- addition: "Client Engagement Representative". Purely additive — one
-- new row in public.positions, referencing only existing catalogue
-- rows. Nothing existing is altered: no new department, no new grade,
-- no new/duplicate operational_titles row, no default_role_slug (this
-- Position, like every other non-leadership Position, grants zero
-- system role and zero authority_grants by itself).
--
-- Why this exists: Stage 2B/2C of the Organizational Structure/
-- Authority real-world validation (Decision Gate E.5) found that
-- "Client Engagement Representative" already exists as a genuine,
-- reusable operational_titles row (set on a real person's
-- staff_details on 2026-07-28, unrelated to this migration) with no
-- formal Position linked to it — every existing Client-department
-- Position collapses to the broader "Client Services" operational
-- title instead. Founder decision (Stage 2D): add the missing Position
-- rather than force a real person's genuine current operational
-- assignment to be overwritten by assignStaffPosition()'s existing
-- "Position drives Grade/Craft" behavior merely to complete a
-- validation exercise.
--
-- Default Grade: G4 (Professionals) — Founder decision, explicitly NOT
-- inferred from the person currently holding the operational title;
-- matches this department's other standard individual-contributor
-- Positions (Client Relations Officer, Marketing/Communications
-- Officer, Business Development Officer, Social Media/Content Officer
-- — all G4/Professionals).
--
-- Multi-occupancy: no uniqueness constraint is added here, and none
-- exists on staff_details.position_id anywhere in the schema (verified
-- directly, migrations 0001-0076) — this Position is exactly as
-- multi-occupant-capable as every other Position in the catalogue,
-- matching the explicit Founder requirement.

begin;

insert into public.positions (
  business_id,
  name,
  slug,
  department_id,
  operational_title_id,
  default_grade_id,
  reports_to_position_id,
  sort_order,
  active
)
select
  public.ordift_studios_business_id(),
  'Client Engagement Representative',
  'client-engagement-representative',
  dept.id,
  ot.id,
  g.id,
  rt.id,
  65, -- between Client Relations Officer (60) and Marketing/Communications Officer (70), same G4 tier
  true
from public.departments dept
cross join public.operational_titles ot
cross join public.grades g
cross join public.positions rt
where dept.slug = 'client-marketing-commercial'
  and ot.slug = 'client_engagement_representative'
  and g.rank_order = 40 -- Professionals (G4)
  and rt.slug = 'client-services-supervisor'
on conflict (business_id, slug) do nothing;

commit;
