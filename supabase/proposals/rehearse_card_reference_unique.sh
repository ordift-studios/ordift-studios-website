#!/bin/bash
# LOCAL REHEARSAL ONLY (never Production). Applies PROPOSAL_card_gateway_reference_unique.sql to the lab inside a transaction that is ROLLED BACK and checks: a second card row with the same provider
# reference is refused; the same reference on a bank-transfer row, rows with no reference, other providers and unlimited history are unaffected; the preflight refuses (plainly) when duplicates exist; rollback.
C=${1:-ordift-mig-check2}; DB=${2:-p4_e2e}; D="$(cd "$(dirname "$0")" && pwd)"
q() { docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d "$DB" -X -q -v ON_ERROR_STOP=1 -At; }
snap() { echo "select (select count(*) from public.payments)||'/'||coalesce((select indexname from pg_indexes where indexname='payments_card_gateway_reference_unique'),'no-index')" | q; }
before=$(snap)
HELPERS=$(cat <<'SQL'
create or replace function pg_temp.must(c boolean, msg text) returns void language plpgsql as $$ begin if not coalesce(c, false) then raise exception 'REHEARSAL FAILED: %', msg; end if; end $$;
create or replace function pg_temp.err(s text) returns text language plpgsql as $$ begin execute s; return ''; exception when others then return sqlstate || ' ' || sqlerrm; end $$;
create or replace function pg_temp.mk(ref text, method text, prov text, st text default 'completed') returns uuid language plpgsql as $$ declare id uuid := gen_random_uuid(); begin
  insert into public.payments (id, record_id, entity_type, entity_id, user_id, reference_amount_usd, payment_currency, exchange_rate, exchange_rate_source, exchange_rate_locked_at, converted_amount, payment_type, payment_method, status, provider, gateway_reference)
    values (id, 'PAY-REH-' || substr(id::text, 1, 8), 'enquiry', 'rehearsal-' || substr(id::text, 1, 8), 'ff475186-3b33-4ea0-90fe-5280d2b1b7d7', 100, 'GHS', 15.5, 'ordift', now(), 1550, 'partial', method, st, prov, ref); return id; end $$;
SQL
)
{ echo "begin;"; echo "$HELPERS"; grep -v -E '^(begin|commit);$' "$D/PROPOSAL_card_gateway_reference_unique.sql"; cat <<'SQL'
do $$ declare r text; begin
  perform pg_temp.mk('CARD-REF-1', 'gateway', 'paystack');
  r := pg_temp.err($q$select pg_temp.mk('CARD-REF-1', 'gateway', 'paystack', 'failed')$q$); perform pg_temp.must(r like '23505%payments_card_gateway_reference_unique%', '1 a second card row with the same provider reference is refused (got ' || r || ')');
  perform pg_temp.mk('CARD-REF-1', 'bank_transfer', 'bank_transfer'); perform pg_temp.mk('CARD-REF-1', 'gateway', 'otherprovider');
  perform pg_temp.mk(null, 'gateway', 'paystack', 'pending'); perform pg_temp.mk(null, 'gateway', 'paystack', 'pending');
  perform pg_temp.mk('BANK-REF-9', 'bank_transfer', 'bank_transfer'); perform pg_temp.mk('BANK-REF-9', 'bank_transfer', 'bank_transfer');
  perform pg_temp.must(true, '2 the same reference on a bank row or another provider, rows without a reference, and repeated bank references are unaffected');
end $$;
select 'CARD GATEWAY REFERENCE REHEARSAL (rules) PASSED' as result;
rollback;
SQL
} | q
out=$({ echo "begin;"; echo "$HELPERS"; echo "select pg_temp.mk('DUP-1', 'gateway', 'paystack'); select pg_temp.mk('DUP-1', 'gateway', 'paystack');"; grep -v -E '^(begin|commit);$' "$D/PROPOSAL_card_gateway_reference_unique.sql"; echo "rollback;"; } | docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d "$DB" -X -q -v ON_ERROR_STOP=1 -At 2>&1)
echo "$out" | grep -q "preflight_duplicate_gateway_references: 1 duplicate" && echo "PASSED: duplicates are reported in plain words and nothing is built" || { echo "FAILED: preflight. $out"; exit 1; }
{ echo "begin;"; grep -v -E '^(begin|commit);$' "$D/PROPOSAL_card_gateway_reference_unique.sql"; grep -v -E '^(begin|commit);$' "$D/ROLLBACK_card_gateway_reference_unique.sql"; echo "do \$\$ begin if exists (select 1 from pg_indexes where indexname = 'payments_card_gateway_reference_unique') then raise exception 'ROLLBACK REHEARSAL FAILED: the index is still there'; end if; end \$\$; select 'CARD GATEWAY REFERENCE ROLLBACK REHEARSAL PASSED'; rollback;"; } | q
after=$(snap); echo "lab payments/index before: $before after: $after -> $([ "$before" = "$after" ] && echo UNCHANGED || echo CHANGED)"
