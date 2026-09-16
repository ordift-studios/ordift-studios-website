-- Founder-authorized restoration (2026-09-16) — clears the erroneous
-- access_expires_at the Founder set on his OWN account (confirmed via
-- activity_log: actor_user_id = 966bf3f7..., 2026-09-15 22:14:01,
-- expiring 2026-09-16 00:00:00), which caused getCurrentUser() to
-- correctly-but-unintentionally zero his usable roles and
-- primaryPortalPath() to fall through to /portal/client. Not a code
-- defect — restores exactly the effect the real setAccessExpiryAction()
-- (src/app/admin/users/actions.ts) would produce, with the same real
-- activity_log entry shape. Scoped to Founder/0001 ONLY — Mishael/0002
-- deliberately untouched, per explicit instruction.

begin;

update public.profiles
set access_expires_at = null
where id = '966bf3f7-16fe-4f35-9b71-bc0408b3975c'
  and member_number = '0001';

insert into public.activity_log (actor_user_id, action, entity_type, entity_id, metadata)
select '966bf3f7-16fe-4f35-9b71-bc0408b3975c', 'access_expiry.change', 'user', '966bf3f7-16fe-4f35-9b71-bc0408b3975c',
  '{"accessExpiresAt": null, "note": "Administrative correction via migration 0131 — clearing an erroneous self-set expiry that caused unintended Founder lockout; not an automated UI action"}'::jsonb
where exists (
  select 1 from public.profiles where id = '966bf3f7-16fe-4f35-9b71-bc0408b3975c' and access_expires_at is null
);

commit;
