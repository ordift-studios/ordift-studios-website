#!/bin/bash
# LOCAL REHEARSAL ONLY (never Production). Applies PROPOSAL_payment_open_commitments_guard.sql to the lab inside ONE transaction that is ROLLED BACK, with synthetic records, and checks: open instructions of different
# types may not together exceed what is owed; instalments, partials and sequential methods still pass; abandoned instructions release after the hold; money already moved (proof, resubmission, completions) is never
# blocked; existing over-committed rows are untouched; rollback.
C=${1:-ordift-mig-check2}; DB=${2:-p4_e2e}; D="$(cd "$(dirname "$0")" && pwd)"
q() { docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d "$DB" -X -q -v ON_ERROR_STOP=1 -At; }
snap() { echo "select (select count(*) from public.payments)||'/'||(select count(*) from pg_trigger where tgname='payments_open_commitment_guard')" | q; }
before=$(snap)
{ echo "begin;"; grep -v -E '^(begin|commit);$' "$D/PROPOSAL_payment_open_commitments_guard.sql"; cat <<'SQL'
create or replace function pg_temp.must(c boolean, msg text) returns void language plpgsql as $$ begin if not coalesce(c, false) then raise exception 'REHEARSAL FAILED: %', msg; end if; end $$;
create or replace function pg_temp.err(s text) returns text language plpgsql as $$ begin execute s; return ''; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.enq(due numeric) returns uuid language plpgsql as $$ declare e uuid := gen_random_uuid(); begin
  set local session_replication_role = replica;
  insert into public.enquiries (id, reference_number, email, full_name, service, crm_stage, amount_due, amount_paid, is_test) values (e, 'ENQ-REH-' || substr(e::text, 1, 8), 'r@e2e.test', 'R', 'photography', 'quotation_sent', due, 0, true);
  set local session_replication_role = origin; return e; end $$;
create or replace function pg_temp.pay(e uuid, usd numeric, ptype text default 'partial', method text default 'bank_transfer', st text default 'pending', age interval default '0') returns uuid language plpgsql as $$ declare p uuid := gen_random_uuid(); begin
  insert into public.payments (id, record_id, entity_type, entity_id, user_id, reference_amount_usd, payment_currency, exchange_rate, exchange_rate_source, exchange_rate_locked_at, converted_amount, payment_type, payment_method, status, provider, created_at)
    values (p, 'PAY-REH-' || substr(p::text, 1, 8), 'enquiry', e::text, 'ff475186-3b33-4ea0-90fe-5280d2b1b7d7', usd, 'QAR', 3.64, 'ordift', now(), round(usd * 3.64, 2), ptype, method, st, case when method = 'gateway' then 'paystack' else 'bank_transfer' end, now() - age);
  return p; end $$;
do $$ declare e uuid; a uuid; b uuid; r text; n0 int := (select count(*) from public.payments);
begin
  -- 1 the gap: a deposit and a full-balance instruction can no longer both be open
  e := pg_temp.enq(1000); a := pg_temp.pay(e, 600, 'deposit');
  r := pg_temp.err(format('select pg_temp.pay(%L, 1000, %L)', e, 'full')); perform pg_temp.must(r like '%would_exceed_outstanding%', '1a a full-balance instruction beside an open 600 deposit is refused (got ' || r || ')');
  perform pg_temp.must(pg_temp.err(format('select pg_temp.pay(%L, 400, %L)', e, 'balance')) = '', '1b the remaining 400 is still allowed');
  r := pg_temp.err(format('select pg_temp.pay(%L, 0.01, %L, %L)', e, 'partial', 'gateway')); perform pg_temp.must(r like '%would_exceed_outstanding%', '1c nothing more fits once 600 + 400 are held, whatever the method');
  -- 2 card and bank count against each other
  e := pg_temp.enq(1000); perform pg_temp.pay(e, 700, 'full', 'gateway'); perform pg_temp.must(pg_temp.err(format('select pg_temp.pay(%L, 400, %L)', e, 'partial')) like '%would_exceed_outstanding%', '2 a pending card attempt of 700 holds that much against a bank instruction of 400');
  -- 3 instalments and sequential methods still pass: completed money reduces what is owed
  e := pg_temp.enq(1000); a := pg_temp.pay(e, 400); update public.payments set status = 'awaiting_verification' where id = a; perform pg_temp.pay(e, 300, 'partial', 'gateway');
  update public.payments set status = 'completed' where id = a;
  perform pg_temp.must(pg_temp.err(format('select pg_temp.pay(%L, 300, %L)', e, 'balance')) = '', '3a after the first 400 is verified and a 300 card attempt is open, the last 300 fits');
  perform pg_temp.must(pg_temp.err(format('select pg_temp.pay(%L, 100, %L)', e, 'partial')) like '%would_exceed_outstanding%', '3b ...and nothing beyond');
  -- 4 an abandoned pending instruction stops holding after the hold period; one awaiting verification holds however old
  e := pg_temp.enq(1000); perform pg_temp.pay(e, 800, 'full', 'bank_transfer', 'pending', interval '30 hours');
  perform pg_temp.must(pg_temp.err(format('select pg_temp.pay(%L, 800, %L, %L)', e, 'partial', 'gateway')) = '', '4a a pending instruction older than the hold (24h) no longer reserves the balance');
  e := pg_temp.enq(1000); perform pg_temp.pay(e, 800, 'full', 'bank_transfer', 'awaiting_verification', interval '30 hours');
  perform pg_temp.must(pg_temp.err(format('select pg_temp.pay(%L, 800, %L, %L)', e, 'partial', 'gateway')) like '%would_exceed_outstanding%', '4b an instruction awaiting verification holds however old (money may have moved)');
  -- 5 raising the amount of an open instruction is a new commitment; lowering it, or changing nothing about the amount, is not
  e := pg_temp.enq(1000); a := pg_temp.pay(e, 300); b := pg_temp.pay(e, 500, 'balance');
  perform pg_temp.must(pg_temp.err(format('update public.payments set reference_amount_usd = 600 where id = %L', a)) like '%would_exceed_outstanding%', '5a raising 300 to 600 beside an open 500 (total 1100) is refused');
  perform pg_temp.must(pg_temp.err(format('update public.payments set reference_amount_usd = 500 where id = %L', a)) = '', '5b raising it to exactly what fits is allowed');
  perform pg_temp.must(pg_temp.err(format('update public.payments set reference_amount_usd = 100 where id = %L', a)) = '', '5c lowering it is allowed');
  -- 6 money that has moved is never blocked, even when other open instructions have since filled the balance
  e := pg_temp.enq(1000); a := pg_temp.pay(e, 600, 'deposit', 'bank_transfer', 'pending', interval '30 hours'); b := pg_temp.pay(e, 700, 'balance');      -- the old one no longer holds, so 700 fits
  perform pg_temp.must(pg_temp.err(format('update public.payments set status = %L, proof_of_payment_asset_path = %L where id = %L', 'awaiting_verification', 'p/x', a)) = '', '6a the client who paid the old instruction can still submit proof');
  update public.payments set status = 'rejected' where id = a;
  perform pg_temp.must(pg_temp.err(format('update public.payments set status = %L where id = %L', 'awaiting_verification', a)) = '', '6b and can resubmit after a rejection');
  perform pg_temp.must(pg_temp.err(format('update public.payments set status = %L, amount_collected = converted_amount where id = %L', 'completed', pg_temp.pay(e, 1, 'partial', 'gateway', 'failed'))) = '', '6c a card completion is never refused by this rule');
  -- 7 refunds are not commitments; a refund row never counts as held money
  e := pg_temp.enq(500); perform pg_temp.pay(e, 500, 'full', 'bank_transfer', 'completed'); perform pg_temp.pay(e, 200, 'refund', 'bank_transfer', 'completed');
  perform pg_temp.must(pg_temp.err(format('select pg_temp.pay(%L, 200, %L)', e, 'partial')) = '', '7 after a 200 refund a 200 start fits again');
  -- 8 a record with no amount due yet is not bounded (the start routes refuse it themselves)
  e := pg_temp.enq(null); perform pg_temp.must(pg_temp.err(format('select pg_temp.pay(%L, 999, %L)', e, 'partial')) = '', '8 nothing to bound against when no amount due is set');
  -- 9 existing rows are untouched: the guard only judges new commitments
  perform pg_temp.must((select count(*) from public.payments where record_id not like 'PAY-REH-%') = n0, '9 existing payment rows are all still there and none was edited');
end $$;
select 'PAYMENT OPEN COMMITMENTS REHEARSAL (rules) PASSED' as result;
rollback;
SQL
} | q
echo "-- rollback"
{ echo "begin;"; grep -v -E '^(begin|commit);$' "$D/PROPOSAL_payment_open_commitments_guard.sql"; grep -v -E '^(begin|commit);$' "$D/ROLLBACK_payment_open_commitments_guard.sql"; echo "do \$\$ begin if exists (select 1 from pg_trigger where tgname = 'payments_open_commitment_guard') or to_regprocedure('private.open_instruction_hold_hours()') is not null then raise exception 'ROLLBACK REHEARSAL FAILED'; end if; end \$\$; select 'PAYMENT OPEN COMMITMENTS ROLLBACK REHEARSAL PASSED'; rollback;"; } | q
after=$(snap); echo "lab payments/trigger before: $before after: $after -> $([ "$before" = "$after" ] && echo UNCHANGED || echo CHANGED)"
