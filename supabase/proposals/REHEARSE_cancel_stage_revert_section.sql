-- Section for PROPOSAL_booking_cancel_reverts_stage.sql. Runs after the shared setup (REHEARSE_booking_body.sql lines 1-52) inside ONE transaction that the runner ROLLS BACK. Synthetic data only.
create or replace function pg_temp.stage(e text) returns text language sql as $$ select crm_stage::text from public.enquiries where id = split_part(e,'|',1)::uuid $$;
create or replace function pg_temp.sc(e text) returns bigint language sql as $$ select count(*) from public.activity_log where action = 'enquiry.stage_change' and entity_id = split_part(e,'|',1) $$;
create or replace function pg_temp.setpaid(e text, st text, paid numeric) returns void language plpgsql as $$ begin set local session_replication_role = replica; update public.enquiries set payment_status = st, amount_paid = paid where id = split_part(e,'|',1)::uuid; set local session_replication_role = origin; end $$;
create or replace function pg_temp.setstage(e text, st text) returns void language plpgsql as $$ begin set local session_replication_role = replica; update public.enquiries set crm_stage = st::public.crm_stage where id = split_part(e,'|',1)::uuid; set local session_replication_role = origin; end $$;
create temp table pay0 as select count(*) n, coalesce(sum(amount_collected),0) s from public.payments; grant all on pay0 to public;

-- A. PAID IN FULL, UNSCHEDULED: the database never books from a payment; confirmation books; cancellation returns it; the money is untouched
do $$ declare a text := pg_temp.mk(31, '44444444-4444-4444-8444-444444444401', 'QAR', 2500, 'photography', 1000, 1000); cid text; begin
  perform pg_temp.setpaid(a, 'Paid', 1000);
  perform pg_temp.must(pg_temp.stage(a) = 'quotation_sent', 'A1: a fully paid project with no booking stays at quotation_sent');
  cid := pg_temp.conf(pg_temp.pl(a));
  perform pg_temp.must(pg_temp.stage(a) = 'booked' and pg_temp.sc(a) = 0, 'A2: confirmation books it (the confirm audit is booking.confirmed, not a payment stage change)');
  perform public.cancel_ordinary_booking(split_part(a,'|',1)::uuid, 'client rescheduled outside the window', '00000000-0000-4000-8000-0000000000a0');
  perform pg_temp.must(pg_temp.stage(a) = 'quotation_sent', 'A3: cancelling a booked project returns it to quotation_sent');
  perform pg_temp.must(pg_temp.sc(a) = 1, 'A4: exactly one enquiry.stage_change audit row');
  perform pg_temp.must((select metadata ->> 'reason' = 'booking_cancelled' and metadata ->> 'from' = 'booked' and metadata ->> 'stage' = 'quotation_sent' and actor_user_id = '00000000-0000-4000-8000-0000000000a0' from public.activity_log where action = 'enquiry.stage_change' and entity_id = split_part(a,'|',1)), 'A5: the audit row records from, to, reason and the Super Admin');
  perform pg_temp.must((select amount_paid = 1000 and payment_status = 'Paid' from public.enquiries where id = split_part(a,'|',1)::uuid), 'A6: payment history and status untouched by confirm + cancel');
  perform pg_temp.must(pg_temp.try(pg_temp.pl(a)) = '', 'A7: it can be confirmed again after the cancellation');
  perform pg_temp.must(pg_temp.stage(a) = 'booked', 'A8: booked again by a genuine confirmation');
  perform public.cancel_ordinary_booking(split_part(a,'|',1)::uuid, 'second cancellation for the rehearsal', '00000000-0000-4000-8000-0000000000a0');
  perform pg_temp.must(pg_temp.sc(a) = 2 and pg_temp.stage(a) = 'quotation_sent', 'A9: each cancellation is audited once');
end $$;

-- B. work already under way is never rewound
do $$ declare a text := pg_temp.mk(32, '44444444-4444-4444-8444-444444444401', 'QAR', 2500, 'photography', 1000, 0); begin
  perform pg_temp.conf(pg_temp.pl(a));
  perform pg_temp.setstage(a, 'in_progress');
  perform public.cancel_ordinary_booking(split_part(a,'|',1)::uuid, 'cancelled after work had started', '00000000-0000-4000-8000-0000000000a0');
  perform pg_temp.must(pg_temp.stage(a) = 'in_progress' and pg_temp.sc(a) = 0, 'B1: an in_progress project is not rewound and writes no stage audit');
  perform pg_temp.must((select kind from public.enquiry_booking_confirmations where enquiry_id = split_part(a,'|',1)::uuid order by version desc limit 1) = 'cancelled', 'B2: the cancellation itself is still recorded');
end $$;

-- C. rescheduling (a change) keeps the stage and writes no stage audit
do $$ declare a text := pg_temp.mk(33, '44444444-4444-4444-8444-444444444401', 'QAR', 2500, 'photography', 1000, 0); begin
  perform pg_temp.conf(pg_temp.pl(a));
  perform pg_temp.conf(pg_temp.pl(a, jsonb_build_object('supersedes', (select id from public.enquiry_booking_confirmations where enquiry_id = split_part(a,'|',1)::uuid order by version desc limit 1), 'segments', jsonb_build_array(jsonb_build_object('startsAt','2026-12-15T09:00:00Z','endsAt','2026-12-15T12:00:00Z','timezone','Asia/Qatar','kind','on_site','location','Synthetic studio, Doha')))));
  perform pg_temp.must((select kind from public.enquiry_booking_confirmations where enquiry_id = split_part(a,'|',1)::uuid order by version desc limit 1) = 'changed' and pg_temp.stage(a) = 'booked' and pg_temp.sc(a) = 0, 'C1: a reschedule is a new version, stage stays booked, no stage audit');
end $$;

-- D. OVERPAYMENT and a part-refund state: confirmation and cancellation never touch amount_paid / payment_status / payments
do $$ declare a text := pg_temp.mk(34, '44444444-4444-4444-8444-444444444401', 'QAR', 2500, 'photography', 1000, 1300); begin
  perform pg_temp.setpaid(a, 'Paid', 1300);
  perform pg_temp.conf(pg_temp.pl(a));
  perform public.cancel_ordinary_booking(split_part(a,'|',1)::uuid, 'overpaid project cancelled for the rehearsal', '00000000-0000-4000-8000-0000000000a0');
  perform pg_temp.must((select amount_paid = 1300 and payment_status = 'Paid' from public.enquiries where id = split_part(a,'|',1)::uuid), 'D1: an overpayment is left exactly as recorded (no silent correction)');
end $$;

-- E. refusals write nothing
do $$ declare a text := pg_temp.mk(35, '44444444-4444-4444-8444-444444444401', 'QAR', 2500, 'photography', 1000, 0); r text; n int; begin
  perform pg_temp.conf(pg_temp.pl(a));
  select count(*) into n from public.activity_log;
  r := pg_temp.err(format($q$select public.cancel_ordinary_booking(%L, 'a long enough reason', %L)$q$, split_part(a,'|',1), '00000000-0000-4000-8000-0000000000a1'));
  perform pg_temp.must(r ilike '%not_authorised%', 'E1: only a Super Admin cancels');
  r := pg_temp.err(format($q$select public.cancel_ordinary_booking(%L, 'short', %L)$q$, split_part(a,'|',1), '00000000-0000-4000-8000-0000000000a0'));
  perform pg_temp.must(r ilike '%cancel_reason%', 'E2: a cancel needs a reason');
  perform pg_temp.must(pg_temp.stage(a) = 'booked' and (select count(*) from public.activity_log) = n, 'E3: refused cancellations change nothing and write no audit');
end $$;

-- F. a project that was never booked: nothing to cancel, stage untouched
do $$ declare a text := pg_temp.mk(36, '44444444-4444-4444-8444-444444444401', 'QAR', 2500, 'photography', 1000, 1000); begin
  perform pg_temp.setpaid(a, 'Paid', 1000);
  perform pg_temp.must(pg_temp.err(format($q$select public.cancel_ordinary_booking(%L, 'nothing was ever booked here', %L)$q$, split_part(a,'|',1), '00000000-0000-4000-8000-0000000000a0')) ilike '%nothing_to_cancel%', 'F1: nothing to cancel');
  perform pg_temp.must(pg_temp.stage(a) = 'quotation_sent', 'F2: stage unchanged');
end $$;
select pg_temp.must((select n = (select count(*) from public.payments) and s = (select coalesce(sum(amount_collected),0) from public.payments) from pay0), 'G1: the payments table is identical before and after (no payment row created, changed or removed)');
select 'CANCEL STAGE REVERT REHEARSAL PASSED' as result;
