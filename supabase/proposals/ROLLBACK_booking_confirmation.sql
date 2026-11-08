-- ROLLBACK for PROPOSAL_booking_confirmation.sql. Refuses to run if any confirmation exists (they are the record of what was agreed): export and approve first. The settings table may be removed with it.
begin;
do $$ begin
  if (select count(*) from public.enquiry_booking_confirmations) > 0 or (select count(*) from public.enquiry_booking_segments) > 0 then
    raise exception 'booking confirmations exist: do not roll back without exporting and approving';
  end if;
end $$;
drop function if exists public.preview_booking_conflicts(uuid, jsonb, uuid);
drop function if exists public.cancel_ordinary_booking(uuid, text, uuid);
drop function if exists public.confirm_ordinary_booking(jsonb, uuid);
drop function if exists private.booking_conflicts(uuid, jsonb, uuid);
drop function if exists private.booking_actor_is_super_admin(uuid);
drop table if exists public.enquiry_booking_segments;
drop table if exists public.enquiry_booking_confirmations;
drop table if exists public.booking_rule_settings;
drop function if exists private.booking_append_only();
commit;
