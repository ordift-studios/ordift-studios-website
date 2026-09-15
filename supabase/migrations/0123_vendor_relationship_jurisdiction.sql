-- Ordift Studios Vendor Completion Phase — QA correction (2026-09-15).
--
-- A real Production defect surfaced during the controlled Lady
-- Anim-Tetey walkthrough: the Full Profile page's Agreement Readiness
-- section unconditionally called the EMPLOYEE-only jurisdiction gate
-- (checkEmployeeAgreementReadiness -> employment_jurisdiction_id on
-- employment_terms_history) for any onboarding record, including a
-- Vendor's. That is fixed at the application layer (gated on
-- onboarding.pipeline === 'employee'), but it also exposed a genuine
-- missing piece: a Vendor relationship has no field of its own to
-- record which jurisdiction governs it.
--
-- public.employment_jurisdictions (migration 0080) is, on inspection,
-- a genuinely GENERIC jurisdiction lookup table (id/name/slug/active/
-- sort_order only) — nothing in its own schema is employee-specific;
-- only the COLUMNS that reference it elsewhere
-- (employment_terms_history.employment_jurisdiction_id,
-- recruitment_requisitions.employment_jurisdiction_id) are
-- employee-hire-shaped. Reusing the LOOKUP TABLE is safe and correct
-- (no duplicate jurisdiction list); misusing an employee-shaped COLUMN
-- for a Vendor relationship would not be. This adds a new,
-- Vendor-specific column instead, on vendor_profiles — the canonical
-- home for vendor company/relationship-level facts (Vendor Completion
-- Phase, migration-adjacent to 0122).
--
-- Deliberately scoped to the CURRENT vendor-onboarding level (one
-- default relationship jurisdiction per vendor), not to a not-yet-built
-- Work Order/Schedule concept — the OS-LGL-009 architecture notes a
-- future Work Order may override this per-engagement; that remains a
-- separate, later undertaking and does not conflict with this default.

begin;

alter table public.vendor_profiles
  add column if not exists relationship_jurisdiction_id uuid references public.employment_jurisdictions (id);

comment on column public.vendor_profiles.relationship_jurisdiction_id is
  'The jurisdiction governing this Vendor/Supplier relationship (e.g. Ghana) — reuses the generic employment_jurisdictions lookup table, but is deliberately a SEPARATE column from any employee-hire-shaped employment_jurisdiction_id elsewhere, since a Vendor relationship is not an employment relationship. UI label: "Relationship Jurisdiction" / "Engagement Jurisdiction", never "Employment Jurisdiction". Null means genuinely unset, never guessed. A future Work Order/Schedule may record its own override per the OS-LGL-009 architecture (normally following the contracting entity) — this column is only the vendor-level default.';

commit;
