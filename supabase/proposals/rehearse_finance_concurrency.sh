#!/bin/bash
# LOCAL ONLY (never Production). Real two-session race test of public.mark_instalment_paid on a SCRATCH database this script creates (a copy of the lab p4_e2e) and drops again.
#   1. two sessions record the SAME instalment: exactly one succeeds, one is refused, one audit event;
#   2. sessions record instalments 3 and 4 at overlapping times plus a duplicate of 4: no double payment, one audit event each, and the fully paid obligation ends 'settled'.
# Usage: rehearse_finance_concurrency.sh [source-db] [container]      Prints PASS/FAIL lines only; synthetic data.
SRC=${1:-p4_e2e}; C=${2:-ordift-mig-check2}; DB=fin_conc_$$; D="$(cd "$(dirname "$0")" && pwd)"; A=00000000-0000-4000-8000-0000000000f0; E=11111111-1111-4111-8111-111111111101; T=$(mktemp -d); FAIL=0
P() { docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -X -q "$@"; }
Q() { P -d "$DB" "$@"; }
cleanup() { P -d postgres -c "drop database if exists $DB" >/dev/null 2>&1; rm -rf "$T"; }; trap cleanup EXIT
P -d postgres -c "create database $DB" >/dev/null || { echo "could not create the scratch database"; exit 1; }
docker exec "$C" pg_dump -U supabase_admin -h 127.0.0.1 -d "$SRC" --no-owner 2>/dev/null | Q -v ON_ERROR_STOP=0 >/dev/null 2>&1
# the lab copy may already hold EMPTY leftover 0186/0187/0188 objects: remove them in THIS scratch database only (it is dropped at the end), newest layer first
for lay in "public.entity_asset_ownership:ROLLBACK_asset_ownership_and_acquisition_link.sql" "public.entity_acquisition_payments:ROLLBACK_acquisition_payment_arrangements.sql" "public.entity_equipment_acquisitions:ROLLBACK_equipment_acquisitions_and_financing.sql"; do
  if [ "$(printf "select to_regclass('${lay%%:*}') is not null;" | Q -At)" = t ]; then grep -v -E "^(begin|commit);\$" "$D/${lay##*:}" | Q -v ON_ERROR_STOP=1 >/dev/null || { echo "FAIL could not remove leftover layer ${lay%%:*}"; exit 1; }; fi
done
grep -v -E "^(begin|commit);\$" "${PROPOSAL_FILE:-$D/PROPOSAL_equipment_acquisitions_and_financing.sql}" | Q -v ON_ERROR_STOP=1 >/dev/null || { echo "FAIL could not apply the proposal to the scratch database"; exit 1; }
sed -n 3,16p "$D/REHEARSE_finance_body.sql" | Q -v ON_ERROR_STOP=1 >/dev/null || { echo "FAIL seed"; exit 1; }
cat <<SQL | Q -v ON_ERROR_STOP=1 -At >/dev/null
select acquisition_id from public.record_equipment_acquisition(jsonb_build_object('entityId','$E',
 'acquisition', jsonb_build_object('supplier','Synthetic Supplier','invoiceNumber','CONC-1','purchaseDate','2026-11-08','itemDescription','Synthetic pen display','quantity',1,'currency','QAR','listPrice',1499.00,'discount',350.00,'net',1149.00,'invoiceDocumentId','22222222-2222-4222-8222-222222222201','fundingStatus','to_confirm'),
 'financing', jsonb_build_object('provider','SyntheticPay','reference','CONC-REF-1','count',4,'plannedOn','2026-11-08','confirmationDocumentId','22222222-2222-4222-8222-222222222202','scheduleBasis','founder_expected_months',
   'instalments', jsonb_build_array(jsonb_build_object('sequence',1,'amount',287.25,'expectedMonth','2026-11-01'),jsonb_build_object('sequence',2,'amount',287.25,'expectedMonth','2026-12-01'),jsonb_build_object('sequence',3,'amount',287.25,'expectedMonth','2027-01-01'),jsonb_build_object('sequence',4,'amount',287.25,'expectedMonth','2027-02-01'))),
 'firstInstalmentPaid', jsonb_build_object('sequence',1,'paidOn','2026-11-08','evidenceNote','synthetic provider confirmation: down payment paid')), '$A');
SQL
id() { Q -At -c "select id from public.entity_financing_instalments where sequence=$1"; }
I2=$(id 2); I3=$(id 3); I4=$(id 4)
run() { printf "begin;\nselect public.mark_instalment_paid('%s','2026-11-09','22222222-2222-4222-8222-222222222202',null,'%s');\nselect pg_sleep(%s);\ncommit;\n" "$2" "$A" "$3" | Q -v ON_ERROR_STOP=1 >"$T/$1.out" 2>&1 && echo OK >"$T/$1.res" || echo REFUSED >"$T/$1.res"; }
chk() { if [ "$2" = "$3" ]; then echo "PASS $1"; else echo "FAIL $1 (got '$3', expected '$2')"; FAIL=1; fi; }
run T1a "$I2" 3 & sleep 1; run T1b "$I2" 0 & wait
chk "same instalment, first session succeeds" OK "$(cat $T/T1a.res)"; chk "same instalment, second session refused" REFUSED "$(cat $T/T1b.res)"
chk "same instalment: exactly one audit event" 1 "$(Q -At -c "select count(*) from public.entity_finance_events where instalment_id='$I2' and event_type='instalment_paid'")"
run T2a "$I3" 2 & sleep 0.3; run T2b "$I4" 2 & sleep 0.3; run T2c "$I4" 0 & wait
chk "overlapping different instalments both succeed" "OK OK" "$(cat $T/T2a.res) $(cat $T/T2b.res)"; chk "duplicate of instalment 4 refused" REFUSED "$(cat $T/T2c.res)"
chk "every instalment has exactly one paid event" "1 1 1 1" "$(Q -At -c "select string_agg(n::text, ' ' order by sequence) from (select i.sequence, count(*) n from public.entity_finance_events e join public.entity_financing_instalments i on i.id=e.instalment_id where e.event_type='instalment_paid' group by i.sequence) s")"
chk "fully paid obligation is settled" settled "$(Q -At -c "select status from public.entity_financing_obligations")"
chk "paid amounts add up to the financed amount" 1149.00 "$(Q -At -c "select sum(paid_amount) from public.entity_financing_instalments where status='paid'")"
[ $FAIL = 0 ] && echo "CONCURRENCY REHEARSAL PASSED" || { echo "CONCURRENCY REHEARSAL FAILED"; exit 1; }
