-- Ordift Studios Compliance/COMP-SYS-1, Phase B6 Step 9 (2026-09-15) —
-- Mishael Adjei Employment Record Reconciliation. The Founder's
-- continuation instruction restates his work location as "Accra,
-- Ghana" — more specific than the "Ghana" recorded by migration 0107.
-- Inspection (this session, direct Production query against
-- employment_terms_history) confirmed the current row genuinely still
-- reads the less-specific "Ghana", so this is a real, Founder-supplied
-- correction, not a duplicate write of an already-correct fact.
--
-- employment_terms_history is INSERT-only (service_role has no UPDATE
-- grant — migration 0086's own comment, re-confirmed this session) —
-- exactly as migration 0106 relies on for a genuine transition, this
-- records a NEW snapshot rather than rewriting the existing row.
-- getCurrentEmploymentTerms() orders by effective_from desc, then
-- recorded_at desc (src/lib/organization/employmentTermsHistory.ts),
-- so this row — same effective_from (2026-09-18), a later recorded_at
-- — correctly becomes "current" without altering history.
--
-- This is NOT recorded as an employment_transition (recordEmploymentTransition()/
-- migration 0106's 11 transition types): nothing about Mishael's
-- employment has actually changed — this only makes the already-agreed
-- location more specific before his commencement date is even reached.
-- Using a real transition_type here would fabricate an employment
-- event that never occurred. source is instead its own distinct,
-- honestly-labeled value so the audit trail never confuses this with
-- either the original commencement snapshot or a real transition.
--
-- Every other field is carried forward verbatim from the existing row
-- (employing_entity_id, employment_jurisdiction_id, work_pattern,
-- basic_salary, currency) — only work_location changes. position_id/
-- department_id/grade_id/manager_id remain NULL, exactly as migration
-- 0107 left them (governed exclusively by assignStaffPosition(), never
-- by this table). recorded_by is NULL for the same reason migration
-- 0107 used NULL: a Founder-authorized, migration-time data entry from
-- facts supplied directly in conversation, not an authenticated in-app
-- action by a specific admin user.

begin;

insert into public.employment_terms_history (
  profile_id,
  effective_from,
  employing_entity_id,
  employment_jurisdiction_id,
  work_location,
  work_pattern,
  basic_salary,
  currency,
  source,
  recorded_by
)
select
  current.profile_id,
  current.effective_from,
  current.employing_entity_id,
  current.employment_jurisdiction_id,
  'Accra, Ghana',
  current.work_pattern,
  current.basic_salary,
  current.currency,
  'work_location_specificity_correction',
  null
from public.employment_terms_history current
where current.profile_id = '218cc67f-e96d-4981-ae97-c53b4f73cee2'
  and current.work_location = 'Ghana'
  and not exists (
    select 1 from public.employment_terms_history already
    where already.profile_id = '218cc67f-e96d-4981-ae97-c53b4f73cee2'
      and already.work_location = 'Accra, Ghana'
  )
order by current.effective_from desc, current.recorded_at desc
limit 1;

commit;
