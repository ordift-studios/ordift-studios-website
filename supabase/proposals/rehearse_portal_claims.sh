#!/bin/bash
# LOCAL REHEARSAL ONLY (never Production). Applies PROPOSAL_portal_claims.sql to the lab inside ONE transaction that is ROLLED BACK, with synthetic enquiries, and checks the whole claim process: who may create an
# invitation, wrong codes and locking, expiry, single use, staff and creator refused, an already-owned record, revocation, the ownership trigger (staff-recorded vs website-form), Super Admin release and its
# refusal once money exists, and the rollback. If the lab already has the proposal, it is first removed INSIDE the transaction. The lab is untouched afterwards.
C=${1:-ordift-mig-check2}; DB=${2:-p4_e2e}; D="$(cd "$(dirname "$0")" && pwd)"
q() { docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d "$DB" -X -q -v ON_ERROR_STOP=1 -At; }
snap() { echo "select (select count(*) from public.enquiries)||'/'||(select count(*) from public.enquiries where user_id is not null)||'/'||(select count(*) from public.activity_log)||'/'||coalesce(to_regclass('public.enquiry_portal_claims')::text,'no-table')" | q; }
before=$(snap)
{ echo "begin;"; grep -v -E '^(begin|commit);$' "$D/ROLLBACK_portal_claims.sql"; grep -v -E '^(begin|commit);$' "$D/PROPOSAL_portal_claims.sql"; cat <<'SQL'
create or replace function pg_temp.must(c boolean, msg text) returns void language plpgsql as $$ begin if not coalesce(c, false) then raise exception 'REHEARSAL FAILED: %', msg; end if; end $$;
create or replace function pg_temp.err(s text) returns text language plpgsql as $$ begin execute s; return ''; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.h(t text) returns text language sql as $$ select encode(sha256(convert_to(t, 'UTF8')), 'hex') $$;
create or replace function pg_temp.enq(by uuid) returns uuid language plpgsql as $$ declare e uuid := gen_random_uuid(); begin
  set local session_replication_role = replica;
  insert into public.enquiries (id, reference_number, email, full_name, service, crm_stage, is_test, created_by, source_channel, received_at) values (e, 'ENQ-REH-' || substr(e::text, 1, 8), 'r@e2e.test', 'R', 'photography', 'new_lead', true, by, case when by is not null then 'whatsapp' end, case when by is not null then now() end);
  set local session_replication_role = origin; return e; end $$;
do $$ declare st uuid := 'd0348e71-47f9-4075-8ff8-f7f463fc88d4'; sa uuid := '4010fc9c-f5c6-4f4d-8845-64856df35647'; ad uuid := '53f08127-8245-4d96-b3bb-ce9dc05a4db5';
  cl uuid := 'ff475186-3b33-4ea0-90fe-5280d2b1b7d7'; cl2 uuid; e uuid; e2 uuid; r jsonb; cid uuid; t text; k text;
begin
  select id into cl2 from public.profiles where full_name = 'JRN Qatar Client'; if cl2 is null then select id into cl2 from public.profiles where full_name = 'User 225'; end if;
  -- 1 creating an invitation: staff may, a client may not, and a staff-recorded enquiry starts unowned
  e := pg_temp.enq(st);
  perform pg_temp.must(pg_temp.err(format('select public.create_portal_claim(%L, %L, %L, null, %L, %L, now() + interval %L, %L, %L)', e, cl, 'whatsapp', pg_temp.h('t0'), pg_temp.h('c0'), '2 days', 'normal', '[]')) like '%creator_not_authorized%', '1a a client cannot create an invitation');
  r := public.create_portal_claim(e, st, 'whatsapp', 'sent on WhatsApp', pg_temp.h('tok1'), pg_temp.h('tok1:123456'), now() + interval '2 days', 'normal', '[]'::jsonb); perform pg_temp.must(r ->> 'outcome' = 'created', '1b staff creates an invitation');
  r := public.create_portal_claim(e, st, 'whatsapp', null, pg_temp.h('tok1b'), pg_temp.h('x'), now() + interval '2 days', 'normal', '[]'::jsonb); perform pg_temp.must(r ->> 'outcome' = 'open_claim_exists', '1c only one open invitation per enquiry');
  perform pg_temp.must(pg_temp.err(format('select public.create_portal_claim(%L, %L, %L, null, %L, %L, now() + interval %L, %L, %L)', pg_temp.enq(st), st, 'whatsapp', pg_temp.h('tok1c'), pg_temp.h('x'), '30 days', 'normal', '[]')) like '%violates check constraint%', '1d an invitation cannot last more than 14 days');
  -- 2 wrong codes count and lock; the right code after a lock is still refused
  for i in 1..4 loop r := public.attempt_portal_claim(pg_temp.h('tok1'), pg_temp.h('tok1:000000'), cl); perform pg_temp.must(r ->> 'outcome' = 'bad_code' and (r ->> 'attempts_left')::int = 5 - i, '2a wrong code ' || i || ' counts (' || r::text || ')'); end loop;
  r := public.attempt_portal_claim(pg_temp.h('tok1'), pg_temp.h('tok1:000000'), cl); perform pg_temp.must(r ->> 'outcome' = 'locked', '2b the fifth wrong code locks the invitation');
  r := public.attempt_portal_claim(pg_temp.h('tok1'), pg_temp.h('tok1:123456'), cl); perform pg_temp.must(r ->> 'outcome' = 'locked' and (select user_id from public.enquiries where id = e) is null, '2c the right code after a lock is refused and nothing is attached');
  -- 3 a fresh invitation: the right code from the client's own account attaches the enquiry, once
  r := public.create_portal_claim(e, st, 'telephone', null, pg_temp.h('tok2'), pg_temp.h('tok2:654321'), now() + interval '1 day', 'normal', '[]'::jsonb); perform pg_temp.must(r ->> 'outcome' = 'created', '3a a new invitation can follow a locked one');
  r := public.attempt_portal_claim(pg_temp.h('tok2'), pg_temp.h('tok2:654321'), cl); perform pg_temp.must(r ->> 'outcome' = 'claimed' and (select user_id from public.enquiries where id = e) = cl, '3b the client claims it (' || r::text || ')');
  perform pg_temp.must((select count(*) from public.enquiry_ownership_events where enquiry_id = e and event = 'claimed' and to_user = cl) = 1, '3c the ownership event is recorded');
  r := public.attempt_portal_claim(pg_temp.h('tok2'), pg_temp.h('tok2:654321'), cl2); perform pg_temp.must(r ->> 'outcome' = 'already_claimed' and (select user_id from public.enquiries where id = e) = cl, '3d the same link used again by someone else, even with the right code, changes nothing');
  r := public.attempt_portal_claim(pg_temp.h('tok2'), pg_temp.h('tok2:654321'), cl); perform pg_temp.must(r ->> 'outcome' = 'already_yours' and (r ->> 'enquiry_id')::uuid = e, '3e pressing the button twice as the owner is recognised as already yours');
  -- 4 staff, admins and the creator can never claim
  e2 := pg_temp.enq(st); perform public.create_portal_claim(e2, st, 'email', null, pg_temp.h('tok3'), pg_temp.h('tok3:111111'), now() + interval '1 day', 'normal', '[]'::jsonb);
  foreach t in array array[st::text, sa::text, ad::text] loop r := public.attempt_portal_claim(pg_temp.h('tok3'), pg_temp.h('tok3:111111'), t::uuid); perform pg_temp.must(r ->> 'outcome' = 'not_eligible' and (select user_id from public.enquiries where id = e2) is null, '4 internal account refused: ' || t); end loop;
  r := public.attempt_portal_claim(pg_temp.h('tok3'), pg_temp.h('tok3:111111'), null); perform pg_temp.must(r ->> 'outcome' = 'not_eligible', '4b no account at all is refused');
  r := public.attempt_portal_claim(pg_temp.h('nonsense'), pg_temp.h('x'), cl); perform pg_temp.must(r ->> 'outcome' = 'not_found', '4c an unknown link is not found');
  -- 5 expiry
  update public.enquiry_portal_claims set expires_at = now() - interval '1 minute', created_at = now() - interval '2 days' where token_hash = pg_temp.h('tok3');
  r := public.attempt_portal_claim(pg_temp.h('tok3'), pg_temp.h('tok3:111111'), cl); perform pg_temp.must(r ->> 'outcome' = 'expired' and (select user_id from public.enquiries where id = e2) is null, '5 an expired invitation is refused even with the right code');
  -- 6 revocation: the creator or an admin may; an unrelated client may not; a closed one stays closed
  perform public.create_portal_claim(e2, st, 'in_person', null, pg_temp.h('tok4'), pg_temp.h('tok4:222222'), now() + interval '1 day', 'normal', '[]'::jsonb);
  select id into cid from public.enquiry_portal_claims where token_hash = pg_temp.h('tok4');
  perform pg_temp.must(pg_temp.err(format('select public.revoke_portal_claim(%L, %L, %L)', cid, cl, 'x')) like '%actor_not_authorized%', '6a a client cannot revoke');
  r := public.revoke_portal_claim(cid, st, 'client changed their mind'); perform pg_temp.must(r ->> 'outcome' = 'revoked', '6b the creator revokes');
  r := public.attempt_portal_claim(pg_temp.h('tok4'), pg_temp.h('tok4:222222'), cl); perform pg_temp.must(r ->> 'outcome' = 'revoked' and (select user_id from public.enquiries where id = e2) is null, '6c a revoked invitation cannot be used');
  -- 7 an enquiry that became owned in the meantime closes the invitation
  perform public.create_portal_claim(e2, st, 'whatsapp', null, pg_temp.h('tok5'), pg_temp.h('tok5:333333'), now() + interval '1 day', 'normal', '[]'::jsonb);
  perform set_config('ordift.portal_claim', '1', true); update public.enquiries set user_id = cl2 where id = e2; perform set_config('ordift.portal_claim', '', true);
  r := public.attempt_portal_claim(pg_temp.h('tok5'), pg_temp.h('tok5:333333'), cl); perform pg_temp.must(r ->> 'outcome' = 'already_owned' and (select user_id from public.enquiries where id = e2) = cl2, '7 an already-owned record is never re-assigned by an invitation');
  -- 8 the ownership trigger
  k := pg_temp.err(format('update public.enquiries set user_id = %L where id = %L', sa, pg_temp.enq(st))); perform pg_temp.must(k like '%enquiry_ownership_requires_claim%', '8a a direct update on a STAFF-recorded enquiry is refused (got ' || k || ')');
  perform pg_temp.must(pg_temp.err(format('update public.enquiries set user_id = %L where id = %L', cl2, e)) like '%enquiry_ownership_requires_claim%', '8b changing an existing owner directly is refused');
  e2 := pg_temp.enq(null); perform pg_temp.must(pg_temp.err(format('update public.enquiries set user_id = %L where id = %L', cl, e2)) = '', '8c a website-form enquiry (nobody on staff recorded it) can still be linked on a confirmed sign-in');
  perform pg_temp.must(pg_temp.err(format('update public.enquiries set user_id = %L where id = %L', cl2, e2)) like '%enquiry_ownership_requires_claim%', '8d ...but once owned it cannot be switched');
  -- 9 release: Super Admin only, with a reason, and never once money exists
  perform pg_temp.must(pg_temp.err(format('select public.release_enquiry_ownership(%L, %L, %L)', e, ad, 'Wrong person claimed this project.')) like '%actor_not_authorized%', '9a an admin cannot release ownership');
  perform pg_temp.must(pg_temp.err(format('select public.release_enquiry_ownership(%L, %L, %L)', e, sa, 'short')) like '%reason_required%', '9b a written reason is required');
  insert into public.payments (record_id, entity_type, entity_id, user_id, reference_amount_usd, payment_currency, exchange_rate, exchange_rate_source, exchange_rate_locked_at, converted_amount, payment_type, payment_method, status, provider)
    values ('PAY-REH-PC1', 'enquiry', e::text, cl, 10, 'QAR', 3.64, 'ordift', now(), 36.4, 'partial', 'bank_transfer', 'awaiting_verification', 'bank_transfer');
  perform pg_temp.must(pg_temp.err(format('select public.release_enquiry_ownership(%L, %L, %L)', e, sa, 'Wrong person claimed this project.')) like '%payments_exist%', '9c release is refused while a payment awaits verification');
  update public.payments set status = 'failed' where record_id = 'PAY-REH-PC1';
  r := public.release_enquiry_ownership(e, sa, 'Wrong person claimed this project.'); perform pg_temp.must(r ->> 'outcome' = 'released' and (select user_id from public.enquiries where id = e) is null, '9d with only failed attempts it can be released');
  perform pg_temp.must((select count(*) from public.enquiry_ownership_events where enquiry_id = e) = 2, '9e both events are kept (claimed, released)');
  r := public.create_portal_claim(e, st, 'whatsapp', null, pg_temp.h('tok6'), pg_temp.h('tok6:444444'), now() + interval '1 day', 'normal', '[]'::jsonb); perform pg_temp.must(r ->> 'outcome' = 'created', '9f a fresh invitation can follow a release');
  -- 10 the hashes are all that is stored
  perform pg_temp.must(not exists (select 1 from public.enquiry_portal_claims where token_hash !~ '^[0-9a-f]{64}$' or code_hash !~ '^[0-9a-f]{64}$'), '10 only 64-character hashes are stored');
  perform pg_temp.must((select count(*) from public.payments where record_id = 'PAY-REH-PC1') = 1, '11 the failed payment evidence is still there after the release');
end $$;
select 'PORTAL CLAIMS REHEARSAL (rules) PASSED' as result;
rollback;
SQL
} | q
echo "-- rollback"
{ echo "begin;"; grep -v -E '^(begin|commit);$' "$D/ROLLBACK_portal_claims.sql"; grep -v -E '^(begin|commit);$' "$D/PROPOSAL_portal_claims.sql"; grep -v -E '^(begin|commit);$' "$D/ROLLBACK_portal_claims.sql"; cat <<'SQL'
do $$ begin if to_regclass('public.enquiry_portal_claims') is not null or to_regprocedure('public.attempt_portal_claim(text,text,uuid)') is not null or exists (select 1 from pg_trigger where tgname = 'enquiries_owner_guard') then raise exception 'ROLLBACK REHEARSAL FAILED: something is still there'; end if; end $$;
select 'PORTAL CLAIMS ROLLBACK REHEARSAL PASSED';
rollback;
SQL
} | q
after=$(snap); echo "lab enquiries/owned/audit/claims table before: $before   after: $after -> $([ "$before" = "$after" ] && echo UNCHANGED || echo CHANGED)"
