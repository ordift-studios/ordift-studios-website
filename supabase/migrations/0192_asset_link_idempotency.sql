-- 0192: link_acquisition_to_asset refuses an acquisition that is ALREADY linked (one function body, one added check; no table, column, guard or data change).
-- Why: the function accepted a repeated call for an acquisition that was already linked to the same asset (the 0188 guard only fires when the link VALUE changes), so a double submit, a retried request or two simultaneous requests wrote a second
-- 'asset_linked' audit event for one link (audit noise; the link itself never changed). The application now refuses the repeat before the database, but only the database can refuse two simultaneous requests; the function already locks the acquisition row,
-- so the second request waits and then sees the link the first one made.
-- Nothing else changes: the same Super Admin check, the same ownership/entity/unique-asset guards, the same audit event for the FIRST link, the same grants. An audited unlink (with a reason) followed by a new link still works.
begin;
create or replace function public.link_acquisition_to_asset(p_acquisition uuid, p_asset uuid, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  if not private.actor_is_super_admin(p_actor) then raise exception 'only a Super Admin can link an acquisition to an asset' using errcode = '42501'; end if;
  select * into a from public.entity_equipment_acquisitions where id = p_acquisition for update;
  if not found or a.status <> 'recorded' then raise exception 'the acquisition is not a recorded acquisition' using errcode = '42501'; end if;
  -- a repeated or concurrent request for an ALREADY-LINKED acquisition is refused (the row lock above serialises two requests: the second one sees the link the first one made). Without this the call was accepted and wrote a SECOND 'asset_linked' audit event for the same link.
  if a.company_asset_id is not null then raise exception 'this acquisition is already linked to an asset: unlink it first, with a reason' using errcode = '42501'; end if;
  update public.entity_equipment_acquisitions set company_asset_id = p_asset where id = a.id;
  insert into public.entity_finance_events (employing_entity_id, acquisition_id, event_type, actor_profile_id, detail)
    values (a.employing_entity_id, a.id, 'asset_linked', p_actor, jsonb_build_object('assetId', p_asset));
end $$;
revoke all on function public.link_acquisition_to_asset(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.link_acquisition_to_asset(uuid, uuid, uuid) to service_role;

commit;
