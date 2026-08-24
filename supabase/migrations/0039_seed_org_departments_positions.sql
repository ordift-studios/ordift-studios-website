-- Ordift Organizational & Administrative Architecture V1, Phase 2: seed
-- the approved Department + Position catalogue (2026-08-25).
--
-- Real organizational catalogue/configuration data, per explicit
-- direction — not sample/test/fake data. No staff member is assigned to
-- any of this; department_id/position_id remain unset on every existing
-- staff_details row (currently zero rows in Production, confirmed
-- during Phase 1). Idempotent: every insert uses ON CONFLICT DO NOTHING
-- against the existing unique(business_id, slug) constraint, safe to
-- re-run.
--
-- default_grade_id is resolved by grade_code lookup against the
-- existing public.grades table (structurally unchanged, names aligned
-- in 0038) — never a hardcoded/guessed id. operational_title_id is
-- resolved by slug lookup against the existing 16 public.operational_titles
-- rows (0009) where a genuine craft correspondence exists; left NULL
-- everywhere else per explicit instruction not to invent new craft
-- taxonomy entries without separate approval — see the Phase 2 report
-- for the full mapping and the gaps this leaves (no existing
-- operational_title covers marketing/client-services or talent-
-- coordination crafts).
--
-- default_role_slug is deliberately left NULL on every row in this
-- migration — see the Phase 2 report's explicit confirmation that
-- nothing reads this column yet, and the decision to defer even
-- advisory role suggestions until the dedicated authorization phase.

begin;

-- ============================================================
-- Departments
-- ============================================================
insert into public.departments (slug, name, sort_order) values
  ('executive-administration', 'Executive & Administration', 10),
  ('creative-production', 'Creative & Production', 20),
  ('client-marketing-commercial', 'Client, Marketing & Commercial', 30),
  ('talent-model-management', 'Talent & Model Management', 40)
on conflict (business_id, slug) do nothing;

-- ============================================================
-- Positions — Executive & Administration
-- ============================================================
insert into public.positions (department_id, operational_title_id, name, slug, default_grade_id, sort_order)
select d.id, null, v.name, v.slug, g.id, v.sort_order
from (values
  ('Founder & CEO', 'founder-ceo', 'G10', 10),
  ('Chief Operating Officer (COO)', 'chief-operating-officer-coo', 'G9', 20),
  ('Administrative / Operations Manager', 'administrative-operations-manager', 'G7', 30),
  ('Administrative Officer', 'administrative-officer', 'G4', 40),
  ('Administrative Assistant', 'administrative-assistant', 'G2', 50)
) as v(name, slug, grade_code, sort_order)
join public.departments d on d.slug = 'executive-administration'
join public.grades g on g.grade_code = v.grade_code
on conflict (business_id, slug) do nothing;

-- ============================================================
-- Positions — Creative & Production
-- ============================================================
insert into public.positions (department_id, operational_title_id, name, slug, default_grade_id, sort_order)
select d.id, ot.id, v.name, v.slug, g.id, v.sort_order
from (values
  ('Creative Director', 'creative-director', 'G8', 'creative_director', 10),
  ('Studio / Production Manager', 'studio-production-manager', 'G7', null, 20),
  ('Production Supervisor', 'production-supervisor', 'G6', null, 30),
  ('Senior Photographer', 'senior-photographer', 'G5', 'photographer', 40),
  ('Senior Videographer', 'senior-videographer', 'G5', 'videographer', 50),
  ('Senior Retoucher / Editor', 'senior-retoucher-editor', 'G5', 'retoucher', 60),
  ('Photographer', 'photographer', 'G4', 'photographer', 70),
  ('Videographer', 'videographer', 'G4', 'videographer', 80),
  ('Retoucher / Photo Editor', 'retoucher-photo-editor', 'G4', 'retoucher', 90),
  ('Video Editor', 'video-editor', 'G4', 'video_editor', 100),
  ('Junior Photographer', 'junior-photographer', 'G3', 'photographer', 110),
  ('Junior Videographer', 'junior-videographer', 'G3', 'videographer', 120),
  ('Junior Editor / Retoucher', 'junior-editor-retoucher', 'G3', 'retoucher', 130),
  ('Studio / Production Assistant', 'studio-production-assistant', 'G2', 'production_assistant', 140),
  ('Creative / Production Intern', 'creative-production-intern', 'G1', null, 150)
) as v(name, slug, grade_code, title_slug, sort_order)
join public.departments d on d.slug = 'creative-production'
join public.grades g on g.grade_code = v.grade_code
left join public.operational_titles ot on ot.slug = v.title_slug
on conflict (business_id, slug) do nothing;

-- ============================================================
-- Positions — Client, Marketing & Commercial
-- ============================================================
insert into public.positions (department_id, operational_title_id, name, slug, default_grade_id, sort_order)
select d.id, null, v.name, v.slug, g.id, v.sort_order
from (values
  ('Commercial / Marketing Director', 'commercial-marketing-director', 'G8', 10),
  ('Client & Marketing Manager', 'client-marketing-manager', 'G7', 20),
  ('Client Services Supervisor', 'client-services-supervisor', 'G6', 30),
  ('Senior Client Relations Officer', 'senior-client-relations-officer', 'G5', 40),
  ('Business Development Officer', 'business-development-officer', 'G4', 50),
  ('Client Relations Officer', 'client-relations-officer', 'G4', 60),
  ('Marketing / Communications Officer', 'marketing-communications-officer', 'G4', 70),
  ('Social Media / Content Officer', 'social-media-content-officer', 'G4', 80),
  ('Junior Client Services Officer', 'junior-client-services-officer', 'G3', 90),
  ('Client Services Assistant', 'client-services-assistant', 'G2', 100),
  ('Marketing / Commercial Intern', 'marketing-commercial-intern', 'G1', 110)
) as v(name, slug, grade_code, sort_order)
join public.departments d on d.slug = 'client-marketing-commercial'
join public.grades g on g.grade_code = v.grade_code
on conflict (business_id, slug) do nothing;

-- ============================================================
-- Positions — Talent & Model Management
-- ============================================================
insert into public.positions (department_id, operational_title_id, name, slug, default_grade_id, sort_order)
select d.id, ot.id, v.name, v.slug, g.id, v.sort_order
from (values
  ('Talent / Model Management Director', 'talent-model-management-director', 'G8', null, 10),
  ('Talent Manager', 'talent-manager', 'G7', 'talent_manager', 20),
  ('Senior Talent Coordinator', 'senior-talent-coordinator', 'G5', null, 30),
  ('Talent / Model Coordinator', 'talent-model-coordinator', 'G4', null, 40),
  ('Talent Scout', 'talent-scout', 'G4', null, 50),
  ('Junior Talent Coordinator', 'junior-talent-coordinator', 'G3', null, 60),
  ('Talent Assistant', 'talent-assistant', 'G2', null, 70),
  ('Talent Management Intern', 'talent-management-intern', 'G1', null, 80)
) as v(name, slug, grade_code, title_slug, sort_order)
join public.departments d on d.slug = 'talent-model-management'
join public.grades g on g.grade_code = v.grade_code
left join public.operational_titles ot on ot.slug = v.title_slug
on conflict (business_id, slug) do nothing;

commit;
