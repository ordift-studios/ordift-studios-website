-- Ordift Organizational & Administrative Architecture V1, Phase 2.1,
-- Part A: complete the Operational Title / Craft taxonomy gap Phase 2
-- reported (2026-08-25).
--
-- Phase 2 left 22 of 39 Positions with operational_title_id = null
-- because no existing craft (of the original 16, migration 0009)
-- genuinely corresponded to marketing, client-services, business-
-- development, or talent-coordination work. Per explicit instruction,
-- this adds exactly 4 new reusable craft families — not one craft per
-- Position — and remaps only the Positions that genuinely correspond to
-- one of them. Positions with no genuine craft correspondence (all 5 in
-- Executive & Administration; Studio/Production Manager, Production
-- Supervisor, and Creative/Production Intern in Creative & Production —
-- general management/support roles spanning multiple crafts, same
-- treatment Phase 2 already gave them) are left null, unchanged, and are
-- out of this phase's scope.
--
-- Operational Title remains the craft/professional-family layer only —
-- Position remains authoritative for Department + Grade, exactly as
-- before. This migration never touches default_grade_id, department_id,
-- or any staff_details row.
--
-- Mapping rationale (full detail in the Phase 2.1 report):
--   marketing_communications      — Commercial/Marketing Director (head
--                                    of this craft ladder, same pattern
--                                    as Creative Director -> creative_director),
--                                    Marketing/Communications Officer,
--                                    Social Media/Content Officer,
--                                    Marketing/Commercial Intern.
--   client_services                — Client & Marketing Manager (leads
--                                    with "Client", heads this ladder),
--                                    Client Services Supervisor, Senior
--                                    Client Relations Officer, Client
--                                    Relations Officer, Junior Client
--                                    Services Officer, Client Services
--                                    Assistant.
--   business_development_commercial — Business Development Officer.
--   talent_coordination             — Senior/Junior Talent Coordinator,
--                                    Talent/Model Coordinator, Talent
--                                    Scout, Talent Assistant. Talent
--                                    Scout is grouped here rather than
--                                    given its own craft, per explicit
--                                    instruction to prefer reusable
--                                    families over one craft per Position.
--                                    Talent/Model Management Director is
--                                    mapped to the existing talent_manager
--                                    craft (head of that ladder), not this
--                                    new one — same director-reuses-
--                                    existing-craft pattern as above.

begin;

-- ============================================================
-- Four new crafts, continuing the existing sort_order sequence (16
-- existing rows end at 150).
-- ============================================================
insert into public.operational_titles (business_id, slug, name, sort_order) values
  (public.ordift_studios_business_id(), 'marketing_communications', 'Marketing / Communications', 160),
  (public.ordift_studios_business_id(), 'client_services', 'Client Services', 170),
  (public.ordift_studios_business_id(), 'business_development_commercial', 'Business Development / Commercial', 180),
  (public.ordift_studios_business_id(), 'talent_coordination', 'Talent Coordination', 190)
on conflict (business_id, slug) do nothing;

-- ============================================================
-- Remap the 18 Positions with a genuine correspondence. Matched by
-- Position slug (unique per business_id) against the new/existing
-- craft slug — never a hardcoded/guessed id.
-- ============================================================
update public.positions p
set operational_title_id = ot.id
from (values
  ('commercial-marketing-director', 'marketing_communications'),
  ('client-marketing-manager', 'client_services'),
  ('client-services-supervisor', 'client_services'),
  ('senior-client-relations-officer', 'client_services'),
  ('business-development-officer', 'business_development_commercial'),
  ('client-relations-officer', 'client_services'),
  ('marketing-communications-officer', 'marketing_communications'),
  ('social-media-content-officer', 'marketing_communications'),
  ('junior-client-services-officer', 'client_services'),
  ('client-services-assistant', 'client_services'),
  ('marketing-commercial-intern', 'marketing_communications'),
  ('talent-model-management-director', 'talent_manager'),
  ('senior-talent-coordinator', 'talent_coordination'),
  ('talent-model-coordinator', 'talent_coordination'),
  ('talent-scout', 'talent_coordination'),
  ('junior-talent-coordinator', 'talent_coordination'),
  ('talent-assistant', 'talent_coordination'),
  ('talent-management-intern', 'talent_coordination')
) as v(position_slug, title_slug)
join public.operational_titles ot on ot.slug = v.title_slug
where p.slug = v.position_slug
  and p.operational_title_id is distinct from ot.id;

commit;
