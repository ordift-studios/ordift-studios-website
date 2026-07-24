-- Ordift Studios — DESTRUCTIVE dev/reset script (2026-07-24)
--
-- This is NOT a migration and must never be placed in
-- supabase/migrations/ — it exists only so a developer can wipe this
-- schema back to nothing during early setup, before real user data
-- exists. It permanently deletes every table, type, function, schema,
-- and trigger created by supabase/migrations/0001_init.sql,
-- 0002_security_advisor_remediation.sql, and 0003_find_user_by_email.sql,
-- and everything in them. There is no undo, no soft-delete, no backup
-- taken by this script.
--
-- Reminder: after running this, a from-scratch rebuild means replaying
-- ALL THREE migrations in order (0001, then 0002, then 0003) — 0001
-- alone reintroduces the 8 Security Advisor warnings that 0002 fixes.
--
-- DO NOT RUN THIS AGAINST A PROJECT WITH REAL CLIENT / MODEL / VENDOR /
-- STAFF DATA. If you're not certain, don't run it — ask first.
--
-- To run this on purpose: uncomment the `set local` line below, then
-- run this entire file in one go (SQL Editor "Run", not statement by
-- statement — the confirmation only holds for the current transaction).

begin;

-- set local ordift.confirm_destructive_reset = 'yes-wipe-ordift-dev-data';

do $$
begin
  if coalesce(current_setting('ordift.confirm_destructive_reset', true), '') <> 'yes-wipe-ordift-dev-data' then
    raise exception 'Refusing to run: this permanently deletes all Client Portal data in this project. Uncomment the "set local" line above (and mean it) before running.';
  end if;
end $$;

drop table if exists public.staff_details cascade;
drop table if exists public.vendor_profiles cascade;
drop table if exists public.model_profiles cascade;
drop table if exists public.workshop_registrations cascade;
drop table if exists public.enquiries cascade;
drop type if exists public.crm_stage;
drop table if exists public.user_roles cascade;
drop table if exists public.roles cascade;
drop trigger if exists on_auth_user_created on auth.users;
drop table if exists public.profiles cascade;
drop table if exists public.businesses cascade;
drop function if exists public.set_updated_at() cascade;
drop function if exists public.is_staff_or_admin() cascade;
drop function if exists public.has_role(text) cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.ordift_studios_business_id() cascade;
drop function if exists public.find_user_id_by_email(text) cascade;
drop function if exists private.is_staff_or_admin() cascade;
drop function if exists private.has_role(text) cascade;
drop schema if exists private cascade;

commit;
