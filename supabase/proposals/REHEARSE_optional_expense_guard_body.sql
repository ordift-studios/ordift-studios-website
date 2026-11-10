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

-- one recorded acquisition (invoice INV-1001 from 'Synthetic Supplier') for the guard to protect
select public.record_equipment_acquisition(pg_temp.payload('INV-1001', pg_temp.four()), '00000000-0000-4000-8000-0000000000f0');
-- the optional guard: the same invoice cannot also become an expense; a different one can
select pg_temp.must(pg_temp.err($q$insert into public.entity_expenses (employing_entity_id, expense_date, amount, currency, category, line_code, description, receipt_number, receipt_total, issuing_authority, recorded_by)
  values ('11111111-1111-4111-8111-111111111101', '2026-11-08', 1149, 'QAR', 'other', 'L1', 'Duplicate of the acquisition', 'INV-1001', 1149, 'Synthetic Supplier', '00000000-0000-4000-8000-0000000000f0')$q$) ilike '%already recorded as an equipment acquisition%', 'no double recognition');
select pg_temp.must(pg_temp.err($q$insert into public.entity_expenses (employing_entity_id, expense_date, amount, currency, category, line_code, description, receipt_number, receipt_total, issuing_authority, recorded_by)
  values ('11111111-1111-4111-8111-111111111101', '2026-11-08', 10, 'QAR', 'other', 'L1', 'Unrelated', '999', 10, 'Synthetic Supplier', '00000000-0000-4000-8000-0000000000f0')$q$) = '', 'an unrelated expense is unaffected');


select 'OPTIONAL EXPENSE GUARD REHEARSAL PASSED' as result;
