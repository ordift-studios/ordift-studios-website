-- Google Workspace Corporate Email — Milestone 1B: internal
-- provisioning foundation (2026-09-10). Additive only — no existing
-- row's meaning changes; every corporate_identities row today is
-- status='reserved' with these two new columns null, exactly the same
-- as before this migration.
--
-- This migration adds ONLY the two columns the new provisioning
-- lifecycle genuinely needs beyond what migration 0046 already
-- provided (status/provider/external_mailbox_id/
-- provisioning_requested_at/provisioned_at all already existed and are
-- reused as-is, untouched here):
--   - provisioning_type: which kind of external identity would
--     eventually be provisioned (licensed_mailbox / alias / group).
--     Recorded at request time so the eventual real-provider call
--     knows what to create — modeled now, even though only
--     'licensed_mailbox' has real workflow support in this milestone,
--     per explicit instruction not to overbuild alias/group handling
--     yet while still keeping the data model ready for them.
--   - provisioning_failure_reason: the human-readable reason the LAST
--     provisioning attempt failed (already_exists / unavailable /
--     ambiguous / a generic message for an unexpected provider error),
--     cleared on a successful attempt. Kept as a plain, present-tense
--     "why is this row currently failed" fact on the row itself,
--     separate from activity_log's full historical trail of every
--     attempt — the same "row = current state, activity_log = history"
--     split already used throughout this table (e.g. deactivated_at
--     alongside the status-change log entry).
--
-- No new status value is introduced — the lifecycle this milestone
-- implements (reserved -> pending_provisioning -> active, or ->
-- provisioning_failed on any non-success outcome) uses exactly the
-- five status values migration 0046 already defined.

begin;

alter table public.corporate_identities
  add column if not exists provisioning_type text
    check (provisioning_type is null or provisioning_type in ('licensed_mailbox', 'alias', 'group')),
  add column if not exists provisioning_failure_reason text;

comment on column public.corporate_identities.provisioning_type is
  'Which kind of external identity a provisioning request/attempt targets. Set when provisioning is first requested (still reserved -> pending_provisioning transition); read by the real provider implementation once one exists. Only ''licensed_mailbox'' has a built workflow as of the 2026-09-10 internal foundation milestone — alias/group are recognized values for a future phase, deliberately not yet exposed in the Admin UI.';

comment on column public.corporate_identities.provisioning_failure_reason is
  'Human-readable reason the most recent provisioning attempt failed (already_exists / unavailable / ambiguous / a generic message for an unexpected provider error). Null while reserved, while pending, or once a provisioning attempt has succeeded. The full historical record of every attempt (not just the latest) lives in activity_log, per this project''s standing row-vs-log-history convention.';

commit;
