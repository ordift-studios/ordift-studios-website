-- Ordift Studios Founder Employment Workspace / Multi-Entity
-- Architecture Phase, Part B Sequence 2 (2026-09-15) — structured
-- work-pattern CLASSIFICATION, additive alongside (never replacing)
-- the existing free-text employment_terms_history.work_pattern
-- column. Same precedent as migration 0111's working_weekdays: a new
-- nullable column on an append-only table, zero backfill, zero risk
-- to any existing row (every historical snapshot simply reads null —
-- genuinely unclassified — until someone explicitly records a value
-- going forward).
--
-- Unconstrained text (no CHECK), matching this codebase's established
-- convention for an application-validated status/classification field
-- (leave_requests.status, agreements.status, etc.) — the three values
-- the application currently recognizes are 'fixed_schedule' |
-- 'shift_roster' | 'flexible_executive':
--   fixed_schedule     — a defined recurring daily schedule (the
--                        ordinary case; working_weekdays is expected
--                        to be meaningfully set alongside this).
--   shift_roster       — governed by an assigned shift/roster. This
--                        is ONLY a classification label at this
--                        stage — the actual shift/roster data model
--                        (assignments, rotations) remains a
--                        deliberately separate, later undertaking.
--   flexible_executive — a genuinely variable executive schedule
--                        (may work weekdays, evenings, weekends, at
--                        varying times) that is not accurately
--                        represented by any fixed working_weekdays
--                        set. Deliberately does NOT force a Monday-
--                        Friday (or any other) weekday array merely
--                        to satisfy working_weekdays — a
--                        flexible_executive person's working_weekdays
--                        may legitimately remain null, resolving
--                        UNRESOLVED in the working-day calendar
--                        exactly as it already does for anyone whose
--                        pattern is genuinely not yet configured, per
--                        that resolver's own established fail-closed
--                        contract (never guessed).
--
-- This column is never auto-assigned to anyone, including Founder
-- Member 0001 — every employment_terms_history row inserted by this
-- migration's own deploy is unaffected (no UPDATE statement exists
-- here at all); a value is only ever recorded when a human explicitly
-- selects one through the (also updated) Founder self-administration
-- or ordinary employment-terms forms.

begin;

alter table public.employment_terms_history
  add column if not exists work_pattern_type text;

comment on column public.employment_terms_history.work_pattern_type is
  'Structured work-pattern classification: fixed_schedule | shift_roster | flexible_executive (unconstrained text, application-validated, same precedent as leave_requests.status). Null means genuinely unclassified, never guessed. Deliberately separate from the free-text work_pattern column, which remains the source of truth for descriptive prose (e.g. specific hours/breaks). shift_roster is a classification label only — the real shift/roster assignment data model is a separate, later undertaking.';

commit;
