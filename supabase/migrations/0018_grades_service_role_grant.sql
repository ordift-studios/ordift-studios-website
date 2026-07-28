-- Ordift Studios — grades service_role grant (2026-07-28)
--
-- Migration 0017 granted `authenticated` access to public.grades (via
-- the "grades: admin read"/"grades: super_admin manages" RLS policies)
-- but never granted service_role, the same gap class already fixed
-- once for other tables in 0010_service_role_grants_fix.sql and again
-- in 0016_service_role_grants.sql — production has "Automatically
-- expose new tables" disabled, so service_role gets zero table
-- privileges until explicitly granted, regardless of RLS policies.
--
-- The Admin Profile Quick Card feature itself never hits this: it
-- always reads/writes grades through the logged-in admin's own
-- request-scoped client, relying on RLS, not service_role. This grant
-- exists so service-role tooling (one-off admin scripts, future admin
-- API routes) can read/write public.grades directly, matching every
-- other operational table in this schema.

begin;

grant select, insert, update, delete on public.grades to service_role;

commit;
