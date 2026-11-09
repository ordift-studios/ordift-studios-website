-- PROPOSAL (LOCAL ONLY - not applied to Production; needs the Founder's separate approval). Booking notices v2, 10 Nov 2026.
-- Requires PROPOSAL_booking_confirmation.sql, PROPOSAL_booking_cancel_reverts_stage.sql and PROPOSAL_booking_notifications.sql (it extends them). Additive except that it REPLACES three functions (cancel, the job-creating trigger function, claim).
-- WHAT
--   1. A cancellation now says WHY it is a cancellation: enquiry_booking_confirmations.cancellation_outcome = 'rescheduling_pending' (a new date will be agreed; the default, and what every cancellation before this meant)
--      or 'final' (no new date). Nullable (earlier rows stay as they are; the application reads null as rescheduling_pending). cancel_ordinary_booking() gains an optional 4th argument. No payment, quotation or balance is read or written.
--   2. Every booking VERSION now creates its notification jobs with the confirmation, in the same transaction: confirmed -> client + internal (+ assigned person); changed -> client + internal (+ assigned person, + 'released' for a
--      person who was taken off); cancelled -> client + internal (+ assigned person). event = confirmed | changed | cancelled_pending | cancelled_final. Each job names the profile it concerns (target_profile_id).
--   3. Deferral: defer_booking_client_notice() lets a Super Admin hold the CLIENT notice of a change or cancellation, ONLY with a written reason (>= 10 characters), only while it is still pending; it records who, when and why on the job,
--      writes an audit row, and the job shows as the outstanding action until someone sends it or records that the client was told another way. The default (nothing done) is that the client IS notified.
--   4. claim_booking_notification_job() treats 'deferred' like failed / skipped: claimable only by an explicit staff action.
--   Jobs gain columns deferred_reason / deferred_by / deferred_at / target_profile_id and the allowed audiences, events and statuses widen. No existing row changes.
-- Rollback: ROLLBACK_booking_notices_v2.sql (restores the v1 functions; drops the new columns, so deferral reasons and cancellation outcomes recorded after v2 are lost: export first).
begin;
do $$ begin
  if to_regclass('public.booking_notification_jobs') is null then raise exception 'ordift:requires_booking_notifications'; end if;
  if to_regprocedure('public.cancel_ordinary_booking(uuid,text,uuid)') is null then raise exception 'ordift:requires_booking_cancel_reverts_stage'; end if;
end $$;

alter table public.enquiry_booking_confirmations add column cancellation_outcome text;
alter table public.enquiry_booking_confirmations add constraint booking_cancellation_outcome_valid check (cancellation_outcome is null or (kind = 'cancelled' and cancellation_outcome in ('rescheduling_pending', 'final')));

alter table public.booking_notification_jobs drop constraint if exists booking_notification_jobs_audience_check;
alter table public.booking_notification_jobs drop constraint if exists booking_notification_jobs_event_check;
alter table public.booking_notification_jobs drop constraint if exists booking_notification_jobs_status_check;
alter table public.booking_notification_jobs add constraint booking_notification_jobs_audience_check check (audience in ('client', 'internal', 'assigned', 'released'));
alter table public.booking_notification_jobs add constraint booking_notification_jobs_event_check check (event in ('confirmed', 'changed', 'cancelled_pending', 'cancelled_final'));
alter table public.booking_notification_jobs add constraint booking_notification_jobs_status_check check (status in ('pending', 'processing', 'sent', 'failed', 'skipped', 'deferred'));
alter table public.booking_notification_jobs add column target_profile_id uuid references public.profiles(id), add column deferred_reason text, add column deferred_by uuid references public.profiles(id), add column deferred_at timestamptz;

create or replace function private.booking_confirmation_creates_notification_jobs() returns trigger language plpgsql security definer set search_path = '' as $$
declare prev public.enquiry_booking_confirmations%rowtype; ev text;
begin
  select * into prev from public.enquiry_booking_confirmations where enquiry_id = new.enquiry_id and version < new.version order by version desc limit 1;
  ev := case new.kind when 'confirmed' then 'confirmed' when 'changed' then 'changed' else case when new.cancellation_outcome = 'final' then 'cancelled_final' else 'cancelled_pending' end end;
  insert into public.booking_notification_jobs (confirmation_id, enquiry_id, audience, event) values (new.id, new.enquiry_id, 'client', ev), (new.id, new.enquiry_id, 'internal', ev) on conflict do nothing;
  if new.assigned_profile_id is not null then
    insert into public.booking_notification_jobs (confirmation_id, enquiry_id, audience, event, target_profile_id) values (new.id, new.enquiry_id, 'assigned', ev, new.assigned_profile_id) on conflict do nothing;
  end if;
  if new.kind = 'changed' and prev.id is not null and prev.assigned_profile_id is not null and prev.assigned_profile_id is distinct from new.assigned_profile_id then
    insert into public.booking_notification_jobs (confirmation_id, enquiry_id, audience, event, target_profile_id) values (new.id, new.enquiry_id, 'released', ev, prev.assigned_profile_id) on conflict do nothing;
  end if;
  return new;
end $$;

drop function public.cancel_ordinary_booking(uuid, text, uuid);
create or replace function public.cancel_ordinary_booking(p_enquiry uuid, p_reason text, p_actor uuid, p_outcome text default 'rescheduling_pending') returns uuid
language plpgsql security definer set search_path = '' as $$
declare prev public.enquiry_booking_confirmations%rowtype; v_id uuid := gen_random_uuid(); v_rows int;
begin
  if not private.booking_actor_is_super_admin(p_actor) then raise exception 'ordift:booking_not_authorised' using errcode = '42501'; end if;
  if p_outcome is null or p_outcome not in ('rescheduling_pending', 'final') then raise exception 'ordift:booking_cancel_outcome'; end if;
  perform pg_advisory_xact_lock(hashtext('booking-enquiry:' || p_enquiry::text));
  select * into prev from public.enquiry_booking_confirmations where enquiry_id = p_enquiry order by version desc limit 1;
  if not found or prev.kind = 'cancelled' then raise exception 'ordift:booking_nothing_to_cancel'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'ordift:booking_cancel_reason'; end if;
  insert into public.enquiry_booking_confirmations (id, enquiry_id, version, kind, supersedes_id, quotation_id, quotation_fingerprint, contracting_entity_id, activities, assigned_profile_id, settings_version, reason, cancellation_outcome, confirmed_by)
    values (v_id, p_enquiry, prev.version + 1, 'cancelled', prev.id, prev.quotation_id, prev.quotation_fingerprint, prev.contracting_entity_id, prev.activities, prev.assigned_profile_id, prev.settings_version, btrim(p_reason), p_outcome, p_actor);
  insert into public.activity_log (actor_user_id, action, entity_type, entity_id, metadata) values (p_actor, 'booking.cancelled', 'enquiry', p_enquiry::text, jsonb_build_object('confirmationId', v_id, 'version', prev.version + 1, 'outcome', p_outcome));
  update public.enquiries set crm_stage = 'quotation_sent' where id = p_enquiry and crm_stage::text = 'booked';
  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    insert into public.activity_log (actor_user_id, action, entity_type, entity_id, metadata)
      values (p_actor, 'enquiry.stage_change', 'enquiry', p_enquiry::text, jsonb_build_object('stage', 'quotation_sent', 'from', 'booked', 'reason', 'booking_cancelled', 'confirmationId', v_id, 'automated', true));
  end if;
  return v_id;
end $$;
revoke all on function public.cancel_ordinary_booking(uuid, text, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.cancel_ordinary_booking(uuid, text, uuid, text) to service_role;

create or replace function public.claim_booking_notification_job(p_confirmation uuid, p_audience text, p_include_retryable boolean default false, p_stale_after interval default interval '2 minutes')
returns setof public.booking_notification_jobs language plpgsql security definer set search_path = '' as $$
begin
  return query update public.booking_notification_jobs j
     set status = 'processing', attempt_count = j.attempt_count + 1, last_attempted_at = now()
   where j.confirmation_id = p_confirmation and j.audience = p_audience
     and (j.status = 'pending' or (p_include_retryable and j.status in ('failed', 'skipped', 'deferred')) or (j.status = 'processing' and j.last_attempted_at < now() - p_stale_after))
  returning j.*;
end $$;

create or replace function public.defer_booking_client_notice(p_confirmation uuid, p_reason text, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare enq uuid;
begin
  if not private.booking_actor_is_super_admin(p_actor) then raise exception 'ordift:booking_not_authorised' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'ordift:booking_defer_reason'; end if;
  update public.booking_notification_jobs set status = 'deferred', deferred_reason = btrim(p_reason), deferred_by = p_actor, deferred_at = now()
   where confirmation_id = p_confirmation and audience = 'client' and status = 'pending' and event <> 'confirmed' returning enquiry_id into enq;
  if enq is null then raise exception 'ordift:booking_nothing_to_defer'; end if;
  insert into public.activity_log (actor_user_id, action, entity_type, entity_id, metadata) values (p_actor, 'booking.client_notice_deferred', 'enquiry', enq::text, jsonb_build_object('confirmationId', p_confirmation, 'reason', left(btrim(p_reason), 300)));
end $$;
revoke all on function public.defer_booking_client_notice(uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.defer_booking_client_notice(uuid, text, uuid) to service_role;
commit;
