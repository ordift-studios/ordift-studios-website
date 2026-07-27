-- Ordift Studios — platform-wide sequential record IDs + Google Sheets
-- sync resilience (2026-07-27)
--
-- Context: the dual-storage form workflow is being inverted — Supabase
-- becomes the primary, required application database for every public
-- form; Google Sheets becomes a best-effort secondary copy (see
-- src/lib/supabase/primaryWrite.ts, GOOGLE_SHEETS_INTEGRATION.md). Two
-- small additive tables support this:
--
--   1. record_sequences — backs public.next_record_sequence(), an
--      atomic per-prefix, per-calendar-year counter used to generate
--      the new PREFIX-YYYY-NNNNNN record ID standard (see
--      RECORD_ID_STANDARD.md and src/lib/shared/recordId.ts). Existing
--      ORD-/WKS- prefixed rows are NOT touched or backfilled — only new
--      records use the new format, per explicit instruction to avoid
--      migration risk on historical data.
--   2. sheet_sync_failures — a retry queue: if a Google Sheets append
--      fails after its Supabase primary write already succeeded, the
--      failure is logged here instead of being silently dropped, so the
--      submission itself is never lost even though its Sheets copy
--      temporarily is.
--
-- Design principles carried forward from 0001_init.sql/0004_admin_platform.sql:
--   - business_id on every new table, defaulting to the seeded Ordift
--     Studios row.
--   - RLS enabled from creation. Both tables here are service-role-only
--     internal plumbing (never read/written by an authenticated user's
--     own session) — no policies are added for authenticated/anon, so
--     RLS default-denies everyone except service_role, which bypasses
--     RLS entirely (see src/lib/supabase/admin.ts). This is the same
--     "lock it down, add grants only when a real workflow needs them"
--     posture 0001/0004 already document for other tables.
--   - SECURITY DEFINER function, search_path '', fully schema-qualified,
--     REVOKE ALL then GRANT EXECUTE to service_role only — identical
--     shape to 0003_find_user_by_email.sql.

begin;

-- ============================================================
-- record_sequences — atomic per-prefix, per-year ID counter
-- ============================================================
create table public.record_sequences (
  prefix text not null,
  year integer not null,
  last_value integer not null default 0,
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  updated_at timestamptz not null default now(),
  primary key (prefix, year)
);

alter table public.record_sequences enable row level security;

-- Atomic upsert-and-increment in a single statement (ON CONFLICT DO
-- UPDATE takes a row lock), so two concurrent submissions for the same
-- prefix/year can never be handed the same sequence number.
create or replace function public.next_record_sequence(p_prefix text, p_year integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_value integer;
begin
  insert into public.record_sequences (prefix, year, last_value)
  values (p_prefix, p_year, 1)
  on conflict (prefix, year)
  do update set last_value = public.record_sequences.last_value + 1, updated_at = now()
  returning last_value into v_value;
  return v_value;
end;
$$;

revoke all on function public.next_record_sequence(text, integer) from public;
revoke all on function public.next_record_sequence(text, integer) from anon;
revoke all on function public.next_record_sequence(text, integer) from authenticated;
grant execute on function public.next_record_sequence(text, integer) to service_role;

-- ============================================================
-- sheet_sync_failures — Google Sheets append retry queue
-- ============================================================
create table public.sheet_sync_failures (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  worksheet_key text not null,
  record_id text not null,
  row_data jsonb not null,
  error_message text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index sheet_sync_failures_unresolved_idx
  on public.sheet_sync_failures (created_at)
  where resolved_at is null;

alter table public.sheet_sync_failures enable row level security;

commit;
