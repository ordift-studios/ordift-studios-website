#!/bin/bash
# LOCAL ONLY. Rehearses the two PROPOSED correction/cleanup scripts on the disposable scratch DB with SYNTHETIC records shaped like the real ones (ids and references substituted).
# Usage: e2e_scratch.sh && rehearse_correction_cleanup.sh && e2e_scratch.sh down
D="$(cd "$(dirname "$0")" && pwd)"; C=ordift-mig-check2
q() { docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d p4_e2e -X -q -At -v ON_ERROR_STOP=1 "$@"; }
sub() { sed -e 's/900f800c-51b5-4e4b-841b-0c9fe94bd950/00000000-0000-4000-8000-00000000c0a1/g; s/a0cbcb39-7798-47e2-864c-b01d02afbaff/00000000-0000-4000-8000-00000000c0e1/g' "$1"; }
seed() { q <<'SQL'
set session_replication_role = replica;
insert into auth.users (id,email) values ('00000000-0000-4000-8000-0000000000f1','f@x.test') on conflict do nothing;
insert into public.profiles (id, full_name, access_status) values ('00000000-0000-4000-8000-0000000000f1','Founder','active') on conflict do nothing;
insert into public.enquiries (id, reference_number, email, full_name, service, is_test, email_notifications_suppressed, payment_country) values ('00000000-0000-4000-8000-00000000c0e1','ENQ-TEST-PERSIST-001','t@x.invalid','TEST','photography',true,true,'GH');
insert into public.client_quotations (id, quotation_reference, prospect_name, status, currency, subtotal, total, enquiry_id, created_by, is_test) values ('00000000-0000-4000-8000-00000000c0a1','ORD-QUO-2026-000006','TEST','draft','USD',351,351,'00000000-0000-4000-8000-00000000c0e1','00000000-0000-4000-8000-0000000000f1',false);
insert into public.client_quotation_items (quotation_id, service_item, quantity, unit_basis, selling_rate, line_total) values ('00000000-0000-4000-8000-00000000c0a1','Portrait',1,'package',351,351);
insert into public.enquiry_discount_approvals (id, enquiry_id, scope_hash, scope_snapshot, eligible_base_usd, discount_type, discount_value, discount_usd, total_after_usd, reason, status, proposed_by, decided_by, decided_at) values ('00000000-0000-4000-8000-00000000c0d1','00000000-0000-4000-8000-00000000c0e1',repeat('b',64),'{}',390,'percentage',10,39,351,'TEST ONLY - verifying discount','approved','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000f1',now());
insert into public.enquiry_price_communications (enquiry_id, revision_number, service, market_slug, scope_title, scope_lines, pricing_snapshot, scope_hash, original_total_usd, communicated_amount, channel, communicated_at, recorded_by) select '00000000-0000-4000-8000-00000000c0e1', n, 'photography','GH','t','[]','{}',repeat('b',64),390, case n when 1 then 225 when 2 then 390 else 351 end,'Phone',now(),'00000000-0000-4000-8000-0000000000f1' from generate_series(1,3) n;
insert into public.enquiry_conversions (enquiry_id, target_type, target_id, idempotency_key, converted_by) values ('00000000-0000-4000-8000-00000000c0e1','client_quotation','00000000-0000-4000-8000-00000000c0a1','enquiry-convert:client_quotation:rehearsalrehearsal12','00000000-0000-4000-8000-0000000000f1');
SQL
}
chk() { printf '%-62s %s\n' "$1" "$(q -c "$2")"; }
seed
echo "== correction: refuses a wrong state, then corrects exactly one row and audits it"
q -c "update public.client_quotations set status='sent', issued_at=now() where id='00000000-0000-4000-8000-00000000c0a1'" ; sub "$D/PROPOSED_correct_test_flag_ORD-QUO-2026-000006.sql" | q 2>&1 | grep -o "precondition failed[^;]*" | head -1
q -c "update public.client_quotations set status='draft', issued_at=null where id='00000000-0000-4000-8000-00000000c0a1'"
chk "is_test before (expect f)" "select is_test from public.client_quotations where id='00000000-0000-4000-8000-00000000c0a1'"
sub "$D/PROPOSED_correct_test_flag_ORD-QUO-2026-000006.sql" | q
chk "is_test after (expect t)" "select is_test from public.client_quotations where id='00000000-0000-4000-8000-00000000c0a1'"
chk "audit entries (expect 1)" "select count(*) from public.activity_log where action='client_quotation.test_flag_corrected'"
chk "price/status/items unchanged (expect 351.00:draft:1)" "select total||':'||status||':'||(select count(*) from public.client_quotation_items where quotation_id=q.id) from public.client_quotations q where id='00000000-0000-4000-8000-00000000c0a1'"
echo "== cleanup: refuses when something financial exists (nothing changes), then removes exactly the test records"
q -c "insert into public.enquiry_notes (enquiry_id, note) values ('00000000-0000-4000-8000-00000000c0e1','synthetic attached record')" && echo "(synthetic attached record added)"
sub "$D/PROPOSED_cleanup_test_enquiry_ENQ-TEST-PERSIST-001.sql" | q 2>&1 | grep -o "precondition: [^;]*" | head -1
chk "after refusal: records remain (expect 1|3|1|1)" "select (select count(*) from public.enquiries where reference_number='ENQ-TEST-PERSIST-001')||'|'||(select count(*) from public.enquiry_price_communications)||'|'||(select count(*) from public.enquiry_discount_approvals)||'|'||(select count(*) from public.enquiry_conversions)"
chk "after refusal: guards enabled (expect 4)" "select count(*) from pg_trigger where tgname in ('enquiry_conversion_append_only','enquiry_comm_append_only','enquiry_discount_no_delete','enquiry_followup_no_delete') and tgenabled='O'"
q -c "delete from public.enquiry_notes where enquiry_id='00000000-0000-4000-8000-00000000c0e1'"
sub "$D/PROPOSED_cleanup_test_enquiry_ENQ-TEST-PERSIST-001.sql" | q && echo "cleanup committed"
chk "records after cleanup (expect 0|0|0|0|0|0)" "select (select count(*) from public.enquiries where reference_number='ENQ-TEST-PERSIST-001')||'|'||(select count(*) from public.client_quotations where quotation_reference='ORD-QUO-2026-000006')||'|'||(select count(*) from public.client_quotation_items)||'|'||(select count(*) from public.enquiry_price_communications)||'|'||(select count(*) from public.enquiry_discount_approvals)||'|'||(select count(*) from public.enquiry_conversions)"
chk "guard triggers enabled again (expect 4)" "select count(*) from pg_trigger where tgname in ('enquiry_conversion_append_only','enquiry_comm_append_only','enquiry_discount_no_delete','enquiry_followup_no_delete') and tgenabled='O'"
chk "audit snapshot kept (expect 1, 3 comms, 1 discount)" "select count(*)||', comms='||max(jsonb_array_length(metadata->'snapshot'->'price_communications'))||', discounts='||max(jsonb_array_length(metadata->'snapshot'->'discount_approvals')) from public.activity_log where action='test_records.removed'"
chk "audit rows of the correction still there (expect 1)" "select count(*) from public.activity_log where action='client_quotation.test_flag_corrected'"
echo "== append-only still enforced afterwards (expect a refusal)"
q -c "insert into public.enquiry_conversions (enquiry_id, target_type, target_id, idempotency_key, converted_by) select gen_random_uuid(),'client_quotation',gen_random_uuid(),'x','00000000-0000-4000-8000-0000000000f1' where false" >/dev/null && echo "(harmless)"; q -c "set session_replication_role=replica; insert into public.enquiry_conversions(enquiry_id,target_type,target_id,idempotency_key,converted_by) values ('00000000-0000-4000-8000-00000000c0e1','client_quotation','00000000-0000-4000-8000-00000000c0a1','enquiry-convert:client_quotation:zzzzzzzzzzzzzzzz','00000000-0000-4000-8000-0000000000f1')" >/dev/null 2>&1; q -c "delete from public.enquiry_conversions" 2>&1 | grep -o "append-only" | head -1
