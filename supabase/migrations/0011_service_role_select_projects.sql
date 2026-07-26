-- Ordift Studios — service_role SELECT on enquiries/workshop_registrations
-- (2026-07-26)
--
-- Pre-existing gap, not something this milestone's earlier migrations
-- broke: since 0001, service_role has only ever had INSERT on these
-- two tables (enough for src/lib/supabase/dualWrite.ts's insert-only
-- calls). Nothing before this milestone needed the service-role admin
-- client to READ them — the Admin Platform's Enquiries/Bookings pages
-- read via the regular session client (RLS + the authenticated role's
-- existing SELECT grant), which already covers staff/admin.
--
-- migration 0009's project-assignment search (src/lib/admin/
-- projectAssignments.ts — searchProjects()/resolveEntityLabel(), used
-- by the Admin Users & Roles "assign to project" picker) is the first
-- code to need service-role read access across every client's
-- enquiries/workshop_registrations, the same reason
-- src/lib/portal/adminData.ts already uses the admin client to list
-- every auth user. Surfaced as "permission denied for table
-- enquiries" the moment that search ran on production.
begin;

grant select on public.enquiries to service_role;
grant select on public.workshop_registrations to service_role;

commit;
