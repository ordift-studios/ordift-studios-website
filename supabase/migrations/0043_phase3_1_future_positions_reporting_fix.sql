-- Ordift Organizational & Administrative Architecture V1, Phase 3.1
-- (2026-08-25): the five approved future-reserved executive Positions,
-- and the reporting-chain correction now that a G8 Director tier exists
-- in Executive & Administration.
--
-- Purely additive/corrective. No existing role, RLS policy, or
-- roles/user_roles row is touched. No staff_details row is written by
-- this migration — these five Positions are created deliberately
-- unoccupied; no account is assigned to any of them.

begin;

-- ============================================================
-- Five approved future-reserved Positions, all in the existing
-- Executive & Administration department (no new department — Phase 2
-- explicitly approved only 4 departments; "Executive Leadership" in the
-- Phase 3.1 approval message is a descriptive grouping, not a request
-- for a 5th department). operational_title_id left null — no existing
-- craft corresponds to any of these, same treatment as every other
-- Executive & Administration Position.
-- ============================================================
insert into public.positions (department_id, operational_title_id, name, slug, default_grade_id, call_sign, sort_order)
select d.id, null, v.name, v.slug, g.id, v.call_sign, v.sort_order
from (values
  ('Chief Financial Officer', 'chief-financial-officer', 'G9', 'VAULT', 60),
  ('Chief Strategy Officer', 'chief-strategy-officer', 'G9', 'ARCHITECT', 70),
  ('Chief People / HR Officer', 'chief-people-hr-officer', 'G9', 'PULSE', 80),
  ('Chief Technology Officer', 'chief-technology-officer', 'G9', 'GEEK', 90),
  ('Director, Executive & Administration', 'director-executive-administration', 'G8', 'CHANCELLOR', 100)
) as v(name, slug, grade_code, call_sign, sort_order)
join public.departments d on d.slug = 'executive-administration'
join public.grades g on g.grade_code = v.grade_code
on conflict (business_id, slug) do nothing;

-- ============================================================
-- Reporting chain: the four Chief officers report to the COO (peer
-- executives to the existing three Directors, who also report to COO —
-- same tier, same pattern). The new Director, Executive & Administration
-- also reports to COO, matching the other three department Directors
-- exactly.
-- ============================================================
update public.positions p set reports_to_position_id = coo.id
from public.positions coo
where coo.slug = 'chief-operating-officer-coo'
  and p.slug in (
    'chief-financial-officer', 'chief-strategy-officer', 'chief-people-hr-officer',
    'chief-technology-officer', 'director-executive-administration'
  )
  and p.reports_to_position_id is distinct from coo.id;

-- Correction: Administrative/Operations Manager (G7) was seeded in
-- Phase 3 reporting directly to COO because no G8 Director existed yet
-- in this department (a real, reported gap at the time). Now that
-- Director, Executive & Administration exists, re-point it to match the
-- exact same pattern already used in every other department (G7 Manager
-- reports to that department's G8 Director, who reports to COO) —
-- correcting the chain now that the missing intermediate Position
-- exists is itself a "reporting structure changed" event per the
-- approved Phase 3.1 Part 6 principle, not a destructive change: it
-- only ever affects the structural positions.reports_to_position_id
-- column, never any real person's staff_details row (nobody currently
-- occupies Administrative/Operations Manager).
update public.positions p set reports_to_position_id = chancellor.id
from public.positions chancellor
where chancellor.slug = 'director-executive-administration'
  and p.slug = 'administrative-operations-manager'
  and p.reports_to_position_id is distinct from chancellor.id;

commit;
