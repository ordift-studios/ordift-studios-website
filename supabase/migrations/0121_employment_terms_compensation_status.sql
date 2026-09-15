-- Ordift Studios Founder Employment Workspace / Multi-Entity
-- Architecture Phase, Part B Sequence 3 (2026-09-15) — Founder/Director
-- compensation-status CLASSIFICATION, additive alongside the existing
-- employment_terms_history.basic_salary/currency columns, structurally
-- separate from salary amount, grade, title, employment status,
-- work-pattern classification, and authority/access. Same precedent as
-- migrations 0111 (working_weekdays) and 0120 (work_pattern_type): a
-- new nullable column on an append-only table, zero backfill, zero
-- risk to any existing row.
--
-- Unconstrained text (no CHECK), matching this codebase's established
-- convention for an application-validated status/classification field.
-- Only ONE value is currently recognized by the application:
--   not_yet_determined — an explicit, legally-neutral "this
--                        Founder/Director compensation classification
--                        decision has been deliberately deferred"
--                        marker. It is NOT a legal characterization of
--                        the relationship (e.g. it does not assert
--                        "Director" vs "employee" status under Ghana's
--                        Companies Act 2019 / Labour Act 2003) — that
--                        determination is a genuine legal/policy
--                        question outside this codebase's authority,
--                        and further classification values (e.g.
--                        distinguishing an unpaid-Director arrangement
--                        from a deferred employment salary) can only
--                        be added once it is resolved. See the Part B
--                        Sequence 3 report for the precise open
--                        question.
--
-- This column is never auto-assigned to anyone, including Founder
-- Member 0001 — no UPDATE statement exists in this migration at all;
-- a value is only ever recorded when a human explicitly selects it
-- through the (also updated) Founder self-administration form.

begin;

alter table public.employment_terms_history
  add column if not exists compensation_status text;

comment on column public.employment_terms_history.compensation_status is
  'Founder/Director compensation CLASSIFICATION (unconstrained text, application-validated). Currently only "not_yet_determined" is recognized: an explicit, legally-neutral deferred-decision marker, never a legal characterization of Director vs employee status. Structurally separate from basic_salary/currency, grade, title, employment status, and work_pattern_type. Null means genuinely unconsidered. Further values require a resolved Ghanaian legal/policy determination — never guessed.';

commit;
