#!/bin/bash
# LOCAL ONLY (never Production). Real two-session race tests of public.link_statement_evidence / unlink_statement_evidence / void_equipment_acquisition on a SCRATCH database this script creates (a copy of the lab p4_e2e) and drops again.
#   A. two sessions link a statement to the SAME instalment at once: exactly one succeeds, one is refused, exactly one 'bank_evidence_linked' event;
#   B. a link holds the locks while a void waits: the void is then REFUSED (a statement is linked); nothing is voided;
#   C. an unlink holds the locks while a link of another statement waits: both succeed in order; the final link is the second statement; the audit trail has the first link, the unlink and the second link.
# Usage: rehearse_statement_concurrency.sh [source-db] [container]      Prints PASS/FAIL lines only; synthetic data.
SRC=${1:-p4_e2e}; C=${2:-ordift-mig-check2}; DB=stm_conc_$$; D="$(cd "$(dirname "$0")" && pwd)"; M="$D/../migrations"; A=00000000-0000-4000-8000-0000000000f0; E=11111111-1111-4111-8111-111111111101; T=$(mktemp -d); FAIL=0
P() { docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -X -q "$@"; }
Q() { P -d "$DB" "$@"; }
cleanup() { P -d postgres -c "drop database if exists $DB" >/dev/null 2>&1; rm -rf "$T"; }; trap cleanup EXIT
P -d postgres -c "create database $DB" >/dev/null || { echo "could not create the scratch database"; exit 1; }
docker exec "$C" pg_dump -U supabase_admin -h 127.0.0.1 -d "$SRC" --no-owner 2>/dev/null | Q -v ON_ERROR_STOP=0 >/dev/null 2>&1
# the lab copy may already hold EMPTY leftover 0186/0187/0188 objects: remove them in THIS scratch database only (it is dropped at the end), newest layer first
for lay in "public.entity_asset_ownership:ROLLBACK_asset_ownership_and_acquisition_link.sql" "public.entity_acquisition_payments:ROLLBACK_acquisition_payment_arrangements.sql" "public.entity_equipment_acquisitions:ROLLBACK_equipment_acquisitions_and_financing.sql"; do
  if [ "$(printf "select to_regclass('${lay%%:*}') is not null;" | Q -At)" = t ]; then grep -v -E "^(begin|commit);\$" "$D/${lay##*:}" | Q -v ON_ERROR_STOP=1 >/dev/null || { echo "FAIL could not remove leftover layer ${lay%%:*}"; exit 1; }; fi
done
Q -At -c "insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('legal-entity-documents','legal-entity-documents',false,10485760,array['application/pdf','image/jpeg','image/png']) on conflict (id) do nothing" >/dev/null 2>&1
cat "$M/0186_equipment_acquisitions_and_financing.sql" "$M/0187_acquisition_payment_arrangements.sql" "$M/0190_void_acquisition_with_financing.sql" "$M/0191_statement_evidence_link.sql" | grep -v -E "^(begin|commit);\$" | Q -v ON_ERROR_STOP=1 >/dev/null || { echo "FAIL could not apply 0186 + 0187 + 0190 + 0191 to the scratch database"; exit 1; }
sed -n 3,22p "$D/REHEARSE_founder_ownership_body.sql" | Q -v ON_ERROR_STOP=1 >/dev/null || { echo "FAIL seed"; exit 1; }
Q -At -c "insert into public.employing_entity_documents (id, employing_entity_id, document_type, storage_path, uploaded_by, file_sha256, original_filename, mime_type, size_bytes) values ('22222222-2222-4222-8222-222222222207','$E','other_financial_document','a/s2.jpg','$A',repeat('7',64),'s2.jpg','image/jpeg',4000) on conflict do nothing" >/dev/null
mk() { cat <<SQL | Q -v ON_ERROR_STOP=1 -At >/dev/null
select acquisition_id from public.record_equipment_acquisition(jsonb_build_object('entityId','$E',
 'acquisition', jsonb_build_object('supplier','Synthetic Supplier','invoiceNumber','$1','purchaseDate','2026-11-01','itemDescription','Synthetic pen display','quantity',1,'currency','QAR','listPrice',1149,'discount',0,'net',1149,
   'invoiceDocumentId','22222222-2222-4222-8222-222222222201','fundingStatus','company_account','fundingNote','Founder statement: company card'),
 'financing', jsonb_build_object('provider','SyntheticPay','reference','$2','count',4,'plannedOn','2026-11-01','confirmationDocumentId','22222222-2222-4222-8222-222222222202','scheduleBasis','founder_expected_months',
   'instalments', jsonb_build_array(jsonb_build_object('sequence',1,'amount',287.25,'expectedMonth','2026-11-01'),jsonb_build_object('sequence',2,'amount',287.25,'expectedMonth','2026-12-01'),jsonb_build_object('sequence',3,'amount',287.25,'expectedMonth','2027-01-01'),jsonb_build_object('sequence',4,'amount',287.25,'expectedMonth','2027-02-01'))),
 'firstInstalmentPaid', jsonb_build_object('sequence',1,'paidOn',(current_date - 1)::text,'evidenceNote','synthetic provider confirmation: down payment paid')), '$A');
SQL
}
acq() { Q -At -c "select id from public.entity_equipment_acquisitions where invoice_number='$1'"; }
ins1() { Q -At -c "select i.id from public.entity_financing_instalments i join public.entity_financing_obligations o on o.id=i.obligation_id join public.entity_equipment_acquisitions a on a.id=o.acquisition_id where a.invoice_number='$1' and i.sequence=1"; }
EV="jsonb_build_object('holderKind','company','instrumentKind','credit_card','accountHolderAsPrinted','FIN ENTITY A W.L.L.','instrumentIdentityAsPrinted','card ending 4242','periodFrom',(current_date - 20)::text,'periodTo',(current_date - 1)::text,'lineDate',(current_date - 1)::text,'lineAmount',287.25,'lineCurrency','QAR','lineDescriptionAsPrinted','SYNTHPAY ONLINE','basisNote','Synthetic statement line matched to the reported first instalment')"
lrun() { printf "begin;\nselect public.link_statement_evidence('instalment','%s','%s',%s,'%s');\nselect pg_sleep(%s);\ncommit;\n" "$2" "$3" "$EV" "$A" "$4" | Q -v ON_ERROR_STOP=1 >"$T/$1.out" 2>&1 && echo OK >"$T/$1.res" || echo REFUSED >"$T/$1.res"; }
urun() { printf "begin;\nselect public.unlink_statement_evidence('instalment','%s','Unlinked in the race test to correct the record','%s');\nselect pg_sleep(%s);\ncommit;\n" "$2" "$A" "$3" | Q -v ON_ERROR_STOP=1 >"$T/$1.out" 2>&1 && echo OK >"$T/$1.res" || echo REFUSED >"$T/$1.res"; }
vrun() { printf "begin;\nselect public.void_equipment_acquisition('%s','Voided in the race test to record a correction','%s');\nselect pg_sleep(%s);\ncommit;\n" "$2" "$A" "$3" | Q -v ON_ERROR_STOP=1 >"$T/$1.out" 2>&1 && echo OK >"$T/$1.res" || echo REFUSED >"$T/$1.res"; }
chk() { if [ "$2" = "$3" ]; then echo "PASS $1"; else echo "FAIL $1 (got '$3', expected '$2')"; FAIL=1; fi; }
S1=22222222-2222-4222-8222-222222222204; S2=22222222-2222-4222-8222-222222222207
mk RACE-A REF-A; mk RACE-B REF-B; mk RACE-C REF-C
IA=$(ins1 RACE-A); IB=$(ins1 RACE-B); IC=$(ins1 RACE-C); AB=$(acq RACE-B)
# A: two links of the same instalment at once
lrun LA1 "$IA" $S1 3 & sleep 1; lrun LA2 "$IA" $S2 0 & wait
chk "A: exactly one of two simultaneous links succeeds" "OK REFUSED" "$(cat $T/LA1.res) $(cat $T/LA2.res)"
chk "A: exactly one bank_evidence_linked event for that instalment" 1 "$(Q -At -c "select count(*) from public.entity_finance_events where instalment_id='$IA' and event_type='bank_evidence_linked'")"
chk "A: the instalment is linked to the first statement" "$S1" "$(Q -At -c "select bank_evidence_document_id from public.entity_financing_instalments where id='$IA'")"
# B: a link holds the locks while a void waits
lrun LB "$IB" $S1 3 & sleep 1; vrun VB "$AB" 0 & wait
chk "B: the link succeeds and the waiting void is REFUSED" "OK REFUSED" "$(cat $T/LB.res) $(cat $T/VB.res)"
chk "B: the refusal says a statement is linked" 1 "$(grep -c 'statement is already linked' $T/VB.out)"
chk "B: nothing was voided and the link stands" "recorded $S1" "$(Q -At -c "select a.status || ' ' || coalesce(i.bank_evidence_document_id::text,'none') from public.entity_equipment_acquisitions a join public.entity_financing_obligations o on o.acquisition_id=a.id join public.entity_financing_instalments i on i.obligation_id=o.id and i.sequence=1 where a.id='$AB'")"
# C: an unlink holds the locks while a link of another statement waits
lrun LC1 "$IC" $S1 0
urun UC "$IC" 3 & sleep 1; lrun LC2 "$IC" $S2 0 & wait
chk "C: the unlink and the waiting second link both succeed" "OK OK" "$(cat $T/UC.res) $(cat $T/LC2.res)"
chk "C: the final link is the SECOND statement" "$S2" "$(Q -At -c "select bank_evidence_document_id from public.entity_financing_instalments where id='$IC'")"
chk "C: audit trail = link, unlink, link" "bank_evidence_linked bank_evidence_unlinked bank_evidence_linked" "$(Q -At -c "select string_agg(event_type, ' ' order by occurred_at, id) from public.entity_finance_events where instalment_id='$IC' and event_type like 'bank_evidence%'")"
[ $FAIL = 0 ] && echo "STATEMENT CONCURRENCY REHEARSAL PASSED" || { echo "STATEMENT CONCURRENCY REHEARSAL FAILED"; exit 1; }
