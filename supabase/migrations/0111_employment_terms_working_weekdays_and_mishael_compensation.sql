-- Ordift Studios Compliance/COMP-SYS-1, Phase B7 Step 1 (2026-09-15) —
-- Mishael Adjei Employment Agreement Draft + Public Holiday / Working-
-- Day Calendar foundation.
--
-- Part 1: additive column. employment_terms_history (migration 0086)
-- has never carried any STRUCTURED representation of an employee's
-- working days — only the free-text work_pattern column (e.g.
-- "Monday-Friday, 08:00-17:00..."). The new Working-Day Resolver
-- (src/lib/organization/workingDayCalendar.ts) needs a real,
-- queryable answer to "which weekdays does this person ordinarily
-- work", and free text can't safely answer that. working_weekdays is
-- ISO weekday numbers (1=Monday..7=Sunday) — e.g. {1,2,3,4,5} for
-- Monday-Friday. Nullable and never backfilled for historical rows:
-- an old row genuinely never recorded this, and NULL here resolves to
-- UNRESOLVED in the calendar, never a guessed Monday-Friday default.
--
-- Part 2: Mishael's real compensation components. The Founder has now
-- supplied Housing/Transport/Clothing allowances (previously entirely
-- unrecorded) that must remain separate from Basic Salary, plus his
-- structured working-weekday set for the calendar. employment_terms_
-- history is INSERT-only (service_role has no UPDATE grant, migration
-- 0086) — this records a NEW snapshot at the same effective_from
-- (2026-09-18) as his current row, carrying every other field forward
-- unchanged (entity, jurisdiction, work location "Accra, Ghana" as
-- corrected by migration 0110, work pattern, basic salary, currency),
-- exactly the same append-only-correction pattern as migration 0110
-- itself. source is its own distinct, honest label — this is not an
-- employment_transition (no real transition_type from the 11
-- Founder-approved types fits "we are now recording previously-
-- unrecorded compensation components before day one"), and recorded_by
-- is NULL for the same reason migrations 0107/0110 used NULL: a
-- Founder-authorized, migration-time data entry from facts supplied
-- directly in conversation, not an authenticated in-app action.
--
-- allowances is recorded as a small structured object (label/amount/
-- currency/frequency per allowance) rather than a flat number, so a
-- future consumer (the agreement's "Allowances" variable, a payroll
-- computation, or a Founder-review display) can render or sum it
-- without re-parsing free text. Nothing here is a guess: the amounts
-- are exactly what the Founder specified as approved.

begin;

alter table public.employment_terms_history
  add column if not exists working_weekdays smallint[];

comment on column public.employment_terms_history.working_weekdays is
  'ISO weekday numbers (1=Monday..7=Sunday) this person ordinarily works, e.g. {1,2,3,4,5} for Monday-Friday. NULL means genuinely unconfigured — never assumed.';

insert into public.employment_terms_history (
  profile_id,
  effective_from,
  employing_entity_id,
  employment_jurisdiction_id,
  work_location,
  work_pattern,
  basic_salary,
  currency,
  allowances,
  working_weekdays,
  source,
  recorded_by
)
select
  current.profile_id,
  current.effective_from,
  current.employing_entity_id,
  current.employment_jurisdiction_id,
  current.work_location,
  current.work_pattern,
  current.basic_salary,
  current.currency,
  jsonb_build_object(
    'housing', jsonb_build_object('label', 'Housing Allowance', 'amount', 500.00, 'currency', 'GHS', 'frequency', 'monthly'),
    'transport', jsonb_build_object('label', 'Transport Allowance', 'amount', 300.00, 'currency', 'GHS', 'frequency', 'monthly'),
    'clothing', jsonb_build_object('label', 'Clothing Allowance', 'amount', 200.00, 'currency', 'GHS', 'frequency', 'monthly')
  ),
  array[1,2,3,4,5]::smallint[],
  'compensation_components_and_schedule_recorded',
  null
from public.employment_terms_history current
where current.profile_id = '218cc67f-e96d-4981-ae97-c53b4f73cee2'
  and current.allowances is null
order by current.effective_from desc, current.recorded_at desc
limit 1;

commit;
