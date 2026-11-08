-- Rehearsal body for PROPOSAL_booking_confirmation.sql. ONE transaction that rehearse_booking.sh ROLLS BACK. Local scratch database only; synthetic data.
set session_replication_role = replica;
insert into auth.users (id, email) select ('00000000-0000-4000-8000-0000000000'||lpad(to_hex(n),2,'0'))::uuid, 'b'||n||'@e2e.test' from generate_series(160,166) n on conflict do nothing;
insert into public.profiles (id, full_name, access_status) select ('00000000-0000-4000-8000-0000000000'||lpad(to_hex(n),2,'0'))::uuid, 'Booking '||n, 'active' from generate_series(160,166) n on conflict do nothing;
-- a0 = 160 Super Admin, a1 = 161 admin, a2 = 162 staff person (assignee), a3 = 163 staff person (other)
insert into public.user_roles (user_id, role_id) select '00000000-0000-4000-8000-0000000000a0', r.id from public.roles r where r.slug = 'super_admin' on conflict do nothing;
insert into public.user_roles (user_id, role_id) select '00000000-0000-4000-8000-0000000000a1', r.id from public.roles r where r.slug = 'admin' on conflict do nothing;
insert into public.currencies (code, name, symbol) values ('QAR','Qatari riyal','QR'),('GHS','Ghana cedi','GH'),('EUR','Euro','E') on conflict do nothing;
-- the first PROVISIONAL settings row (the migration seeds it only if a Super Admin exists at apply time; make sure one exists here)
insert into public.booking_rule_settings (version, status, agreement_value_thresholds, agreement_always_categories, agreement_escalators, note, created_by)
  select 1, 'provisional', '{"QAR": 3000, "GHS": 10000, "USD": 800}'::jsonb, array['videography','production_services','talent_management','drone_operations'], array['usage_rights_extended','exclusivity','minors','third_party_ip','restricted_location','complex_or_unusual','multi_day_assignment'], 'rehearsal', '00000000-0000-4000-8000-0000000000a0'
  where not exists (select 1 from public.booking_rule_settings);
-- entities: Qatar (CR + permit + signatory; photography listed on the CR, videography NOT) and Ghana (business-name registration + proprietor)
insert into public.employing_entities (id, name, slug, legal_name, registration_type, verification_status, verified_at, verified_by, default_currency, employer_capable, jurisdiction_id)
  select '44444444-4444-4444-8444-444444444401', 'BK Qatar', 'bk-qatar', 'BK QATAR W.L.L.', 'W.L.L.', 'verified', now(), '00000000-0000-4000-8000-0000000000a0', 'QAR', false, j.id from public.employment_jurisdictions j where j.slug = 'qatar';
insert into public.employing_entities (id, name, slug, legal_name, registration_type, verification_status, verified_at, verified_by, default_currency, employer_capable, jurisdiction_id)
  select '44444444-4444-4444-8444-444444444402', 'BK Ghana', 'bk-ghana', 'BK GHANA (SYNTHETIC)', 'Business name', 'verified', now(), '00000000-0000-4000-8000-0000000000a0', 'GHS', false, j.id from public.employment_jurisdictions j where j.slug = 'ghana';
insert into public.entity_registrations (employing_entity_id, kind, status, identifier, issued_on, valid_from, expires_on, issuing_authority, facts, verified_by, verified_at, recorded_by)
  select e.id, v.kind, 'active', v.ident, date '2026-10-15', date '2026-10-15', date '2027-10-15', 'MOCI', v.facts::jsonb, '00000000-0000-4000-8000-0000000000a0', now(), '00000000-0000-4000-8000-0000000000a0'
  from public.employing_entities e, (values ('commercial_registration','CR-BK-1','{"activities":[{"code":"742010","name":"Photographic activities"}]}'), ('commercial_permit','PERMIT-BK-1','{}')) as v(kind, ident, facts) where e.slug = 'bk-qatar';
insert into public.entity_registrations (employing_entity_id, kind, status, identifier, issued_on, valid_from, expires_on, issuing_authority, facts, verified_by, verified_at, recorded_by)
  select e.id, 'commercial_registration', 'active', 'BN123456789', date '2026-01-15', date '2026-01-15', date '2027-12-15', 'Registrar (synthetic)', '{}'::jsonb, '00000000-0000-4000-8000-0000000000a0', now(), '00000000-0000-4000-8000-0000000000a0' from public.employing_entities e where e.slug = 'bk-ghana';
insert into public.entity_signatories (employing_entity_id, full_name, position, authority, legal_capacity, effective_from, recorded_by)
  select e.id, 'Synthetic Owner', 'Owner', 'As stated', case when e.slug = 'bk-qatar' then 'owner' else 'sole_proprietor' end, date '2026-01-01', '00000000-0000-4000-8000-0000000000a0' from public.employing_entities e where e.slug in ('bk-qatar','bk-ghana');
set session_replication_role = origin;

create or replace function pg_temp.err(q text) returns text language plpgsql as $$ begin execute q; return ''; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.must(cond boolean, msg text) returns void language plpgsql as $$ begin if not coalesce(cond, false) then raise exception 'REHEARSAL FAILED: %', msg; end if; end $$;
-- a synthetic accepted, issued ordinary quotation for a new enquiry; returns '<enquiry>|<quotation>'
create or replace function pg_temp.mk(n int, ent text, cur text, total numeric, acts text, due numeric, paid numeric, fp boolean default true) returns text language plpgsql as $$
declare e uuid := gen_random_uuid(); q uuid := gen_random_uuid();
begin
  set local session_replication_role = replica;
  insert into public.enquiries (id, reference_number, email, full_name, service, crm_stage, amount_due, amount_paid) values (e, 'ENQ-BK-' || n, 'c' || n || '@e2e.test', 'Client ' || n, 'photography', 'quotation_sent', due, paid);
  insert into public.client_quotations (id, prospect_name, quotation_reference, currency, total, subtotal, status, issued_at, enquiry_id, created_by, accepted_at, accepted_via, accepted_by_name, acceptance_channel, acceptance_evidence, acceptance_received_at, acceptance_recorded_by)
    values (q, 'Client ' || n, 'ORD-QUO-BK-' || n, cur, total, total, 'accepted', now() - interval '2 days', e, '00000000-0000-4000-8000-0000000000a0', now() - interval '1 day', 'staff_recorded', 'Client ' || n, 'email', 'synthetic acceptance email', now() - interval '1 day', '00000000-0000-4000-8000-0000000000a0');
  insert into public.activity_log (actor_user_id, action, entity_type, entity_id, metadata) values ('00000000-0000-4000-8000-0000000000a0', 'client_quotation.issued', 'client_quotation', q,
    jsonb_build_object('declaredActivities', string_to_array(acts, ','), 'contractingEntity', jsonb_build_object('entityId', ent)));
  if fp then insert into public.activity_log (actor_user_id, action, entity_type, entity_id, metadata) values ('00000000-0000-4000-8000-0000000000a0', 'client_quotation.content_fingerprint', 'client_quotation', q, jsonb_build_object('contentSha256', repeat('a', 64))); end if;
  set local session_replication_role = origin;
  return e::text || '|' || q::text;
end $$;
-- payload with overrides (defaults: one on-site segment, no payment condition, terms consistent, no assignee)
create or replace function pg_temp.pl(eq text, over jsonb default '{}'::jsonb) returns jsonb language sql as $$
  select jsonb_build_object('enquiryId', split_part(eq,'|',1), 'quotationId', split_part(eq,'|',2), 'segments', jsonb_build_array(jsonb_build_object('startsAt','2026-12-14T09:00:00Z','endsAt','2026-12-14T12:00:00Z','timezone','Asia/Qatar','kind','on_site','location','Synthetic studio, Doha')),
    'paymentTermsCheck','consistent','basis','rehearsal') || over;
$$;
create or replace function pg_temp.setcond(eq text, cond text, pct numeric) returns void language plpgsql as $$
begin set local session_replication_role = replica; update public.client_quotations set payment_condition = cond, deposit_percent = pct where id = split_part(eq,'|',2)::uuid; set local session_replication_role = origin; end $$;
create or replace function pg_temp.conf(p jsonb, actor text default '00000000-0000-4000-8000-0000000000a0') returns text language sql as $$ select public.confirm_ordinary_booking(p, actor::uuid)::text $$;
create or replace function pg_temp.try(p jsonb, actor text default '00000000-0000-4000-8000-0000000000a0') returns text language plpgsql as $$ begin perform public.confirm_ordinary_booking(p, actor::uuid); return ''; exception when others then return sqlerrm; end $$;
create temp table t (k text primary key, v text); grant all on t to public;

-- 1. the plain case: photography, Qatar, below the threshold, no payment condition -> confirmed, stage booked, outstanding recorded (not received), audited
do $$ declare a text := pg_temp.mk(1, '44444444-4444-4444-8444-444444444401', 'QAR', 2500, 'photography', 1000, 0); cid text; begin
  insert into t values ('a', a); cid := pg_temp.conf(pg_temp.pl(a));
  perform pg_temp.must((select kind from public.enquiry_booking_confirmations where id = cid::uuid) = 'confirmed', 'first row is confirmed');
  perform pg_temp.must((select not agreement_required from public.enquiry_booking_confirmations where id = cid::uuid), 'a simple photography session below the threshold needs no agreement');
  perform pg_temp.must((select outstanding_usd from public.enquiry_booking_confirmations where id = cid::uuid) = 1000 and (select required_usd from public.enquiry_booking_confirmations where id = cid::uuid) = 0, 'outstanding recorded, nothing treated as received');
  perform pg_temp.must((select crm_stage::text from public.enquiries where id = split_part(a,'|',1)::uuid) = 'booked', 'the enquiry moves to booked');
  perform pg_temp.must((select count(*) from public.enquiry_booking_segments where confirmation_id = cid::uuid) = 1, 'one segment');
  perform pg_temp.must((select count(*) from public.activity_log where action = 'booking.confirmed' and entity_id = split_part(a,'|',1)) = 1, 'one audit row');
  perform pg_temp.must((select settings_version from public.enquiry_booking_confirmations where id = cid::uuid) = 1, 'the settings version used is recorded');
  perform pg_temp.must((select count(*) from public.payments where created_at > now() - interval '1 minute') = 0, 'no payment was created');
end $$;
-- 2. only a Super Admin; twice is refused; a change is a new version; a cancel needs a reason; then it can be confirmed again
do $$ declare a text; cid text; begin
  select v into a from t where k = 'a';
  perform pg_temp.must(pg_temp.try(pg_temp.pl(a), '00000000-0000-4000-8000-0000000000a1') ilike '%booking_not_authorised%', 'an ordinary admin cannot confirm');
  perform pg_temp.must(pg_temp.try(pg_temp.pl(a)) ilike '%booking_already_confirmed%', 'already confirmed');
  cid := pg_temp.conf(pg_temp.pl(a, jsonb_build_object('supersedes', (select id from public.enquiry_booking_confirmations where enquiry_id = split_part(a,'|',1)::uuid order by version desc limit 1))));
  perform pg_temp.must((select version from public.enquiry_booking_confirmations where id = cid::uuid) = 2 and (select kind from public.enquiry_booking_confirmations where id = cid::uuid) = 'changed', 'a change is version 2');
  perform pg_temp.must(pg_temp.err(format($q$select public.cancel_ordinary_booking(%L, 'short', %L)$q$, split_part(a,'|',1), '00000000-0000-4000-8000-0000000000a0')) ilike '%cancel_reason%', 'a cancel needs a reason');
  perform pg_temp.must(pg_temp.err(format($q$select public.cancel_ordinary_booking(%L, 'client withdrew in writing', %L)$q$, split_part(a,'|',1), '00000000-0000-4000-8000-0000000000a1')) ilike '%not_authorised%', 'only a Super Admin cancels');
  perform public.cancel_ordinary_booking(split_part(a,'|',1)::uuid, 'client withdrew in writing', '00000000-0000-4000-8000-0000000000a0');
  perform pg_temp.must((select kind from public.enquiry_booking_confirmations where enquiry_id = split_part(a,'|',1)::uuid order by version desc limit 1) = 'cancelled', 'cancelled is a new row');
  perform pg_temp.must(pg_temp.try(pg_temp.pl(a)) = '', 'after a cancellation it can be confirmed again');
  perform pg_temp.must((select max(version) from public.enquiry_booking_confirmations where enquiry_id = split_part(a,'|',1)::uuid) = 4, 'four rows, nothing edited');
end $$;
-- 3. the agreement rules: value threshold, categories, currency without a threshold; an agreement never overrides an unlicensed activity
do $$ declare e1 text := pg_temp.mk(2, '44444444-4444-4444-8444-444444444401', 'QAR', 3000, 'photography', 3000, 0); ok_ag uuid := gen_random_uuid(); bad_ag uuid := gen_random_uuid(); e2 text; e3 text; e4 text; e5 text; begin
  set local session_replication_role = replica;
  insert into public.agreements (id, agreement_reference, master_id, master_version_id, classification, status, primary_context_type, primary_context_reference, executed_at) values (ok_ag, 'AGR-BK-1', gen_random_uuid(), gen_random_uuid(), 'transaction_agreement', 'active', 'enquiry', 'ENQ-BK-2', now());
  insert into public.agreements (id, agreement_reference, master_id, master_version_id, classification, status, primary_context_type, primary_context_reference, executed_at, cancelled_at) values (bad_ag, 'AGR-BK-2', gen_random_uuid(), gen_random_uuid(), 'transaction_agreement', 'cancelled', 'enquiry', 'ENQ-BK-2', now(), now());
  set local session_replication_role = origin;
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e1)) ilike '%booking_agreement_required%', 'QAR 3,000 reaches the threshold: an agreement is required');
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e1, jsonb_build_object('agreementId', bad_ag))) ilike '%booking_agreement_required%', 'a cancelled agreement does not count');
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e1, jsonb_build_object('agreementId', gen_random_uuid()))) ilike '%booking_agreement_required%', 'an unknown agreement does not count');
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e1, jsonb_build_object('agreementId', ok_ag))) = '', 'an executed agreement linked to this enquiry satisfies it');
  perform pg_temp.must((select 'value_at_or_above_threshold' = any(agreement_reasons) from public.enquiry_booking_confirmations where enquiry_id = split_part(e1,'|',1)::uuid), 'the reason is recorded');
  e2 := pg_temp.mk(3, '44444444-4444-4444-8444-444444444401', 'QAR', 2999, 'photography', 100, 0);
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e2)) = '', 'QAR 2,999 is below the threshold');
  e3 := pg_temp.mk(4, '44444444-4444-4444-8444-444444444402', 'GHS', 500, 'production_services', 100, 0);
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e3)) ilike '%booking_agreement_required%', 'production services always need an agreement, even for a small value');
  e4 := pg_temp.mk(5, '44444444-4444-4444-8444-444444444402', 'EUR', 10, 'photography', 10, 0);
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e4)) ilike '%booking_agreement_required%', 'a currency with no threshold fails closed');
  e5 := pg_temp.mk(6, '44444444-4444-4444-8444-444444444401', 'QAR', 100, 'videography', 100, 0);
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e5, jsonb_build_object('agreementId', ok_ag))) ilike '%booking_entity_not_eligible%', 'an agreement cannot override an unlicensed activity (videography is not listed on the Qatar CR)');
end $$;
do $$ declare e text := pg_temp.mk(7, '44444444-4444-4444-8444-444444444401', 'QAR', 100, 'photography', 100, 0); begin
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e, jsonb_build_object('escalators', jsonb_build_array('usage_rights_extended')))) ilike '%booking_agreement_required%', 'an escalator requires an agreement');
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e, jsonb_build_object('escalators', jsonb_build_array('made_up')))) ilike '%unknown_escalator%', 'unknown escalators are refused');
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e, jsonb_build_object('escalators', jsonb_build_array('exclusivity')))) ilike '%booking_agreement_required%' and pg_temp.try(pg_temp.pl(e, jsonb_build_object('escalators', jsonb_build_array('minors')))) ilike '%booking_agreement_required%' and pg_temp.try(pg_temp.pl(e, jsonb_build_object('escalators', jsonb_build_array('third_party_ip')))) ilike '%booking_agreement_required%' and pg_temp.try(pg_temp.pl(e, jsonb_build_object('escalators', jsonb_build_array('restricted_location')))) ilike '%booking_agreement_required%' and pg_temp.try(pg_temp.pl(e, jsonb_build_object('escalators', jsonb_build_array('complex_or_unusual')))) ilike '%booking_agreement_required%', 'each approved circumstance requires an agreement');
end $$;
-- 4. payment: the quotation's OWN structured condition vs VERIFIED paid; none records the outstanding amount only
do $$ declare e text := pg_temp.mk(8, '44444444-4444-4444-8444-444444444401', 'QAR', 100, 'photography', 1000, 0); begin
  perform pg_temp.setcond(e, 'deposit', 50);
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e)) ilike '%booking_payment_pending%', 'a deposit that is not paid blocks');
  set local session_replication_role = replica; update public.enquiries set amount_paid = 499.99 where id = split_part(e,'|',1)::uuid; set local session_replication_role = origin;
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e)) ilike '%booking_payment_pending%', 'a shortfall of one cent still blocks');
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e, jsonb_build_object('paymentCondition','none'))) ilike '%payment_condition_mismatch%', 'a caller cannot state a different condition from the quotation''s own');
  set local session_replication_role = replica; update public.enquiries set amount_paid = 500 where id = split_part(e,'|',1)::uuid; set local session_replication_role = origin;
  perform pg_temp.setcond(e, 'full', null);
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e)) ilike '%booking_payment_pending%', 'full payment needs the whole amount');
  perform pg_temp.setcond(e, 'deposit', 50);
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e)) = '', 'the deposit is paid: confirmed');
  perform pg_temp.must((select required_usd from public.enquiry_booking_confirmations where enquiry_id = split_part(e,'|',1)::uuid) = 500 and (select outstanding_usd from public.enquiry_booking_confirmations where enquiry_id = split_part(e,'|',1)::uuid) = 500 and (select payment_condition from public.enquiry_booking_confirmations where enquiry_id = split_part(e,'|',1)::uuid) = 'deposit', 'the quotation''s condition, required and outstanding are recorded');
end $$;
do $$ declare e text := pg_temp.mk(9, '44444444-4444-4444-8444-444444444401', 'QAR', 100, 'photography', null, 0); begin
  perform pg_temp.setcond(e, 'deposit', 30);
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e)) ilike '%booking_amount_due_missing%', 'a deposit needs an established amount due');
end $$;
-- 5. the structured condition may not silently contradict the quotation's terms
do $$ declare e text := pg_temp.mk(10, '44444444-4444-4444-8444-444444444401', 'QAR', 100, 'photography', 100, 0); begin
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e, jsonb_build_object('paymentTermsCheck','ambiguous'))) ilike '%payment_terms_unclear%', 'ambiguous terms need clarification');
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e, jsonb_build_object('paymentTermsCheck','no_terms'))) ilike '%payment_terms_unclear%', 'a quotation with no terms text needs clarification');
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e, jsonb_build_object('paymentTermsCheck','contradiction','clarification', jsonb_build_object('kind','quotation_revised','evidence','a revised quotation reference 123')))) ilike '%payment_terms_unclear%', 'a contradiction is not cleared by a revision note');
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e, jsonb_build_object('paymentTermsCheck','ambiguous','clarification', jsonb_build_object('kind','client_confirmed_in_writing','evidence','short')))) ilike '%payment_terms_unclear%', 'thin evidence does not clear it');
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e, jsonb_build_object('paymentTermsCheck','contradiction','clarification', jsonb_build_object('kind','client_confirmed_in_writing','evidence','client email of 8 Nov confirms no deposit')))) = '', 'written client confirmation clears it');
  perform pg_temp.must((select payment_clarification ->> 'kind' from public.enquiry_booking_confirmations where enquiry_id = split_part(e,'|',1)::uuid) = 'client_confirmed_in_writing', 'the clarification is stored');
end $$;
-- 6. date, time and place; multi-day and multi-location; online
do $$ declare e text := pg_temp.mk(11, '44444444-4444-4444-8444-444444444401', 'QAR', 100, 'photography', 100, 0); cid text; ag11 uuid := gen_random_uuid(); begin
  set local session_replication_role = replica;
  insert into public.agreements (id, agreement_reference, master_id, master_version_id, classification, status, primary_context_type, primary_context_reference, executed_at) values (ag11, 'AGR-BK-11', gen_random_uuid(), gen_random_uuid(), 'transaction_agreement', 'active', 'enquiry', 'ENQ-BK-11', now());
  set local session_replication_role = origin;
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e, jsonb_build_object('segments', '[]'::jsonb))) ilike '%booking_no_schedule%', 'no schedule, no booking');
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e, jsonb_build_object('segments', jsonb_build_array(jsonb_build_object('startsAt','2026-12-14T09:00:00Z','endsAt','2026-12-14T12:00:00Z','timezone','Asia/Qatar','kind','online'))))) ilike '%booking_segment_place%', 'online needs a platform');
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e, jsonb_build_object('segments', jsonb_build_array(jsonb_build_object('startsAt','2026-12-14T09:00:00Z','endsAt','2026-12-14T12:00:00Z','timezone','Asia/Qatar','kind','on_site'))))) ilike '%booking_segment_place%', 'on-site needs a place');
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e, jsonb_build_object('segments', jsonb_build_array(jsonb_build_object('startsAt','2026-12-14T12:00:00Z','endsAt','2026-12-14T09:00:00Z','timezone','Asia/Qatar','kind','on_site','location','Doha'))))) ilike '%booking_segment_order%', 'the end must be after the start');
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e, jsonb_build_object('segments', jsonb_build_array(jsonb_build_object('startsAt','2026-12-14T05:00:00Z','endsAt','2026-12-14T09:00:00Z','timezone','Asia/Qatar','kind','on_site','location','Venue A, Doha'), jsonb_build_object('startsAt','2026-12-15T05:00:00Z','endsAt','2026-12-15T09:00:00Z','timezone','Asia/Qatar','kind','on_site','location','Venue B, Doha')))) ) ilike '%booking_agreement_required%', 'a multi-day assignment is detected from the schedule and needs an agreement');
  cid := pg_temp.conf(pg_temp.pl(e, jsonb_build_object('agreementId', ag11, 'segments', jsonb_build_array(
      jsonb_build_object('startsAt','2026-12-14T05:00:00Z','endsAt','2026-12-14T09:00:00Z','timezone','Asia/Qatar','kind','on_site','location','Venue A, Doha'),
      jsonb_build_object('startsAt','2026-12-15T05:00:00Z','endsAt','2026-12-15T09:00:00Z','timezone','Asia/Qatar','kind','studio','location','Studio, Doha'),
      jsonb_build_object('startsAt','2026-12-16T12:00:00Z','endsAt','2026-12-16T13:00:00Z','timezone','Europe/London','kind','online','platform','Video call')))));
  perform pg_temp.must((select count(*) from public.enquiry_booking_segments where confirmation_id = cid::uuid) = 3, 'a multi-day, multi-location and online booking is three segments');
end $$;
-- 7. conflicts for the SAME assigned person: booking, confirmed Crew Support slot, approved leave; a reason alone never clears them
do $$ declare e1 text := pg_temp.mk(12, '44444444-4444-4444-8444-444444444401', 'QAR', 100, 'photography', 100, 0); e2 text := pg_temp.mk(13, '44444444-4444-4444-8444-444444444401', 'QAR', 100, 'photography', 100, 0);
  e3 text := pg_temp.mk(14, '44444444-4444-4444-8444-444444444401', 'QAR', 100, 'photography', 100, 0); k text; seg jsonb := jsonb_build_array(jsonb_build_object('startsAt','2026-12-20T09:00:00Z','endsAt','2026-12-20T12:00:00Z','timezone','Asia/Qatar','kind','on_site','location','Doha'));
  p2 text := '00000000-0000-4000-8000-0000000000a2'; p3 text := '00000000-0000-4000-8000-0000000000a3'; b1 text; res jsonb; begin
  b1 := pg_temp.conf(pg_temp.pl(e1, jsonb_build_object('assignedProfileId', p2, 'segments', seg)));
  k := 'booking:' || b1;
  perform pg_temp.must(jsonb_array_length(public.preview_booking_conflicts(p2::uuid, seg, null)) = 1 and (public.preview_booking_conflicts(p2::uuid, seg, null) -> 0 ->> 'key') = k, 'the read-only preview lists the firm conflict before confirmation');
  perform pg_temp.must(jsonb_array_length(public.preview_booking_conflicts(p3::uuid, seg, null)) = 0, 'and nothing for another person');
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e2, jsonb_build_object('assignedProfileId', p2, 'segments', seg))) ilike '%booking_firm_conflict%', 'the same person double-booked is a firm conflict');
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e2, jsonb_build_object('assignedProfileId', p2, 'segments', seg, 'conflictResolutions', jsonb_build_array(jsonb_build_object('key', k, 'kind', 'overridden', 'reason', 'I decided so, it is fine')))) ) ilike '%booking_firm_conflict%', 'a reason alone does not clear it');
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e2, jsonb_build_object('assignedProfileId', p2, 'segments', seg, 'conflictResolutions', jsonb_build_array(jsonb_build_object('key', k, 'kind', 'availability_verified', 'verifiedWithProfileId', p3, 'method', 'call', 'reference', 'call with someone else', 'verifiedOn', current_date)))) ) ilike '%booking_firm_conflict%', 'verification with a different person does not count');
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e2, jsonb_build_object('assignedProfileId', p2, 'segments', seg, 'conflictResolutions', jsonb_build_array(jsonb_build_object('key', k, 'kind', 'availability_verified', 'verifiedWithProfileId', p2, 'method', 'telepathy', 'reference', 'a long enough reference', 'verifiedOn', current_date)))) ) ilike '%booking_firm_conflict%', 'an unknown method does not count');
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e2, jsonb_build_object('assignedProfileId', p2, 'segments', seg, 'conflictResolutions', jsonb_build_array(jsonb_build_object('key', k, 'kind', 'availability_verified', 'verifiedWithProfileId', p2, 'method', 'call', 'reference', 'short', 'verifiedOn', current_date)))) ) ilike '%booking_firm_conflict%', 'a thin reference does not count');
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e2, jsonb_build_object('assignedProfileId', p2, 'segments', seg, 'conflictResolutions', jsonb_build_array(jsonb_build_object('key', k, 'kind', 'availability_verified', 'verifiedWithProfileId', p2, 'method', 'call', 'reference', 'call with the assignee, 8 Nov', 'verifiedOn', current_date + 3)))) ) ilike '%booking_firm_conflict%', 'a future verification date does not count');
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e2, jsonb_build_object('assignedProfileId', p3, 'segments', seg))) = '', 'a different person has no conflict');
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e3, jsonb_build_object('assignedProfileId', p2, 'segments', seg, 'conflictResolutions', jsonb_build_array(jsonb_build_object('key', k, 'kind', 'availability_verified', 'verifiedWithProfileId', p2, 'method', 'call', 'reference', 'call with the assignee, 8 Nov', 'verifiedOn', current_date)))) ) = '', 'documented availability verified WITH the assigned person clears a firm conflict');
  perform pg_temp.must((select jsonb_array_length(conflict_review -> 'resolutions') from public.enquiry_booking_confirmations where enquiry_id = split_part(e3,'|',1)::uuid) = 1, 'the resolution is stored with the booking');
end $$;
do $$ declare e1 text := pg_temp.mk(15, '44444444-4444-4444-8444-444444444401', 'QAR', 100, 'photography', 100, 0); e2 text := pg_temp.mk(16, '44444444-4444-4444-8444-444444444401', 'QAR', 100, 'photography', 100, 0); e3 text := pg_temp.mk(17, '44444444-4444-4444-8444-444444444401', 'QAR', 100, 'photography', 100, 0);
  p2 text := '00000000-0000-4000-8000-0000000000a2'; mk_seg jsonb := jsonb_build_array(jsonb_build_object('startsAt','2027-01-10T09:00:00Z','endsAt','2027-01-10T12:00:00Z','timezone','Asia/Qatar','kind','on_site','location','Doha')); begin
  set local session_replication_role = replica;
  insert into public.crew_support_requests (id, enquiry_id, reference_number, requester_type, requester_name, requester_email, requester_phone, service_family, project_name, start_date, end_date, location, consent_accepted_at, status)
    values ('55555555-5555-4555-8555-555555555501', gen_random_uuid(), 'CSR-BK-1', 'photographer', 'X', 'x@e2e.test', '1', 'photography', 'P', date '2027-01-10', date '2027-01-10', 'Doha', now(), 'confirmed'),
           ('55555555-5555-4555-8555-555555555502', gen_random_uuid(), 'CSR-BK-2', 'photographer', 'X', 'x@e2e.test', '1', 'photography', 'P', date '2027-02-10', date '2027-02-10', 'Doha', now(), 'quoted');
  insert into public.crew_support_slots (requirement_id, request_id, slot_number, assignee_profile_id, status) values (gen_random_uuid(), '55555555-5555-4555-8555-555555555501', 1, p2::uuid, 'assigned'), (gen_random_uuid(), '55555555-5555-4555-8555-555555555502', 1, p2::uuid, 'assigned');
  insert into public.leave_requests (profile_id, leave_type_id, start_date, end_date, days_requested, status) values (p2::uuid, gen_random_uuid(), date '2027-03-10', date '2027-03-11', 2, 'approved');
  set local session_replication_role = origin;
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e1, jsonb_build_object('assignedProfileId', p2, 'segments', mk_seg))) ilike '%booking_firm_conflict%', 'a CONFIRMED Crew Support slot is a firm conflict');
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e2, jsonb_build_object('assignedProfileId', p2, 'segments', jsonb_build_array(jsonb_build_object('startsAt','2027-02-10T09:00:00Z','endsAt','2027-02-10T12:00:00Z','timezone','Asia/Qatar','kind','on_site','location','Doha'))))) = '', 'a slot on a request that is only quoted is a soft conflict and does not block');
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e3, jsonb_build_object('assignedProfileId', p2, 'segments', jsonb_build_array(jsonb_build_object('startsAt','2027-03-10T09:00:00Z','endsAt','2027-03-10T12:00:00Z','timezone','Asia/Qatar','kind','on_site','location','Doha'))))) ilike '%booking_firm_conflict%', 'approved leave is a firm conflict');
end $$;
-- 8. what an accepted ordinary quotation must be; the entity must still be eligible; closed enquiries
do $$ declare e text := pg_temp.mk(18, '44444444-4444-4444-8444-444444444401', 'QAR', 100, 'photography', 100, 0, false); f text := pg_temp.mk(19, '44444444-4444-4444-8444-444444444401', 'QAR', 100, 'photography', 100, 0); g text := pg_temp.mk(20, '44444444-4444-4444-8444-444444444401', 'QAR', 100, 'photography', 100, 0); begin
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e)) ilike '%booking_no_fingerprint%', 'a quotation with no recorded content fingerprint is refused');
  set local session_replication_role = replica; update public.client_quotations set status = 'sent' where id = split_part(f,'|',2)::uuid; set local session_replication_role = origin;
  perform pg_temp.must(pg_temp.try(pg_temp.pl(f)) ilike '%booking_not_accepted%', 'an unaccepted quotation cannot be booked');
  set local session_replication_role = replica; update public.client_quotations set crew_support_request_id = '55555555-5555-4555-8555-555555555501' where id = split_part(g,'|',2)::uuid; set local session_replication_role = origin;
  perform pg_temp.must(pg_temp.try(pg_temp.pl(g)) ilike '%booking_not_accepted%', 'a Crew Support quotation is not an ordinary booking');
end $$;
do $$ declare e text := pg_temp.mk(21, '44444444-4444-4444-8444-444444444401', 'QAR', 100, 'photography', 100, 0); begin
  set local session_replication_role = replica; update public.enquiries set crm_stage = 'closed' where id = split_part(e,'|',1)::uuid; set local session_replication_role = origin;
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e)) ilike '%booking_enquiry_closed%', 'a closed enquiry cannot be booked');
  set local session_replication_role = replica; update public.enquiries set crm_stage = 'in_progress' where id = split_part(e,'|',1)::uuid; set local session_replication_role = origin;
  perform pg_temp.must(pg_temp.try(pg_temp.pl(e)) = '', 'an in-progress enquiry is confirmed without being moved backwards');
  perform pg_temp.must((select crm_stage::text from public.enquiries where id = split_part(e,'|',1)::uuid) = 'in_progress', 'the stage is never moved backwards');
end $$;
-- 9. append-only, settings are data, privileges
select pg_temp.must(pg_temp.err($q$update public.enquiry_booking_confirmations set basis = 'x'$q$) ilike '%append-only%' and pg_temp.err($q$delete from public.enquiry_booking_segments$q$) ilike '%append-only%', 'confirmations and segments are append-only');
select pg_temp.must(pg_temp.err($q$update public.booking_rule_settings set status = 'approved'$q$) ilike '%append-only%', 'settings are versioned, never edited');
select pg_temp.must((select agreement_value_thresholds ->> 'QAR' from public.booking_rule_settings where version = 1) = '3000' and (select agreement_value_thresholds ->> 'GHS' from public.booking_rule_settings where version = 1) = '10000' and (select agreement_value_thresholds ->> 'USD' from public.booking_rule_settings where version = 1) = '800', 'the provisional thresholds are data');
do $$ begin
  insert into public.booking_rule_settings (version, status, agreement_value_thresholds, agreement_always_categories, agreement_escalators, note, created_by) values (2, 'approved', '{"QAR": 5000, "GHS": 10000, "USD": 800}', array['videography'], array['exclusivity'], 'rehearsal v2', '00000000-0000-4000-8000-0000000000a0');
  perform pg_temp.must((select version from public.booking_rule_settings order by version desc limit 1) = 2, 'a new settings version is the latest');
end $$;
select pg_temp.must(not has_table_privilege('authenticated', 'public.enquiry_booking_confirmations', 'insert') and not has_table_privilege('service_role', 'public.enquiry_booking_confirmations', 'insert') and not has_table_privilege('anon', 'public.enquiry_booking_segments', 'select'), 'only the functions write confirmations');
select pg_temp.must(not has_function_privilege('authenticated', 'public.confirm_ordinary_booking(jsonb, uuid)', 'execute') and has_function_privilege('service_role', 'public.confirm_ordinary_booking(jsonb, uuid)', 'execute'), 'the functions are server-only');
select pg_temp.must((select relrowsecurity from pg_class where oid = 'public.enquiry_booking_confirmations'::regclass), 'RLS on');
select 'BOOKING REHEARSAL PASSED' as result;
