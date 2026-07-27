-- Ordift Studios — service_role grants fix, round 2 (2026-07-27)
--
-- Same root cause as 0010_service_role_grants_fix.sql, hit again: this
-- project's production database has "Automatically expose new tables"
-- disabled, so `service_role` gets NO table-level privilege on a table
-- it didn't create, without an explicit grant — RLS bypass (a role
-- attribute) is a separate, unrelated layer from base table GRANTs,
-- which Postgres always enforces regardless.
--
-- Surfaced during production verification of the dual-storage/
-- reporting work (0013-0015): src/lib/shared/sheetSyncFailures.ts
-- inserts into sheet_sync_failures via the service-role admin client
-- directly (not through a SECURITY DEFINER function, unlike
-- record_sequences' access path via next_record_sequence()) — that
-- insert would fail with "permission denied for table
-- sheet_sync_failures" the moment a real Google Sheets append fails
-- after FORMS_SENDING_ENABLED is turned on, silently breaking the one
-- thing that table exists for. The same verification pass also found
-- enquiries, workshop_registrations, and project_requests missing
-- service_role grants entirely (pre-dating this session's work —
-- 0001/0008 only ever granted to `authenticated`), which blocks any
-- future admin script or background job that needs service-role
-- access to those tables, e.g. QA test-data cleanup.
--
-- record_sequences is NOT included below on purpose: every real access
-- to it goes through next_record_sequence(), a SECURITY DEFINER
-- function that runs with its owner's privileges regardless of the
-- caller's own table grants (see 0013's header) — so it was never
-- actually broken, just untested directly. Granted anyway, for the
-- same "every table gets explicit service_role grants" consistency
-- 0010 established, and so a future admin view of the raw counters
-- doesn't hit this exact same gap a third time.

begin;

grant select, insert, update, delete on public.enquiries to service_role;
grant select, insert, update, delete on public.workshop_registrations to service_role;
grant select, insert, update, delete on public.project_requests to service_role;
grant select, insert, update, delete on public.record_sequences to service_role;
grant select, insert, update, delete on public.sheet_sync_failures to service_role;

commit;
