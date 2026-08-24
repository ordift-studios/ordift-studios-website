-- Ordift Organizational & Administrative Architecture V1, Phase 2:
-- align existing Grade names/descriptions to the formally approved
-- architecture (2026-08-25).
--
-- The existing public.grades table (0017) is authoritative and STAYS
-- STRUCTURALLY UNCHANGED — same 10 rows, same grade_code values (G1-G10),
-- same rank_order (10-100), same id values, same table shape. This
-- migration updates ONLY the display `name` and `description` text on
-- each existing row, by grade_code, to match the grade architecture
-- approved in this phase. No row is inserted, deleted, or restructured.
--
-- Safe by construction: Production staff_details currently has zero
-- rows (confirmed during Phase 1 verification), so no existing staff
-- member's displayed Grade name changes as a result of this update —
-- there is no one assigned a Grade yet.

begin;

update public.grades set name = 'Interns / Trainees', description = 'Entry-level, supervised learning role.' where grade_code = 'G1';
update public.grades set name = 'Assistants', description = 'Supports a function under regular guidance.' where grade_code = 'G2';
update public.grades set name = 'Junior Professionals', description = 'Early-career, delivers defined tasks with growing independence.' where grade_code = 'G3';
update public.grades set name = 'Professionals', description = 'Experienced individual contributor, works independently.' where grade_code = 'G4';
update public.grades set name = 'Senior Professionals', description = 'Advanced individual contributor, minimal supervision, may guide others informally.' where grade_code = 'G5';
update public.grades set name = 'Supervisors / Team Leads', description = 'Day-to-day oversight of a team or function.' where grade_code = 'G6';
update public.grades set name = 'Managers', description = 'Owns a function or department''s operations.' where grade_code = 'G7';
update public.grades set name = 'Directors / Department Heads', description = 'Strategic ownership of a major department or business area.' where grade_code = 'G8';
update public.grades set name = 'C-Suite / Executive Leadership', description = 'Executive-level ownership across the organization.' where grade_code = 'G9';
update public.grades set name = 'Founder / CEO', description = 'Founder-level, highest tier.' where grade_code = 'G10';

commit;
