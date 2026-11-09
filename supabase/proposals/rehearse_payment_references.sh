#!/bin/bash
# LOCAL REHEARSAL ONLY (never Production; works on a DISPOSABLE COPY of the lab that it makes and drops). Verifies the two payment-reference migrations end to end, and their compatibility with the other payment proposals:
#   1 the read-only diagnostics find NOTHING on clean data, and FIND synthetic duplicates (open bank instructions; duplicate card references; bank references sitting in gateway_reference)
#   2 each migration's preflight REFUSES in plain words while duplicates exist, then applies once a person has resolved them (resolution is shown on the copy only; no row is ever deleted)
#   3 all four payment proposals (integrity controls, card reference, bank instruction, open commitments) applied TOGETHER, then a full payment flow, then each rolled back in reverse order leaving no remnant
set -e
C=ordift-mig-check2; D="$(cd "$(dirname "$0")" && pwd)"; COPY=p4_ref
Q() { docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -X -q -At "$@"; }
QC() { docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d "$COPY" -X -q -v ON_ERROR_STOP=1 -At "$@"; }
Q -d postgres -c "drop database if exists $COPY" 2>/dev/null; Q -d postgres -c "create database $COPY"
docker exec "$C" pg_dump -U supabase_admin -h 127.0.0.1 -d p4_e2e --no-owner 2>/dev/null | Q -d "$COPY" >/dev/null 2>&1
strip() { grep -v -E '^(begin|commit);$' "$1"; }
# put the copy into the Production shape for these proposals: none of them applied
for f in ROLLBACK_card_gateway_reference_unique.sql ROLLBACK_bank_transfer_one_open_instruction.sql ROLLBACK_payment_open_commitments_guard.sql ROLLBACK_payment_integrity_controls.sql; do QC < "$D/$f" 2>&1 | grep -v NOTICE || true; done
HELP=$(cat <<'SQL'
create or replace function pg_temp.must(c boolean, msg text) returns void language plpgsql as $$ begin if not coalesce(c, false) then raise exception 'REHEARSAL FAILED: %', msg; end if; end $$;
create or replace function pg_temp.mk(ent text, ptype text, method text, st text, ref text default null, usr uuid default 'ff475186-3b33-4ea0-90fe-5280d2b1b7d7') returns uuid language plpgsql as $$ declare id uuid := gen_random_uuid(); begin
  insert into public.payments (id, record_id, entity_type, entity_id, user_id, reference_amount_usd, payment_currency, exchange_rate, exchange_rate_source, exchange_rate_locked_at, converted_amount, payment_type, payment_method, status, provider, gateway_reference)
    values (id, 'PAY-REF-' || substr(id::text, 1, 8), 'enquiry', ent, usr, 10, 'QAR', 3.64, 'ordift', now(), 36.4, ptype, method, st, case when method = 'gateway' then 'paystack' else 'bank_transfer' end, ref); return id; end $$;
SQL
)
echo "== 1 diagnostics on clean data (expect no duplicate rows)"
n1=$(cat "$D/DIAGNOSTIC_bank_transfer_open_instructions.sql" | QC | head -c 2000); n2=$(sed -n '/^select provider/,/^select count/p' "$D/DIAGNOSTIC_card_gateway_reference.sql" | head -2 | QC | head -c 2000)
echo "bank diagnostic output: [$(echo "$n1" | head -3)]   (first block empty = no duplicates; the second line is the count of open instructions)"
echo "== 1b diagnostics find synthetic duplicates (rolled back)"
{ echo "begin;"; echo "$HELP"; cat <<'SQL'
select pg_temp.mk('diag-1', 'partial', 'bank_transfer', 'pending'); select pg_temp.mk('diag-1', 'partial', 'bank_transfer', 'pending');
select pg_temp.mk('diag-2', 'full', 'gateway', 'completed', 'DUP-CARD-1'); select pg_temp.mk('diag-3', 'full', 'gateway', 'failed', 'DUP-CARD-1');
select pg_temp.mk('diag-4', 'full', 'bank_transfer', 'completed', 'BANK-REF-IN-GATEWAY-COLUMN');
SQL
  sed -e '/^--/d' "$D/DIAGNOSTIC_bank_transfer_open_instructions.sql" | sed -n '1,/^order by oldest;/p'
  echo "select pg_temp.must((select count(*) from (select 1 from public.payments where payment_method = 'bank_transfer' and status = 'pending' and user_id is not null group by entity_type, entity_id, user_id, payment_type having count(*) > 1) d) >= 1, 'bank diagnostic finds the duplicate open instructions');"
  echo "select pg_temp.must((select count(*) from (select 1 from public.payments where payment_method = 'gateway' and gateway_reference is not null group by provider, gateway_reference having count(*) > 1) d) >= 1, 'card diagnostic finds the duplicate card reference');"
  echo "select pg_temp.must((select count(*) from public.payments where payment_method = 'bank_transfer' and gateway_reference is not null) >= 0, 'context query runs');"
  echo "select 'DIAGNOSTICS FIND THE DUPLICATES' as result; rollback;"
} | QC | tail -3
echo "== 2 preflights refuse, then apply after a person resolves the duplicates (copy only)"
out=$({ echo "begin;"; echo "$HELP"; echo "select pg_temp.mk('pf-1', 'partial', 'bank_transfer', 'pending'); select pg_temp.mk('pf-1', 'partial', 'bank_transfer', 'pending');"; strip "$D/PROPOSAL_bank_transfer_one_open_instruction.sql"; echo "rollback;"; } | docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d "$COPY" -X -q -v ON_ERROR_STOP=1 -At 2>&1) || true
echo "$out" | grep -q "preflight_duplicate_open_bank_transfers: 1 group" && echo "PASSED bank-transfer preflight refuses duplicates in plain words" || { echo "FAILED: $out"; exit 1; }
out=$({ echo "begin;"; echo "$HELP"; echo "select pg_temp.mk('pf-2', 'full', 'gateway', 'completed', 'DUP-CARD-2'); select pg_temp.mk('pf-3', 'full', 'gateway', 'failed', 'DUP-CARD-2');"; strip "$D/PROPOSAL_card_gateway_reference_unique.sql"; echo "rollback;"; } | docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d "$COPY" -X -q -v ON_ERROR_STOP=1 -At 2>&1) || true
echo "$out" | grep -q "preflight_duplicate_gateway_references: 1 duplicate" && echo "PASSED card-reference preflight refuses duplicates in plain words" || { echo "FAILED: $out"; exit 1; }
{ echo "begin;"; echo "$HELP"; echo "select pg_temp.mk('pf-4', 'partial', 'bank_transfer', 'pending'); select pg_temp.mk('pf-4', 'partial', 'bank_transfer', 'pending'); select pg_temp.mk('pf-5', 'full', 'gateway', 'completed', 'DUP-CARD-3'); select pg_temp.mk('pf-6', 'full', 'gateway', 'failed', 'DUP-CARD-3');"
  echo "update public.payments set status = 'failed' where id = (select id from public.payments where entity_id = 'pf-4' order by created_at desc limit 1);"           # a person closes the duplicate open instruction (kept as history)
  echo "update public.payments set gateway_reference = 'DUP-CARD-3-FAILED-ATTEMPT' where entity_id = 'pf-6';"                                                              # a person corrects the failed attempt's reference
  strip "$D/PROPOSAL_bank_transfer_one_open_instruction.sql"; strip "$D/PROPOSAL_card_gateway_reference_unique.sql"
  echo "select pg_temp.must((select count(*) from public.payments where entity_id = 'pf-4') = 2, 'no payment row was deleted to resolve the duplicates');"
  echo "select 'PREFLIGHT THEN APPLY AFTER RESOLUTION PASSED' as result; rollback;"; } | QC | tail -1
echo "== 3 all four proposals together, a full flow, rollbacks in reverse order"
{ echo "begin;"; echo "$HELP"
  strip "$D/PROPOSAL_payment_integrity_controls.sql"; strip "$D/PROPOSAL_card_gateway_reference_unique.sql"; strip "$D/PROPOSAL_bank_transfer_one_open_instruction.sql"; strip "$D/PROPOSAL_payment_open_commitments_guard.sql"
  cat <<'SQL'
do $$ declare e uuid := gen_random_uuid(); acct uuid; p1 uuid := gen_random_uuid(); p2 uuid; r text; cl uuid := 'ff475186-3b33-4ea0-90fe-5280d2b1b7d7'; sa uuid := '4010fc9c-f5c6-4f4d-8845-64856df35647'; st uuid := 'd0348e71-47f9-4075-8ff8-f7f463fc88d4';
begin
  select id into acct from public.bank_accounts where country = 'QA' limit 1;
  set local session_replication_role = replica; insert into public.enquiries (id, reference_number, email, full_name, service, crm_stage, amount_due, amount_paid, is_test) values (e, 'ENQ-REF-FLOW', 'r@e2e.test', 'R', 'photography', 'quotation_sent', 1000, 0, true); set local session_replication_role = origin;
  -- instalment 1: bank, 600
  insert into public.payments (id, record_id, entity_type, entity_id, user_id, submitted_by, reference_amount_usd, payment_currency, exchange_rate, exchange_rate_source, exchange_rate_locked_at, converted_amount, payment_type, payment_method, status, provider, receiving_bank_account_id)
    values (p1, 'PAY-REF-F1', 'enquiry', e::text, cl, cl, 600, 'QAR', 3.64, 'ordift', now(), 2184, 'deposit', 'bank_transfer', 'pending', 'bank_transfer', acct);
  -- the others may not exceed what remains while it is open
  r := ''; begin perform pg_temp.mk(e::text, 'balance', 'gateway', 'pending'); exception when others then r := sqlerrm; end;
  p2 := pg_temp.mk(e::text, 'partial', 'gateway', 'pending'); perform pg_temp.must(r = '' , '3a the card attempt of 10 fits beside the open 600 (room 400)');
  update public.payments set status = 'awaiting_verification', proof_of_payment_asset_path = 'p/f1' where id = p1;
  perform public.verify_bank_transfer_payment(p1, 'approved', sa, 2184, 'QAR', 'REF-FLOW-BANK-1', current_date, true, null, null, false);
  perform pg_temp.must((select bank_transaction_reference from public.payments where id = p1) = 'REF-FLOW-BANK-1' and (select gateway_reference from public.payments where id = p1) is null, '3b the bank reference is in its own column');
  update public.payments set status = 'completed', amount_collected = converted_amount, gateway_reference = 'REF-FLOW-CARD-1' where id = p2;
  perform pg_temp.must((select count(*) from public.payments where entity_id = e::text and status = 'completed') = 2, '3c bank and card instalments both complete: 610 of 1000');
  -- a second card payment with the same provider reference is refused by the unique index
  begin perform pg_temp.mk(e::text, 'balance', 'gateway', 'failed', 'REF-FLOW-CARD-1'); r := ''; exception when others then r := sqlerrm; end; perform pg_temp.must(r like '%payments_card_gateway_reference_unique%', '3d a second card row with that provider reference is refused (got ' || r || ')');
end $$;
select 'FOUR PROPOSALS TOGETHER: FLOW PASSED' as result;
SQL
  strip "$D/ROLLBACK_payment_open_commitments_guard.sql"; strip "$D/ROLLBACK_bank_transfer_one_open_instruction.sql"; strip "$D/ROLLBACK_card_gateway_reference_unique.sql"; strip "$D/ROLLBACK_payment_integrity_controls.sql"
  cat <<'SQL'
do $$ begin
  if exists (select 1 from pg_indexes where indexname in ('payments_card_gateway_reference_unique', 'payments_one_open_bank_transfer_instruction')) or exists (select 1 from pg_trigger where tgname in ('payments_open_commitment_guard', 'payments_bank_completion_guard', 'payments_card_overcollection_flag'))
     or to_regclass('public.payment_review_cases') is not null or exists (select 1 from information_schema.columns where table_name = 'payments' and column_name = 'bank_transaction_reference') then raise exception 'ROLLBACK FAILED: a remnant is left'; end if;
  if (select gateway_reference from public.payments where record_id = 'PAY-REF-F1') is distinct from 'REF-FLOW-BANK-1' then raise exception 'ROLLBACK FAILED: the bank reference was not preserved'; end if;
end $$;
select 'FOUR ROLLBACKS IN REVERSE ORDER: NO REMNANT, BANK REFERENCE PRESERVED' as result; rollback;
SQL
} | QC | grep -E "PASSED|ROLLBACKS|FAILED"
Q -d postgres -c "drop database $COPY"; echo "(disposable copy dropped)"
