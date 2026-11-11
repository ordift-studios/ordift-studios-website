-- Rehearsal body for migration 0192 (asset-link idempotency). Runs inside ONE transaction that rehearse_finance_stamp.sh ROLLS BACK. Local scratch database only. Synthetic users/entities.
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
insert into public.company_assets (id, asset_identifier, description, category) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', 'SER-Q', 'Synthetic Qatar pen display', 'Pad'), ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02', 'SER-L', 'Synthetic legal-entity item', 'Other'), ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03', 'SER-G', 'Synthetic Ghana item', 'Other');
create temp table t_before as select (select md5(string_agg(row_to_json(a)::text, '|' order by a.id)) from public.company_assets a) assets_h, (select md5(coalesce(string_agg(row_to_json(x)::text, '|' order by x.id), '')) from public.asset_assignments x) assign_h,
  (select md5(string_agg(row_to_json(d)::text, '|' order by d.id)) from public.employing_entity_documents d) vault_h;
insert into t_ids values ('q_funded', pg_temp.mk('Q-1', 'company_account')), ('q_tbc', pg_temp.mk('Q-2', 'to_confirm')), ('g_funded', pg_temp.mk('G-1', 'company_account', '11111111-1111-4111-8111-111111111102'));
create or replace function pg_temp.i(n text) returns uuid language sql as $$ select id from t_ids where name = n $$;
create or replace function pg_temp.fo(asset uuid, ent uuid, basis text default 'Founder statement: personally owned; payments funded with the company card; treatment pending', funded boolean default true, actor uuid default '00000000-0000-4000-8000-0000000000f0') returns text language plpgsql as $$
begin perform public.record_founder_asset_ownership(asset, ent, 'The Founder, as printed on the receipt', 'The Founder', 'The Founder (personal PayLater account)', 'Photography retouching and related creative production', funded, basis, null, actor); return ''; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.lnk(acq uuid, asset uuid) returns text language plpgsql as $$ begin perform public.link_acquisition_to_asset(acq, asset, '00000000-0000-4000-8000-0000000000f0'); return ''; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.unl(acq uuid, reason text, actor uuid default '00000000-0000-4000-8000-0000000000f0') returns text language plpgsql as $$ begin perform public.unlink_acquisition_from_asset(acq, reason, actor); return ''; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.linked(acq uuid) returns uuid language sql as $$ select company_asset_id from public.entity_equipment_acquisitions where id = acq $$;

create or replace function pg_temp.nev() returns bigint language sql as $$ select count(*) from public.entity_finance_events where event_type = 'asset_linked' $$;
-- the owner record the link needs (Founder-personal, filed under entity A)
select pg_temp.fo('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', '11111111-1111-4111-8111-111111111101') ;
select pg_temp.must(has_function_privilege('service_role', 'public.link_acquisition_to_asset(uuid, uuid, uuid)', 'execute') and not has_function_privilege('authenticated', 'public.link_acquisition_to_asset(uuid, uuid, uuid)', 'execute') and not has_function_privilege('anon', 'public.link_acquisition_to_asset(uuid, uuid, uuid)', 'execute'), 'the grants are unchanged (service_role only)');
select pg_temp.must((select prosecdef and exists (select 1 from unnest(proconfig) c where c in ('search_path=""', 'search_path=')) from pg_proc where oid = 'public.link_acquisition_to_asset(uuid, uuid, uuid)'::regprocedure), 'the function is still security definer with an empty search_path');
select pg_temp.must(pg_temp.lnk(pg_temp.i('q_funded'), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01') = '', 'the FIRST link is accepted');
select pg_temp.must(pg_temp.linked(pg_temp.i('q_funded')) = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01' and pg_temp.nev() = 1, 'the acquisition is linked and exactly one asset_linked event exists');
select pg_temp.must(pg_temp.lnk(pg_temp.i('q_funded'), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01') ilike '%already linked to an asset%', 'a REPEATED link of the same asset is refused');
select pg_temp.must(pg_temp.lnk(pg_temp.i('q_funded'), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02') ilike '%already linked to an asset%' or pg_temp.lnk(pg_temp.i('q_funded'), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02') ilike '%cannot be changed or cleared%' or pg_temp.lnk(pg_temp.i('q_funded'), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02') ilike '%no current ownership record%', 'a link to a DIFFERENT asset is refused too');
select pg_temp.must(pg_temp.nev() = 1, 'still exactly ONE asset_linked event after the repeated attempts');

select pg_temp.must(pg_temp.unl(pg_temp.i('q_funded'), 'Unlinked to correct the record') = '' and true, 'an audited unlink still works');
select pg_temp.must(pg_temp.linked(pg_temp.i('q_funded')) is null, 'the link is cleared by the audited unlink');
select pg_temp.must(pg_temp.lnk(pg_temp.i('q_funded'), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01') = '', 'after the unlink the acquisition can be linked again');
select pg_temp.must(pg_temp.nev() = 2, 'two asset_linked events in total: the first link and the deliberate re-link (the repeated attempts added none)');
select pg_temp.must(pg_temp.lnk(pg_temp.i('q_tbc'), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01') <> '', 'a second acquisition cannot take an asset that is already linked (the 0188 guards are untouched)');
select pg_temp.must((select assets_h from t_before) = (select md5(string_agg(row_to_json(a)::text, '|' order by a.id)) from public.company_assets a), 'the asset register is unchanged');
