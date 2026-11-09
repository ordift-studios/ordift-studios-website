-- Section for PROPOSAL_booking_notices_v2.sql (after notifications v1 + v2 in the same rolled-back transaction, after the shared setup). Synthetic data only.
create or replace function pg_temp.setpaid(e text, st text, paid numeric) returns void language plpgsql as $$ begin set local session_replication_role = replica; update public.enquiries set payment_status = st, amount_paid = paid where id = split_part(e,'|',1)::uuid; set local session_replication_role = origin; end $$;
create or replace function pg_temp.sg(day text) returns jsonb language sql as $$ select jsonb_build_array(jsonb_build_object('startsAt', day || 'T09:00:00Z', 'endsAt', day || 'T11:00:00Z', 'timezone', 'Asia/Qatar', 'kind', 'on_site', 'location', 'Synthetic studio, Doha')) $$;
create or replace function pg_temp.ev(e text) returns text language sql as $$ select string_agg(audience || ':' || event || coalesce(':' || target_profile_id::text, ''), ',' order by audience, event) from public.booking_notification_jobs j where j.enquiry_id = split_part(e,'|',1)::uuid and j.confirmation_id = (select id from public.enquiry_booking_confirmations c where c.enquiry_id = j.enquiry_id order by version desc limit 1) $$;
create or replace function pg_temp.lastc(e text) returns uuid language sql as $$ select id from public.enquiry_booking_confirmations where enquiry_id = split_part(e,'|',1)::uuid order by version desc limit 1 $$;
create or replace function pg_temp.cl(c uuid, a text, retry boolean default false) returns int language sql as $$ select count(*)::int from public.claim_booking_notification_job(c, a, retry) $$;
create or replace function pg_temp.sup(e text, over jsonb) returns jsonb language sql as $$ select over || jsonb_build_object('supersedes', (select id from public.enquiry_booking_confirmations where enquiry_id = split_part(e,'|',1)::uuid order by version desc limit 1)) $$;

-- A. the audience matrix for every kind of version
do $$ declare a text := pg_temp.mk(51, '44444444-4444-4444-8444-444444444401', 'QAR', 2500, 'photography', 1000, 0); b text := pg_temp.mk(52, '44444444-4444-4444-8444-444444444401', 'QAR', 2500, 'photography', 1000, 0);
  p2 text := '00000000-0000-4000-8000-0000000000a2'; p3 text := '00000000-0000-4000-8000-0000000000a3'; begin
  perform pg_temp.conf(pg_temp.pl(b, jsonb_build_object('segments', pg_temp.sg('2027-01-05'))));
  perform pg_temp.must(pg_temp.ev(b) = 'client:confirmed,internal:confirmed', 'A0: a confirmation with nobody assigned notifies client and internal only');
  perform pg_temp.conf(pg_temp.pl(a, jsonb_build_object('assignedProfileId', p2, 'segments', pg_temp.sg('2027-01-06'))));
  perform pg_temp.must(pg_temp.ev(a) = 'assigned:confirmed:' || p2 || ',client:confirmed,internal:confirmed', 'A1: a confirmation with an assigned person also notifies that person');
  perform pg_temp.conf(pg_temp.pl(a, pg_temp.sup(a, jsonb_build_object('assignedProfileId', p2, 'segments', pg_temp.sg('2027-01-07')))));
  perform pg_temp.must(pg_temp.ev(a) = 'assigned:changed:' || p2 || ',client:changed,internal:changed', 'A2: a reschedule keeping the person notifies client, internal and the person (event changed)');
  perform pg_temp.conf(pg_temp.pl(a, pg_temp.sup(a, jsonb_build_object('assignedProfileId', p3, 'segments', pg_temp.sg('2027-01-07')))));
  perform pg_temp.must(pg_temp.ev(a) = 'assigned:changed:' || p3 || ',client:changed,internal:changed,released:changed:' || p2, 'A3: a different person: the new person is told, and the person taken off is told they are released');
  perform public.cancel_ordinary_booking(split_part(a,'|',1)::uuid, 'client asked for another date, new date to follow', '00000000-0000-4000-8000-0000000000a0');
  perform pg_temp.must(pg_temp.ev(a) = 'assigned:cancelled_pending:' || p3 || ',client:cancelled_pending,internal:cancelled_pending', 'A4: a default cancellation is cancelled_pending and tells the assigned person');
  perform pg_temp.must((select cancellation_outcome from public.enquiry_booking_confirmations where id = pg_temp.lastc(a)) = 'rescheduling_pending', 'A5: the outcome is recorded on the cancellation row');
  insert into t values ('v2a', a), ('v2b', b);
end $$;

-- B. final cancellation; invalid outcome; authorisation; money and quotation untouched
do $$ declare e text := pg_temp.mk(53, '44444444-4444-4444-8444-444444444401', 'QAR', 2500, 'photography', 1000, 1000); pay0 numeric; r text; begin
  perform pg_temp.setpaid(e, 'Paid', 1000); select coalesce(sum(amount_collected),0) into pay0 from public.payments;
  perform pg_temp.conf(pg_temp.pl(e, jsonb_build_object('segments', pg_temp.sg('2027-01-08'))));
  r := pg_temp.err(format($q$select public.cancel_ordinary_booking(%L, 'a reason that is long enough', %L, 'whatever')$q$, split_part(e,'|',1), '00000000-0000-4000-8000-0000000000a0'));
  perform pg_temp.must(r ilike '%cancel_outcome%', 'B1: an unknown outcome is refused');
  r := pg_temp.err(format($q$select public.cancel_ordinary_booking(%L, 'a reason that is long enough', %L, 'final')$q$, split_part(e,'|',1), '00000000-0000-4000-8000-0000000000a1'));
  perform pg_temp.must(r ilike '%not_authorised%', 'B2: only a Super Admin cancels');
  perform pg_temp.must((select kind from public.enquiry_booking_confirmations where id = pg_temp.lastc(e)) = 'confirmed', 'B3: refusals write nothing');
  perform public.cancel_ordinary_booking(split_part(e,'|',1)::uuid, 'client withdrew for good, no new date', '00000000-0000-4000-8000-0000000000a0', 'final');
  perform pg_temp.must(pg_temp.ev(e) = 'client:cancelled_final,internal:cancelled_final', 'B4: a final cancellation creates cancelled_final notices');
  perform pg_temp.must((select cancellation_outcome from public.enquiry_booking_confirmations where id = pg_temp.lastc(e)) = 'final', 'B5: final is recorded');
  perform pg_temp.must((select crm_stage::text from public.enquiries where id = split_part(e,'|',1)::uuid) = 'quotation_sent', 'B6: the stage returns exactly as for a rescheduling cancellation (nothing is closed or refunded automatically)');
  perform pg_temp.must((select amount_paid = 1000 and payment_status = 'Paid' from public.enquiries where id = split_part(e,'|',1)::uuid) and (select status = 'accepted' from public.client_quotations where id = split_part(e,'|',2)::uuid) and (select coalesce(sum(amount_collected),0) from public.payments) = pay0, 'B7: payments, amount paid and the accepted quotation are untouched');
  perform pg_temp.must((select count(*) from public.enquiry_booking_confirmations where enquiry_id = split_part(e,'|',1)::uuid) = 2, 'B8: the original booking row is still there (append-only history)');
  perform pg_temp.must((select metadata ->> 'outcome' from public.activity_log where action = 'booking.cancelled' and entity_id = split_part(e,'|',1)) = 'final', 'B9: the audit row records the outcome');
  insert into t values ('v2e', e);
end $$;

-- C. deferral: reason, authority, state, audit; deferred is not auto-claimed but is claimable by an explicit retry
do $$ declare a text; c uuid; r text; begin
  select v into a from t where k = 'v2a'; c := pg_temp.lastc(a);
  r := pg_temp.err(format($q$select public.defer_booking_client_notice(%L, 'short', %L)$q$, c, '00000000-0000-4000-8000-0000000000a0'));
  perform pg_temp.must(r ilike '%defer_reason%', 'C1: a deferral needs a written reason');
  r := pg_temp.err(format($q$select public.defer_booking_client_notice(%L, 'phoning the client first about the new date', %L)$q$, c, '00000000-0000-4000-8000-0000000000a1'));
  perform pg_temp.must(r ilike '%not_authorised%', 'C2: only a Super Admin defers');
  perform public.defer_booking_client_notice(c, 'phoning the client first about the new date', '00000000-0000-4000-8000-0000000000a0');
  perform pg_temp.must((select status = 'deferred' and deferred_reason like 'phoning%' and deferred_by = '00000000-0000-4000-8000-0000000000a0' and deferred_at is not null from public.booking_notification_jobs where confirmation_id = c and audience = 'client'), 'C3: deferred, with the reason, who and when');
  perform pg_temp.must((select status from public.booking_notification_jobs where confirmation_id = c and audience = 'internal') = 'pending', 'C4: only the CLIENT notice can be deferred; internal and assigned notices still go');
  perform pg_temp.must((select count(*) from public.activity_log where action = 'booking.client_notice_deferred' and entity_id = split_part(a,'|',1)) = 1, 'C5: an audit row records the deferral');
  perform pg_temp.must(pg_temp.err(format($q$select public.defer_booking_client_notice(%L, 'trying to defer a second time', %L)$q$, c, '00000000-0000-4000-8000-0000000000a0')) ilike '%nothing_to_defer%', 'C6: a deferred notice cannot be deferred again');
  perform pg_temp.must(pg_temp.cl(c, 'client') = 0, 'C7: an automatic send never claims a deferred notice');
  perform pg_temp.must(pg_temp.cl(c, 'client', true) = 1, 'C8: an explicit send (Send now / manual record) claims it');
  perform public.finish_booking_notification_job((select id from public.booking_notification_jobs where confirmation_id = c and audience = 'client'), 'sent', null, 'manual', '[]'::jsonb, 1, 's', 'b');
  perform pg_temp.must(pg_temp.err(format($q$select public.defer_booking_client_notice(%L, 'too late: it was already sent', %L)$q$, c, '00000000-0000-4000-8000-0000000000a0')) ilike '%nothing_to_defer%', 'C9: a sent notice cannot be deferred');
  perform pg_temp.must((select deferred_reason is not null from public.booking_notification_jobs where confirmation_id = c and audience = 'client'), 'C10: the deferral record stays on the job after it was sent');
end $$;

-- D. the confirmed notice cannot be deferred (the client must be told they are booked); constraints exist
do $$ declare b text; begin
  select v into b from t where k = 'v2b';
  perform pg_temp.must(pg_temp.err(format($q$select public.defer_booking_client_notice(%L, 'trying to hold a confirmation', %L)$q$, pg_temp.lastc(b), '00000000-0000-4000-8000-0000000000a0')) ilike '%nothing_to_defer%', 'D1: a Booking Confirmed notice cannot be deferred');
  perform pg_temp.must(exists (select 1 from pg_constraint where conname = 'booking_cancellation_outcome_valid'), 'D2: the outcome constraint exists');
  perform pg_temp.must(not has_function_privilege('authenticated', 'public.defer_booking_client_notice(uuid,text,uuid)', 'execute') and has_function_privilege('service_role', 'public.defer_booking_client_notice(uuid,text,uuid)', 'execute'), 'D3: the deferral function is server-only');
  perform pg_temp.must(not has_function_privilege('authenticated', 'public.cancel_ordinary_booking(uuid,text,uuid,text)', 'execute') and to_regprocedure('public.cancel_ordinary_booking(uuid,text,uuid)') is null, 'D4: one cancel function, server-only');
end $$;
select 'BOOKING NOTICES V2 REHEARSAL PASSED' as result;
