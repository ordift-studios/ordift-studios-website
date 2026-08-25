-- Ordift Organizational & Administrative Architecture V1, Phase 3.3,
-- Part A (2026-08-25): promote CHANCELLOR to the sixth GR.9 peer
-- executive.
--
-- Reclassifies the existing Position in place (per explicit
-- instruction: "Promote/reclassify the POSITION itself") rather than
-- creating a new row and retiring the old one — the same Position
-- record that has held the CHANCELLOR call sign since Phase 3.1
-- continues to; only its name, Grade, and structural reporting parent
-- change. slug is deliberately left as 'director-executive-administration'
-- (not renamed) — slugs are internal stable keys never shown to users
-- (the display name is what changes), and this Position is still
-- referenced by id (not slug) from staff_details/reports_to_position_id
-- FKs, so nothing depends on the slug text matching the new title.
-- department_id (Executive & Administration) is unchanged — same
-- precedent as PRIME/COO, which also stays administratively housed in
-- that department despite being a top-tier peer executive.
--
-- Zero real people affected: nobody occupies this Position (confirmed
-- live before this migration).

begin;

update public.positions p
set
  name = 'Chief Administration & Governance Officer',
  default_grade_id = g9.id,
  reports_to_position_id = chief.id
from public.grades g9, public.positions chief
where p.slug = 'director-executive-administration'
  and g9.grade_code = 'G9'
  and chief.slug = 'founder-ceo';

commit;
