#!/bin/bash
# LOCAL ONLY: parallel database sessions against the throwaway Docker Postgres. Run after 00/01/02/03 (fixtures and helper functions exist).
C=ordift-mig-check2
sql(){ docker exec -i $C psql -U postgres -q -t -A -v ON_ERROR_STOP=0 -c "$1" 2>&1; }
ok(){ echo "PASS  $1"; }
bad(){ echo "FAIL  $1"; FAILED=1; }
FAILED=0
ADMIN=$(sql "select public.m2a_id('admin')")

echo "===== G1. two sessions revise the same sent quotation at the same moment"
sql "select public.m2a_mkenq('CONC1')" >/dev/null; Q=$(sql "select public.m2a_mkq('CONC1Q', public.m2a_id('enq_CONC1'), 'sent', 'USD', 900)"); E=$(sql "select public.m2a_id('enq_CONC1')")
( docker exec -i $C psql -U postgres -q -t -A -c "begin; select quotation_reference from public.revise_ordinary_quotation('$Q','$ADMIN'); select pg_sleep(2.5); commit;" > /tmp/m2a_g1a.out 2>&1 ) &
sleep 0.7
START=$(date +%s.%N); sql "select quotation_reference from public.revise_ordinary_quotation('$Q','$ADMIN')" > /tmp/m2a_g1b.out; END=$(date +%s.%N)
wait
WAITED=$(echo "$END - $START" | bc)
grep -q "ORD-QUO" /tmp/m2a_g1a.out && ok "session A revised successfully" || bad "session A did not revise: $(cat /tmp/m2a_g1a.out)"
grep -q "ordift:not_revisable" /tmp/m2a_g1b.out && ok "session B was refused with not_revisable (it saw the committed supersede)" || bad "session B result: $(cat /tmp/m2a_g1b.out)"
[ "$(echo "$WAITED > 1.5" | bc)" = 1 ] && ok "session B waited on the row lock (${WAITED%.*}s) instead of racing" || bad "session B did not wait ($WAITED s)"
[ "$(sql "select count(*) from public.client_quotations where enquiry_id='$E'")" = 2 ] && ok "exactly two rows: the superseded original and ONE new version" || bad "unexpected number of rows"
[ "$(sql "select public.m2a_live('$E')")" = 1 ] && ok "exactly one live quotation" || bad "live count wrong"

echo "===== G2. eight sessions revise the same sent quotation simultaneously"
sql "select public.m2a_mkenq('CONC2')" >/dev/null; Q2=$(sql "select public.m2a_mkq('CONC2Q', public.m2a_id('enq_CONC2'), 'sent', 'USD', 900)"); E2=$(sql "select public.m2a_id('enq_CONC2')")
rm -f /tmp/m2a_g2_*.out
for i in 1 2 3 4 5 6 7 8; do ( sql "select quotation_reference from public.revise_ordinary_quotation('$Q2','$ADMIN')" > /tmp/m2a_g2_$i.out ) & done; wait
S=$(cat /tmp/m2a_g2_*.out | grep -c "ORD-QUO"); R=$(cat /tmp/m2a_g2_*.out | grep -c "ordift:not_revisable"); DL=$(cat /tmp/m2a_g2_*.out | grep -ci "deadlock")
[ "$S" = 1 ] && [ "$R" = 7 ] && ok "1 succeeded, 7 refused (not_revisable)" || bad "successes=$S refusals=$R"
[ "$DL" = 0 ] && ok "no deadlock reported" || bad "deadlock reported"
[ "$(sql "select count(*) from public.client_quotations where enquiry_id='$E2'")" = 2 ] && [ "$(sql "select public.m2a_live('$E2')")" = 1 ] && ok "final state: 2 rows, 1 live, no duplicates" || bad "final state wrong"

echo "===== G3. two sessions try to create a live quotation for the same enquiry at once"
sql "select public.m2a_mkenq('CONC3')" >/dev/null; E3=$(sql "select public.m2a_id('enq_CONC3')"); SUP=$(sql "select public.m2a_id('super')")
INS="insert into public.client_quotations (quotation_reference, prospect_name, status, currency, subtotal, discount_total, tax_total, total, created_by, enquiry_id, is_test)"
( docker exec -i $C psql -U postgres -q -t -A -c "begin; $INS values ('M2A-Q-C3A','x','draft','USD',1,0,0,1,'$SUP','$E3',true); select pg_sleep(2); commit;" > /tmp/m2a_g3a.out 2>&1 ) &
sleep 0.6
sql "$INS values ('M2A-Q-C3B','x','draft','USD',1,0,0,1,'$SUP','$E3',true)" > /tmp/m2a_g3b.out; wait
grep -q "one_live_per_enquiry" /tmp/m2a_g3b.out && ok "the second creator was stopped by the unique index once the first committed" || bad "second creator: $(cat /tmp/m2a_g3b.out)"
[ "$(sql "select public.m2a_live('$E3')")" = 1 ] && ok "exactly one live quotation" || bad "live count wrong"

echo "===== G4. two sessions establish the amount due at the same moment (double click)"
sql "select public.m2a_mkenq('CONC4')" >/dev/null; sql "select public.m2a_mkq('CONC4Q', public.m2a_id('enq_CONC4'), 'accepted', 'GHS', 1108.98)" >/dev/null
E4=$(sql "select public.m2a_id('enq_CONC4')"); Q4=$(sql "select public.m2a_id('q_CONC4Q')")
CALL="select public.m2a_est('$E4','$Q4')"
( docker exec -i $C psql -U postgres -q -t -A -c "begin; $CALL; select pg_sleep(2); commit;" > /tmp/m2a_g4a.out 2>&1 ) &
sleep 0.6; sql "$CALL" > /tmp/m2a_g4b.out; wait
grep -q '"noop": false' /tmp/m2a_g4a.out && ok "first session established the amount" || bad "first: $(cat /tmp/m2a_g4a.out)"
grep -q '"noop": true' /tmp/m2a_g4b.out && ok "second session waited, then returned a harmless no-op" || bad "second: $(cat /tmp/m2a_g4b.out)"
[ "$(sql "select count(*) from public.enquiry_amount_events where enquiry_id='$E4'")" = 1 ] && ok "exactly one ledger row" || bad "ledger count wrong"

echo "===== G5. establish races a revision of the same quotation (opposite entry points, same lock order)"
sql "select public.m2a_mkenq('CONC5')" >/dev/null; Q5=$(sql "select public.m2a_mkq('CONC5Q', public.m2a_id('enq_CONC5'), 'sent', 'GHS', 1108.98)"); E5=$(sql "select public.m2a_id('enq_CONC5')")
( docker exec -i $C psql -U postgres -q -t -A -c "begin; select quotation_reference from public.revise_ordinary_quotation('$Q5','$ADMIN'); select pg_sleep(2); commit;" > /tmp/m2a_g5a.out 2>&1 ) &
sleep 0.6; sql "select public.m2a_est('$E5','$Q5')" > /tmp/m2a_g5b.out; wait
grep -qi "deadlock" /tmp/m2a_g5a.out /tmp/m2a_g5b.out && bad "deadlock" || ok "no deadlock"
grep -q "ordift:quotation_not_accepted" /tmp/m2a_g5b.out && ok "establish waited for the revision, then correctly refused (the quotation is no longer the live accepted one)" || bad "establish result: $(cat /tmp/m2a_g5b.out)"
[ "$(sql "select amount_due is null from public.enquiries where id='$E5'")" = t ] && ok "no amount was written" || bad "amount unexpectedly written"

echo "===== G6. integrity after all races"
[ "$(sql "select count(*) from (select enquiry_id from public.client_quotations where enquiry_id is not null and crew_support_request_id is null and is_variation = false and status in ('draft','ready','sent','accepted') group by 1 having count(*)>1) x")" = 0 ] && ok "no enquiry anywhere has two live ordinary quotations" || bad "duplicate live quotations exist"
[ "$(sql "select count(*) from public.client_quotations q where q.supersedes_id is not null and not exists (select 1 from public.client_quotations o where o.id=q.supersedes_id and o.status='superseded')")" = 0 ] && ok "every version points to a superseded predecessor (no half-written history)" || bad "orphan revision history"
[ "$(sql "select count(*) from public.client_quotations q where q.status='draft' and q.supersedes_id is not null and not exists (select 1 from public.client_quotation_items i where i.quotation_id=q.id)")" = 0 ] && ok "no revision exists without its lines" || bad "revision without lines"
echo; [ $FAILED = 0 ] && echo "ALL CONCURRENCY CHECKS PASSED" || echo "SOME CONCURRENCY CHECKS FAILED"
