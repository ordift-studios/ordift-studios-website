#!/bin/bash
# LOCAL ONLY (never Production). Real two-session race test of public.link_acquisition_to_asset after migration 0192 on a SCRATCH database this script creates (a copy of the lab p4_e2e) and drops again.
#   A. two sessions link the SAME acquisition to the SAME asset at once (the double-submit / retry case): exactly one succeeds, one is refused ("already linked"), exactly ONE asset_linked event;
#   B. for contrast, WITHOUT 0192 (the 0188 function) the same race is accepted twice and writes TWO events: this proves the test would catch the defect.
# Usage: rehearse_asset_link_concurrency.sh [source-db] [container]      Prints PASS/FAIL lines only; synthetic data.
SRC=${1:-p4_e2e}; C=${2:-ordift-mig-check2}; D="$(cd "$(dirname "$0")" && pwd)"; M="$D/../migrations"; A=00000000-0000-4000-8000-0000000000f0; E=11111111-1111-4111-8111-111111111101; AS=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01; FAIL=0
P() { docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -X -q "$@"; }
one() {   # $1 = with0192|without ; prints "OK OK" style result and event count
  local DB=link_conc_$$_$1 T; T=$(mktemp -d); Q() { P -d "$DB" "$@"; }
  P -d postgres -c "create database $DB" >/dev/null || { echo "could not create the scratch database"; return 1; }
  docker exec "$C" pg_dump -U supabase_admin -h 127.0.0.1 -d "$SRC" --no-owner 2>/dev/null | Q -v ON_ERROR_STOP=0 >/dev/null 2>&1
  for lay in "public.entity_asset_ownership:ROLLBACK_asset_ownership_and_acquisition_link.sql" "public.entity_acquisition_payments:ROLLBACK_acquisition_payment_arrangements.sql" "public.entity_equipment_acquisitions:ROLLBACK_equipment_acquisitions_and_financing.sql"; do
    if [ "$(printf "select to_regclass('${lay%%:*}') is not null;" | Q -At)" = t ]; then grep -v -E "^(begin|commit);\$" "$D/${lay##*:}" | Q -v ON_ERROR_STOP=1 >/dev/null || { echo "FAIL could not remove leftover layer"; return 1; }; fi
  done
  local FILES="$M/0186_equipment_acquisitions_and_financing.sql $M/0187_acquisition_payment_arrangements.sql $M/0188_asset_ownership_and_acquisition_link.sql"; [ "$1" = with0192 ] && FILES="$FILES $M/0192_asset_link_idempotency.sql"
  cat $FILES | grep -v -E "^(begin|commit);\$" | Q -v ON_ERROR_STOP=1 >/dev/null || { echo "FAIL could not apply the layers"; return 1; }
  sed -n 3,22p "$D/REHEARSE_founder_ownership_body.sql" | Q -v ON_ERROR_STOP=1 >/dev/null || { echo "FAIL seed"; return 1; }
  Q -At -v ON_ERROR_STOP=1 <<SQL >/dev/null
insert into public.company_assets (id, asset_identifier, description, category) values ('$AS', 'SER-RACE', 'Synthetic race asset', 'Pad');
insert into public.entity_asset_ownership (employing_entity_id, asset_id, business_purpose, basis_statement, recorded_by) values ('$E', '$AS', 'Synthetic business purpose text', 'Synthetic basis: legal entity owner', '$A');
select acquisition_id from public.record_equipment_acquisition(jsonb_build_object('entityId','$E','acquisition', jsonb_build_object('supplier','Synthetic Supplier','invoiceNumber','RACE-1','purchaseDate','2026-11-01','itemDescription','Synthetic pen display','quantity',1,'currency','QAR','listPrice',1149,'discount',0,'net',1149,
  'invoiceDocumentId','22222222-2222-4222-8222-222222222201','fundingStatus','company_account','fundingNote','Founder statement: company card')), '$A');
SQL
  local ACQ; ACQ=$(Q -At -c "select id from public.entity_equipment_acquisitions where invoice_number='RACE-1'")
  run() { printf "begin;\nselect public.link_acquisition_to_asset('%s','%s','%s');\nselect pg_sleep(%s);\ncommit;\n" "$ACQ" "$AS" "$A" "$2" | Q -v ON_ERROR_STOP=1 >"$T/$1.out" 2>&1 && echo OK >"$T/$1.res" || echo REFUSED >"$T/$1.res"; }
  run L1 3 & sleep 1; run L2 0 & wait
  RES="$(cat $T/L1.res) $(cat $T/L2.res)"; EV=$(Q -At -c "select count(*) from public.entity_finance_events where acquisition_id='$ACQ' and event_type='asset_linked'")
  P -d postgres -c "drop database if exists $DB" >/dev/null 2>&1; rm -rf "$T"; echo "$RES|$EV"
}
chk() { if [ "$2" = "$3" ]; then echo "PASS $1"; else echo "FAIL $1 (got '$3', expected '$2')"; FAIL=1; fi; }
R1=$(one with0192); chk "A (with 0192): exactly one of two simultaneous identical links succeeds, and exactly ONE asset_linked event is written" "OK REFUSED|1" "$R1"
R2=$(one without);  chk "B (the 0188 function, for contrast): the same race is accepted TWICE and writes TWO events (the defect this migration closes)" "OK OK|2" "$R2"
[ $FAIL = 0 ] && echo "ASSET LINK CONCURRENCY REHEARSAL PASSED" || { echo "ASSET LINK CONCURRENCY REHEARSAL FAILED"; exit 1; }
