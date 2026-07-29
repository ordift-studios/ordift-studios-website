-- Ordift Studios — email_send_failures dead-letter table (2026-07-29)
--
-- Phase 2 production hardening (email subsystem). Mirrors
-- sheet_sync_failures (0013_record_ids_and_sheet_sync.sql) exactly:
-- src/lib/shared/email/dispatch.ts already retries transient send
-- failures with exponential backoff, but until now a send that
-- exhausts every retry, or fails permanently (bad address, auth,
-- payload), was only ever visible in server logs — no durable record
-- for later investigation or manual resend. This closes that gap the
-- same way sheet_sync_failures closed it for Google Sheets.
--
-- The service_role grant is included in this same migration, not a
-- follow-up one — sheet_sync_failures itself had to be patched in
-- 0016 after shipping without a grant (see that file's header), and
-- activity_log needed the same fix again in 0021. Both times the gap
-- was "Automatically expose new tables" being disabled in production,
-- so service_role gets zero table-level privileges on anything it
-- didn't create until explicitly granted.

begin;

create table public.email_send_failures (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  email_type text not null,
  recipient text not null,
  reference_number text,
  error_message text not null,
  attempts integer not null,
  permanent boolean not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index email_send_failures_unresolved_idx
  on public.email_send_failures (created_at)
  where resolved_at is null;

alter table public.email_send_failures enable row level security;

grant select, insert, update, delete on public.email_send_failures to service_role;

commit;
