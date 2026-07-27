-- Ordift Studios — Project Requests Google Sheets integration (2026-07-27)
--
-- Context: Project Requests (client-portal requests against an existing
-- enquiry/workshop registration — supabase/migrations/0008_project_requests.sql)
-- is being wired into the same dual-storage operational reporting
-- workflow as Enquiries and Workshop Registrations (see
-- GOOGLE_SHEETS_INTEGRATION.md, src/lib/projectRequests/sheetsSync.ts).
-- Unlike those two, project_requests never had a human-facing reference
-- number at all — this adds one using the same platform-wide
-- PREFIX-YYYY-NNNNNN standard (RECORD_ID_STANDARD.md), prefix `PRJ`.
--
-- Nullable, not backfilled: existing project_requests rows (submitted
-- before this migration) keep reference_number = null — same "existing
-- records aren't retroactively renumbered" principle already applied to
-- Enquiries/Workshop Registrations. A partial unique index (rather than
-- a plain unique constraint) is used specifically so multiple existing
-- null rows don't need to satisfy uniqueness against each other.

begin;

alter table public.project_requests
  add column reference_number text;

create unique index project_requests_reference_number_key
  on public.project_requests (reference_number)
  where reference_number is not null;

commit;
