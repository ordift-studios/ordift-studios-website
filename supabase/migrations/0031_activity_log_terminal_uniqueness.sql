-- TD-043 defense-in-depth: terminal payment-outcome activity uniqueness
-- (2026-08-19, approved decision report; extended 2026-08-19 with the
-- Production-specific annotation once TD-043's own Production
-- pre-flight check surfaced a third, independently-discovered
-- duplicate pair on PAY-2026-000001 — see below)
--
-- Migration 0030 deferred partial unique indexes on activity_log for
-- payment.completed/payment.failed/payment.amount_mismatch because a
-- pre-migration check found exactly two pre-existing duplicate pairs
-- on Staging (PAY-2026-000033, PAY-2026-000040), each carrying two
-- genuine, independently-triggered activity_log rows (one 'verify',
-- one 'webhook') predating migration 0030's atomic
-- claim_and_log_payment_activity(). Per explicit instruction, those
-- rows are historical evidence of the original TD-043 defect and must
-- never be deleted, merged, or rewritten merely to make a constraint
-- pass.
--
-- This migration closes that gap without touching a single pre-existing
-- value on those rows: it adds two new, purely additive nullable
-- columns (duplicate_of_id, duplicate_reason), sets them on exactly the
-- already-identified rows (each later-timestamped row of a pair
-- pointing back at its earlier sibling — an ordering convention, not a
-- truth claim; both rows in each pair are equally genuine), and then
-- installs the three partial unique indexes scoped to exclude
-- annotated rows. Every column that existed on these rows before this
-- migration (action, entity_type, entity_id, actor_user_id, metadata,
-- created_at, id) is identical after it — verified by dedicated
-- integration test (activityLogDuplicateProtection.integration.test.ts)
-- and by direct read-only query in the verification report.
--
-- The earlier row of each pair is deliberately left un-annotated
-- (duplicate_of_id remains null), so it continues to occupy the
-- uniqueness slot for its payment — meaning every annotated payment
-- also gains forward protection against any hypothetical future
-- duplicate, not just newly-created payments.
--
-- Two environments, three independently-identified pairs: the first
-- two UPDATE blocks below (PAY-2026-000033, PAY-2026-000040) correspond
-- to the historical duplicates already handled on Staging. The third
-- block (PAY-2026-000001) corresponds to Production's own,
-- independently-identified historical duplicate, found via Production's
-- own TD-043 migration pre-flight check ahead of this migration's
-- promotion there. Every UPDATE below is deliberately scoped to one
-- exact row id — in any environment where that specific id doesn't
-- exist, the statement matches zero rows and is a harmless no-op; none
-- of them depend on which environment the migration is run against.
--
-- ENQ-2026-000034, ENQ-2026-000035, and TD-044 are untouched by this
-- migration — it only ever writes to activity_log, by exact row id.

alter table public.activity_log
  add column duplicate_of_id uuid references public.activity_log (id),
  add column duplicate_reason text;

comment on column public.activity_log.duplicate_of_id is
  'TD-043 — set only for pre-existing historical duplicate terminal-payment-outcome rows identified by the TD-043 investigation, pointing at the sibling row in the same duplicate pair. Never set by application code; only by a one-time, explicitly-approved migration. The unmarked sibling remains the row that occupies the uniqueness slot for its payment, so historical payments stay protected against future duplicates too.';

comment on column public.activity_log.duplicate_reason is
  'TD-043 — human-readable explanation for why duplicate_of_id is set on this row. Null for every row except the annotated historical duplicates.';

-- The rows below were each re-verified read-only, by exact id, in their
-- own environment, immediately before being added here — see the
-- approved decision report and
-- activityLogDuplicateProtection.integration.test.ts for the exact
-- values every other column on the Staging rows must still match
-- afterward, and the TD-043A/Production pre-flight verification record
-- for the Production row's values.

-- Staging — PAY-2026-000033 (entity_id 50de7bfa-3382-4ba4-ae2a-c31ca95a6625):
-- earlier row (verify, 2026-08-18T22:08:57.444622+00:00) stays
-- unmarked; later row (webhook, 2026-08-18T22:08:58.460878+00:00) is
-- annotated as the duplicate.
update public.activity_log
set duplicate_of_id = '1029f875-fe89-4358-b8b2-54512b985910',
    duplicate_reason = 'TD-043 — historical duplicate payment.completed activity, pre-dates migration 0030''s atomic claim_and_log_payment_activity(). Both this row and 1029f875-fe89-4358-b8b2-54512b985910 are genuine, independently-triggered records (verify vs webhook) of PAY-2026-000033''s completion; neither is false. Preserved unchanged as evidence, annotated only, never deleted or altered otherwise.'
where id = 'd6cecc78-8753-44ca-83d3-2c77f144c36d';

-- Staging — PAY-2026-000040 (entity_id e9bdae00-e555-477f-a083-2cf17e97df0c):
-- earlier row (verify, 2026-08-18T23:33:32.262604+00:00) stays
-- unmarked; later row (webhook, 2026-08-18T23:33:32.658475+00:00) is
-- annotated as the duplicate.
update public.activity_log
set duplicate_of_id = 'ef022fb1-34e6-420d-a669-17c965cc250f',
    duplicate_reason = 'TD-043 — historical duplicate payment.completed activity, pre-dates migration 0030''s atomic claim_and_log_payment_activity(). Both this row and ef022fb1-34e6-420d-a669-17c965cc250f are genuine, independently-triggered records (verify vs webhook) of PAY-2026-000040''s completion; neither is false. Preserved unchanged as evidence, annotated only, never deleted or altered otherwise.'
where id = '768cc88f-1b42-4467-8792-6ed491bf2ba4';

-- Production — PAY-2026-000001 (entity_id 01af6ad0-62b7-400d-950f-342bc2da3d21),
-- Production's own first real transaction: earlier row (webhook,
-- 2026-08-14T11:13:37.538939+00:00) stays unmarked; later row (verify,
-- 2026-08-14T11:13:38.359767+00:00) is annotated as the duplicate.
-- Identified via Production's own TD-043 migration pre-flight check,
-- independently of the two Staging pairs above. This statement is a
-- harmless no-op on any environment where this exact row id doesn't
-- exist (e.g. Staging, or a fresh environment built from these
-- migrations) — it only ever matches Production's own row.
update public.activity_log
set duplicate_of_id = '4850a91a-1cf2-4a8b-b935-f46d3ad9bbb0',
    duplicate_reason = 'TD-043 — historical duplicate payment.completed activity for PAY-2026-000001 (Production), pre-dates migration 0030''s atomic claim_and_log_payment_activity(). Both this row and 4850a91a-1cf2-4a8b-b935-f46d3ad9bbb0 are genuine, independently-triggered records (webhook vs verify) of PAY-2026-000001''s completion; neither is false. Preserved unchanged as evidence, annotated only, never deleted or altered otherwise.'
where id = 'c9ecbb5b-8227-42c1-bf6b-4298960e552e';

-- Targeted uniqueness for exactly the three terminal payment-outcome
-- actions, excluding annotated legacy duplicates. Any other
-- entity_type/action pair (e.g. a portfolio project's lifecycle
-- transitions, or a legitimately-repeatable action such as
-- payment.receipt_retry) is untouched — these indexes' predicates only
-- ever match entity_type = 'payment' and one of the three exact action
-- strings.
create unique index activity_log_payment_completed_once
  on public.activity_log (entity_id)
  where entity_type = 'payment' and action = 'payment.completed' and duplicate_of_id is null;

create unique index activity_log_payment_failed_once
  on public.activity_log (entity_id)
  where entity_type = 'payment' and action = 'payment.failed' and duplicate_of_id is null;

create unique index activity_log_payment_amount_mismatch_once
  on public.activity_log (entity_id)
  where entity_type = 'payment' and action = 'payment.amount_mismatch' and duplicate_of_id is null;
