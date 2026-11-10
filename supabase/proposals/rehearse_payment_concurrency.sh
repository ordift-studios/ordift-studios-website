#!/bin/bash
# LOCAL ONLY (never Production). Real multi-session race test of public.record_acquisition_payment on a SCRATCH database this script creates (a copy of the lab p4_e2e + 0186 + the proposal) and drops again.
#   A. two sessions each pay 600 against a net price of 1,000 at overlapping times: exactly one succeeds, the total never exceeds the net price
#   B. three sessions each pay 400: exactly two succeed (800), one is refused
# Usage: rehearse_payment_concurrency.sh [source-db] [container]      PASS/FAIL lines only; synthetic data.
SRC=${1:-p4_e2e}; C=${2:-ordift-mig-check2}; DB=pay_conc_$$; D="$(cd "$(dirname "$0")" && pwd)"; A=00000000-0000-4000-8000-0000000000f0; E=11111111-1111-4111-8111-111111111101; T=$(mktemp -d); FAIL=0
P() { docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -X -q "$@"; }; Q() { P -d "$DB" "$@"; }
cleanup() { P -d postgres -c "drop database if exists $DB" >/dev/null 2>&1; rm -rf "$T"; }; trap cleanup EXIT
P -d postgres -c "create database $DB" >/dev/null || { echo "could not create the scratch database"; exit 1; }
docker exec "$C" pg_dump -U supabase_admin -h 127.0.0.1 -d "$SRC" --no-owner 2>/dev/null | Q -v ON_ERROR_STOP=0 >/dev/null 2>&1
for f in "$D/../migrations/0186_equipment_acquisitions_and_financing.sql" "${PROPOSAL_FILE:-$D/../migrations/0187_acquisition_payment_arrangements.sql}"; do grep -v -E "^(begin|commit);\$" "$f" | Q -v ON_ERROR_STOP=1 >/dev/null || { echo "FAIL could not apply $f"; exit 1; }; done
sed -n 3,16p "$D/REHEARSE_finance_body.sql" | Q -v ON_ERROR_STOP=1 >/dev/null || { echo "FAIL seed"; exit 1; }
mk() { cat <<SQL | Q -v ON_ERROR_STOP=1 -At
select acquisition_id from public.record_equipment_acquisition(jsonb_build_object('entityId','$E','acquisition', jsonb_build_object('supplier','Synthetic Supplier','invoiceNumber','$1','purchaseDate','2026-11-01','itemDescription','Synthetic equipment','quantity',1,'currency','QAR','listPrice',1000,'discount',0,'net',1000,'invoiceDocumentId','22222222-2222-4222-8222-222222222201','fundingStatus','to_confirm')), '$A');
SQL
}
run() { printf "begin;\nselect public.record_acquisition_payment('%s','part',%s,'2026-11-05','bank_transfer',null,'%s','22222222-2222-4222-8222-222222222202',null,'%s');\nselect pg_sleep(%s);\ncommit;\n" "$2" "$3" "$4" "$A" "$5" | Q -v ON_ERROR_STOP=1 >"$T/$1.out" 2>&1 && echo OK >"$T/$1.res" || echo REFUSED >"$T/$1.res"; }
chk() { if [ "$2" = "$3" ]; then echo "PASS $1"; else echo "FAIL $1 (got '$3', expected '$2')"; FAIL=1; fi; }
A1=$(mk RACE-A); run a1 "$A1" 600 R1 3 & sleep 1; run a2 "$A1" 600 R2 0 & wait
chk "A: two sessions paying 600 of 1,000 -> exactly one succeeds" "1" "$(cat $T/a1.res $T/a2.res | grep -c OK)"
chk "A: the other is refused" "1" "$(cat $T/a1.res $T/a2.res | grep -c REFUSED)"
chk "A: recorded total is 600 (never above the net price)" 600.00 "$(Q -At -c "select coalesce(sum(amount),0) from public.entity_acquisition_payments where acquisition_id='$A1' and status='recorded'")"
B1=$(mk RACE-B); run b1 "$B1" 400 R1 2 & sleep 0.3; run b2 "$B1" 400 R2 2 & sleep 0.3; run b3 "$B1" 400 R3 0 & wait
chk "B: three sessions paying 400 of 1,000 -> exactly two succeed" "2" "$(cat $T/b1.res $T/b2.res $T/b3.res | grep -c OK)"
chk "B: one is refused" "1" "$(cat $T/b1.res $T/b2.res $T/b3.res | grep -c REFUSED)"
chk "B: recorded total is 800" 800.00 "$(Q -At -c "select coalesce(sum(amount),0) from public.entity_acquisition_payments where acquisition_id='$B1' and status='recorded'")"
chk "one audit event per recorded payment" "3" "$(Q -At -c "select count(*) from public.entity_finance_events where event_type='payment_recorded'")"
[ $FAIL = 0 ] && echo "PAYMENT CONCURRENCY REHEARSAL PASSED" || { echo "PAYMENT CONCURRENCY REHEARSAL FAILED"; exit 1; }
