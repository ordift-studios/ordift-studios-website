-- Ordift Studios — grant fix for admin-platform tables (2026-07-26)
--
-- Found while verifying 0004_admin_platform.sql on staging: inserting
-- into public.enquiry_notes / public.activity_log as `authenticated`
-- (staff/admin, via their own session — not service_role) failed with
-- "permission denied for function ordift_studios_business_id", because
-- that function has only ever been granted EXECUTE to service_role
-- (0001_init.sql, reaffirmed in 0002). That was correct at the time —
-- every existing business_id-scoped table (enquiries,
-- workshop_registrations, profiles) is only ever inserted via
-- service_role (dual-write, the auth trigger) or has its default
-- evaluated in that context. enquiry_notes and activity_log are the
-- first tables whose `business_id default public.ordift_studios_business_id()`
-- column needs to be evaluated as `authenticated` — a real staff/admin
-- user inserting a note or a log entry through their own session, not
-- through the service-role client.
--
-- This is safe to grant: the function is STABLE, SECURITY DEFINER,
-- read-only (a single lookup against public.businesses), and
-- public.businesses is already readable by any authenticated user via
-- the "businesses readable by authenticated" policy from 0001 — so this
-- grant exposes nothing not already exposed, it just lets the DEFAULT
-- expression itself run under the authenticated role.
--
-- 0004_admin_platform.sql is not edited — per instruction, migrations
-- are immutable once applied; this is a new, separate, forward-only fix.

begin;

grant execute on function public.ordift_studios_business_id() to authenticated;

commit;
