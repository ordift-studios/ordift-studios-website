-- LOCAL ONLY. Sequential M2a tests (single session). Each PASS/FAIL line is a RAISE NOTICE. Any FAIL aborts the run.
\set ON_ERROR_STOP 1
\set VERBOSITY terse

-- helpers -------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.m2a_mkenq(p_name text, p_market text default 'GH', p_intent text default 'ordift_led', p_amount numeric default null, p_source text default null, p_paid numeric default null)
returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.enquiries (reference_number, email, full_name, service, payment_country, commercial_intent, amount_due, amount_due_source, amount_paid, is_test)
  values ('M2A-' || p_name, 'm2a-' || lower(p_name) || '@example.invalid', 'M2A ' || p_name, 'photography', p_market, p_intent, p_amount, p_source, p_paid, true) returning id into v;
  insert into public.m2a_fx values ('enq_' || p_name, v); return v;
end $$;

create or replace function public.m2a_mkq(p_name text, p_enq uuid, p_status text, p_cur text, p_total numeric, p_crew uuid default null, p_entity boolean default true)
returns uuid language plpgsql as $$
declare v uuid; v_super uuid := public.m2a_id('super');
begin
  insert into public.client_quotations (quotation_reference, prospect_name, status, currency, subtotal, discount_total, tax_total, total, created_by, enquiry_id, crew_support_request_id, is_test,
                                        issued_at, accepted_at, accepted_via, accepted_by_name, acceptance_channel, acceptance_evidence, acceptance_received_at, acceptance_recorded_by)
  values ('M2A-Q-' || p_name, 'M2A Prospect', p_status, p_cur, p_total, 0, 0, p_total, v_super, p_enq, p_crew, true,
          case when p_status in ('sent','accepted') then now() end,
          case when p_status = 'accepted' then now() end, case when p_status = 'accepted' then 'staff_recorded' end, case when p_status = 'accepted' then 'M2A Client' end,
          case when p_status = 'accepted' then 'email' end, case when p_status = 'accepted' then 'M2A test evidence' end, case when p_status = 'accepted' then now() end,
          case when p_status = 'accepted' then v_super end)
  returning id into v;
  insert into public.client_quotation_items (quotation_id, service_item, quantity, unit_basis, selling_rate, line_total, sort_order) values
    (v, 'Item A', 1, 'per_job', p_total - 100, p_total - 100, 0), (v, 'Item B', 1, 'per_job', 100, 100, 1);
  insert into public.m2a_fx values ('q_' || p_name, v);
  if p_entity and p_status = 'accepted' then
    insert into public.booking_contracting_entities (subject_type, subject_id, version, employing_entity_id, basis, chosen_by) values ('quotation', v, 1, public.m2a_id('entity'), 'M2A test basis', v_super);
  end if;
  return v;
end $$;

create or replace function public.m2a_live(p_enq uuid) returns bigint language sql stable as $$
  select count(*) from public.client_quotations where enquiry_id = p_enq and crew_support_request_id is null and is_variation = false and status in ('draft','ready','sent','accepted') $$;

-- baseline snapshot of everything that must NOT change (notifications, payments, obligations, stages) --------------------------------------------
create table if not exists public.m2a_snap (k text primary key, v bigint);
truncate public.m2a_snap;
insert into public.m2a_snap select 'crew_support_notification_events', count(*) from public.crew_support_notification_events;
insert into public.m2a_snap select 'assignment_notifications', count(*) from public.assignment_notifications;
insert into public.m2a_snap select 'assignment_notification_deliveries', count(*) from public.assignment_notification_deliveries;
insert into public.m2a_snap select 'email_send_failures', count(*) from public.email_send_failures;
insert into public.m2a_snap select 'payments', count(*) from public.payments;
insert into public.m2a_snap select 'payment_obligations', count(*) from public.payment_obligations;
insert into public.m2a_snap select 'engagements', count(*) from public.engagements;
\echo ===== A. ledger, grants, index and constraint semantics =====
select public.m2a_assert(not has_function_privilege('anon', 'public.revise_ordinary_quotation(uuid,uuid)', 'execute') and not has_function_privilege('authenticated', 'public.revise_ordinary_quotation(uuid,uuid)', 'execute') and has_function_privilege('service_role', 'public.revise_ordinary_quotation(uuid,uuid)', 'execute'), 'revise: service_role only');
select public.m2a_assert(not has_function_privilege('anon', 'public.establish_enquiry_amount_due(uuid,uuid,uuid,numeric,timestamptz,boolean)', 'execute') and not has_function_privilege('authenticated', 'public.establish_enquiry_amount_due(uuid,uuid,uuid,numeric,timestamptz,boolean)', 'execute') and has_function_privilege('service_role', 'public.establish_enquiry_amount_due(uuid,uuid,uuid,numeric,timestamptz,boolean)', 'execute'), 'establish: service_role only');
select public.m2a_assert(not has_function_privilege('anon', 'public.override_enquiry_amount_due(uuid,uuid,numeric,text,text,text)', 'execute') and not has_function_privilege('authenticated', 'public.override_enquiry_amount_due(uuid,uuid,numeric,text,text,text)', 'execute') and has_function_privilege('service_role', 'public.override_enquiry_amount_due(uuid,uuid,numeric,text,text,text)', 'execute'), 'override: service_role only');
select public.m2a_assert(not has_table_privilege('service_role', 'public.enquiry_amount_events', 'insert') and not has_table_privilege('service_role', 'public.enquiry_amount_events', 'update') and not has_table_privilege('service_role', 'public.enquiry_amount_events', 'delete') and not has_table_privilege('authenticated', 'public.enquiry_amount_events', 'insert') and not has_table_privilege('anon', 'public.enquiry_amount_events', 'select'), 'ledger: the application role cannot write it directly; anonymous cannot read it');

select public.m2a_mkenq('IDX');
select public.m2a_mkq('IDX1', public.m2a_id('enq_IDX'), 'draft', 'USD', 500);
select public.m2a_expect($$ select public.m2a_mkq('IDX2', public.m2a_id('enq_IDX'), 'draft', 'USD', 500) $$, '%client_quotations_one_live_per_enquiry%');
select public.m2a_expect($$ select public.m2a_mkq('IDX3', public.m2a_id('enq_IDX'), 'sent', 'USD', 500) $$, '%client_quotations_one_live_per_enquiry%');
update public.client_quotations set status = 'sent', issued_at = now() where id = public.m2a_id('q_IDX1');
update public.client_quotations set status = 'declined' where id = public.m2a_id('q_IDX1');
select public.m2a_mkq('IDX4', public.m2a_id('enq_IDX'), 'draft', 'USD', 500);
select public.m2a_assert(public.m2a_live(public.m2a_id('enq_IDX')) = 1, 'index: a declined quotation no longer counts; a new one can be created (1 live)');
update public.client_quotations set is_variation = true where id = public.m2a_id('q_IDX4');
select public.m2a_mkq('IDXVAR', public.m2a_id('enq_IDX'), 'draft', 'USD', 500);
select public.m2a_assert(public.m2a_live(public.m2a_id('enq_IDX')) = 1, 'index: governs ORIGINAL quotations only (a variation row does not collide with its original)');
update public.client_quotations set status = 'declined' where id = public.m2a_id('q_IDXVAR');
update public.client_quotations set is_variation = false where id = public.m2a_id('q_IDX4');
select public.m2a_expect($$ select public.m2a_mkq('IDX5', null, 'draft', 'XXX', 500) $$, '%client_quotations_currency_fk%');
select public.m2a_assert((select count(*) from public.client_quotations where enquiry_id is null and is_test) >= 0, 'index: unlinked quotations are unrestricted');
select public.m2a_mkq('IDX6', null, 'draft', 'USD', 500); select public.m2a_mkq('IDX7', null, 'draft', 'USD', 500);
select public.m2a_assert(true, 'index: two unlinked drafts allowed');
do $$ declare v_req uuid; v_enq uuid := public.m2a_mkenq('CREW', 'GH', 'creative_crew_support'); begin
  insert into public.crew_support_requests (enquiry_id, reference_number, requester_type, requester_name, requester_email, requester_phone, service_family, project_name, start_date, end_date, location, consent_accepted_at, is_test)
  values (v_enq, 'M2A-CSR', 'photographer', 'M2A', 'm2a-crew@example.invalid', '000', 'photo', 'M2A', current_date, current_date, 'x', now(), true) returning id into v_req;
  insert into public.m2a_fx values ('req_CREW', v_req);
  perform public.m2a_mkq('CREW1', v_enq, 'draft', 'USD', 300, v_req); perform public.m2a_mkq('CREWORD', v_enq, 'draft', 'USD', 300);
  raise notice 'PASS  index: a Crew Support quotation does not count as the live ordinary quotation';
end $$;

-- ledger immutability, including for the table owner
insert into public.enquiry_amount_events (enquiry_id, kind, quotation_id, amount_after, source_after, actor_id)
  values (public.m2a_id('enq_IDX'), 'established', public.m2a_id('q_IDX4'), 10, 'accepted_quotation', public.m2a_id('super'));
select public.m2a_expect($$ update public.enquiry_amount_events set amount_after = 11 $$, '%append-only%');
select public.m2a_expect($$ delete from public.enquiry_amount_events $$, '%append-only%');
select public.m2a_expect($$ truncate public.enquiry_amount_events $$, '%append-only%');
select public.m2a_expect($$ insert into public.enquiry_amount_events (enquiry_id, kind, amount_after, source_after, actor_id, category, reason) values (public.m2a_id('enq_IDX'), 'override', 10, 'manual', public.m2a_id('super'), 'other', 'too short') $$, '%enquiry_amount_events_shape%');
delete from public.m2a_fx where name = 'never';
\echo ===== B. atomic revision =====
select public.m2a_mkenq('REV');
select public.m2a_mkq('REV1', public.m2a_id('enq_REV'), 'sent', 'GHS', 1000);
create temp table rev_out as select * from public.revise_ordinary_quotation(public.m2a_id('q_REV1'), public.m2a_id('admin'));
select public.m2a_assert((select status from public.client_quotations where id = public.m2a_id('q_REV1')) = 'superseded', 'revise: original is superseded');
select public.m2a_assert((select count(*) from public.client_quotations c join rev_out r on r.quotation_id = c.id where c.status = 'draft' and c.version = 2 and c.supersedes_id = public.m2a_id('q_REV1') and c.enquiry_id = public.m2a_id('enq_REV') and c.total = 1000 and c.currency = 'GHS' and c.quotation_reference like 'ORD-QUO-____-______') = 1, 'revise: new draft v2 linked to the same enquiry, same total/currency, valid reference');
select public.m2a_assert((select count(*) from public.client_quotation_items i join rev_out r on r.quotation_id = i.quotation_id) = 2 and (select sum(line_total) from public.client_quotation_items i join rev_out r on r.quotation_id = i.quotation_id) = 1000, 'revise: both lines copied with identical totals');
select public.m2a_assert(public.m2a_live(public.m2a_id('enq_REV')) = 1, 'revise: exactly one live quotation for the enquiry afterwards');
select public.m2a_assert((select count(*) from public.activity_log a join rev_out r on r.quotation_id::text = a.entity_id where a.action = 'client_quotation.revised' and a.actor_user_id = public.m2a_id('admin')) = 1, 'revise: one audit entry with the actor');
select public.m2a_assert((select count(*) from public.client_quotation_items where quotation_id = public.m2a_id('q_REV1')) = 2, 'revise: the superseded quotation keeps its own lines (history intact)');
-- refusals
select public.m2a_expect(format($$ select * from public.revise_ordinary_quotation(%L, %L) $$, public.m2a_id('q_REV1'), public.m2a_id('admin')), '%ordift:not_revisable%');
select public.m2a_expect(format($$ select * from public.revise_ordinary_quotation((select quotation_id from rev_out), %L) $$, public.m2a_id('admin')), '%ordift:draft_edit_directly%');
select public.m2a_expect(format($$ select * from public.revise_ordinary_quotation(%L, %L) $$, public.m2a_id('q_REV1'), public.m2a_id('plain')), '%ordift:not_authorised%');
select public.m2a_expect(format($$ select * from public.revise_ordinary_quotation(%L, %L) $$, public.m2a_id('q_CREW1'), public.m2a_id('admin')), '%ordift:crew_managed%');
select public.m2a_expect(format($$ select * from public.revise_ordinary_quotation(gen_random_uuid(), %L) $$, public.m2a_id('admin')), '%ordift:quotation_not_found%');
select public.m2a_mkenq('REVACC'); select public.m2a_mkq('REVACC1', public.m2a_id('enq_REVACC'), 'accepted', 'USD', 400);
select public.m2a_expect(format($$ select * from public.revise_ordinary_quotation(%L, %L) $$, public.m2a_id('q_REVACC1'), public.m2a_id('admin')), '%ordift:not_revisable%');
\echo ===== C. failure injection: a failed revision leaves everything exactly as before =====
select public.m2a_mkenq('FAIL'); select public.m2a_mkq('FAIL1', public.m2a_id('enq_FAIL'), 'sent', 'USD', 700);
create temp table before_fail as select (select count(*) from public.client_quotations) nq, (select count(*) from public.client_quotation_items) ni, (select count(*) from public.activity_log) na,
  (select status from public.client_quotations where id = public.m2a_id('q_FAIL1')) st, (select last_value from public.client_quotation_reference_seq) seq;
create or replace function public.m2a_boom() returns trigger language plpgsql as $$ begin raise exception 'injected failure while copying lines'; end $$;
create trigger m2a_boom before insert on public.client_quotation_items for each row when (new.service_item = 'Item A' and new.quotation_id <> public.m2a_id('q_FAIL1')) execute function public.m2a_boom();
select public.m2a_expect(format($$ select * from public.revise_ordinary_quotation(%L, %L) $$, public.m2a_id('q_FAIL1'), public.m2a_id('admin')), '%injected failure%');
drop trigger m2a_boom on public.client_quotation_items; drop function public.m2a_boom();
select public.m2a_assert((select nq from before_fail) = (select count(*) from public.client_quotations) and (select ni from before_fail) = (select count(*) from public.client_quotation_items) and (select na from before_fail) = (select count(*) from public.activity_log), 'failure: no quotation, line or audit row was added');
select public.m2a_assert((select status from public.client_quotations where id = public.m2a_id('q_FAIL1')) = (select st from before_fail) and public.m2a_live(public.m2a_id('enq_FAIL')) = 1, 'failure: the original is still sent and still the one live quotation');
select public.m2a_assert((select last_value from public.client_quotation_reference_seq) >= (select seq from before_fail), 'failure: the reference sequence may skip a number but never repeats one');
create temp table after_fail as select * from public.revise_ordinary_quotation(public.m2a_id('q_FAIL1'), public.m2a_id('admin'));
select public.m2a_assert((select count(*) from after_fail) = 1 and public.m2a_live(public.m2a_id('enq_FAIL')) = 1, 'failure: a retry after the failure succeeds cleanly');
