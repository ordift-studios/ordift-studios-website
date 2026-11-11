-- ROLLBACK for 0192_asset_link_idempotency.sql: restores the 0188 function exactly (it again accepts a repeated call and writes another audit event). No data is touched.
begin;
create or replace function public.link_acquisition_to_asset(p_acquisition uuid, p_asset uuid, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  if not private.actor_is_super_admin(p_actor) then raise exception 'only a Super Admin can link an acquisition to an asset' using errcode = '42501'; end if;
  select * into a from public.entity_equipment_acquisitions where id = p_acquisition for update;
  if not found or a.status <> 'recorded' then raise exception 'the acquisition is not a recorded acquisition' using errcode = '42501'; end if;
  update public.entity_equipment_acquisitions set company_asset_id = p_asset where id = a.id;
  insert into public.entity_finance_events (employing_entity_id, acquisition_id, event_type, actor_profile_id, detail)
    values (a.employing_entity_id, a.id, 'asset_linked', p_actor, jsonb_build_object('assetId', p_asset));
end $$;
revoke all on function public.link_acquisition_to_asset(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.link_acquisition_to_asset(uuid, uuid, uuid) to service_role;
commit;
