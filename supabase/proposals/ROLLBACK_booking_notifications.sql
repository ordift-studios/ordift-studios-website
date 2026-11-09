-- ROLLBACK for PROPOSAL_booking_notifications.sql (LOCAL ONLY). Drops the delivery records: export them first if the history matters. No booking, payment or enquiry row is touched.
begin;
drop trigger if exists booking_confirmation_notification_jobs on public.enquiry_booking_confirmations;
drop function if exists private.booking_confirmation_creates_notification_jobs();
drop function if exists public.claim_booking_notification_job(uuid, text, boolean, interval);
drop function if exists public.finish_booking_notification_job(uuid, text, text, text, jsonb, int, text, text);
drop trigger if exists booking_notification_jobs_guard on public.booking_notification_jobs;
drop function if exists private.booking_notification_jobs_guard();
drop table if exists public.booking_notification_jobs;
commit;
