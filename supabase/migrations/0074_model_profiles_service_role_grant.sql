-- Ordift Studios — model_profiles service_role grant (2026-09-09)
--
-- Same gap class as 0021_service_role_grants_audit.sql: production has
-- "Automatically expose new tables" disabled, so service_role gets
-- zero table-level privileges until explicitly granted, regardless of
-- RLS policies. 0021 (2026-07-28) audited public.model_profiles at the
-- time and correctly found no service_role code path touched it —
-- deliberately left ungranted per this project's least-privilege
-- discipline ("grant a table when something actually needs it," never
-- speculatively).
--
-- TALENT-SYS-1's Add Talent onboarding flow (commit 2e51697,
-- 2026-09-09) is that trigger: src/lib/talent/talentProfiles.ts and
-- talentOverview.ts now read/write public.model_profiles via
-- createAdminClient() (service_role) — createTalentProfile()'s insert,
-- listTalentOnboardingCandidates()'s/listTalentProfiles()'s selects,
-- and setRepresentationStatusAction()'s/setPublicationStatusAction()'s
-- updates. No corresponding grant was added at the time, so every one
-- of those calls fails in Production with "permission denied for
-- table model_profiles" — confirmed via live Production runtime logs
-- (2026-09-09), independent of and unrelated to the PostgREST
-- relationship-ambiguity fix in the same area (commit 594494a).
--
-- Scoped to exactly what the code actually uses, per the audited
-- grant matrix above: SELECT (listing/detail/existing-record checks),
-- INSERT (profile creation), UPDATE (representation/publication status
-- transitions). No DELETE — no code path deletes a model_profiles row.
-- No other table touched; no RLS policy changed (every existing
-- model_profiles RLS policy already governs the request-scoped client
-- correctly — this migration only affects the separate service-role
-- privilege layer RLS bypasses, not replaces).

begin;

grant select, insert, update on public.model_profiles to service_role;

commit;
