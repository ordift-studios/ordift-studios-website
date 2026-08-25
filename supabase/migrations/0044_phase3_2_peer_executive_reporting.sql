-- Ordift Organizational & Administrative Architecture V1, Phase 3.2
-- (2026-08-25): correct the GR.9 reporting chain — all five GR.9
-- executive Positions (PRIME/COO, VAULT/CFO, ARCHITECT/CSO, PULSE/CPO,
-- GEEK/CTO) are peer executives who report directly to CHIEF/Founder &
-- CEO. PRIME is not their reporting parent.
--
-- Phase 3.1's migration (0043) set VAULT/ARCHITECT/PULSE/GEEK to report
-- to the COO, because at the time no explicit peer-executive direction
-- had been given and COO was the nearest existing superior in the
-- chain. chief-operating-officer-coo itself already correctly reports
-- to founder-ceo (set back in Phase 3's original migration, 0042) —
-- that relationship is untouched here.
--
-- Director, Executive & Administration (CHANCELLOR, G8) is NOT part of
-- this correction — it is a department Director, not a GR.9 executive,
-- and correctly continues reporting to the COO (PRIME), exactly like
-- the other three department Directors (MAESTRO/ENVOY/CURATOR).
--
-- Purely structural (positions.reports_to_position_id) — no
-- staff_details row is touched. Zero real people affected: no account
-- currently occupies any of the five GR.9 Positions.

begin;

update public.positions p set reports_to_position_id = chief.id
from public.positions chief
where chief.slug = 'founder-ceo'
  and p.slug in ('chief-financial-officer', 'chief-strategy-officer', 'chief-people-hr-officer', 'chief-technology-officer')
  and p.reports_to_position_id is distinct from chief.id;

commit;
