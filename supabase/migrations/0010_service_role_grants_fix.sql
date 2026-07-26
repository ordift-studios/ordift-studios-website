-- Ordift Studios — service_role grants fix (2026-07-26)
--
-- Migration 0009 granted select/insert/update/delete on its new tables
-- (and on staff_details, previously ungranted) to `authenticated` only.
-- That was sufficient on staging, but production has "Automatically
-- expose new tables" disabled (see Hardening Pass 4 in 0001_init.sql) —
-- meaning `service_role` gets NO table-level privilege on a newly
-- created table without an explicit grant, same as any other role.
-- `service_role` bypasses RLS (a role attribute), but base table GRANTs
-- are a separate, mandatory layer Postgres always enforces.
--
-- Surfaced as "permission denied for table staff_details" the moment
-- the Admin Platform's Users & Roles page (which reads via the
-- service-role admin client, src/lib/supabase/admin.ts) tried to load
-- on production. This migration is the fix — purely additive grants,
-- no schema change.
begin;

grant select, insert, update, delete on public.staff_details to service_role;
grant select, insert, update, delete on public.operational_titles to service_role;
grant select, insert, update, delete on public.engagement_types to service_role;
grant select, insert, update, delete on public.project_assignments to service_role;
grant select, insert, update, delete on public.project_updates to service_role;

commit;
