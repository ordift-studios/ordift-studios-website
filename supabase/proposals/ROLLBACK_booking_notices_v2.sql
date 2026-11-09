-- ROLLBACK for PROPOSAL_booking_notices_v2.sql (LOCAL ONLY). Restores the v1 behaviour: cancel without an outcome, jobs only for a confirmation, claim without 'deferred'.
-- DROPS the new columns: cancellation outcomes and deferral reasons recorded after v2 are lost (export first). Jobs created for changes, cancellations and the extra audiences are removed (they are v2-only); v1 jobs are kept.
begin;
delete from public.booking_notification_jobs where event <> 'confirmed' or audience not in ('client', 'internal') or status = 'deferred';
alter table public.booking_notification_jobs drop constraint if exists booking_notification_jobs_audience_check, drop constraint if exists booking_notification_jobs_event_check, drop constraint if exists booking_notification_jobs_status_check;
alter table public.booking_notification_jobs add constraint booking_notification_jobs_audience_check check (audience in ('client', 'internal')),
  add constraint booking_notification_jobs_event_check check (event in ('confirmed', 'changed', 'cancelled')), add constraint booking_notification_jobs_status_check check (status in ('pending', 'processing', 'sent', 'failed', 'skipped'));
alter table public.booking_notification_jobs drop column target_profile_id, drop column deferred_reason, drop column deferred_by, drop column deferred_at;
drop function if exists public.defer_booking_client_notice(uuid, text, uuid);
create or replace function private.booking_confirmation_creates_notification_jobs() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'confirmed' then
    insert into public.booking_notification_jobs (confirmation_id, enquiry_id, audience, event) values (new.id, new.enquiry_id, 'client', 'confirmed'), (new.id, new.enquiry_id, 'internal', 'confirmed') on conflict do nothing;
  end if;
  return new;
end $$;
create or replace function public.claim_booking_notification_job(p_confirmation uuid, p_audience text, p_include_retryable boolean default false, p_stale_after interval default interval '2 minutes')
returns setof public.booking_notification_jobs language plpgsql security definer set search_path = '' as $$
begin
  return query update public.booking_notification_jobs j
     set status = 'processing', attempt_count = j.attempt_count + 1, last_attempted_at = now()
   where j.confirmation_id = p_confirmation and j.audience = p_audience
     and (j.status = 'pending' or (p_include_retryable and j.status in ('failed', 'skipped')) or (j.status = 'processing' and j.last_attempted_at < now() - p_stale_after))
  returning j.*;
end $$;
drop function if exists public.cancel_ordinary_booking(uuid, text, uuid, text);
create or replace function public.cancel_ordinary_booking(p_enquiry uuid, p_reason text, p_actor uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare prev public.enquiry_booking_confirmations%rowtype; v_id uuid := gen_random_uuid(); v_rows int;
begin
  if not private.booking_actor_is_super_admin(p_actor) then raise exception 'ordift:booking_not_authorised' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('booking-enquiry:' || p_enquiry::text));
  select * into prev from public.enquiry_booking_confirmations where enquiry_id = p_enquiry order by version desc limit 1;
  if not found or prev.kind = 'cancelled' then raise exception 'ordift:booking_nothing_to_cancel'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'ordift:booking_cancel_reason'; end if;
  insert into public.enquiry_booking_confirmations (id, enquiry_id, version, kind, supersedes_id, quotation_id, quotation_fingerprint, contracting_entity_id, activities, assigned_profile_id, settings_version, reason, confirmed_by)
    values (v_id, p_enquiry, prev.version + 1, 'cancelled', prev.id, prev.quotation_id, prev.quotation_fingerprint, prev.contracting_entity_id, prev.activities, prev.assigned_profile_id, prev.settings_version, btrim(p_reason), p_actor);
  insert into public.activity_log (actor_user_id, action, entity_type, entity_id, metadata) values (p_actor, 'booking.cancelled', 'enquiry', p_enquiry::text, jsonb_build_object('confirmationId', v_id, 'version', prev.version + 1));
  update public.enquiries set crm_stage = 'quotation_sent' where id = p_enquiry and crm_stage::text = 'booked';
  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    insert into public.activity_log (actor_user_id, action, entity_type, entity_id, metadata)
      values (p_actor, 'enquiry.stage_change', 'enquiry', p_enquiry::text, jsonb_build_object('stage', 'quotation_sent', 'from', 'booked', 'reason', 'booking_cancelled', 'confirmationId', v_id, 'automated', true));
  end if;
  return v_id;
end $$;
revoke all on function public.cancel_ordinary_booking(uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.cancel_ordinary_booking(uuid, text, uuid) to service_role;
alter table public.enquiry_booking_confirmations drop constraint if exists booking_cancellation_outcome_valid;
alter table public.enquiry_booking_confirmations drop column cancellation_outcome;
commit;
