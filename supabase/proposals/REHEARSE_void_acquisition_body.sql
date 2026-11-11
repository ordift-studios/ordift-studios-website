-- Rehearsal body for migration 0190 (audited void of an acquisition with its financing). Runs inside ONE transaction that rehearse_finance_stamp.sh ROLLS BACK. Local scratch database only. Synthetic users/entities.
-- Every check raises an exception on failure; the script stops at the first one (ON_ERROR_STOP).
set session_replication_role = replica;
insert into auth.users (id, email) select ('00000000-0000-4000-8000-0000000000'||lpad(to_hex(n),2,'0'))::uuid, 'f'||n||'@e2e.test' from generate_series(240,243) n on conflict do nothing;
insert into public.profiles (id, full_name, access_status) select ('00000000-0000-4000-8000-0000000000'||lpad(to_hex(n),2,'0'))::uuid, 'Fin '||n, 'active' from generate_series(240,243) n on conflict do nothing;
insert into public.user_roles (user_id, role_id) select '00000000-0000-4000-8000-0000000000f0', r.id from public.roles r where r.slug = 'super_admin' on conflict do nothing;      -- f0 = 240: Super Admin
insert into public.user_roles (user_id, role_id) select '00000000-0000-4000-8000-0000000000f1', r.id from public.roles r where r.slug = 'admin' on conflict do nothing;            -- f1 = 241: ordinary admin
insert into public.employing_entities (id, name, slug, legal_name, verification_status) values
  ('11111111-1111-4111-8111-111111111101', 'Fin Entity A', 'fin-a', 'FIN ENTITY A W.L.L.', 'verified'), ('11111111-1111-4111-8111-111111111102', 'Fin Entity B', 'fin-b', 'FIN ENTITY B W.L.L.', 'verified') on conflict do nothing;
insert into public.employing_entity_documents (id, employing_entity_id, document_type, storage_path, uploaded_by, file_sha256, original_filename, mime_type, size_bytes) values
  ('22222222-2222-4222-8222-222222222201', '11111111-1111-4111-8111-111111111101', 'purchase_receipt', 'a/inv.jpg', '00000000-0000-4000-8000-0000000000f0', repeat('a', 64), 'invoice.jpg', 'image/jpeg', 1000),
  ('22222222-2222-4222-8222-222222222202', '11111111-1111-4111-8111-111111111101', 'other_financial_document', 'a/pl.pdf', '00000000-0000-4000-8000-0000000000f0', repeat('b', 64), 'receipt_SQ1.pdf', 'application/pdf', 2000),
  ('22222222-2222-4222-8222-222222222203', '11111111-1111-4111-8111-111111111102', 'other_financial_document', 'b/pl.pdf', '00000000-0000-4000-8000-0000000000f0', repeat('c', 64), 'other_entity.pdf', 'application/pdf', 2000),
  ('22222222-2222-4222-8222-222222222204', '11111111-1111-4111-8111-111111111101', 'other_financial_document', 'a/bank.pdf', '00000000-0000-4000-8000-0000000000f0', repeat('d', 64), 'statement.pdf', 'application/pdf', 3000)
  on conflict do nothing;
set session_replication_role = origin;
insert into public.employing_entity_documents (id, employing_entity_id, document_type, storage_path, uploaded_by, file_sha256, original_filename, mime_type, size_bytes) values
  ('22222222-2222-4222-8222-222222222205', '11111111-1111-4111-8111-111111111102', 'purchase_receipt', 'b/inv.jpg', '00000000-0000-4000-8000-0000000000f0', repeat('e', 64), 'ghana-invoice.jpg', 'image/jpeg', 1000) on conflict do nothing;
-- the Founder identity (lab only, inside the rolled-back transaction): the synthetic Super Admin f0 is the ACTIVE Founder
set session_replication_role = replica; delete from public.founder_identities;
insert into public.founder_identities (profile_id, status, designation_reference) values ('00000000-0000-4000-8000-0000000000f0', 'active', 'Rehearsal Founder designation reference (synthetic)'); set session_replication_role = origin;
create or replace function pg_temp.err(q text) returns text language plpgsql as $$ begin execute q; return ''; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.must(cond boolean, msg text) returns void language plpgsql as $$ begin if not coalesce(cond, false) then raise exception 'REHEARSAL FAILED: %', msg; end if; end $$;
create temp table t_ids (name text primary key, id uuid); grant all on t_ids to public;
create or replace function pg_temp.mk(inv text, fund text, ent uuid default '11111111-1111-4111-8111-111111111101') returns uuid language plpgsql as $$
declare r record;
begin select * into r from public.record_equipment_acquisition(jsonb_build_object('entityId', ent, 'acquisition', jsonb_build_object('supplier','Synthetic Supplier','invoiceNumber',inv,'purchaseDate','2026-11-01','itemDescription','Synthetic pen display','quantity',1,'currency','QAR','listPrice',1149,'discount',0,'net',1149,
  'invoiceDocumentId', case when ent = '11111111-1111-4111-8111-111111111101' then '22222222-2222-4222-8222-222222222201' else '22222222-2222-4222-8222-222222222205' end,'fundingStatus',fund,'fundingNote','Founder statement: company card')), '00000000-0000-4000-8000-0000000000f0'); return r.acquisition_id; end $$;

-- ---------------------------------------------------------------- helpers
create or replace function pg_temp.fin(inv text, ref text, paid boolean default true, ent uuid default '11111111-1111-4111-8111-111111111101') returns uuid language plpgsql as $$
declare r record;
begin select * into r from public.record_equipment_acquisition(jsonb_build_object('entityId', ent, 'acquisition', jsonb_build_object('supplier','Synthetic Supplier','invoiceNumber',inv,'purchaseDate','2026-11-01','itemDescription','Synthetic pen display','quantity',1,'currency','QAR','listPrice',1149,'discount',0,'net',1149,
  'invoiceDocumentId','22222222-2222-4222-8222-222222222201','fundingStatus','company_account','fundingNote','Founder statement: company card'),
  'financing', jsonb_build_object('provider','SynthPay','reference',ref,'merchant','Synthetic Supplier','count',4,'plannedOn','2026-11-01','confirmationDocumentId','22222222-2222-4222-8222-222222222202','scheduleBasis','founder_expected_months',
    'instalments', jsonb_build_array(jsonb_build_object('sequence',1,'amount',287.25,'expectedMonth','2026-11-01'),jsonb_build_object('sequence',2,'amount',287.25,'expectedMonth','2026-12-01'),jsonb_build_object('sequence',3,'amount',287.25,'expectedMonth','2027-01-01'),jsonb_build_object('sequence',4,'amount',287.25,'expectedMonth','2027-02-01')))
  ) || case when paid then jsonb_build_object('firstInstalmentPaid', jsonb_build_object('sequence',1,'paidOn',(current_date - 1)::text,'evidenceNote','Synthetic confirmation: down payment shown as paid')) else '{}'::jsonb end, '00000000-0000-4000-8000-0000000000f0'); return r.acquisition_id; end $$;
create or replace function pg_temp.vd(acq uuid, reason text default 'Entered with a wrong value; voided to record a correction', actor uuid default '00000000-0000-4000-8000-0000000000f0') returns text language plpgsql as $$
begin perform public.void_equipment_acquisition(acq, reason, actor); return ''; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.st(acq uuid) returns text language sql as $$ select status from public.entity_equipment_acquisitions where id = acq $$;
create or replace function pg_temp.nev(acq uuid, t text) returns bigint language sql as $$ select count(*) from public.entity_finance_events where acquisition_id = acq and event_type = t $$;
create or replace function pg_temp.ins(acq uuid) returns table (sequence int, status text, paid_on date, paid_amount numeric, void_reason text, evidence_note text) language sql as $$
  select i.sequence, i.status, i.paid_on, i.paid_amount, i.void_reason, i.evidence_note from public.entity_financing_instalments i join public.entity_financing_obligations o on o.id = i.obligation_id where o.acquisition_id = acq order by i.sequence $$;
create or replace function pg_temp.bundle(inv text, net numeric, terms jsonb, pay jsonb, ent uuid default '11111111-1111-4111-8111-111111111101') returns uuid language plpgsql as $$
declare r record;
begin select * into r from public.record_acquisition_bundle(jsonb_build_object('entityId', ent, 'acquisition', jsonb_build_object('supplier','Synthetic Supplier','invoiceNumber',inv,'purchaseDate','2026-11-01','itemDescription','Synthetic bundle item','quantity',1,'currency','QAR','listPrice',net,'discount',0,'net',net,
  'invoiceDocumentId','22222222-2222-4222-8222-222222222201','fundingStatus','to_confirm'), 'terms', terms, 'payment', pay), '00000000-0000-4000-8000-0000000000f0'); return r.new_acquisition_id; end $$;
insert into public.company_assets (id, asset_identifier, description, category) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', 'SER-Q', 'Synthetic Qatar pen display', 'Pad');
create temp table t_b as select (select md5(string_agg(row_to_json(a)::text, '|' order by a.id)) from public.company_assets a) assets_h, (select md5(coalesce(string_agg(row_to_json(x)::text, '|' order by x.id), '')) from public.asset_assignments x) assign_h,
  (select md5(string_agg(row_to_json(d)::text, '|' order by d.id)) from public.employing_entity_documents d) vault_h, (select count(*) from public.entity_expenses) exp_n, (select count(*) from public.payments) pay_n,
  (select md5(string_agg(indexdef, '|' order by indexname)) from pg_indexes where tablename in ('entity_equipment_acquisitions','entity_financing_obligations','entity_financing_instalments')) idx_h,
  (select md5(string_agg(conname || pg_get_constraintdef(oid), '|' order by conname)) from pg_constraint where conrelid in ('public.entity_equipment_acquisitions'::regclass, 'public.entity_financing_obligations'::regclass)) con_h;
grant all on t_b to public;

-- ---------------------------------------------------------------- 1. the function and its privileges
select pg_temp.must(has_function_privilege('service_role', 'public.void_equipment_acquisition(uuid, text, uuid)', 'execute') and not has_function_privilege('authenticated', 'public.void_equipment_acquisition(uuid, text, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.void_equipment_acquisition(uuid, text, uuid)', 'execute'), 'only service_role can run the void function');
select pg_temp.must((select prosecdef and exists (select 1 from unnest(proconfig) c where c in ('search_path=""', 'search_path=')) from pg_proc where oid = 'public.void_equipment_acquisition(uuid, text, uuid)'::regprocedure), 'the void function is security definer with an empty search_path');
select pg_temp.must((select pg_get_constraintdef(oid) from pg_constraint where conname = 'instalments_paid_shape') ilike '%status = ''void''%', 'the paid-shape constraint is relaxed for void rows only');
select pg_temp.must((select pg_get_constraintdef(oid) from pg_constraint where conname = 'entity_finance_events_event_type_check') ilike '%''voided''%', 'the audit-event list already contains voided (no widening was needed)');

-- ---------------------------------------------------------------- 2. refusals before anything changes
insert into t_ids values ('f1', pg_temp.fin('FIN-1', 'PL-0001')), ('f2', pg_temp.fin('FIN-2', 'PL-0002', false));
create or replace function pg_temp.i(n text) returns uuid language sql as $$ select id from t_ids where name = n $$;
select pg_temp.must(pg_temp.vd(pg_temp.i('f1'), 'Entered with a wrong value; voided to record a correction', '00000000-0000-4000-8000-0000000000f1') ilike '%only a Super Admin%', 'an ordinary admin cannot void an acquisition');
select pg_temp.must(pg_temp.vd(pg_temp.i('f1'), 'short') ilike '%at least 10 characters%', 'a reason of fewer than 10 characters is refused');
select pg_temp.must(pg_temp.vd('99999999-9999-4999-8999-999999999999') ilike '%not a recorded acquisition%', 'an unknown acquisition is refused');
select pg_temp.must(pg_temp.st(pg_temp.i('f1')) = 'recorded' and (select count(*) from pg_temp.ins(pg_temp.i('f1')) where status <> 'void') = 4, 'nothing changed after the refusals');
-- the guards still hold directly (the paid-instalment exception exists ONLY inside the function)
select pg_temp.must(pg_temp.err($q$update public.entity_financing_instalments set status = 'void', void_reason = 'trying to void a paid instalment directly' where status = 'paid'$q$) ilike '%paid instalment cannot be changed%', 'a paid instalment cannot be voided directly');
select pg_temp.must(pg_temp.err(format($q$select set_config('ordift.void_acquisition', %L, true); update public.entity_financing_instalments set status = 'void', void_reason = 'wrong acquisition named in the setting' where status = 'paid'$q$, pg_temp.i('f2'))) ilike '%paid instalment cannot be changed%', 'the setting must name THIS acquisition');
select set_config('ordift.void_acquisition', '', true);
select pg_temp.must(pg_temp.err($q$update public.entity_equipment_acquisitions set status = 'void', void_reason = 'direct void is allowed by the 0186 guard' where invoice_number = 'FIN-1'$q$) = '' , 'baseline: 0186 already allowed a direct status change of an acquisition (the function adds the cascade and the audit)');
select pg_temp.must((select count(*) from public.entity_equipment_acquisitions where status = 'void') = 1, 'sanity: the direct update above voided the row inside this rehearsal');
-- undo that direct change for the real tests (rehearsal only: replica role)
set session_replication_role = replica; update public.entity_equipment_acquisitions set status = 'recorded', void_reason = null where invoice_number = 'FIN-1'; set session_replication_role = origin;

-- ---------------------------------------------------------------- 3. the void of a financed purchase with a REPORTED payment
create temp table t_f1 as select * from pg_temp.ins(pg_temp.i('f1')); grant all on t_f1 to public;
select pg_temp.must(pg_temp.vd(pg_temp.i('f1')) = '', 'a Super Admin voids a financed acquisition with a reported-paid instalment');
select pg_temp.must(pg_temp.st(pg_temp.i('f1')) = 'void' and (select void_reason from public.entity_equipment_acquisitions where id = pg_temp.i('f1')) = 'Entered with a wrong value; voided to record a correction', 'the acquisition is void and keeps the reason');
select pg_temp.must((select status from public.entity_financing_obligations where acquisition_id = pg_temp.i('f1')) = 'void', 'the financing obligation is void');
select pg_temp.must((select count(*) from pg_temp.ins(pg_temp.i('f1')) where status = 'void' and void_reason = 'Entered with a wrong value; voided to record a correction') = 4, 'all four instalments are void with the reason (none deleted)');
select pg_temp.must((select (paid_on, paid_amount, evidence_note) from pg_temp.ins(pg_temp.i('f1')) where sequence = 1) = (select (paid_on, paid_amount, evidence_note) from t_f1 where sequence = 1), 'the voided paid instalment KEEPS its payment date, amount and evidence note');
select pg_temp.must((select evidence_document_id from public.entity_financing_instalments i join public.entity_financing_obligations o on o.id = i.obligation_id where o.acquisition_id = pg_temp.i('f1') and i.sequence = 1) = '22222222-2222-4222-8222-222222222202', 'the evidence document link of the paid instalment is kept');
select pg_temp.must(pg_temp.nev(pg_temp.i('f1'), 'voided') = 1 and (select detail ->> 'kind' from public.entity_finance_events where acquisition_id = pg_temp.i('f1') and event_type = 'voided') = 'acquisition_void', 'exactly one audit event of type voided, kind acquisition_void');
select pg_temp.must((select jsonb_array_length(detail -> 'voidedInstalments') = 4 and detail ->> 'reason' = 'Entered with a wrong value; voided to record a correction' and detail #>> '{voidedInstalments,0,wasStatus}' = 'paid' and detail #>> '{voidedInstalments,0,evidenceNote}' = 'Synthetic confirmation: down payment shown as paid' and detail ->> 'financingReference' = 'PL-0001'
  from public.entity_finance_events where acquisition_id = pg_temp.i('f1') and event_type = 'voided'), 'the audit event snapshots the reason, the four instalments, the reported payment and its evidence note');
select pg_temp.must(pg_temp.vd(pg_temp.i('f1')) ilike '%not a recorded acquisition%', 'a second void is refused (no duplicate event)');
select pg_temp.must(pg_temp.nev(pg_temp.i('f1'), 'voided') = 1, 'still exactly one void event');
select pg_temp.must(pg_temp.err(format($q$update public.entity_equipment_acquisitions set funding_source_note = 'silent edit' where id = %L$q$, pg_temp.i('f1'))) ilike '%voided acquisition cannot be changed%', 'a voided acquisition cannot be edited');
select pg_temp.must(pg_temp.err(format($q$update public.entity_financing_instalments set evidence_note = 'silent edit of a voided instalment' where obligation_id = (select id from public.entity_financing_obligations where acquisition_id = %L)$q$, pg_temp.i('f1'))) ilike '%voided instalment cannot be changed%', 'a voided instalment cannot be edited');
select pg_temp.must(pg_temp.err($q$delete from public.entity_financing_instalments$q$) ilike '%append-only%' and pg_temp.err($q$delete from public.entity_equipment_acquisitions$q$) ilike '%append-only%' and pg_temp.err($q$delete from public.entity_finance_events$q$) ilike '%append-only%', 'nothing can be deleted, and the audit table stays append-only');
select pg_temp.must(pg_temp.err(format($q$select public.mark_instalment_paid(%L, current_date - 1, null, 'trying to mark a voided instalment as paid', '00000000-0000-4000-8000-0000000000f0')$q$, (select i.id from public.entity_financing_instalments i join public.entity_financing_obligations o on o.id = i.obligation_id where o.acquisition_id = pg_temp.i('f1') and i.sequence = 2))) ilike '%not pending%', 'a voided instalment cannot be marked paid');

-- ---------------------------------------------------------------- 4. the correction: the same invoice number and financing reference can be entered again; nothing is counted twice
insert into t_ids values ('f1b', pg_temp.fin('FIN-1', 'PL-0001'));
select pg_temp.must((select count(*) from public.entity_equipment_acquisitions where invoice_number = 'FIN-1') = 2 and (select count(*) from public.entity_equipment_acquisitions where invoice_number = 'FIN-1' and status = 'recorded') = 1, 'the corrected record is a NEW row; the voided one stays');
select pg_temp.must(pg_temp.err($q$select pg_temp.fin('FIN-1', 'PL-0001')$q$) ilike '%acquisitions_one_per_invoice%', 'while a live record exists the same invoice is still refused');
select pg_temp.must((select count(*) from public.entity_financing_obligations where provider_reference = 'PL-0001' and status <> 'void') = 1, 'only ONE live financing obligation for the reference (no duplicate liability)');
select pg_temp.must((select sum(i.amount) from public.entity_financing_instalments i join public.entity_financing_obligations o on o.id = i.obligation_id where o.provider_reference = 'PL-0001' and i.status <> 'void') = 1149, 'live instalments of the reference add to exactly the net price once');
select pg_temp.must((select sum(i.paid_amount) from public.entity_financing_instalments i join public.entity_financing_obligations o on o.id = i.obligation_id where o.provider_reference = 'PL-0001' and i.status = 'paid') = 287.25, 'only ONE live paid instalment of the reference (the voided one is not paid any more)');

-- ---------------------------------------------------------------- 5. refusals that protect reconciled / settled / linked records
-- linked to an asset: unlink first
select public.record_founder_asset_ownership('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', '11111111-1111-4111-8111-111111111101', 'The Founder', 'The Founder', 'The Founder', 'Photography retouching and related creative production', true, 'Founder statement: personally owned; company-funded; treatment pending', null, '00000000-0000-4000-8000-0000000000f0');
select public.link_acquisition_to_asset(pg_temp.i('f2'), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', '00000000-0000-4000-8000-0000000000f0');
select pg_temp.must(pg_temp.vd(pg_temp.i('f2')) ilike '%linked to an asset%', 'a linked acquisition cannot be voided until it is unlinked');
select public.unlink_acquisition_from_asset(pg_temp.i('f2'), 'Unlinked to correct the record', '00000000-0000-4000-8000-0000000000f0');
select pg_temp.must(pg_temp.vd(pg_temp.i('f2')) = '' and pg_temp.st(pg_temp.i('f2')) = 'void', 'after the audited unlink the void is allowed (all instalments pending)');
select pg_temp.must((select count(*) from pg_temp.ins(pg_temp.i('f2')) where status = 'void') = 4 and (select count(*) from public.entity_asset_ownership where status = 'current') = 1, 'the pending instalments are void and the ownership record is untouched');
-- settled financing
insert into t_ids values ('f3', pg_temp.fin('FIN-3', 'PL-0003'));
select public.mark_instalment_paid(i.id, current_date - 1, null, 'Synthetic confirmation: instalment shown as paid', '00000000-0000-4000-8000-0000000000f0') from public.entity_financing_instalments i join public.entity_financing_obligations o on o.id = i.obligation_id where o.acquisition_id = pg_temp.i('f3') and i.status = 'pending';
select pg_temp.must(pg_temp.vd(pg_temp.i('f3')) ilike '%already settled%', 'a settled financing is refused');
-- statement linked to an instalment
insert into t_ids values ('f4', pg_temp.fin('FIN-4', 'PL-0004'));
update public.entity_financing_instalments i set bank_evidence_document_id = '22222222-2222-4222-8222-222222222204' from public.entity_financing_obligations o where o.id = i.obligation_id and o.acquisition_id = pg_temp.i('f4') and i.sequence = 1;
select pg_temp.must(pg_temp.vd(pg_temp.i('f4')) ilike '%statement is already linked to an instalment%', 'a statement-verified instalment blocks the void');
-- statement linked to the acquisition
insert into t_ids values ('f5', pg_temp.fin('FIN-5', 'PL-0005', false));
update public.entity_equipment_acquisitions set bank_evidence_document_id = '22222222-2222-4222-8222-222222222204' where id = pg_temp.i('f5');
select pg_temp.must(pg_temp.vd(pg_temp.i('f5')) ilike '%statement is already linked to this acquisition%', 'a statement-verified acquisition blocks the void');

-- ---------------------------------------------------------------- 6. a non-financed purchase: its recorded payment is voided through the existing audited path
insert into t_ids values ('n1', pg_temp.bundle('BUN-1', 800, '{"arrangement":"deposit_and_balance","balanceDueOn":"2026-12-30"}'::jsonb, jsonb_build_object('kind','deposit','amount',300,'paidOn',(current_date - 1)::text,'method','company_debit_card','evidenceNote','debit card receipt kept by the Founder')));
select pg_temp.must(pg_temp.vd(pg_temp.i('n1')) = '' and pg_temp.st(pg_temp.i('n1')) = 'void', 'a non-financed acquisition is voided');
select pg_temp.must((select count(*) from public.entity_acquisition_payments where acquisition_id = pg_temp.i('n1') and status = 'void' and void_reason = 'Entered with a wrong value; voided to record a correction') = 1 and pg_temp.nev(pg_temp.i('n1'), 'payment_voided') = 1, 'its payment is void (kept) with its own audited event');
select pg_temp.must((select (detail ->> 'voidedPayments')::int = 1 and detail ->> 'financingReference' is null from public.entity_finance_events where acquisition_id = pg_temp.i('n1') and event_type = 'voided'), 'the void event records one voided payment and no financing');
select pg_temp.must((select count(*) from public.entity_acquisition_terms where acquisition_id = pg_temp.i('n1')) = 1, 'the recorded terms are kept');

-- ---------------------------------------------------------------- 7. isolation and nothing else touched
select pg_temp.must((select status from public.entity_equipment_acquisitions where id = pg_temp.i('f3')) = 'recorded' and (select status from public.entity_equipment_acquisitions where id = pg_temp.i('f4')) = 'recorded', 'refused voids left those records exactly as they were');
select pg_temp.must((select assets_h from t_b) = (select md5(string_agg(row_to_json(a)::text, '|' order by a.id)) from public.company_assets a), 'the asset register is unchanged');
select pg_temp.must((select assign_h from t_b) = (select md5(coalesce(string_agg(row_to_json(x)::text, '|' order by x.id), '')) from public.asset_assignments x), 'custody records are unchanged');
select pg_temp.must((select vault_h from t_b) = (select md5(string_agg(row_to_json(d)::text, '|' order by d.id)) from public.employing_entity_documents d), 'vault documents are unchanged');
select pg_temp.must((select exp_n from t_b) = (select count(*) from public.entity_expenses) and (select pay_n from t_b) = (select count(*) from public.payments), 'no expense and no client payment was created');
select pg_temp.must((select idx_h from t_b) = (select md5(string_agg(indexdef, '|' order by indexname)) from pg_indexes where tablename in ('entity_equipment_acquisitions','entity_financing_obligations','entity_financing_instalments')), 'the unique indexes are unchanged');
select pg_temp.must((select con_h from t_b) = (select md5(string_agg(conname || pg_get_constraintdef(oid), '|' order by conname)) from pg_constraint where conrelid in ('public.entity_equipment_acquisitions'::regclass, 'public.entity_financing_obligations'::regclass)), 'the acquisition and obligation constraints are unchanged');
select pg_temp.must((select count(*) from public.entity_finance_events where event_type = 'voided') = 3, 'one void event per voided acquisition (f1, f2, n1)');
