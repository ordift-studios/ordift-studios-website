-- PROPOSAL (LOCAL ONLY - not applied to Production; needs the Founder's separate approval). Booking notifications, 10 Nov 2026.
-- WHAT: a durable delivery record ("outbox") for the two messages a booking CONFIRMATION produces: the client's booking confirmation e-mail and the internal "New Booking Confirmed" notice.
--   * public.booking_notification_jobs: one row per (confirmation, audience). The UNIQUE key is what makes each message happen once: a duplicate request, a double click or a retry can never create a second job.
--   * a trigger creates the two jobs (status pending) in the SAME transaction as a 'confirmed' confirmation row, so a confirmation can never exist without its notification records, and NOTHING ELSE can create one:
--     a payment, a payment verification, a stage edit and a booking change or cancellation do not (changes and cancellations have no client notice until the wording is approved).
--   * claim_booking_notification_job(): DB-authoritative claim (pending -> processing; optionally failed/skipped -> processing for a staff retry; a stale processing job after 2 minutes), attempt count bumped atomically.
--   * finish_booking_notification_job(): the only way to record the outcome, and only for a job currently processing. A 'sent' job can never change again (guard trigger); no job is ever deleted.
--   Retry stays staff-triggered (Super Admin button), exactly like the payment receipt outbox (migrations 0030/0032): no scheduler is added.
-- Requires PROPOSAL_booking_confirmation.sql. Additive only: no existing table, row or function is changed. Rollback: ROLLBACK_booking_notifications.sql (drops the table: export it first if you need the delivery history).
begin;
do $$ begin
  if to_regclass('public.enquiry_booking_confirmations') is null then raise exception 'ordift:requires_booking_confirmation_tables'; end if;
end $$;

create table public.booking_notification_jobs (
  id uuid primary key default gen_random_uuid(),
  confirmation_id uuid not null references public.enquiry_booking_confirmations(id),
  enquiry_id uuid not null references public.enquiries(id),
  audience text not null check (audience in ('client', 'internal')),
  event text not null default 'confirmed' check (event in ('confirmed', 'changed', 'cancelled')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'skipped')),
  attempt_count int not null default 0,
  last_attempted_at timestamptz,
  sent_at timestamptz,
  last_error text,
  provider_result text,                                   -- 'sent' (a real send), 'logged' (test mode: nothing left this system), 'suppressed', 'no_email', 'no_recipients'
  recipient_count int not null default 0,
  deliveries jsonb not null default '[]'::jsonb,          -- [{recipient, ok, mode, at}] so a retry only addresses people not yet reached
  subject text,
  body_text text,                                         -- the exact plain-text message, so a person can see (and, if suppressed, copy) what was or would be sent
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (confirmation_id, audience)
);
create index booking_notification_jobs_enquiry_idx on public.booking_notification_jobs (enquiry_id, created_at desc);
alter table public.booking_notification_jobs enable row level security;                          -- no policies: nobody reads it through the public API
revoke all on public.booking_notification_jobs from public, anon, authenticated;
grant select on public.booking_notification_jobs to service_role;                                 -- the application reads; every write goes through the functions below

create or replace function private.booking_notification_jobs_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'ordift:booking_notification_jobs_are_permanent'; end if;
  if old.status = 'sent' then raise exception 'ordift:booking_notification_already_sent'; end if;
  if new.confirmation_id <> old.confirmation_id or new.enquiry_id <> old.enquiry_id or new.audience <> old.audience or new.event <> old.event then raise exception 'ordift:booking_notification_identity_is_fixed'; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger booking_notification_jobs_guard before update or delete on public.booking_notification_jobs for each row execute function private.booking_notification_jobs_guard();

-- the jobs are born with the confirmation (same transaction). Only a first or renewed CONFIRMATION notifies; a change or a cancellation does not (until its wording is approved).
create or replace function private.booking_confirmation_creates_notification_jobs() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'confirmed' then
    insert into public.booking_notification_jobs (confirmation_id, enquiry_id, audience, event) values (new.id, new.enquiry_id, 'client', 'confirmed'), (new.id, new.enquiry_id, 'internal', 'confirmed') on conflict do nothing;
  end if;
  return new;
end $$;
create trigger booking_confirmation_notification_jobs after insert on public.enquiry_booking_confirmations for each row execute function private.booking_confirmation_creates_notification_jobs();

create or replace function public.claim_booking_notification_job(p_confirmation uuid, p_audience text, p_include_retryable boolean default false, p_stale_after interval default interval '2 minutes')
returns setof public.booking_notification_jobs language plpgsql security definer set search_path = '' as $$
begin
  return query update public.booking_notification_jobs j
     set status = 'processing', attempt_count = j.attempt_count + 1, last_attempted_at = now()
   where j.confirmation_id = p_confirmation and j.audience = p_audience
     and (j.status = 'pending' or (p_include_retryable and j.status in ('failed', 'skipped')) or (j.status = 'processing' and j.last_attempted_at < now() - p_stale_after))
  returning j.*;
end $$;

create or replace function public.finish_booking_notification_job(p_job uuid, p_status text, p_error text, p_provider_result text, p_deliveries jsonb, p_recipient_count int, p_subject text, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('sent', 'failed', 'skipped') then raise exception 'ordift:booking_notification_bad_status'; end if;
  update public.booking_notification_jobs set status = p_status, last_error = p_error, provider_result = p_provider_result, deliveries = coalesce(p_deliveries, '[]'::jsonb), recipient_count = coalesce(p_recipient_count, 0),
         subject = p_subject, body_text = p_body, sent_at = case when p_status = 'sent' then now() else sent_at end
   where id = p_job and status = 'processing';
  if not found then raise exception 'ordift:booking_notification_not_processing'; end if;
end $$;

revoke all on function public.claim_booking_notification_job(uuid, text, boolean, interval) from public, anon, authenticated, service_role;
revoke all on function public.finish_booking_notification_job(uuid, text, text, text, jsonb, int, text, text) from public, anon, authenticated, service_role;
grant execute on function public.claim_booking_notification_job(uuid, text, boolean, interval) to service_role;
grant execute on function public.finish_booking_notification_job(uuid, text, text, text, jsonb, int, text, text) to service_role;
commit;
