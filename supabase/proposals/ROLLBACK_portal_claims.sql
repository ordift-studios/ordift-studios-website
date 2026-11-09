-- ROLLBACK for PROPOSAL_portal_claims.sql. Removes the ownership trigger, the four functions, the two helper functions and the two tables.
-- WHAT THIS DISCARDS: the claim invitations and the ownership-event history written since the proposal was applied (export both tables first if any history is worth keeping). It does NOT undo any ownership that was
-- granted: enquiries.user_id values set by a successful claim stay as they are. No enquiry, payment or audit-log row is deleted.
begin;
drop trigger if exists enquiries_owner_guard on public.enquiries;
drop function if exists private.enquiries_owner_guard();
drop function if exists public.create_portal_claim(uuid, uuid, text, text, text, text, timestamptz, text, jsonb);
drop function if exists public.attempt_portal_claim(text, text, uuid);
drop function if exists public.revoke_portal_claim(uuid, uuid, text);
drop function if exists public.release_enquiry_ownership(uuid, uuid, text);
drop table if exists public.enquiry_ownership_events;
drop table if exists public.enquiry_portal_claims;
drop function if exists private.is_internal_profile(uuid);
drop function if exists private.is_super_admin_profile(uuid);
commit;
