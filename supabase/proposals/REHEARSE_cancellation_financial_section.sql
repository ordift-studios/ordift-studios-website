-- Section for PROPOSAL_cancellation_financial_decisions.sql (after notifications v1, v2 and v3 in one rolled-back transaction, after the shared setup). Synthetic data only.
create or replace function pg_temp.setpaid(e text, st text, paid numeric, due numeric default null) returns void language plpgsql as $$ begin set local session_replication_role = replica; update public.enquiries set payment_status = st, amount_paid = paid, amount_due = coalesce(due, amount_due) where id = split_part(e,'|',1)::uuid; set local session_replication_role = origin; end $$;
create or replace function pg_temp.sg(day text) returns jsonb language sql as $$ select jsonb_build_array(jsonb_build_object('startsAt', day || 'T09:00:00Z', 'endsAt', day || 'T11:00:00Z', 'timezone', 'Asia/Qatar', 'kind', 'on_site', 'location', 'Synthetic studio, Doha')) $$;
create or replace function pg_temp.rq(e text, k text, amt numeric, actor text, reason text default 'client withdrew; refund agreed in writing', evid text default 'Signed cancellation letter ref CL-2026-014') returns text language plpgsql as $$
begin return public.request_cancellation_financial_action(split_part(e,'|',1)::uuid, k, amt, reason, evid, actor::uuid)::text; exception when others then return 'ERR:' || sqlerrm; end $$;
create or replace function pg_temp.dc(id text, d text, actor text, note text default 'Checked the letter and the ledger') returns text language plpgsql as $$
begin perform public.decide_cancellation_financial_action(id::uuid, d, note, actor::uuid); return ''; exception when others then return sqlerrm; end $$;
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000a7', 'sa2@e2e.test') on conflict do nothing;
insert into public.profiles (id, full_name, access_status) values ('00000000-0000-4000-8000-0000000000a7', 'Second Super Admin', 'active') on conflict do nothing;
insert into public.user_roles (user_id, role_id) select '00000000-0000-4000-8000-0000000000a7', r.id from public.roles r where r.slug = 'super_admin' on conflict do nothing;
create temp table pay0 as select count(*) n, coalesce(sum(amount_collected), 0) s from public.payments; grant all on pay0 to public;

do $$ declare e text := pg_temp.mk(61, '44444444-4444-4444-8444-444444444401', 'QAR', 2500, 'photography', 1000, 1000); r text; id1 text; id2 text; id3 text; ex text;
  sa1 text := '00000000-0000-4000-8000-0000000000a0'; adm text := '00000000-0000-4000-8000-0000000000a1'; sa2 text := '00000000-0000-4000-8000-0000000000a7'; stf text := '00000000-0000-4000-8000-0000000000a2'; begin
  perform pg_temp.setpaid(e, 'Paid', 1000);
  perform pg_temp.conf(pg_temp.pl(e, jsonb_build_object('segments', pg_temp.sg('2027-02-05'))));
  perform pg_temp.must(pg_temp.rq(e, 'refund', 100, adm) like 'ERR:%needs_final_cancellation%', 'A1: nothing can be requested while the booking stands');
  perform public.cancel_ordinary_booking(split_part(e,'|',1)::uuid, 'client asked for another date, new one to follow', sa1::uuid);
  perform pg_temp.must(pg_temp.rq(e, 'refund', 100, adm) like 'ERR:%needs_final_cancellation%', 'A2: nor after a cancellation that is only awaiting rescheduling');
  perform public.confirm_ordinary_booking(pg_temp.pl(e, jsonb_build_object('segments', pg_temp.sg('2027-02-06'))), sa1::uuid);
  perform public.cancel_ordinary_booking(split_part(e,'|',1)::uuid, 'client withdrew for good, no new date', sa1::uuid, 'final');
  -- B authority
  perform pg_temp.must(pg_temp.rq(e, 'refund', 100, stf) like 'ERR:%not_authorised%', 'B1: staff cannot request');
  perform pg_temp.must(pg_temp.rq(e, 'refund', 100, '00000000-0000-4000-8000-0000000000a6') like 'ERR:%not_authorised%', 'B2: a client cannot request');
  perform pg_temp.must(pg_temp.rq(e, 'refund', 100, gen_random_uuid()::text) like 'ERR:%not_authorised%', 'B3: an unknown person cannot request');
  -- C validations
  perform pg_temp.must(pg_temp.rq(e, 'refund', 100, adm, 'short') like 'ERR:%financial_reason%', 'C1: reason needed');
  perform pg_temp.must(pg_temp.rq(e, 'refund', 100, adm, 'client withdrew; refund agreed in writing', 'short') like 'ERR:%financial_evidence%', 'C2: evidence needed');
  perform pg_temp.must(pg_temp.rq(e, 'refund', 100, adm, 'client withdrew; refund agreed in writing', 'mail from ama@example.com on 3 Nov') like 'ERR:%financial_evidence%', 'C3: evidence is a reference, not an e-mail address');
  perform pg_temp.must(pg_temp.rq(e, 'refund', 100, adm, 'client withdrew; refund agreed in writing', 'bank account 0012345678 statement') like 'ERR:%financial_evidence%' and pg_temp.rq(e, 'refund', 100, adm, 'client withdrew; refund agreed in writing', 'phone +233 24 123 4567 confirmed') like 'ERR:%financial_evidence%', 'C4: nor a long account number or a phone number');
  perform pg_temp.must(pg_temp.rq(e, 'refund', null, adm) like 'ERR:%financial_amount%' and pg_temp.rq(e, 'refund', 0, adm) like 'ERR:%financial_amount%', 'C5: a refund needs an amount above zero');
  perform pg_temp.must(pg_temp.rq(e, 'no_adjustment', 50, adm) like 'ERR:%financial_amount%', 'C6: no adjustment carries no amount');
  perform pg_temp.must(pg_temp.rq(e, 'refund', 1000.01, adm) like 'ERR:%over_cap%', 'C7: a refund cannot exceed what was verified paid');
  perform pg_temp.must(pg_temp.rq(e, 'write_off', 1, adm) like 'ERR:%over_cap%', 'C8: nothing is unpaid here, so nothing can be written off');
  perform pg_temp.must(pg_temp.rq(e, 'bonus', 1, adm) like 'ERR:%financial_kind%', 'C9: unknown kind refused');
  -- D requests, caps, separation of duties
  id1 := pg_temp.rq(e, 'refund', 600, adm); perform pg_temp.must(id1 not like 'ERR:%', 'D1: an Admin can request');
  perform pg_temp.must(pg_temp.rq(e, 'refund', 500, sa1) like 'ERR:%over_cap%', 'D2: open requests count against the cap (600 + 500 > 1000)');
  id2 := pg_temp.rq(e, 'refund', 400, sa1); perform pg_temp.must(id2 not like 'ERR:%', 'D3: a Super Admin can request within the cap (600 + 400)');
  perform pg_temp.must(pg_temp.dc(id1, 'authorised', adm) ilike '%not_authorised%', 'D4: an Admin cannot decide');
  perform pg_temp.must(pg_temp.dc(id2, 'authorised', sa1) ilike '%separation_of_duties%', 'D5: a Super Admin cannot authorise their OWN request');
  perform pg_temp.must(pg_temp.dc(id1, 'maybe', sa1) ilike '%financial_decision%' and pg_temp.dc(id1, 'authorised', sa1, 'ok') ilike '%financial_note%', 'D6: a decision needs a valid choice and a written note');
  perform pg_temp.must(pg_temp.dc(id1, 'authorised', sa1) = '', 'D7: a different Super Admin authorises the Admin''s request');
  perform pg_temp.must(pg_temp.dc(id2, 'declined', sa2) = '', 'D8: a second Super Admin declines the first one''s request');
  perform pg_temp.must(pg_temp.dc(id1, 'declined', sa2) ilike '%decision_is_final%', 'D9: a decision is final');
  perform pg_temp.must(pg_temp.rq(e, 'refund', 400, adm) not like 'ERR:%', 'D10: a declined request frees its part of the cap');
  -- E execution
  perform pg_temp.must(pg_temp.err(format($q$select public.record_cancellation_financial_execution(%L, 'RF-2026-0007', %L)$q$, id2, sa2)) ilike '%not_authorised%', 'E1: a declined request can never be executed');
  perform pg_temp.must(pg_temp.err(format($q$select public.record_cancellation_financial_execution(%L, 'RF-2026-0007', %L)$q$, id1, adm)) ilike '%not_authorised%', 'E2: only a Super Admin records execution');
  perform pg_temp.must(pg_temp.err(format($q$select public.record_cancellation_financial_execution(%L, 'x', %L)$q$, id1, sa1)) ilike '%financial_reference%', 'E3: an execution needs a reference (not an e-mail or long number)');
  perform public.record_cancellation_financial_execution(id1::uuid, 'RF-2026-0007', sa1::uuid);
  perform pg_temp.must(pg_temp.err(format($q$select public.record_cancellation_financial_execution(%L, 'RF-2026-0008', %L)$q$, id1, sa1)) ilike '%execution_is_final%', 'E4: executed once only');
  perform pg_temp.must(pg_temp.err(format($q$update public.cancellation_financial_decisions set amount_usd = 1 where id = %L$q$, id1)) ilike '%request_is_fixed%', 'E5: the request itself can never be edited');
  perform pg_temp.must(pg_temp.err(format($q$update public.cancellation_financial_decisions set status = 'declined' where id = %L$q$, id1)) ilike '%decision_is_final%', 'E6: a decision can never be changed afterwards');
  perform pg_temp.must(pg_temp.err(format($q$delete from public.cancellation_financial_decisions where id = %L$q$, id1)) ilike '%permanent%', 'E7: nothing is ever deleted');
  -- F money, quotation and history untouched; audit
  perform pg_temp.must((select amount_paid = 1000 and payment_status = 'Paid' and amount_due = 1000 and crm_stage::text = 'quotation_sent' from public.enquiries where id = split_part(e,'|',1)::uuid), 'F1: amount paid, status, amount due and stage are exactly as they were');
  perform pg_temp.must((select status = 'accepted' from public.client_quotations where id = split_part(e,'|',2)::uuid) and (select n = (select count(*) from public.payments) and s = (select coalesce(sum(amount_collected),0) from public.payments) from pay0), 'F2: the quotation and the payments table are untouched');
  perform pg_temp.must((select count(*) from public.enquiry_booking_confirmations where enquiry_id = split_part(e,'|',1)::uuid) = 4, 'F3: the whole booking history is kept (confirmed, cancelled, confirmed, cancelled final)');
  perform pg_temp.must((select count(*) from public.activity_log where entity_id = split_part(e,'|',1) and action like 'booking.cancellation_financial_%') = 6, 'F4: every step is audited with the actor (3 requests, 2 decisions, 1 execution)');
  ex := 'ok';
end $$;
-- G write-off on an unpaid balance, no-adjustment, privileges
do $$ declare e text := pg_temp.mk(62, '44444444-4444-4444-8444-444444444401', 'QAR', 2500, 'photography', 800, 300); wid text; adm text := '00000000-0000-4000-8000-0000000000a1'; begin
  perform pg_temp.setpaid(e, 'Pending', 300, 800);
  perform pg_temp.conf(pg_temp.pl(e, jsonb_build_object('segments', pg_temp.sg('2027-02-09')))); perform public.cancel_ordinary_booking(split_part(e,'|',1)::uuid, 'client withdrew for good, balance will not be paid', '00000000-0000-4000-8000-0000000000a0', 'final');
  perform pg_temp.must(pg_temp.rq(e, 'write_off', 600, adm) like 'ERR:%over_cap%', 'G1: a write-off cannot exceed the unpaid balance (500)');
  wid := pg_temp.rq(e, 'write_off', 500, adm); perform pg_temp.must(wid not like 'ERR:%', 'G2: a write-off of exactly the unpaid balance can be requested');
  perform pg_temp.must(pg_temp.rq(e, 'write_off', 1, adm) like 'ERR:%over_cap%', 'G3: and nothing more');
  perform pg_temp.must(pg_temp.rq(e, 'no_adjustment', null, adm) not like 'ERR:%', 'G4: "no adjustment needed" is itself recorded, with reason and evidence');
  perform pg_temp.must((select amount_paid = 300 and amount_due = 800 from public.enquiries where id = split_part(e,'|',1)::uuid), 'G5: a write-off REQUEST changes no balance');
  perform pg_temp.must(not has_table_privilege('authenticated', 'public.cancellation_financial_decisions', 'select') and not has_table_privilege('service_role', 'public.cancellation_financial_decisions', 'insert') and not has_table_privilege('service_role', 'public.cancellation_financial_decisions', 'update') and not has_table_privilege('service_role', 'public.cancellation_financial_decisions', 'delete'), 'G6: no direct access: clients cannot read it, the application can only read, and writes only through the functions');
  perform pg_temp.must(not has_function_privilege('authenticated', 'public.decide_cancellation_financial_action(uuid,text,text,uuid)', 'execute') and has_function_privilege('service_role', 'public.decide_cancellation_financial_action(uuid,text,text,uuid)', 'execute'), 'G7: the functions are server-only');
end $$;
select 'CANCELLATION FINANCIAL DECISIONS REHEARSAL PASSED' as result;
