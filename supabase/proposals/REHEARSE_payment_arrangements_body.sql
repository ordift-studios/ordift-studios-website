-- Rehearsal body for PROPOSAL_acquisition_payment_arrangements.sql. Runs inside ONE transaction that rehearse_finance_stamp.sh ROLLS BACK. Local scratch database only. Synthetic users/entities.
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

create or replace function pg_temp.err(q text) returns text language plpgsql as $$ begin execute q; return ''; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.must(cond boolean, msg text) returns void language plpgsql as $$ begin if not coalesce(cond, false) then raise exception 'REHEARSAL FAILED: %', msg; end if; end $$;
insert into public.employing_entity_documents (id, employing_entity_id, document_type, storage_path, uploaded_by, file_sha256, original_filename, mime_type, size_bytes) values
  ('22222222-2222-4222-8222-222222222205', '11111111-1111-4111-8111-111111111102', 'purchase_receipt', 'b/inv.jpg', '00000000-0000-4000-8000-0000000000f0', repeat('e', 64), 'ghana-invoice.jpg', 'image/jpeg', 1000) on conflict do nothing;
create temp table t_ids (name text primary key, id uuid);
grant all on t_ids to public;
-- an acquisition WITHOUT financing (outright / deposit / credit / unpaid) and one WITH PayLater-style financing
create or replace function pg_temp.mk(inv text, net numeric, fin boolean default false, ent uuid default '11111111-1111-4111-8111-111111111101') returns uuid language plpgsql as $$
declare r record; p jsonb;
begin
  p := jsonb_build_object('entityId', ent, 'acquisition', jsonb_build_object('supplier','Synthetic Supplier','invoiceNumber',inv,'purchaseDate','2026-11-01','itemDescription','Synthetic equipment','quantity',1,'currency','QAR','listPrice',net,'discount',0,'net',net,
    'invoiceDocumentId', case when ent = '11111111-1111-4111-8111-111111111101' then '22222222-2222-4222-8222-222222222201' else '22222222-2222-4222-8222-222222222205' end,'fundingStatus','to_confirm'));
  if fin then p := p || jsonb_build_object('financing', jsonb_build_object('provider','SyntheticPay','reference','REF-'||inv,'count',2,'plannedOn','2026-11-01','confirmationDocumentId','22222222-2222-4222-8222-222222222202','scheduleBasis','provider_schedule',
    'instalments', jsonb_build_array(jsonb_build_object('sequence',1,'amount',net/2,'expectedMonth','2026-11-01'), jsonb_build_object('sequence',2,'amount',net/2,'expectedMonth','2026-12-01')))); end if;
  select * into r from public.record_equipment_acquisition(p, '00000000-0000-4000-8000-0000000000f0');
  return r.acquisition_id;
end $$;
-- record a payment and return '' or the error text
create or replace function pg_temp.pay(acq uuid, kind text, amount numeric, paid_on date, method text default 'bank_transfer', note text default null, ref text default null, doc uuid default '22222222-2222-4222-8222-222222222202', evnote text default null, actor uuid default '00000000-0000-4000-8000-0000000000f0') returns text language plpgsql as $$
begin
  perform public.record_acquisition_payment(acq, kind, amount, paid_on, method, note, ref, doc, evnote, actor); return '';
exception when others then return sqlerrm; end $$;
create or replace function pg_temp.terms(acq uuid, arr text, due date default null, actor uuid default '00000000-0000-4000-8000-0000000000f0') returns text language plpgsql as $$
begin perform public.set_acquisition_terms(acq, arr, due, null, null, actor); return ''; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.paid(acq uuid) returns numeric language sql as $$ select coalesce(sum(amount), 0) from public.entity_acquisition_payments where acquisition_id = acq and status = 'recorded' $$;

insert into t_ids values ('out', pg_temp.mk('OUT-1', 2000)), ('dep', pg_temp.mk('DEP-1', 3000)), ('cr', pg_temp.mk('CR-1', 1500)), ('unp', pg_temp.mk('UNP-1', 1000)), ('fin', pg_temp.mk('FIN-1', 1149, true)), ('gh', pg_temp.mk('GH-1', 500, false, '11111111-1111-4111-8111-111111111102'));
create or replace function pg_temp.i(n text) returns uuid language sql as $$ select id from t_ids where name = n $$;

-- 1. outright / full payment: no financing agreement, payment with method + evidence; reported, never bank-verified (there is no such column)
select pg_temp.must(pg_temp.pay(pg_temp.i('out'), 'full', 2000, '2026-11-02', 'company_credit_card') = '', 'a full payment of the net price is recorded');
select pg_temp.must(pg_temp.paid(pg_temp.i('out')) = 2000, 'paid total = net');
select pg_temp.must(not exists (select 1 from information_schema.columns where table_name in ('entity_acquisition_payments', 'entity_acquisition_terms') and (column_name like '%bank%' or column_name like '%verif%' or column_name like '%statement%')), 'no verification / statement column exists');
select pg_temp.must(pg_temp.pay(pg_temp.i('out'), 'part', 1, '2026-11-02', 'cash', evnote => 'cash handed over, note of at least ten') ilike '%would total%', 'cannot exceed the net price (one more unit refused)');
select pg_temp.must((select count(*) from public.entity_expenses) = 0 and (select count(*) from public.entity_equipment_acquisitions) = 6, 'nothing created an expense; no extra acquisition');
-- 2. validation: every refusal leaves nothing behind
select pg_temp.must(pg_temp.pay(pg_temp.i('dep'), 'full', 1000, '2026-11-02') ilike '%full payment must equal%', 'a "full" payment must equal the net price');
select pg_temp.must(pg_temp.pay(pg_temp.i('dep'), 'deposit', 1000, current_date + 1) ilike '%future%', 'future dates refused');
select pg_temp.must(pg_temp.pay(pg_temp.i('dep'), 'deposit', 1000, '2026-11-02', doc => null, evnote => null) ilike '%payments_evidence%', 'evidence (document or note) is required');
select pg_temp.must(pg_temp.pay(pg_temp.i('dep'), 'deposit', 1000, '2026-11-02', doc => null, evnote => 'too short') ilike '%payments_evidence%', 'a note under 10 characters is not evidence');
select pg_temp.must(pg_temp.pay(pg_temp.i('dep'), 'deposit', 1000, '2026-11-02', doc => '22222222-2222-4222-8222-222222222203') ilike '%THIS entity%', 'evidence from another legal entity refused (Qatar/Ghana separation)');
select pg_temp.must(pg_temp.pay(pg_temp.i('dep'), 'deposit', 1000, '2026-11-02', method => 'other') ilike '%payments_other_method%', 'method "other" needs a description');
select pg_temp.must(pg_temp.pay(pg_temp.i('dep'), 'deposit', 1000, '2026-11-02', method => 'bitcoin') ilike '%violates check%', 'unknown methods refused');
select pg_temp.must(pg_temp.pay(pg_temp.i('dep'), 'deposit', 1000, '2026-11-02', actor => '00000000-0000-4000-8000-0000000000f1') ilike '%only a Super Admin%', 'an ordinary admin cannot record a payment');
select pg_temp.must(pg_temp.err($q$insert into public.entity_acquisition_payments (employing_entity_id, acquisition_id, kind, amount, currency, paid_on, method, evidence_note, recorded_by)
  select employing_entity_id, id, 'part', 10, 'USD', '2026-11-02', 'cash', 'a direct insert in the wrong currency', '00000000-0000-4000-8000-0000000000f0' from public.entity_equipment_acquisitions where invoice_number = 'DEP-1'$q$) ilike '%must be the acquisition currency%', 'currency must equal the acquisition currency (also for a direct insert)');
select pg_temp.must(pg_temp.err($q$insert into public.entity_acquisition_payments (employing_entity_id, acquisition_id, kind, amount, currency, paid_on, method, evidence_note, recorded_by)
  select '11111111-1111-4111-8111-111111111102', id, 'part', 10, 'QAR', '2026-11-02', 'cash', 'a direct insert naming the wrong entity', '00000000-0000-4000-8000-0000000000f0' from public.entity_equipment_acquisitions where invoice_number = 'DEP-1'$q$) ilike '%another entity%', 'the payment entity must be the acquisition entity (also for a direct insert)');
select pg_temp.must(pg_temp.paid(pg_temp.i('dep')) = 0, 'no refused payment left a row');
-- 3. deposit and balance, with a due date; totals add up; settlement is derived, never stored
select pg_temp.must(pg_temp.terms(pg_temp.i('dep'), 'deposit_and_balance', '2026-12-15') = '', 'terms: deposit and balance with a due date');
select pg_temp.must(pg_temp.terms(pg_temp.i('dep'), 'deposit_and_balance', '2026-10-01') ilike '%before the purchase date%', 'the balance cannot be due before the purchase');
select pg_temp.must(pg_temp.pay(pg_temp.i('dep'), 'deposit', 1000, '2026-11-02', 'bank_transfer', ref => 'TRF-1') = '', 'deposit recorded');
select pg_temp.must(pg_temp.pay(pg_temp.i('dep'), 'deposit', 1000, '2026-11-02', 'bank_transfer', ref => 'TRF-1') ilike '%identical payment%', 'an identical payment is refused as a duplicate');
select pg_temp.must(pg_temp.pay(pg_temp.i('dep'), 'balance', 2001, '2026-11-09') ilike '%would total%', 'balance above the remainder refused');
select pg_temp.must(pg_temp.pay(pg_temp.i('dep'), 'balance', 2000, '2026-11-09', 'cheque', ref => 'CHQ-77') = '', 'balance recorded');
select pg_temp.must(pg_temp.paid(pg_temp.i('dep')) = 3000, 'total = net');
-- 4. supplier credit needs a due date; unpaid blocks payments; terms are versioned
select pg_temp.must(pg_temp.terms(pg_temp.i('cr'), 'supplier_credit') ilike '%terms_due_shape%', 'supplier credit needs a due date');
select pg_temp.must(pg_temp.terms(pg_temp.i('cr'), 'supplier_credit', '2026-12-31') = '', 'supplier credit with a due date');
select pg_temp.must(pg_temp.terms(pg_temp.i('cr'), 'paid_in_full', '2026-12-31') ilike '%terms_due_shape%', 'paid in full carries no due date');
select pg_temp.must(pg_temp.terms(pg_temp.i('unp'), 'unpaid') = '', 'terms: unpaid');
select pg_temp.must(pg_temp.pay(pg_temp.i('unp'), 'part', 10, '2026-11-02') ilike '%"unpaid"%', 'no payment while the arrangement is unpaid');
select pg_temp.must(pg_temp.terms(pg_temp.i('unp'), 'supplier_credit', '2026-12-01') = '', 'terms can be changed');
select pg_temp.must((select count(*) from public.entity_acquisition_terms where acquisition_id = pg_temp.i('unp')) = 2 and (select count(*) from public.entity_acquisition_terms where acquisition_id = pg_temp.i('unp') and status = 'current') = 1, 'a change supersedes: two versions, one current');
select pg_temp.must(pg_temp.terms(pg_temp.i('out'), 'unpaid') ilike '%already recorded%', 'cannot declare "unpaid" when payments exist');
-- 5. financed acquisitions: no direct payments, no terms (no double counting); the instalment workflow is untouched
select pg_temp.must(pg_temp.pay(pg_temp.i('fin'), 'part', 100, '2026-11-02') ilike '%twice%', 'a financed acquisition refuses direct payments');
select pg_temp.must(pg_temp.terms(pg_temp.i('fin'), 'paid_in_full') ilike '%financed acquisition%', 'a financed acquisition cannot carry payment terms');
select pg_temp.must((select count(*) from public.entity_financing_instalments) = 2 and (select count(*) from public.entity_financing_obligations) = 1, 'the financing records are unchanged');
-- 6. Ghana entity is separate: its own acquisition, its own documents
select pg_temp.must(pg_temp.pay(pg_temp.i('gh'), 'full', 500, '2026-11-02', doc => '22222222-2222-4222-8222-222222222203') = '', 'the Ghana entity records its own payment with its own document');
select pg_temp.must(pg_temp.pay(pg_temp.i('gh'), 'part', 1, '2026-11-02', doc => '22222222-2222-4222-8222-222222222202') ilike '%THIS entity%' or pg_temp.pay(pg_temp.i('gh'), 'part', 1, '2026-11-03', doc => '22222222-2222-4222-8222-222222222202') ilike '%THIS entity%', 'the Ghana entity cannot use a Qatar document');
-- 7. append-only: edit and delete refused; a void needs a reason, frees the amount, and can happen once
select pg_temp.must(pg_temp.err($q$update public.entity_acquisition_payments set amount = 1$q$) ilike '%cannot be edited%', 'a payment cannot be edited');
select pg_temp.must(pg_temp.err($q$delete from public.entity_acquisition_payments$q$) ilike '%append-only%', 'a payment cannot be deleted');
select pg_temp.must(pg_temp.err($q$delete from public.entity_acquisition_terms$q$) ilike '%append-only%', 'terms cannot be deleted');
select pg_temp.must(pg_temp.err($q$update public.entity_acquisition_terms set arrangement = 'unpaid'$q$) ilike '%superseded%', 'terms cannot be edited');
select pg_temp.must(pg_temp.err(format($q$select public.void_acquisition_payment(%L, 'short', '00000000-0000-4000-8000-0000000000f0')$q$, (select id from public.entity_acquisition_payments where acquisition_id = pg_temp.i('out') limit 1))) ilike '%reason%', 'void needs a written reason');
select pg_temp.must(pg_temp.err(format($q$select public.void_acquisition_payment(%L, 'entered against the wrong purchase', '00000000-0000-4000-8000-0000000000f0')$q$, (select id from public.entity_acquisition_payments where acquisition_id = pg_temp.i('out') limit 1))) = '', 'a void is accepted');
select pg_temp.must(pg_temp.paid(pg_temp.i('out')) = 0, 'a void frees the amount');
select pg_temp.must(pg_temp.err(format($q$select public.void_acquisition_payment(%L, 'entered against the wrong purchase', '00000000-0000-4000-8000-0000000000f0')$q$, (select id from public.entity_acquisition_payments where acquisition_id = pg_temp.i('out') limit 1))) ilike '%not recorded%', 'a void cannot be repeated');
select pg_temp.must(pg_temp.pay(pg_temp.i('out'), 'full', 2000, '2026-11-03', 'cash', evnote => 'cash receipt seen, corrected entry') = '', 'the corrected payment is accepted after the void');
-- 8. audit and privileges
select pg_temp.must((select count(*) from public.entity_finance_events where event_type = 'payment_recorded') = (select count(*) from public.entity_acquisition_payments), 'one payment_recorded event per payment (including voided ones)');
select pg_temp.must((select count(*) from public.entity_finance_events where event_type = 'payment_voided') = 1 and (select count(*) from public.entity_finance_events where event_type = 'terms_set') = (select count(*) from public.entity_acquisition_terms), 'void and terms events written');
select pg_temp.must(not exists (select 1 from public.entity_finance_events where event_type = 'payment_recorded' and (detail ->> 'bankVerified') <> 'false'), 'no event ever claims bank verification');
select pg_temp.must(not has_table_privilege('authenticated', 'public.entity_acquisition_payments', 'insert') and not has_table_privilege('authenticated', 'public.entity_acquisition_payments', 'update') and not has_table_privilege('anon', 'public.entity_acquisition_terms', 'insert')
  and not has_table_privilege('service_role', 'public.entity_acquisition_payments', 'delete') and not has_table_privilege('service_role', 'public.entity_acquisition_terms', 'delete') and not has_table_privilege('service_role', 'public.entity_acquisition_payments', 'truncate'), 'no client write grants; service_role cannot delete');
select pg_temp.must(not has_function_privilege('authenticated', 'public.record_acquisition_payment(uuid, text, numeric, date, text, text, text, uuid, text, uuid)', 'execute') and not has_function_privilege('anon', 'public.set_acquisition_terms(uuid, text, date, text, text, uuid)', 'execute')
  and has_function_privilege('service_role', 'public.void_acquisition_payment(uuid, text, uuid)', 'execute'), 'the three functions are service_role-only');
select pg_temp.must((select count(*) from pg_class where relname in ('entity_acquisition_terms', 'entity_acquisition_payments') and relrowsecurity) = 2 and (select count(*) from pg_policies where tablename in ('entity_acquisition_terms', 'entity_acquisition_payments') and cmd = 'SELECT') = 2, 'RLS on, Super Admin read policies');
select pg_temp.must((select count(*) from public.entity_expenses) = 0, 'still no expense anywhere');

select 'PAYMENT ARRANGEMENTS REHEARSAL PASSED' as result;
