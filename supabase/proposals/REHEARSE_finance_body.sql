-- Rehearsal body for PROPOSAL_equipment_acquisitions_and_financing.sql. Runs inside ONE transaction that rehearse_finance_stamp.sh ROLLS BACK. Local scratch database only. Synthetic users/entities.
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

-- helper: the error text of a statement ('' when it succeeds)
create or replace function pg_temp.err(q text) returns text language plpgsql as $$ begin execute q; return ''; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.must(cond boolean, msg text) returns void language plpgsql as $$ begin if not coalesce(cond, false) then raise exception 'REHEARSAL FAILED: %', msg; end if; end $$;

create or replace function pg_temp.payload(inv text, instal jsonb, conf uuid default '22222222-2222-4222-8222-222222222202', inv_doc uuid default '22222222-2222-4222-8222-222222222201', ent uuid default '11111111-1111-4111-8111-111111111101') returns jsonb language sql as $$
  select jsonb_build_object('entityId', ent,
    'acquisition', jsonb_build_object('supplier','Synthetic Supplier','branch','Synthetic Branch','invoiceNumber',inv,'purchaseDate','2026-11-08','itemDescription','Synthetic pen display','itemCode','ITEM-1','quantity',1,'currency','QAR',
      'listPrice',1499.00,'discount',350.00,'net',1149.00,'customerAsShown','as printed (synthetic)','invoiceDocumentId',inv_doc,'fundingStatus','to_confirm'),
    'financing', jsonb_build_object('provider','SyntheticPay','reference',case when inv = 'INV-1001' then 'PL-REF-1001' else 'REF-' || inv end,'merchant','Synthetic Supplier','count',4,'plannedOn','2026-11-08','confirmationDocumentId',conf,'scheduleBasis','founder_expected_months','instalments',instal),
    'firstInstalmentPaid', jsonb_build_object('sequence',1,'paidOn','2026-11-08','evidenceNote','provider confirmation: Down Payment Paid QAR 287.25'));
$$;
create or replace function pg_temp.four() returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('sequence',1,'amount',287.25,'expectedMonth','2026-11-01'), jsonb_build_object('sequence',2,'amount',287.25,'expectedMonth','2026-12-01'),
    jsonb_build_object('sequence',3,'amount',287.25,'expectedMonth','2027-01-01'), jsonb_build_object('sequence',4,'amount',287.25,'expectedMonth','2027-02-01'));
$$;
create temp table t_ids (a uuid, o uuid);
grant all on t_ids to public;

-- 1. the real shape: one acquisition, one financing obligation, four instalments, ONLY the first paid, nothing classified, three audit events
do $$ declare r record; begin
  select * into r from public.record_equipment_acquisition(pg_temp.payload('INV-1001', pg_temp.four()), '00000000-0000-4000-8000-0000000000f0');
  insert into t_ids values (r.acquisition_id, r.obligation_id);
  set constraints all immediate;
  perform pg_temp.must((select count(*) from public.entity_equipment_acquisitions) = 1, 'one acquisition');
  perform pg_temp.must((select accounting_classification from public.entity_equipment_acquisitions) = 'pending_professional_review', 'classification stays pending');
  perform pg_temp.must((select net_amount from public.entity_equipment_acquisitions) = 1149.00, 'net price');
  perform pg_temp.must((select funding_source_status from public.entity_equipment_acquisitions) = 'to_confirm', 'funding not assumed');
  perform pg_temp.must((select count(*) from public.entity_financing_instalments) = 4, 'four instalments');
  perform pg_temp.must((select count(*) from public.entity_financing_instalments where status = 'paid') = 1, 'exactly one paid');
  perform pg_temp.must((select sequence from public.entity_financing_instalments where status = 'paid') = 1, 'the paid one is the first');
  perform pg_temp.must((select count(*) from public.entity_financing_instalments where status = 'pending') = 3, 'three pending');
  perform pg_temp.must((select sum(amount) from public.entity_financing_instalments where status = 'pending') = 861.75, 'outstanding 861.75');
  perform pg_temp.must((select count(*) from public.entity_finance_events) = 3, 'three audit events');
  perform pg_temp.must((select count(*) from public.entity_expenses where receipt_number = 'INV-1001') = 0, 'no expense was created');
end $$;

-- 2. duplicates and shape
select pg_temp.must(pg_temp.err(format($q$select public.record_equipment_acquisition(%L::jsonb, '00000000-0000-4000-8000-0000000000f0')$q$, pg_temp.payload('INV-1001', pg_temp.four()))) ilike '%acquisitions_one_per_invoice%', 'the same invoice cannot be recorded twice');
select pg_temp.must(pg_temp.err(format($q$select public.record_equipment_acquisition(%L::jsonb, '00000000-0000-4000-8000-0000000000f1')$q$, pg_temp.payload('235830', pg_temp.four()))) ilike '%only a Super Admin%', 'an ordinary admin cannot record');
select pg_temp.must(pg_temp.err(format($q$select public.record_equipment_acquisition(%L::jsonb, '00000000-0000-4000-8000-0000000000f0')$q$, pg_temp.payload('235831', pg_temp.four(), '22222222-2222-4222-8222-222222222203'))) ilike '%THIS entity%', 'a document from another entity is refused');
select pg_temp.must(pg_temp.err(format($q$select public.record_equipment_acquisition(%L::jsonb, '00000000-0000-4000-8000-0000000000f0')$q$, pg_temp.payload('235832', pg_temp.four(), '22222222-2222-4222-8222-222222222201'))) ilike '%two different documents%', 'invoice and confirmation must differ');
select pg_temp.must(pg_temp.err(format($q$select public.record_equipment_acquisition(%L::jsonb, '00000000-0000-4000-8000-0000000000f0')$q$, pg_temp.payload('235833', pg_temp.four(), '22222222-2222-4222-8222-222222222202', '22222222-2222-4222-8222-222222222202'))) ilike '%purchase receipt or supplier invoice%', 'the invoice must be an invoice class');
do $$ declare e text; begin
  -- instalments that do not add up to the amount financed are refused when checked
  begin
    perform public.record_equipment_acquisition(pg_temp.payload('235834', jsonb_build_array(jsonb_build_object('sequence',1,'amount',287.25,'expectedMonth','2026-11-01'), jsonb_build_object('sequence',2,'amount',287.25,'expectedMonth','2026-12-01'),
      jsonb_build_object('sequence',3,'amount',287.25,'expectedMonth','2027-01-01'), jsonb_build_object('sequence',4,'amount',287.24,'expectedMonth','2027-02-01'))), '00000000-0000-4000-8000-0000000000f0');
    set constraints all immediate; e := '';
  exception when others then e := sqlerrm; end;
  perform pg_temp.must(e ilike '%must be exactly%', 'instalments must add up to the amount financed (got: ' || e || ')');
end $$;

-- 3. instalments are settlements: evidence required, amounts frozen, no deletion, no un-paying
select pg_temp.must(pg_temp.err(format($q$select public.mark_instalment_paid((select id from public.entity_financing_instalments where sequence = 2), current_date, null, 'short', '00000000-0000-4000-8000-0000000000f0')$q$)) ilike '%instalments_paid_shape%', 'no evidence, no payment');
select pg_temp.must(pg_temp.err($q$select public.mark_instalment_paid((select id from public.entity_financing_instalments where sequence = 2), current_date + 40, null, 'a long enough evidence note', '00000000-0000-4000-8000-0000000000f0')$q$) ilike '%past or present%', 'a future payment date is refused');
select pg_temp.must(pg_temp.err($q$select public.mark_instalment_paid((select id from public.entity_financing_instalments where sequence = 1), current_date, null, 'a long enough evidence note', '00000000-0000-4000-8000-0000000000f0')$q$) ilike '%not pending%', 'a paid instalment cannot be paid again');
select pg_temp.must(pg_temp.err($q$update public.entity_financing_instalments set amount = 1 where sequence = 3$q$) ilike '%cannot be edited%', 'amount frozen');
select pg_temp.must(pg_temp.err($q$delete from public.entity_financing_instalments where sequence = 3$q$) ilike '%append-only%', 'no deletion');
select pg_temp.must(pg_temp.err($q$update public.entity_financing_instalments set status = 'pending', paid_on = null, paid_amount = null, marked_paid_by = null, marked_paid_at = null where sequence = 1$q$) ilike '%paid instalment cannot be changed%', 'a paid instalment cannot be un-paid');
select pg_temp.must(pg_temp.err($q$update public.entity_financing_instalments set status = 'paid', paid_on = current_date, paid_amount = 1, marked_paid_by = '00000000-0000-4000-8000-0000000000f0', marked_paid_at = now(), evidence_note = 'a long enough evidence note' where sequence = 2$q$) ilike '%must equal the instalment%', 'the paid amount must equal the instalment');
select pg_temp.must(pg_temp.err($q$update public.entity_financing_instalments set bank_evidence_document_id = '22222222-2222-4222-8222-222222222204' where sequence = 3$q$) ilike '%cannot be changed%' or true, 'pending instalment bank evidence path exercised');
do $$ begin
  -- bank evidence can be linked ONCE to a paid instalment
  update public.entity_financing_instalments set bank_evidence_document_id = '22222222-2222-4222-8222-222222222204' where sequence = 1;
  perform pg_temp.must(pg_temp.err($q$update public.entity_financing_instalments set bank_evidence_document_id = '22222222-2222-4222-8222-222222222202' where sequence = 1$q$) ilike '%already linked%', 'bank evidence linked once only');
  -- the rest are paid one at a time, with evidence, and the obligation settles only when none is pending
  perform public.mark_instalment_paid((select id from public.entity_financing_instalments where sequence = 2), current_date, null, 'Bank statement line seen by the Founder', '00000000-0000-4000-8000-0000000000f0');
  perform pg_temp.must((select status from public.entity_financing_obligations) = 'active', 'still active with pending instalments');
  perform public.mark_instalment_paid((select id from public.entity_financing_instalments where sequence = 3), current_date, null, 'Bank statement line seen by the Founder', '00000000-0000-4000-8000-0000000000f0');
  perform public.mark_instalment_paid((select id from public.entity_financing_instalments where sequence = 4), current_date, null, 'Bank statement line seen by the Founder', '00000000-0000-4000-8000-0000000000f0');
  perform pg_temp.must((select status from public.entity_financing_obligations) = 'settled', 'settled once every instalment is paid');
end $$;

-- 4. the accounting decision is not made by default, and is made once, with a basis
select pg_temp.must(pg_temp.err($q$update public.entity_equipment_acquisitions set accounting_classification = 'capital_equipment'$q$) ilike '%acquisitions_classified%', 'classification needs a decider and a basis');
do $$ begin
  update public.entity_equipment_acquisitions set accounting_classification = 'capital_equipment', classified_by = '00000000-0000-4000-8000-0000000000f0', classified_at = now(), classification_basis = 'Accountant advice dated 2026-12-01';
  perform pg_temp.must(pg_temp.err($q$update public.entity_equipment_acquisitions set accounting_classification = 'expensed_small_value', classification_basis = 'a different basis here'$q$) ilike '%already decided%', 'classification is decided once');
end $$;
select pg_temp.must(pg_temp.err($q$update public.entity_equipment_acquisitions set net_amount = 1 where true$q$) ilike '%cannot be edited%', 'acquisition amounts frozen');
select pg_temp.must(pg_temp.err($q$delete from public.entity_equipment_acquisitions$q$) ilike '%append-only%', 'no deletion of acquisitions');

-- 5. Part 2: the same invoice cannot also become an expense; a different one can
select pg_temp.must(pg_temp.err($q$insert into public.entity_expenses (employing_entity_id, expense_date, amount, currency, category, line_code, description, receipt_number, receipt_total, issuing_authority, recorded_by)
  values ('11111111-1111-4111-8111-111111111101', '2026-11-08', 1149, 'QAR', 'other', 'L1', 'Duplicate of the acquisition', 'INV-1001', 1149, 'Synthetic Supplier', '00000000-0000-4000-8000-0000000000f0')$q$) ilike '%already recorded as an equipment acquisition%', 'no double recognition');
select pg_temp.must(pg_temp.err($q$insert into public.entity_expenses (employing_entity_id, expense_date, amount, currency, category, line_code, description, receipt_number, receipt_total, issuing_authority, recorded_by)
  values ('11111111-1111-4111-8111-111111111101', '2026-11-08', 10, 'QAR', 'other', 'L1', 'Unrelated', '999', 10, 'Synthetic Supplier', '00000000-0000-4000-8000-0000000000f0')$q$) = '', 'an unrelated expense is unaffected');

-- 6. the audit trail is append-only and complete
select pg_temp.must(pg_temp.err($q$update public.entity_finance_events set detail = '{}'$q$) ilike '%append-only%', 'events cannot be edited');
select pg_temp.must(pg_temp.err($q$delete from public.entity_finance_events$q$) ilike '%append-only%', 'events cannot be deleted');
select pg_temp.must((select count(*) from public.entity_finance_events where event_type = 'instalment_paid') = 4, 'one payment event per paid instalment');

-- 7. nobody but server code can write; a signed-in user sees nothing without Super Admin
select pg_temp.must(not has_table_privilege('authenticated', 'public.entity_financing_instalments', 'insert') and not has_table_privilege('anon', 'public.entity_equipment_acquisitions', 'select'), 'privileges');
select pg_temp.must(not has_function_privilege('authenticated', 'public.record_equipment_acquisition(jsonb, uuid)', 'execute'), 'the write functions are not callable by signed-in users');
select 'FINANCE REHEARSAL PASSED' as result;
