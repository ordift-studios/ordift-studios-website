-- Vendor QA correction (2026-09-15) — same gap class documented across
-- 0010_service_role_grants_fix.sql, 0016_service_role_grants.sql,
-- 0018_grades_service_role_grant.sql, and
-- 0021_service_role_grants_audit.sql: Production has "Automatically
-- expose new tables" disabled, so service_role gets ZERO table-level
-- privileges until explicitly granted, regardless of RLS policies.
--
-- 0021's own audit (2026-07-28) confirmed public.vendor_profiles was
-- correctly ungranted to service_role at the time, because no
-- service_role code path touched it then (0001_init.sql only ever
-- granted `select` to `authenticated`). That changed with the Vendor
-- Completion Phase (2026-09-15): vendorProfiles.ts's
-- upsertVendorProfile()/getVendorProfile()/listVendorWorkspaceRows()
-- now read and write this table via createAdminClient() (service_role)
-- — the exact "reactive grant when something actually needs it"
-- trigger 0010/0016/0018/0021 all describe.
--
-- Confirmed live in Production before writing this migration: every
-- attempt to record a vendor's company profile was failing with
-- "permission denied for table vendor_profiles" (Vercel runtime logs),
-- not an RLS rejection — exactly the signature of a missing grant.

begin;

grant select, insert, update, delete on public.vendor_profiles to service_role;

commit;
