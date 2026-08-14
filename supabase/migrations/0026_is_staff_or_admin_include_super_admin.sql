-- Ordift Studios — fix private.is_staff_or_admin() to include
-- super_admin (2026-08-07)
--
-- Bug: private.is_staff_or_admin() (0009_access_management.sql) only
-- ever checked 'staff' or 'admin' — never 'super_admin'. Every RLS
-- policy on enquiries, workshop_registrations, deliverables,
-- project_requests, payments (and more) gates on this function, so a
-- super_admin-only account (no separate staff/admin role) passes the
-- application-level /admin route gate (isStaffOrAdmin() in
-- src/lib/portal/roles.ts, which correctly includes super_admin) but
-- then sees zero rows on every RLS-protected admin list — the two
-- checks silently disagreed. private.is_super_admin() already exists
-- as its own correctly-defined function elsewhere in this schema;
-- this migration only extends is_staff_or_admin()'s OR condition to
-- match the app-level check it's supposed to mirror.
--
-- No RLS policy definitions themselves change — they all already
-- reference is_staff_or_admin() by name, so this fixes every one of
-- them at once by correcting the one function they share.

begin;

create or replace function private.is_staff_or_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select private.has_role('staff') or private.has_role('admin') or private.has_role('super_admin');
$$;

revoke all on function private.is_staff_or_admin() from public, anon, authenticated, service_role;
grant execute on function private.is_staff_or_admin() to authenticated;

commit;
