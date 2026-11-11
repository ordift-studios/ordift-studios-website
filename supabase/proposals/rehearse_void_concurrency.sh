#!/bin/bash
# LOCAL ONLY (never Production). Real two-session race tests of public.void_equipment_acquisition on a SCRATCH database this script creates (a copy of the lab p4_e2e) and drops again.
#   A. an instalment is marked paid while a void waits: both succeed, the void then also voids that newly paid instalment (nothing is left paid under a void financing), one void event;
#   B. a void holds the locks while an instalment payment is attempted: the payment is refused ("not pending"), no paid instalment appears;
#   C. two voids at once: exactly one succeeds, one is refused, exactly one void event.
# Usage: rehearse_void_concurrency.sh [source-db] [container]      Prints PASS/FAIL lines only; synthetic data.
SRC=${1:-p4_e2e}; C=${2:-ordift-mig-check2}; DB=void_conc_$$; D="$(cd "$(dirname "$0")" && pwd)"; M="$D/../migrations"; A=00000000-0000-4000-8000-0000000000f0; E=11111111-1111-4111-8111-111111111101; T=$(mktemp -d); FAIL=0
P() { docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -X -q "$@"; }
Q() { P -d "$DB" "$@"; }
cleanup() { P -d postgres -c "drop database if exists $DB" >/dev/null 2>&1; rm -rf "$T"; }; trap cleanup EXIT
P -d postgres -c "create database $DB" >/dev/null || { echo "could not create the scratch database"; exit 1; }
docker exec "$C" pg_dump -U supabase_admin -h 127.0.0.1 -d "$SRC" --no-owner 2>/dev/null | Q -v ON_ERROR_STOP=0 >/dev/null 2>&1
# the lab copy may already hold EMPTY leftover 0186/0187/0188 objects: remove them in THIS scratch database only (it is dropped at the end), newest layer first
for lay in "public.entity_asset_ownership:ROLLBACK_asset_ownership_and_acquisition_link.sql" "public.entity_acquisition_payments:ROLLBACK_acquisition_payment_arrangements.sql" "public.entity_equipment_acquisitions:ROLLBACK_equipment_acquisitions_and_financing.sql"; do
  if [ "$(printf "select to_regclass('${lay%%:*}') is not null;" | Q -At)" = t ]; then grep -v -E "^(begin|commit);\$" "$D/${lay##*:}" | Q -v ON_ERROR_STOP=1 >/dev/null || { echo "FAIL could not remove leftover layer ${lay%%:*}"; exit 1; }; fi
done
cat "$M/0186_equipment_acquisitions_and_financing.sql" "$M/0187_acquisition_payment_arrangements.sql" "$M/0190_void_acquisition_with_financing.sql" | grep -v -E "^(begin|commit);\$" | Q -v ON_ERROR_STOP=1 >/dev/null || { echo "FAIL could not apply 0186 + 0187 + 0190 to the scratch database"; exit 1; }
sed -n 3,16p "$D/REHEARSE_finance_body.sql" | Q -v ON_ERROR_STOP=1 >/dev/null || { echo "FAIL seed"; exit 1; }
mk() { cat <<SQL | Q -v ON_ERROR_STOP=1 -At >/dev/null
select acquisition_id from public.record_equipment_acquisition(jsonb_build_object('entityId','$E',
 'acquisition', jsonb_build_object('supplier','Synthetic Supplier','invoiceNumber','$1','purchaseDate','2026-11-08','itemDescription','Synthetic pen display','quantity',1,'currency','QAR','listPrice',1149,'discount',0,'net',1149,
   'invoiceDocumentId','22222222-2222-4222-8222-222222222201','fundingStatus','company_account','fundingNote','Founder statement: company card'),
 'financing', jsonb_build_object('provider','SyntheticPay','reference','$2','count',4,'plannedOn','2026-11-08','confirmationDocumentId','22222222-2222-4222-8222-222222222202','scheduleBasis','founder_expected_months',
   'instalments', jsonb_build_array(jsonb_build_object('sequence',1,'amount',287.25,'expectedMonth','2026-11-01'),jsonb_build_object('sequence',2,'amount',287.25,'expectedMonth','2026-12-01'),jsonb_build_object('sequence',3,'amount',287.25,'expectedMonth','2027-01-01'),jsonb_build_object('sequence',4,'amount',287.25,'expectedMonth','2027-02-01'))),
 'firstInstalmentPaid', jsonb_build_object('sequence',1,'paidOn',(current_date - 1)::text,'evidenceNote','synthetic provider confirmation: down payment paid')), '$A');
SQL
}
acq() { Q -At -c "select id from public.entity_equipment_acquisitions where invoice_number='$1'"; }
ins() { Q -At -c "select i.id from public.entity_financing_instalments i join public.entity_financing_obligations o on o.id=i.obligation_id join public.entity_equipment_acquisitions a on a.id=o.acquisition_id where a.invoice_number='$1' and i.sequence=$2"; }
vrun() { printf "begin;\nselect public.void_equipment_acquisition('%s','Voided in the race test to record a correction','%s');\nselect pg_sleep(%s);\ncommit;\n" "$2" "$A" "$3" | Q -v ON_ERROR_STOP=1 >"$T/$1.out" 2>&1 && echo OK >"$T/$1.res" || echo REFUSED >"$T/$1.res"; }
prun() { printf "begin;\nselect public.mark_instalment_paid('%s',current_date - 1,'22222222-2222-4222-8222-222222222202',null,'%s');\nselect pg_sleep(%s);\ncommit;\n" "$2" "$A" "$3" | Q -v ON_ERROR_STOP=1 >"$T/$1.out" 2>&1 && echo OK >"$T/$1.res" || echo REFUSED >"$T/$1.res"; }
chk() { if [ "$2" = "$3" ]; then echo "PASS $1"; else echo "FAIL $1 (got '$3', expected '$2')"; FAIL=1; fi; }
mk RACE-A REF-A; mk RACE-B REF-B; mk RACE-C REF-C
AA=$(acq RACE-A); AB=$(acq RACE-B); AC=$(acq RACE-C)
# A: a payment holds the obligation lock, the void waits for it
prun PA "$(ins RACE-A 2)" 3 & sleep 1; vrun VA "$AA" 0 & wait
chk "A: the payment and the waiting void both succeed" "OK OK" "$(cat $T/PA.res) $(cat $T/VA.res)"
chk "A: afterwards the acquisition is void and NO instalment is left paid or pending" "void 0" "$(Q -At -c "select a.status || ' ' || (select count(*) from public.entity_financing_instalments i join public.entity_financing_obligations o on o.id=i.obligation_id where o.acquisition_id=a.id and i.status <> 'void') from public.entity_equipment_acquisitions a where a.id='$AA'")"
chk "A: the void event snapshot includes the instalment paid during the race" "paid" "$(Q -At -c "select e.detail #>> '{voidedInstalments,1,wasStatus}' from public.entity_finance_events e where e.acquisition_id='$AA' and e.event_type='voided'")"
chk "A: exactly one void event" 1 "$(Q -At -c "select count(*) from public.entity_finance_events where acquisition_id='$AA' and event_type='voided'")"
# B: the void holds the locks, a payment attempt waits and is then refused
vrun VB "$AB" 3 & sleep 1; prun PB "$(ins RACE-B 3)" 0 & wait
chk "B: the void succeeds and the late payment is refused" "OK REFUSED" "$(cat $T/VB.res) $(cat $T/PB.res)"
chk "B: the refusal says the instalment is not pending" 1 "$(grep -c 'not pending' $T/PB.out)"
chk "B: no live paid instalment exists under the voided acquisition" 0 "$(Q -At -c "select count(*) from public.entity_financing_instalments i join public.entity_financing_obligations o on o.id=i.obligation_id where o.acquisition_id='$AB' and i.status = 'paid'")"
# C: two voids at once
vrun VC1 "$AC" 3 & sleep 1; vrun VC2 "$AC" 0 & wait
chk "C: exactly one of two simultaneous voids succeeds" "OK REFUSED" "$(cat $T/VC1.res) $(cat $T/VC2.res)"
chk "C: exactly one void event" 1 "$(Q -At -c "select count(*) from public.entity_finance_events where acquisition_id='$AC' and event_type='voided'")"
[ $FAIL = 0 ] && echo "VOID CONCURRENCY REHEARSAL PASSED" || { echo "VOID CONCURRENCY REHEARSAL FAILED"; exit 1; }
