-- Ordift Studios — service_role UPDATE on profiles (2026-07-26)
--
-- Pre-existing gap since 0001 — service_role never had UPDATE on
-- profiles at all (only the SELECT needed by existing read paths).
-- Nothing before this milestone updated a profile via the service-role
-- admin client; role grants/revokes only ever touched user_roles.
-- src/app/admin/users/actions.ts's updateAccessStatusAction() and
-- setAccessExpiryAction() are the first code to need it (suspend/
-- deactivate/restore, access-expiry), and surfaced as a plain "Failed
-- to update access status" the moment Suspend was used on production.
begin;

grant update on public.profiles to service_role;

commit;
