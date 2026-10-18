-- LOCAL ONLY. Establish, override and side-effect tests. Run after 02_tests.sql (same fixtures).
\set ON_ERROR_STOP 1
\set VERBOSITY terse

create or replace function public.m2a_est(p_enq uuid, p_q uuid, p_actor text default 'admin', p_cur text default 'GHS', p_ack boolean default false) returns jsonb language plpgsql as $$
declare v_rate numeric; v_eff timestamptz;
begin
  select rate_to_usd, effective_from into v_rate, v_eff from public.exchange_rates where currency_code = p_cur order by effective_from desc limit 1;
  return public.establish_enquiry_amount_due(p_enq, p_q, public.m2a_id(p_actor), v_rate, v_eff, p_ack);
end $$;

\echo ===== D. establishing the amount due =====
select public.m2a_mkenq('EST', 'GH'); select public.m2a_mkq('EST1', public.m2a_id('enq_EST'), 'accepted', 'GHS', 1108.98);
create temp table est_before as select crm_stage, amount_paid from public.enquiries where id = public.m2a_id('enq_EST');
create temp table est_out as select public.m2a_est(public.m2a_id('enq_EST'), public.m2a_id('q_EST1')) r;
select public.m2a_assert((select (amount_due, amount_due_source, amount_due_quotation_id) = (100.00::numeric, 'accepted_quotation', public.m2a_id('q_EST1')) from public.enquiries where id = public.m2a_id('enq_EST')), 'establish: amount due = GHS 1,108.98 / 11.0898 = USD 100.00, source accepted_quotation, quotation linked');
select public.m2a_assert((select (usd_total, fx_currency, fx_rate_to_usd) = (100.00::numeric, 'GHS', 11.089800::numeric) and fx_locked_at is not null from public.client_quotations where id = public.m2a_id('q_EST1')), 'establish: rate and USD total locked on the quotation');
select public.m2a_assert((select crm_stage from public.enquiries where id = public.m2a_id('enq_EST')) is not distinct from (select crm_stage from est_before), 'establish: the stage is untouched');
select public.m2a_assert((select count(*) from public.enquiry_amount_events where enquiry_id = public.m2a_id('enq_EST') and kind = 'established' and amount_before is null and amount_after = 100 and fx_rate_to_usd = 11.0898 and quotation_currency = 'GHS' and quotation_total = 1108.98 and fx_rate_note like 'M2A test%' and actor_id = public.m2a_id('admin')) = 1, 'establish: one ledger row with before/after, currency, total, rate, note and actor');
select public.m2a_assert((select count(*) from public.activity_log where action = 'enquiry.amount_due_established' and entity_id = public.m2a_id('enq_EST')::text and actor_user_id = public.m2a_id('admin')) = 1, 'establish: one audit entry');
select public.m2a_assert((select (public.m2a_est(public.m2a_id('enq_EST'), public.m2a_id('q_EST1')))->>'noop' = 'true'), 'establish: repeating it is a no-op');
select public.m2a_assert((select count(*) from public.enquiry_amount_events where enquiry_id = public.m2a_id('enq_EST')) = 1, 'establish: the no-op added no second ledger row');

select public.m2a_mkenq('USD1', 'GH'); select public.m2a_mkq('USD1Q', public.m2a_id('enq_USD1'), 'accepted', 'USD', 250);
select public.m2a_assert((public.establish_enquiry_amount_due(public.m2a_id('enq_USD1'), public.m2a_id('q_USD1Q'), public.m2a_id('super')))->>'amountDue' = '250.00', 'establish: a USD quotation uses rate 1 and needs no exchange rate (super admin also allowed)');

-- refusals
select public.m2a_mkenq('R1'); select public.m2a_mkq('R1Q', public.m2a_id('enq_R1'), 'sent', 'USD', 300);
select public.m2a_expect(format($$ select public.m2a_est(%L, %L) $$, public.m2a_id('enq_R1'), public.m2a_id('q_R1Q')), '%ordift:quotation_not_accepted%');
select public.m2a_expect(format($$ select public.m2a_est(%L, %L) $$, public.m2a_id('enq_R1'), public.m2a_id('q_EST1')), '%ordift:quotation_not_linked%');
select public.m2a_expect(format($$ select public.m2a_est(%L, %L, 'plain') $$, public.m2a_id('enq_R1'), public.m2a_id('q_R1Q')), '%ordift:not_authorised%');
select public.m2a_expect(format($$ select public.m2a_est(%L, %L) $$, public.m2a_id('enq_CREW'), public.m2a_id('q_CREW1')), '%ordift:crew_support_excluded%');
select public.m2a_expect(format($$ select public.m2a_est(gen_random_uuid(), %L) $$, public.m2a_id('q_R1Q')), '%ordift:enquiry_not_found%');
select public.m2a_mkenq('R2'); select public.m2a_mkq('R2Q', public.m2a_id('enq_R2'), 'accepted', 'USD', 300, null, false);
select public.m2a_expect(format($$ select public.m2a_est(%L, %L) $$, public.m2a_id('enq_R2'), public.m2a_id('q_R2Q')), '%ordift:contracting_entity_missing%');
select public.m2a_mkenq('R3', null); select public.m2a_mkq('R3Q', public.m2a_id('enq_R3'), 'accepted', 'USD', 300);
select public.m2a_expect(format($$ select public.m2a_est(%L, %L) $$, public.m2a_id('enq_R3'), public.m2a_id('q_R3Q')), '%ordift:payment_market_not_set%');
select public.m2a_mkenq('R4', 'GH'); select public.m2a_mkq('R4Q', public.m2a_id('enq_R4'), 'accepted', 'QAR', 3640);
select public.m2a_expect(format($$ select public.m2a_est(%L, %L, 'admin', 'QAR') $$, public.m2a_id('enq_R4'), public.m2a_id('q_R4Q')), '%ordift:currency_market_mismatch%');
select public.m2a_mkenq('R5', 'QA'); select public.m2a_mkq('R5Q', public.m2a_id('enq_R5'), 'accepted', 'QAR', 3640);
select public.m2a_expect(format($$ select public.m2a_est(%L, %L, 'admin', 'QAR') $$, public.m2a_id('enq_R5'), public.m2a_id('q_R5Q')), '%ordift:rate_stale%');
select public.m2a_mkenq('R6'); select public.m2a_mkq('R6Q', public.m2a_id('enq_R6'), 'accepted', 'GHS', 1108.98);
select public.m2a_expect(format($$ select public.establish_enquiry_amount_due(%L, %L, %L, 11.5, now(), false) $$, public.m2a_id('enq_R6'), public.m2a_id('q_R6Q'), public.m2a_id('admin')), '%ordift:rate_changed_since_preview%');
select public.m2a_expect(format($$ select public.establish_enquiry_amount_due(%L, %L, %L) $$, public.m2a_id('enq_R6'), public.m2a_id('q_R6Q'), public.m2a_id('admin')), '%ordift:rate_changed_since_preview%');
-- inconsistent total
update public.client_quotation_items set line_total = 5 where quotation_id = public.m2a_id('q_R6Q') and service_item = 'Item B';
select public.m2a_expect(format($$ select public.m2a_est(%L, %L) $$, public.m2a_id('enq_R6'), public.m2a_id('q_R6Q')), '%ordift:total_not_consistent%');
update public.client_quotation_items set line_total = 100 where quotation_id = public.m2a_id('q_R6Q') and service_item = 'Item B';
-- missing source note and rate jump (each rolled back by the helper)
select public.m2a_expect(format($$ do $x$ begin
  insert into public.exchange_rates (currency_code, rate_to_usd, effective_from, reason) values ('GHS', 11.1, now(), '   ');
  perform public.m2a_est(%L, %L); end $x$ $$, public.m2a_id('enq_R6'), public.m2a_id('q_R6Q')), '%ordift:rate_source_missing%');
select public.m2a_expect(format($$ do $x$ begin
  insert into public.exchange_rates (currency_code, rate_to_usd, effective_from, reason) values ('GHS', 13.5, now(), 'M2A test jump');
  perform public.m2a_est(%L, %L); end $x$ $$, public.m2a_id('enq_R6'), public.m2a_id('q_R6Q')), '%ordift:rate_jump_unacknowledged%');
select public.m2a_expect(format($$ do $x$ declare r jsonb; begin
  insert into public.exchange_rates (currency_code, rate_to_usd, effective_from, reason) values ('GHS', 13.5, now(), 'M2A test jump');
  r := public.m2a_est(%L, %L, 'admin', 'GHS', true);
  if (r->>'amountDue')::numeric <> round(1108.98 / 13.5, 2) then raise exception 'wrong amount %%', r; end if;
  raise exception 'ROLLED_BACK_AFTER_SUCCESS'; end $x$ $$, public.m2a_id('enq_R6'), public.m2a_id('q_R6Q')), '%ROLLED_BACK_AFTER_SUCCESS%');
-- amount already supplied by another quotation / typed amount / payments
select public.m2a_mkenq('R7', 'GH', 'ordift_led', 50, 'accepted_quotation'); select public.m2a_mkq('R7OLD', null, 'superseded', 'USD', 150); select public.m2a_mkq('R7Q', public.m2a_id('enq_R7'), 'accepted', 'USD', 300);
update public.enquiries set amount_due_quotation_id = public.m2a_id('q_R7OLD') where id = public.m2a_id('enq_R7');
select public.m2a_expect(format($$ select public.m2a_est(%L, %L) $$, public.m2a_id('enq_R7'), public.m2a_id('q_R7Q')), '%ordift:different_quotation_supplies_amount%');
select public.m2a_mkenq('R8', 'GH', 'ordift_led', 77, 'manual'); select public.m2a_mkq('R8Q', public.m2a_id('enq_R8'), 'accepted', 'USD', 300);
select public.m2a_expect(format($$ select public.m2a_est(%L, %L) $$, public.m2a_id('enq_R8'), public.m2a_id('q_R8Q')), '%ordift:amount_already_set_use_override%');
select public.m2a_mkenq('R9', 'GH', 'ordift_led', null, null, 10); select public.m2a_mkq('R9Q', public.m2a_id('enq_R9'), 'accepted', 'USD', 300);
select public.m2a_expect(format($$ select public.m2a_est(%L, %L) $$, public.m2a_id('enq_R9'), public.m2a_id('q_R9Q')), '%ordift:payments_exist_amount_differs%');

\echo ===== E. Super Admin override =====
select public.m2a_mkenq('OV', 'GH', 'ordift_led', 100, 'accepted_quotation', 40);
select public.m2a_expect(format($$ select public.override_enquiry_amount_due(%L, %L, 120, 'scope_or_price_change_agreed', 'Client agreed an extra location in writing', 'Email 2026-10-20') $$, public.m2a_id('enq_OV'), public.m2a_id('admin')), '%ordift:not_authorised%');
select public.m2a_expect(format($$ select public.override_enquiry_amount_due(%L, %L, 120, 'scope_or_price_change_agreed', 'too short', 'ref') $$, public.m2a_id('enq_OV'), public.m2a_id('super')), '%ordift:reason_too_short%');
select public.m2a_expect(format($$ select public.override_enquiry_amount_due(%L, %L, 120, 'other', 'test test test test test test test test', 'ref123') $$, public.m2a_id('enq_OV'), public.m2a_id('super')), '%ordift:reason_not_meaningful%');
select public.m2a_expect(format($$ select public.override_enquiry_amount_due(%L, %L, 120, 'nonsense', 'Client agreed an extra location in writing', 'ref123') $$, public.m2a_id('enq_OV'), public.m2a_id('super')), '%ordift:category_invalid%');
select public.m2a_expect(format($$ select public.override_enquiry_amount_due(%L, %L, 120, 'other', 'Client agreed an extra location in writing', null) $$, public.m2a_id('enq_OV'), public.m2a_id('super')), '%ordift:evidence_required%');
select public.m2a_expect(format($$ select public.override_enquiry_amount_due(%L, %L, 30, 'scope_or_price_change_agreed', 'Client agreed an extra location in writing', 'ref123') $$, public.m2a_id('enq_OV'), public.m2a_id('super')), '%ordift:amount_below_paid%');
select public.m2a_expect(format($$ select public.override_enquiry_amount_due(%L, %L, 100, 'scope_or_price_change_agreed', 'Client agreed an extra location in writing', 'ref123') $$, public.m2a_id('enq_OV'), public.m2a_id('super')), '%ordift:amount_unchanged%');
select public.m2a_expect(format($$ select public.override_enquiry_amount_due(%L, %L, -5, 'scope_or_price_change_agreed', 'Client agreed an extra location in writing', 'ref123') $$, public.m2a_id('enq_OV'), public.m2a_id('super')), '%ordift:amount_not_positive%');
select public.m2a_expect(format($$ select public.override_enquiry_amount_due(%L, %L, 120, 'scope_or_price_change_agreed', 'Client agreed an extra location in writing', 'ref123') $$, public.m2a_id('enq_CREW'), public.m2a_id('super')), '%ordift:crew_support_excluded%');
select public.override_enquiry_amount_due(public.m2a_id('enq_OV'), public.m2a_id('super'), 120, 'scope_or_price_change_agreed', 'Client agreed an extra location in writing', 'Email 2026-10-20');
select public.m2a_assert((select amount_due = 120 and amount_due_source = 'manual' and amount_due_quotation_id is null from public.enquiries where id = public.m2a_id('enq_OV')), 'override: amount, source manual and quotation pointer cleared');
select public.m2a_assert((select count(*) from public.enquiry_amount_events where enquiry_id = public.m2a_id('enq_OV') and kind = 'override' and amount_before = 100 and amount_after = 120 and source_before = 'accepted_quotation' and source_after = 'manual' and category = 'scope_or_price_change_agreed' and char_length(reason) >= 30 and evidence_reference = 'Email 2026-10-20' and actor_id = public.m2a_id('super')) = 1, 'override: ledger row holds before and after, category, reason, evidence and actor');
select public.m2a_assert((select count(*) from public.activity_log where action = 'enquiry.amount_due_overridden' and entity_id = public.m2a_id('enq_OV')::text and actor_user_id = public.m2a_id('super')) = 1, 'override: one audit entry');
select public.m2a_assert((public.override_enquiry_amount_due(public.m2a_id('enq_OV'), public.m2a_id('super'), 125, 'data_entry_correction', 'Typing error corrected after re-reading the signed quotation', null))->>'amountDue' = '125.00', 'override: a data-entry correction needs no evidence reference');

\echo ===== F. nothing else moved =====
select public.m2a_assert((select count(*) from public.crew_support_notification_events) = (select v from public.m2a_snap where k = 'crew_support_notification_events')
  and (select count(*) from public.assignment_notifications) = (select v from public.m2a_snap where k = 'assignment_notifications')
  and (select count(*) from public.assignment_notification_deliveries) = (select v from public.m2a_snap where k = 'assignment_notification_deliveries')
  and (select count(*) from public.email_send_failures) = (select v from public.m2a_snap where k = 'email_send_failures'), 'no notification or email record was created by any revise, establish or override');
select public.m2a_assert((select count(*) from public.payments) = (select v from public.m2a_snap where k = 'payments') and (select count(*) from public.payment_obligations) = (select v from public.m2a_snap where k = 'payment_obligations') and (select count(*) from public.engagements) = (select v from public.m2a_snap where k = 'engagements'), 'no payment, obligation or engagement was created');
select public.m2a_assert((select count(*) from pg_trigger t join pg_proc p on p.oid = t.tgfoid where not t.tgisinternal and t.tgrelid in ('public.enquiries'::regclass, 'public.client_quotations'::regclass, 'public.client_quotation_items'::regclass, 'public.enquiry_amount_events'::regclass) and p.prosrc ~* '(insert into|perform |net\.http|http_post|pg_notify|dblink)') = 0, 'every trigger on the affected tables only guards or stamps (no inserts, no network calls, no notifications)');
select public.m2a_assert((select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('revise_ordinary_quotation','establish_enquiry_amount_due','override_enquiry_amount_due') and (p.prosrc ~* 'crm_stage|pg_net|http_post|notif' )) = 0, 'the three functions never reference the stage, notifications or network calls');
select public.m2a_assert((select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('revise_ordinary_quotation','establish_enquiry_amount_due','override_enquiry_amount_due') and (p.prosrc ~* '(insert into|update|delete from)\s+public\.(payments|payment_obligations|engagements|crew_support|deliverables)')) = 0, 'the three functions never write payment, obligation, engagement, Crew Support or deliverable tables');
