-- Ordift Studios Compliance/COMP-SYS-1, Phase B6 Step 8 (2026-09-15) —
-- Ghana Legal Entity evidence completion. The Founder has now supplied
-- the actual Certificate of Registration for the real, already-
-- existing Ordift Studios entity (id a8560dea-5140-46eb-bfdd-c3416fc71ab6,
-- created migration 0105) — no second entity is created here.
--
-- Recorded exactly what the certificate states, nothing more:
--   - Registration Number: BN222942018
--   - TIN (tax identifier): P0003830802
-- The certificate does not show a registered address in the supplied
-- image — registered_address is left NULL, never inferred.
--
-- This uses a migration rather than the real recordEmployingEntitySensitiveDetails()
-- service function (legalEntities.ts) because this environment's
-- .env.local has no Supabase credentials at all (grep-confirmed: only
-- VERCEL_OIDC_TOKEN is present) — there is no way to invoke that
-- function against Production from this session. The migration
-- performs the identical write the service function would have made:
-- one row in employing_entity_sensitive_details, keyed to the existing
-- entity, changing nothing on employing_entities itself (legal name,
-- jurisdiction, registration date/type, currency, and verification
-- state all remain exactly as migration 0105 left them — inspected
-- immediately before writing this migration and found consistent,
-- with no genuine discrepancy against the certificate).
--
-- recorded_by references the real, primary Super Admin account
-- (member_number '0001', 332 prior activity_log entries — the actively-
-- used Founder account, distinct from a second same-named Super Admin
-- profile with only 3 log entries that this migration does not touch
-- or attempt to resolve, since reconciling duplicate accounts was not
-- requested and is out of this task's narrow scope).
--
-- No document/evidence row is inserted here: the actual certificate
-- FILE (the image itself) was shared inline in conversation and is not
-- accessible to this session as bytes on disk to upload to the private
-- legal-entity-documents Storage bucket — inserting an
-- employing_entity_documents row without a real uploaded file would be
-- a fabricated reference. The upload UI (already fully built,
-- migration 0105) remains ready for the Founder to use directly once
-- the file is available in an authenticated browser session.

begin;

insert into public.employing_entity_sensitive_details (
  employing_entity_id,
  registration_number,
  tax_identifier,
  registered_address,
  recorded_by
)
select
  'a8560dea-5140-46eb-bfdd-c3416fc71ab6',
  'BN222942018',
  'P0003830802',
  null,
  '966bf3f7-16fe-4f35-9b71-bc0408b3975c'
where not exists (
  select 1 from public.employing_entity_sensitive_details where employing_entity_id = 'a8560dea-5140-46eb-bfdd-c3416fc71ab6'
);

commit;
