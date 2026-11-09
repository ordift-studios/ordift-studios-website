-- ROLLBACK for PROPOSAL_booking_cancel_reverts_stage.sql (LOCAL ONLY): restores the original cancel_ordinary_booking() (cancelled row + audit, stage untouched).
-- Stage changes already made by the new version stay (they are audited 'enquiry.stage_change' rows with reason booking_cancelled); nothing is un-written.
begin;
create or replace function public.cancel_ordinary_booking(p_enquiry uuid, p_reason text, p_actor uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare prev public.enquiry_booking_confirmations%rowtype; v_id uuid := gen_random_uuid();
begin
  if not private.booking_actor_is_super_admin(p_actor) then raise exception 'ordift:booking_not_authorised' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('booking-enquiry:' || p_enquiry::text));
  select * into prev from public.enquiry_booking_confirmations where enquiry_id = p_enquiry order by version desc limit 1;
  if not found or prev.kind = 'cancelled' then raise exception 'ordift:booking_nothing_to_cancel'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'ordift:booking_cancel_reason'; end if;
  insert into public.enquiry_booking_confirmations (id, enquiry_id, version, kind, supersedes_id, quotation_id, quotation_fingerprint, contracting_entity_id, activities, assigned_profile_id, settings_version, reason, confirmed_by)
    values (v_id, p_enquiry, prev.version + 1, 'cancelled', prev.id, prev.quotation_id, prev.quotation_fingerprint, prev.contracting_entity_id, prev.activities, prev.assigned_profile_id, prev.settings_version, btrim(p_reason), p_actor);
  insert into public.activity_log (actor_user_id, action, entity_type, entity_id, metadata) values (p_actor, 'booking.cancelled', 'enquiry', p_enquiry::text, jsonb_build_object('confirmationId', v_id, 'version', prev.version + 1));
  return v_id;
end $$;
revoke all on function public.cancel_ordinary_booking(uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.cancel_ordinary_booking(uuid, text, uuid) to service_role;
commit;
