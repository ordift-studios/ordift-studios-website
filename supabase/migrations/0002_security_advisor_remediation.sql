-- Ordift Studios — Security Advisor remediation (2026-07-24)
--
-- Migration 0001_init.sql ran successfully, but the Supabase Security
-- Advisor flagged 8 warnings (4 functions × anon + authenticated):
--   public.handle_new_user()
--   public.has_role(role_slug text)
--   public.is_staff_or_admin()
--   public.ordift_studios_business_id()
--
-- Root cause: `revoke all on function ... from public;` in 0001 only
-- revokes the PUBLIC pseudo-role's grant. Supabase's project
-- bootstrapping separately runs `alter default privileges ... grant
-- execute on functions to anon, authenticated, service_role;` — that
-- creates DIRECT grants to those three named roles at the moment each
-- function is created, entirely independent of PUBLIC. Revoking from
-- PUBLIC never touched those, so all 4 functions remained callable via
-- /rest/v1/rpc/<name> by anon and authenticated regardless.
--
-- This is a NEW forward-only migration, not an edit to 0001 — 0001
-- already ran and is treated as immutable history. A future
-- from-scratch rebuild (reset-dev-database.sql, then replaying
-- migrations) must run 0001 then this file then 0003 in order — 0001
-- alone still has the flawed grants; this file is what fixes them.
--
-- Fixes applied:
--   1. has_role(text) and is_staff_or_admin() move out of `public`
--      entirely, into a new `private` schema that Supabase's exposed
--      REST API (PostgREST) never lists — so there is no
--      /rest/v1/rpc/has_role route to warn about at all, regardless of
--      grants. They keep the exact same behavior (SECURITY DEFINER,
--      search_path='', fully qualified references, no writes, no
--      dynamic SQL, boolean-only), just relocated. Every RLS policy
--      that referenced public.has_role()/public.is_staff_or_admin() is
--      recreated to call private.has_role()/private.is_staff_or_admin()
--      instead — the row-level logic itself is byte-for-byte unchanged.
--   2. Only `authenticated` gets USAGE on schema `private` + EXECUTE on
--      the two functions (RLS policies restricted `to authenticated`
--      are the only thing that ever evaluates them). service_role is
--      NOT granted here — service_role bypasses RLS entirely, so it
--      never evaluates these policies and has no other caller of them
--      either; anon is not granted for the same reason (no policy
--      referencing them is ever `to anon`).
--   3. ordift_studios_business_id() and handle_new_user() stay in
--      `public` (they're not RLS-authorization helpers, they're a
--      column default and a trigger) but lose their anon/authenticated
--      grants explicitly:
--        - ordift_studios_business_id(): only service_role keeps
--          EXECUTE — it's evaluated as a column DEFAULT during the
--          enquiries/workshop_registrations dual-write inserts, which
--          only ever run as service_role.
--        - handle_new_user(): only supabase_auth_admin keeps EXECUTE —
--          it fires via the auth.users trigger, performed by GoTrue as
--          supabase_auth_admin, for both self-service signup and any
--          future admin-created account.
--   4. set_updated_at() is DELIBERATELY NOT TOUCHED by this migration.
--      It wasn't one of the 8 Advisor-flagged functions in the first
--      place — removing its authenticated/service_role grant was a
--      proactive hardening I proposed on my own initiative, reasoned
--      from Postgres's documented trigger-privilege model (trigger
--      functions fire as a consequence of the table-level DML privilege,
--      not a separate EXECUTE check on the firing role) but never
--      empirically tested against this database. Per explicit
--      instruction, its grant stays exactly as 0001 left it
--      (`grant execute on function public.set_updated_at() to
--      authenticated, service_role;`) until profile-update behavior is
--      verified live. Revisit only after that verification, as its own
--      separate, individually-tested change — not folded into this file.

begin;

-- ============================================================
-- Private schema for RLS-only authorization helpers. Not listed in
-- PostgREST's exposed schemas (that's a project-level API setting, not
-- something this migration touches) — functions here have no
-- /rest/v1/rpc/... route at all, so there is nothing for the Security
-- Advisor's "callable via RPC" checks to flag, independent of grants.
-- ============================================================
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ============================================================
-- private.has_role() — identical body/behavior to the old
-- public.has_role(), just relocated. Still SECURITY DEFINER,
-- search_path='', fully schema-qualified, stable, boolean-only, no
-- writes, no dynamic SQL.
-- ============================================================
create or replace function private.has_role(role_slug text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid() and r.slug = role_slug
  );
$$;

revoke all on function private.has_role(text) from public, anon, authenticated, service_role;
grant execute on function private.has_role(text) to authenticated;

-- ============================================================
-- private.is_staff_or_admin() — same relocation, now calling
-- private.has_role() instead of the old public.has_role().
-- ============================================================
create or replace function private.is_staff_or_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select private.has_role('staff') or private.has_role('admin');
$$;

revoke all on function private.is_staff_or_admin() from public, anon, authenticated, service_role;
grant execute on function private.is_staff_or_admin() to authenticated;

-- ============================================================
-- Recreate every RLS policy that referenced the old public.-qualified
-- functions, pointing at private. instead. The USING/WITH CHECK logic
-- itself is byte-for-byte unchanged from 0001_init.sql — only the
-- function's schema qualifier changes.
-- ============================================================
drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id or (select private.is_staff_or_admin()));

drop policy if exists "user_roles: read own" on public.user_roles;
create policy "user_roles: read own" on public.user_roles
  for select
  to authenticated
  using ((select auth.uid()) = user_id or (select private.is_staff_or_admin()));

drop policy if exists "user_roles: admin manages" on public.user_roles;
create policy "user_roles: admin manages" on public.user_roles
  for all
  to authenticated
  using ((select private.has_role('admin')))
  with check ((select private.has_role('admin')));

drop policy if exists "enquiries: read own" on public.enquiries;
create policy "enquiries: read own" on public.enquiries
  for select
  to authenticated
  using ((select auth.uid()) = user_id or (select private.is_staff_or_admin()));

drop policy if exists "enquiries: staff update" on public.enquiries;
create policy "enquiries: staff update" on public.enquiries
  for update
  to authenticated
  using ((select private.is_staff_or_admin()))
  with check ((select private.is_staff_or_admin()));

drop policy if exists "workshop_registrations: read own" on public.workshop_registrations;
create policy "workshop_registrations: read own" on public.workshop_registrations
  for select
  to authenticated
  using ((select auth.uid()) = user_id or (select private.is_staff_or_admin()));

drop policy if exists "workshop_registrations: staff update" on public.workshop_registrations;
create policy "workshop_registrations: staff update" on public.workshop_registrations
  for update
  to authenticated
  using ((select private.is_staff_or_admin()))
  with check ((select private.is_staff_or_admin()));

drop policy if exists "model_profiles: read own" on public.model_profiles;
create policy "model_profiles: read own" on public.model_profiles
  for select
  to authenticated
  using ((select auth.uid()) = id or (select private.is_staff_or_admin()));

drop policy if exists "model_profiles: staff update" on public.model_profiles;
create policy "model_profiles: staff update" on public.model_profiles
  for update
  to authenticated
  using ((select private.is_staff_or_admin()))
  with check ((select private.is_staff_or_admin()));

drop policy if exists "vendor_profiles: read own" on public.vendor_profiles;
create policy "vendor_profiles: read own" on public.vendor_profiles
  for select
  to authenticated
  using ((select auth.uid()) = id or (select private.is_staff_or_admin()));

drop policy if exists "vendor_profiles: staff update" on public.vendor_profiles;
create policy "vendor_profiles: staff update" on public.vendor_profiles
  for update
  to authenticated
  using ((select private.is_staff_or_admin()))
  with check ((select private.is_staff_or_admin()));

drop policy if exists "staff_details: read own or admin" on public.staff_details;
create policy "staff_details: read own or admin" on public.staff_details
  for select
  to authenticated
  using ((select auth.uid()) = id or (select private.has_role('admin')));

-- ============================================================
-- Now safe to drop the old public.-schema versions — nothing
-- references them anymore (every policy above was rewritten first, in
-- the same transaction).
-- ============================================================
drop function if exists public.is_staff_or_admin();
drop function if exists public.has_role(text);

-- ============================================================
-- ordift_studios_business_id() and handle_new_user(): stay in public
-- (column default / trigger, not RLS-authorization helpers), lose the
-- anon/authenticated grants they never needed. See header note above.
--
-- set_updated_at() is intentionally NOT touched here — see "Fixes
-- applied" note 4 at the top of this file. Its grant stays exactly as
-- 0001 left it (authenticated, service_role) until profile-update
-- behavior is verified live, per explicit instruction.
-- ============================================================
revoke execute on function public.ordift_studios_business_id() from public, anon, authenticated;
-- service_role keeps EXECUTE — unchanged from 0001, still required for
-- the enquiries/workshop_registrations dual-write inserts.

revoke execute on function public.handle_new_user() from public, anon, authenticated;
-- supabase_auth_admin keeps EXECUTE — unchanged from 0001.

commit;
