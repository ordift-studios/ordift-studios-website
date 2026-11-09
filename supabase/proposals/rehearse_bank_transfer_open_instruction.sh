#!/bin/bash
# LOCAL REHEARSAL ONLY (never Production). Applies PROPOSAL_bank_transfer_one_open_instruction.sql to the lab inside ONE transaction that is ROLLED BACK, with synthetic payment rows, and checks:
# compatibility with existing rows, the one-open-instruction rule, every legitimate repeated-payment case, the preflight refusal when duplicates exist, and the rollback. The lab is untouched afterwards.
C=${1:-ordift-mig-check2}; DB=${2:-p4_e2e}; D="$(cd "$(dirname "$0")" && pwd)"
q() { docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d "$DB" -X -q -v ON_ERROR_STOP=1 -At; }
snap() { echo "select (select count(*) from public.payments)||'/'||(select count(*) from public.activity_log)||'/'||(select count(*) from public.bank_transfer_verifications)||'/'||(select count(*) from public.payment_completion_claims)||'/'||coalesce((select indexname from pg_indexes where indexname='payments_one_open_bank_transfer_instruction'),'no-index')" | q; }
before=$(snap)
HELPERS=$(cat <<'SQL'
create or replace function pg_temp.must(c boolean, msg text) returns void language plpgsql as $$ begin if not coalesce(c, false) then raise exception 'REHEARSAL FAILED: %', msg; end if; end $$;
create or replace function pg_temp.err(s text) returns text language plpgsql as $$ begin execute s; return ''; exception when others then return sqlstate || ' ' || sqlerrm; end $$;
create or replace function pg_temp.mk(ent text, usr uuid, ptype text, st text, method text default 'bank_transfer') returns uuid language plpgsql as $$
declare id uuid := gen_random_uuid(); begin
  insert into public.payments (id, record_id, entity_type, entity_id, user_id, reference_amount_usd, payment_currency, exchange_rate, exchange_rate_source, exchange_rate_locked_at, converted_amount, payment_type, payment_method, status, provider)
    values (id, 'PAY-REH-' || substr(id::text, 1, 8), 'enquiry', ent, usr, 100, 'QAR', 3.64, 'ordift', now(), 364, ptype, method, st, case when method = 'gateway' then 'paystack' else 'bank_transfer' end);
  return id; end $$;
SQL
)
{ echo "begin;"; echo "$HELPERS"; grep -v -E '^(begin|commit);$' "$D/PROPOSAL_bank_transfer_one_open_instruction.sql"; cat <<'SQL'
do $$ declare a uuid := 'ff475186-3b33-4ea0-90fe-5280d2b1b7d7'; b uuid := '4010fc9c-f5c6-4f4d-8845-64856df35647'; e1 text := 'rehearsal-enquiry-1'; e2 text := 'rehearsal-enquiry-2'; p1 uuid; p2 uuid; r text; n0 int := (select count(*) from public.payments);
begin
  -- 1 the rule: a second OPEN bank-transfer instruction for the same client, record and type is refused by the database
  p1 := pg_temp.mk(e1, a, 'partial', 'pending');
  r := pg_temp.err(format('select pg_temp.mk(%L, %L, %L, %L)', e1, a, 'partial', 'pending'));
  perform pg_temp.must(r like '23505%payments_one_open_bank_transfer_instruction%', '1 a second open instruction for the same client, record and type is refused (got: ' || r || ')');
  -- 2 legitimate: another payment TYPE, another RECORD, another CLIENT are different keys
  perform pg_temp.mk(e1, a, 'deposit', 'pending'); perform pg_temp.mk(e1, a, 'balance', 'pending'); perform pg_temp.mk(e2, a, 'partial', 'pending'); perform pg_temp.mk(e1, b, 'partial', 'pending');
  -- 3 legitimate: the card path is unaffected (its own index applies to gateway rows only)
  perform pg_temp.mk(e1, a, 'full', 'pending', 'gateway');
  perform pg_temp.must(pg_temp.err(format('select pg_temp.mk(%L, %L, %L, %L, %L)', e1, a, 'full', 'pending', 'gateway')) like '23505%payments_one_pending_gateway_per_entity%', '3 the existing card rule still applies to card rows');
  -- 4 instalments: once proof is in (awaiting_verification) the next instruction may start; then once verified, and again
  update public.payments set status = 'awaiting_verification' where id = p1;
  p2 := pg_temp.mk(e1, a, 'partial', 'pending');
  perform pg_temp.must(p2 is not null, '4a a new instruction can start while the earlier one awaits verification');
  update public.payments set status = 'completed' where id = p1;
  update public.payments set status = 'awaiting_verification' where id = p2; update public.payments set status = 'completed' where id = p2;
  perform pg_temp.mk(e1, a, 'partial', 'pending');
  perform pg_temp.must((select count(*) from public.payments where entity_id = e1 and user_id = a and payment_type = 'partial' and payment_method = 'bank_transfer') = 3, '4b three sequential partial instalments coexist');
  -- 5 retries after a rejection, an information request and a failure
  update public.payments set status = 'pending' where false;
  p1 := pg_temp.mk(e2, b, 'full', 'pending'); update public.payments set status = 'awaiting_verification' where id = p1; update public.payments set status = 'rejected' where id = p1;
  perform pg_temp.mk(e2, b, 'full', 'pending');
  perform pg_temp.must(pg_temp.err(format('update public.payments set status = %L where id = %L', 'pending', p1)) like '23505%', '5a putting a rejected row back to pending while another is open is refused (nothing in the app does this)');
  -- 6 unlimited history
  for i in 1..5 loop perform pg_temp.mk(e2, a, 'balance', 'completed'); perform pg_temp.mk(e2, a, 'balance', 'failed'); perform pg_temp.mk(e2, a, 'balance', 'refunded'); perform pg_temp.mk(e2, a, 'balance', 'rejected'); end loop;
  perform pg_temp.must((select count(*) from public.payments where entity_id = e2 and user_id = a and payment_type = 'balance') = 20, '6 any amount of completed, failed, refunded and rejected history is allowed');
  -- 7 the card/bank cross case: a bank instruction and a card attempt for the same record may be open together (existing behaviour, unchanged)
  perform pg_temp.must((select count(*) from public.payments where record_id not like 'PAY-REH-%') = n0, '8 compatibility: the proposal changed no existing payment row');
  perform pg_temp.must(exists (select 1 from public.payments where entity_id = e1 and payment_method = 'gateway' and status = 'pending') and exists (select 1 from public.payments where entity_id = e1 and user_id = a and payment_method = 'bank_transfer' and status = 'pending'), '7 bank and card instructions are independent');
end $$;
select 'BANK TRANSFER ONE-OPEN-INSTRUCTION REHEARSAL (rules) PASSED' as result;
rollback;
SQL
} | q
echo "-- preflight: with duplicates already present the proposal must refuse BEFORE building anything"
out=$({ echo "begin;"; echo "$HELPERS"; cat <<'SQL'
select pg_temp.mk('rehearsal-dup', 'ff475186-3b33-4ea0-90fe-5280d2b1b7d7', 'partial', 'pending');
select pg_temp.mk('rehearsal-dup', 'ff475186-3b33-4ea0-90fe-5280d2b1b7d7', 'partial', 'pending');
SQL
grep -v -E '^(begin|commit);$' "$D/PROPOSAL_bank_transfer_one_open_instruction.sql"; echo "rollback;"; } | docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d "$DB" -X -q -v ON_ERROR_STOP=1 -At 2>&1)
echo "$out" | grep -q "preflight_duplicate_open_bank_transfers: 1 group" && echo "PASSED: duplicates are reported in plain words and nothing is built" || { echo "FAILED: preflight did not refuse. Output: $out"; exit 1; }
echo "-- rollback: proposal then rollback leaves no index, and duplicates are possible again"
{ echo "begin;"; echo "$HELPERS"; grep -v -E '^(begin|commit);$' "$D/PROPOSAL_bank_transfer_one_open_instruction.sql"; grep -v -E '^(begin|commit);$' "$D/ROLLBACK_bank_transfer_one_open_instruction.sql"; cat <<'SQL'
select pg_temp.must(not exists (select 1 from pg_indexes where indexname = 'payments_one_open_bank_transfer_instruction'), 'the index is gone after the rollback');
select pg_temp.mk('rehearsal-rb', 'ff475186-3b33-4ea0-90fe-5280d2b1b7d7', 'partial', 'pending');
select pg_temp.mk('rehearsal-rb', 'ff475186-3b33-4ea0-90fe-5280d2b1b7d7', 'partial', 'pending');
select 'BANK TRANSFER ONE-OPEN-INSTRUCTION ROLLBACK REHEARSAL PASSED' as result;
rollback;
SQL
} | q
after=$(snap); echo "lab payments/activity/verifications/claims/index before: $before   after: $after -> $([ "$before" = "$after" ] && echo UNCHANGED || echo CHANGED)"
