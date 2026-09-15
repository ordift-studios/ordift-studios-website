-- Founder corporate/work-email correction (Workforce/Employee Self-
-- Service Phase, 2026-09-15). Reassigns the OWNER of the existing
-- corporate_identities reservation for matetey@ordiftstudios.com from
-- the Founder's secondary/backup Super Admin login
-- (2bf593f7-d6bc-4c4b-93cd-582f859ade2b, auth email
-- ordift.ghana@gmail.com, no member number) to the Founder's PRIMARY
-- Founder & CEO record (966bf3f7-16fe-4f35-9b71-bc0408b3975c, auth
-- email matetey@ordiftghana.com, Member Number 0001) — confirmed
-- directly in Production, read-only, before this migration: the
-- reservation (id bd258fdf-cfd8-4a1a-b385-f103d92e09e4, status
-- "reserved", never provisioned) was created 2026-09-07 against the
-- wrong profile.
--
-- Explicit Founder decision (2026-09-15): reassign ONLY this one
-- reservation. The two accounts themselves are NOT merged — the
-- secondary login remains a genuine, independent, active Super Admin
-- account (the Founder's own deliberate backup credential), and the
-- primary account's own identity (Member Number 0001, Founder & CEO,
-- CHIEF, Executive & Administration, GR.10, existing authentication
-- email matetey@ordiftghana.com) is completely unchanged by this.
--
-- No existing function performs an ownership transfer of an already-
-- reserved corporate identity (grep-confirmed across
-- reserveCorporateIdentity.ts/corporateProvisioning.ts — the closest,
-- approveCorporateIdentityLocalPart(), only ever corrects local_part
-- on a row that already belongs to the requesting profile, never
-- reassigns profile_id). This is a genuinely new, narrow, one-off
-- administrative correction — implemented as a migration for the same
-- reason as migration 0115: this environment's .env.local carries no
-- Supabase credentials for a direct service-layer invocation.
--
-- Safety, confirmed read-only before writing this:
--   - profile 966bf3f7 has zero existing corporate_identities rows —
--     no conflict, matches reserveCorporateIdentity()'s own "one
--     identity per profile" invariant after the move.
--   - corporate_identities has no unique constraint on profile_id
--     alone; the real unique constraint is (business_id, domain,
--     local_part) — untouched, since local_part/domain are not
--     changed here, only profile_id. `email` is a generated column
--     (local_part || '@' || domain) and is therefore never written
--     directly — its value does not change.
--   - the only FK anywhere in the schema referencing
--     corporate_identities is staff_onboarding.corporate_identity_id,
--     which references the immutable `id` primary key, never
--     profile_id — confirmed zero staff_onboarding rows reference
--     either this identity or either Founder profile at all (neither
--     account has ever been through the onboarding pipeline), so
--     nothing can be left dangling or semantically mismatched by this
--     change.
--   - status remains "reserved" (never provisioned) — no external
--     mailbox/provider state exists to reconcile.

begin;

update public.corporate_identities
set profile_id = '966bf3f7-16fe-4f35-9b71-bc0408b3975c'
where id = 'bd258fdf-cfd8-4a1a-b385-f103d92e09e4'
  and profile_id = '2bf593f7-d6bc-4c4b-93cd-582f859ade2b';

insert into public.activity_log (actor_user_id, action, entity_type, entity_id, metadata)
select '966bf3f7-16fe-4f35-9b71-bc0408b3975c', 'corporate_identity.reassigned', 'user', '966bf3f7-16fe-4f35-9b71-bc0408b3975c',
       jsonb_build_object(
         'corporateIdentityId', 'bd258fdf-cfd8-4a1a-b385-f103d92e09e4',
         'email', 'matetey@ordiftstudios.com',
         'fromProfileId', '2bf593f7-d6bc-4c4b-93cd-582f859ade2b',
         'toProfileId', '966bf3f7-16fe-4f35-9b71-bc0408b3975c',
         'reason', 'Reservation was created against the Founder''s secondary/backup Super Admin login by mistake; corrected to the primary Founder & CEO (Member 0001) record. The secondary account is preserved unchanged as an independent backup Super Admin login.'
       )
where exists (
  select 1 from public.corporate_identities
  where id = 'bd258fdf-cfd8-4a1a-b385-f103d92e09e4' and profile_id = '966bf3f7-16fe-4f35-9b71-bc0408b3975c'
) and not exists (
  select 1 from public.activity_log
  where entity_id = '966bf3f7-16fe-4f35-9b71-bc0408b3975c' and action = 'corporate_identity.reassigned'
);

commit;
