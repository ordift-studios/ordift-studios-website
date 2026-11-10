-- Rehearsal body for PROPOSAL_asset_ownership_and_acquisition_link.sql. Runs inside ONE transaction that rehearse_finance_stamp.sh ROLLS BACK. Local scratch database only. Synthetic users/entities.
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
create or replace function pg_temp.err(q text) returns text language plpgsql as $$ begin execute q; return ''; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.must(cond boolean, msg text) returns void language plpgsql as $$ begin if not coalesce(cond, false) then raise exception 'REHEARSAL FAILED: %', msg; end if; end $$;
create temp table t_ids (name text primary key, id uuid); grant all on t_ids to public;
create or replace function pg_temp.mk(inv text, ent uuid default '11111111-1111-4111-8111-111111111101') returns uuid language plpgsql as $$
declare r record;
begin select * into r from public.record_equipment_acquisition(jsonb_build_object('entityId', ent, 'acquisition', jsonb_build_object('supplier','Synthetic Supplier','invoiceNumber',inv,'purchaseDate','2026-11-01','itemDescription','Synthetic pen display','quantity',1,'currency','QAR','listPrice',1149,'discount',0,'net',1149,
  'invoiceDocumentId', case when ent = '11111111-1111-4111-8111-111111111101' then '22222222-2222-4222-8222-222222222201' else '22222222-2222-4222-8222-222222222205' end,'fundingStatus','to_confirm')), '00000000-0000-4000-8000-0000000000f0'); return r.acquisition_id; end $$;
-- two registered assets (the HR custody register; no entity column). The rehearsal NEVER writes to company_assets after this seed.
insert into public.company_assets (id, asset_identifier, description, category) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', 'SER-0001', 'Synthetic pen display', 'Graphics Pad'), ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02', 'SER-0002', 'Synthetic second item', 'Other');
create temp table t_asset_before as select md5(string_agg(row_to_json(a)::text, '|' order by a.id)) h, count(*) n from public.company_assets a;
insert into t_ids values ('a1', pg_temp.mk('ASSET-1')), ('a2', pg_temp.mk('ASSET-2')), ('b1', pg_temp.mk('GHA-1', '11111111-1111-4111-8111-111111111102'));
create or replace function pg_temp.i(n text) returns uuid language sql as $$ select id from t_ids where name = n $$;
create or replace function pg_temp.own(asset uuid, ent uuid, personal boolean default false, pnote text default null, doc uuid default null, actor uuid default '00000000-0000-4000-8000-0000000000f0') returns text language plpgsql as $$
begin perform public.record_asset_ownership(asset, ent, 'The Founder, as printed on the receipt', 'Photography retouching and graphic design for the company', personal, pnote, 'Founder statement: bought for the company; ownership documents pending', doc, actor); return ''; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.lnk(acq uuid, asset uuid, actor uuid default '00000000-0000-4000-8000-0000000000f0') returns text language plpgsql as $$
begin perform public.link_acquisition_to_asset(acq, asset, actor); return ''; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.linked(acq uuid) returns uuid language sql as $$ select company_asset_id from public.entity_equipment_acquisitions where id = acq $$;
\set A1 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01'
select pg_temp.must(pg_temp.lnk(pg_temp.i('a1'), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01') ilike '%no current ownership record%', 'no link without a recorded legal owner');
select pg_temp.must(pg_temp.own('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', '11111111-1111-4111-8111-111111111101', true, null) ilike '%ownership_personal_use_note%', 'incidental personal use needs a note');
select pg_temp.must(pg_temp.own('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', '11111111-1111-4111-8111-111111111101', false, null, '22222222-2222-4222-8222-222222222203') ilike '%THIS entity%', 'ownership evidence must belong to the owning entity');
select pg_temp.must(pg_temp.own('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', '11111111-1111-4111-8111-111111111101', false, null, actor => '00000000-0000-4000-8000-0000000000f1') ilike '%only a Super Admin%', 'an ordinary admin cannot record ownership');
select pg_temp.must(pg_temp.own('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', '11111111-1111-4111-8111-111111111101', true, 'Occasional personal use by the Founder; accountant to review any adjustment') = '', 'owner recorded: Qatar-style entity A, with incidental personal use flagged');
select pg_temp.must(pg_temp.own('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', '11111111-1111-4111-8111-111111111102') ilike '%ownership_one_current%', 'only ONE current owner per asset');
select pg_temp.must((select review_status from public.entity_asset_ownership) = 'pending_professional_review', 'ownership starts pending professional review');
select pg_temp.must(pg_temp.lnk(pg_temp.i('b1'), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01') ilike '%THIS legal entity%', 'an acquisition of ANOTHER legal entity cannot link to this asset (Qatar/Ghana separation)');
select pg_temp.must(pg_temp.lnk(pg_temp.i('a1'), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', '00000000-0000-4000-8000-0000000000f1') ilike '%only a Super Admin%', 'an ordinary admin cannot link');
select pg_temp.must(pg_temp.lnk(pg_temp.i('a1'), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01') = '', 'the acquisition is linked to the existing asset');
select pg_temp.must(pg_temp.linked(pg_temp.i('a1')) = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', 'the link is stored on the acquisition');
select pg_temp.must(pg_temp.lnk(pg_temp.i('a2'), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01') ilike '%acquisitions_one_per_asset%', 'ONE active acquisition per asset (no second financial record for the same asset)');
select pg_temp.must(pg_temp.lnk(pg_temp.i('a1'), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02') ilike '%cannot be changed%', 'an existing link cannot be changed');
select pg_temp.must(pg_temp.err($q$update public.entity_equipment_acquisitions set company_asset_id = null where invoice_number = 'ASSET-1'$q$) ilike '%cannot be changed or cleared%', 'an existing link cannot be cleared (not even by a direct update)');
select pg_temp.must(pg_temp.err($q$update public.entity_equipment_acquisitions set company_asset_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02' where invoice_number = 'ASSET-2'$q$) ilike '%no current ownership record%', 'a direct update cannot link an asset that has no recorded owner for this entity');
select pg_temp.must(pg_temp.err(format($q$select public.void_asset_ownership(%L, 'recorded against the wrong asset by mistake', '00000000-0000-4000-8000-0000000000f0')$q$, (select id from public.entity_asset_ownership))) ilike '%acquisition is linked%', 'ownership cannot be voided while an acquisition is linked');
select pg_temp.must((select count(*) from public.entity_finance_events where event_type = 'asset_linked') = 1 and (select count(*) from public.entity_finance_events where event_type = 'asset_ownership_recorded') = 1, 'audit events for the owner record and the link');
-- a VOIDED acquisition frees the asset; ownership can then be corrected
select pg_temp.must(pg_temp.err($q$update public.entity_equipment_acquisitions set status = 'void', void_reason = 'recorded in error for the rehearsal' where invoice_number = 'ASSET-1'$q$) = '', 'the first acquisition is voided');
select pg_temp.must(pg_temp.lnk(pg_temp.i('a2'), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01') = '', 'after the void, another acquisition can link to the same asset');
-- ownership of the second asset: record, void with a reason, correct
select pg_temp.must(pg_temp.own('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02', '11111111-1111-4111-8111-111111111101') = '', 'second asset owner recorded');
select pg_temp.must(pg_temp.err(format($q$select public.void_asset_ownership(%L, 'short', '00000000-0000-4000-8000-0000000000f0')$q$, (select id from public.entity_asset_ownership where asset_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02'))) ilike '%reason%', 'a void needs a written reason');
select pg_temp.must(pg_temp.err(format($q$select public.void_asset_ownership(%L, 'recorded against the wrong asset by mistake', '00000000-0000-4000-8000-0000000000f0')$q$, (select id from public.entity_asset_ownership where asset_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02'))) = '', 'an unlinked ownership record can be voided');
select pg_temp.must(pg_temp.own('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02', '11111111-1111-4111-8111-111111111102') = '', 'and corrected (new current record)');
-- append-only, privileges, the asset register untouched, nothing else created
select pg_temp.must(pg_temp.err($q$update public.entity_asset_ownership set business_purpose = 'edited purpose text here'$q$) ilike '%cannot be edited%', 'an ownership record cannot be edited');
select pg_temp.must(pg_temp.err($q$delete from public.entity_asset_ownership$q$) ilike '%append-only%', 'an ownership record cannot be deleted');
select pg_temp.must(not has_table_privilege('authenticated', 'public.entity_asset_ownership', 'insert') and not has_table_privilege('anon', 'public.entity_asset_ownership', 'update') and not has_table_privilege('service_role', 'public.entity_asset_ownership', 'delete') and not has_table_privilege('service_role', 'public.entity_asset_ownership', 'truncate'), 'no client write grants; service_role cannot delete');
select pg_temp.must(not has_function_privilege('authenticated', 'public.link_acquisition_to_asset(uuid, uuid, uuid)', 'execute') and not has_function_privilege('anon', 'public.record_asset_ownership(uuid, uuid, text, text, boolean, text, text, uuid, uuid)', 'execute') and has_function_privilege('service_role', 'public.void_asset_ownership(uuid, text, uuid)', 'execute'), 'the three functions are service_role-only');
select pg_temp.must((select count(*) from pg_class where relname = 'entity_asset_ownership' and relrowsecurity) = 1 and (select count(*) from pg_policies where tablename = 'entity_asset_ownership' and cmd = 'SELECT') = 1, 'RLS on, Super Admin read policy');
select pg_temp.must((select h from t_asset_before) = (select md5(string_agg(row_to_json(a)::text, '|' order by a.id)) from public.company_assets a) and (select n from t_asset_before) = (select count(*) from public.company_assets), 'the asset register rows are byte-identical: identifier, description, category, status, custody fields all untouched, and no asset was added');
select pg_temp.must((select count(*) from public.entity_expenses) = 0, 'no expense was created');
select 'ASSET LINK REHEARSAL PASSED' as result;
