#!/bin/bash
# LOCAL REHEARSAL ONLY (never Production). Applies PROPOSAL_payment_integrity_controls.sql to the lab inside ONE transaction that is ROLLED BACK, with synthetic records, and checks: partial payments and
# instalments across bank transfer and card, the overpay refusal (function and table backstop), card over-collection flagging, review cases, the bank reference column, historical rows, and the rollback.
C=${1:-ordift-mig-check2}; DB=${2:-p4_e2e}; D="$(cd "$(dirname "$0")" && pwd)"
q() { docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d "$DB" -X -q -v ON_ERROR_STOP=1 -At; }
snap() { echo "select (select count(*) from public.payments)||'/'||(select count(*) from public.bank_transfer_verifications)||'/'||(select count(*) from public.activity_log)||'/'||md5(pg_get_functiondef('public.verify_bank_transfer_payment(uuid,text,uuid,numeric,text,text,date,boolean,text,text,boolean)'::regprocedure))||'/'||coalesce(to_regclass('public.payment_review_cases')::text,'no-table')" | q; }
before=$(snap)
{ echo "begin;"; grep -v -E '^(begin|commit);$' "$D/PROPOSAL_payment_integrity_controls.sql"; cat <<'SQL'
create or replace function pg_temp.must(c boolean, msg text) returns void language plpgsql as $$ begin if not coalesce(c, false) then raise exception 'REHEARSAL FAILED: %', msg; end if; end $$;
create or replace function pg_temp.err(s text) returns text language plpgsql as $$ begin execute s; return ''; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.enq(due numeric) returns uuid language plpgsql as $$ declare e uuid := gen_random_uuid(); begin
  set local session_replication_role = replica;
  insert into public.enquiries (id, reference_number, email, full_name, service, crm_stage, amount_due, amount_paid, is_test) values (e, 'ENQ-REH-' || substr(e::text, 1, 8), 'r@e2e.test', 'R', 'photography', 'quotation_sent', due, 0, true);
  set local session_replication_role = origin; return e; end $$;
-- a payment awaiting verification: usd credited if approved, local amount QAR at 3.64
create or replace function pg_temp.pay(e uuid, usd numeric, method text default 'bank_transfer', st text default 'awaiting_verification') returns uuid language plpgsql as $$ declare p uuid := gen_random_uuid(); acct uuid; begin
  select id into acct from public.bank_accounts where country = 'QA' limit 1;
  set local session_replication_role = replica;
  insert into public.payments (id, record_id, entity_type, entity_id, user_id, submitted_by, reference_amount_usd, payment_currency, exchange_rate, exchange_rate_source, exchange_rate_locked_at, converted_amount, payment_type, payment_method, status, provider, receiving_bank_account_id)
    values (p, 'PAY-REH-' || substr(p::text, 1, 8), 'enquiry', e::text, 'ff475186-3b33-4ea0-90fe-5280d2b1b7d7', case when method = 'bank_transfer' then 'ff475186-3b33-4ea0-90fe-5280d2b1b7d7'::uuid end, usd, 'QAR', 3.64, 'ordift', now(), round(usd * 3.64, 2), 'partial', method, st, case when method = 'gateway' then 'paystack' else 'bank_transfer' end, case when method = 'bank_transfer' then acct end);
  set local session_replication_role = origin; return p; end $$;
create or replace function pg_temp.verify(p uuid, ref text, amount numeric default null) returns text language plpgsql as $$ declare q numeric; begin
  select coalesce(amount, converted_amount) into q from public.payments where id = p;
  perform public.verify_bank_transfer_payment(p, 'approved', '4010fc9c-f5c6-4f4d-8845-64856df35647', q, 'QAR', ref, current_date, true, null, null, false); return 'ok'; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.paid(e uuid) returns numeric language sql as $$ select coalesce(sum(case when payment_type = 'refund' then -reference_amount_usd else reference_amount_usd end), 0) from public.payments where entity_id = e::text and status = 'completed' $$;

do $$ declare e uuid; a uuid; b uuid; c uuid; r text; n0 int := (select count(*) from public.payments); w int := (select count(*) from public.payments where payment_method = 'bank_transfer' and bank_transaction_reference is not null);
begin
  -- 1 the confirmed race, in sequence: 700 + 700 on a 1000 receivable -> the second is refused, total stays within what is owed
  e := pg_temp.enq(1000); a := pg_temp.pay(e, 700); b := pg_temp.pay(e, 700);
  perform pg_temp.must(pg_temp.verify(a, 'REH-1A') = 'ok', '1a first approval');
  r := pg_temp.verify(b, 'REH-1B'); perform pg_temp.must(r like '%would_overpay_receivable%', '1b second refused (got ' || r || ')');
  perform pg_temp.must(pg_temp.paid(e) = 700 and (select status from public.payments where id = b) = 'awaiting_verification', '1c refusal changed nothing: still awaiting verification, total 700');
  -- 2 the bank reference is kept apart from the card provider's reference
  perform pg_temp.must((select bank_transaction_reference from public.payments where id = a) = 'REH-1A' and (select gateway_reference from public.payments where id = a) is null, '2 bank reference in its own column, gateway_reference left empty');
  -- 3 partial payments and instalments across both methods: 400 bank + 300 card + 300 bank = 1000 exactly; one more cent is refused
  e := pg_temp.enq(1000); a := pg_temp.pay(e, 400); b := pg_temp.pay(e, 300, 'gateway', 'completed'); c := pg_temp.pay(e, 300);
  perform pg_temp.must(pg_temp.verify(a, 'REH-3A') = 'ok' and pg_temp.verify(c, 'REH-3C') = 'ok' and pg_temp.paid(e) = 1000, '3a instalments across methods add up to exactly the amount due');
  b := pg_temp.pay(e, 0.01); r := pg_temp.verify(b, 'REH-3D', 0.04); perform pg_temp.must(r like '%would_overpay_receivable%', '3b one cent more is refused (got ' || r || ')');
  -- 4 a refund frees the balance again
  insert into public.payments (record_id, entity_type, entity_id, payment_type, status, reference_amount_usd, payment_currency, exchange_rate, exchange_rate_source, exchange_rate_locked_at, converted_amount, payment_method, provider)
    values ('PAY-REH-RF1', 'enquiry', e::text, 'refund', 'completed', 100, 'QAR', 3.64, 'ordift', now(), 364, 'bank_transfer', 'bank_transfer');
  b := pg_temp.pay(e, 100); perform pg_temp.must(pg_temp.verify(b, 'REH-4A') = 'ok' and pg_temp.paid(e) = 1000, '4 after a 100 refund a 100 credit fits again');
  -- 5 duplicate request: the same payment decided twice -> the second is refused as no longer awaiting verification
  e := pg_temp.enq(500); a := pg_temp.pay(e, 200); perform pg_temp.verify(a, 'REH-5A'); r := pg_temp.verify(a, 'REH-5B'); perform pg_temp.must(r like '%not_awaiting_verification%', '5 a repeat decision is refused (got ' || r || ')');
  -- 6 the table backstop: any other path completing a bank row beyond what is owed is refused, and a within-balance one is allowed
  e := pg_temp.enq(300); a := pg_temp.pay(e, 250); b := pg_temp.pay(e, 100);
  perform pg_temp.must(pg_temp.err(format('update public.payments set status = %L where id = %L', 'completed', a)) = '', '6a within the balance: allowed');
  r := pg_temp.err(format('update public.payments set status = %L where id = %L', 'completed', b)); perform pg_temp.must(r like '%would_overpay_receivable%', '6b beyond the balance: refused by the table itself (got ' || r || ')');
  -- 7 a CARD payment is never refused, but over-collection opens ONE review case
  e := pg_temp.enq(300); a := pg_temp.pay(e, 250); perform pg_temp.verify(a, 'REH-7A'); b := pg_temp.pay(e, 100, 'gateway', 'pending');
  perform pg_temp.must(pg_temp.err(format('update public.payments set status = %L where id = %L', 'completed', b)) = '', '7a the card completion is accepted');
  perform pg_temp.must((select count(*) from public.payment_review_cases where payment_id = b and reason = 'over_collection' and status = 'open') = 1, '7b exactly one open over_collection case');
  update public.payments set status = 'completed' where id = b;
  perform pg_temp.must((select count(*) from public.payment_review_cases where payment_id = b) = 1, '7c re-saving does not open a second case');
  -- 8 review cases: opened idempotently, resolved only by an authorised person with a written note, once
  a := pg_temp.pay(e, 10, 'gateway', 'failed'); perform public.open_payment_review_case(a, 'amount_mismatch', '{"expected":100,"received":90}'::jsonb, 'webhook'); perform public.open_payment_review_case(a, 'amount_mismatch', '{}'::jsonb, 'verify');
  perform pg_temp.must((select count(*) from public.payment_review_cases where payment_id = a and reason = 'amount_mismatch') = 1, '8a one open case per payment and reason');
  c := (select id from public.payment_review_cases where payment_id = a);
  perform pg_temp.must(pg_temp.err(format('select public.resolve_payment_review_case(%L, %L, %L, %L)', c, 'ff475186-3b33-4ea0-90fe-5280d2b1b7d7', 'confirmed_not_charged', 'Checked with the provider dashboard.')) like '%resolver_not_authorized%', '8b a client cannot resolve');
  perform pg_temp.must(pg_temp.err(format('select public.resolve_payment_review_case(%L, %L, %L, %L)', c, '4010fc9c-f5c6-4f4d-8845-64856df35647', 'confirmed_not_charged', 'short')) like '%note_required%', '8c a written note is required');
  perform public.resolve_payment_review_case(c, '4010fc9c-f5c6-4f4d-8845-64856df35647', 'confirmed_not_charged', 'Checked with the provider dashboard: no charge.');
  perform pg_temp.must(pg_temp.err(format('select public.resolve_payment_review_case(%L, %L, %L, %L)', c, '4010fc9c-f5c6-4f4d-8845-64856df35647', 'other', 'Trying to resolve it twice.')) like '%case_already_resolved%', '8d resolving twice is refused');
  perform public.open_payment_review_case(a, 'amount_mismatch', '{}'::jsonb, 'webhook');
  perform pg_temp.must((select count(*) from public.payment_review_cases where payment_id = a) = 2, '8e after resolution a NEW occurrence opens a new case; the resolved one is kept');
  set local role service_role;
  r := pg_temp.err(format('delete from public.payment_review_cases where id = %L', c)); perform pg_temp.must(r like '%permission denied%', '8f the application role cannot delete a review case (got ' || r || ')');
  r := pg_temp.err(format('update public.payment_review_cases set status = %L where id = %L', 'open', c)); perform pg_temp.must(r like '%permission denied%', '8g nor edit one directly (got ' || r || ')');
  reset role;
  -- 9 history untouched: no pre-existing payment row was changed by applying the proposal
  perform pg_temp.must((select count(*) from public.payments where record_id not like 'PAY-REH-%') = n0, '9a existing payment rows are all still there');
  perform pg_temp.must((select count(*) from public.payments where payment_method = 'bank_transfer' and bank_transaction_reference is not null and record_id not like 'PAY-REH-%') = w, '9b no existing row received a bank_transaction_reference');
end $$;
select 'PAYMENT INTEGRITY CONTROLS REHEARSAL (rules) PASSED' as result;
rollback;
SQL
} | q
echo "-- rollback: proposal, some verified bank rows, then the rollback script"
{ echo "begin;"; grep -v -E '^(begin|commit);$' "$D/PROPOSAL_payment_integrity_controls.sql"; cat <<'SQL'
create or replace function pg_temp.must(c boolean, msg text) returns void language plpgsql as $$ begin if not coalesce(c, false) then raise exception 'REHEARSAL FAILED: %', msg; end if; end $$;
do $$ declare e uuid := gen_random_uuid(); p uuid := gen_random_uuid(); acct uuid; begin
  select id into acct from public.bank_accounts where country = 'QA' limit 1; set local session_replication_role = replica;
  insert into public.enquiries (id, reference_number, email, full_name, service, crm_stage, amount_due, amount_paid, is_test) values (e, 'ENQ-REH-RB', 'r@e2e.test', 'R', 'photography', 'quotation_sent', 500, 0, true);
  insert into public.payments (id, record_id, entity_type, entity_id, user_id, submitted_by, reference_amount_usd, payment_currency, exchange_rate, exchange_rate_source, exchange_rate_locked_at, converted_amount, payment_type, payment_method, status, provider, receiving_bank_account_id)
    values (p, 'PAY-REH-RB', 'enquiry', e::text, 'ff475186-3b33-4ea0-90fe-5280d2b1b7d7', 'ff475186-3b33-4ea0-90fe-5280d2b1b7d7', 100, 'QAR', 3.64, 'ordift', now(), 364, 'partial', 'bank_transfer', 'awaiting_verification', 'bank_transfer', acct);
  set local session_replication_role = origin;
  perform public.verify_bank_transfer_payment(p, 'approved', '4010fc9c-f5c6-4f4d-8845-64856df35647', 364, 'QAR', 'REH-RB-REF', current_date, true, null, null, false);
  perform pg_temp.must((select bank_transaction_reference from public.payments where id = p) = 'REH-RB-REF', 'new function wrote the bank reference column');
end $$;
SQL
grep -v -E '^(begin|commit);$' "$D/ROLLBACK_payment_integrity_controls.sql"; cat <<'SQL'
do $$ begin
  if to_regclass('public.payment_review_cases') is not null or to_regprocedure('private.payments_bank_completion_guard()') is not null or exists (select 1 from information_schema.columns where table_name = 'payments' and column_name = 'bank_transaction_reference') then raise exception 'ROLLBACK REHEARSAL FAILED: something is still there'; end if;
  if (select gateway_reference from public.payments where record_id = 'PAY-REH-RB') is distinct from 'REH-RB-REF' then raise exception 'ROLLBACK REHEARSAL FAILED: the bank reference was not preserved'; end if;
end $$;
select 'PAYMENT INTEGRITY CONTROLS ROLLBACK REHEARSAL PASSED (bank reference copied back, nothing lost)' as result;
rollback;
SQL
} | q
after=$(snap); echo "lab payments/verifications/activity/function fingerprint/review table before: $before"; echo "                                                                   after:  $after -> $([ "$before" = "$after" ] && echo UNCHANGED || echo CHANGED)"
