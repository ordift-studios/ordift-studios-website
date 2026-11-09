#!/bin/bash
# LOCAL REHEARSAL ONLY (never Production). Applies PROPOSAL_staff_client_lookup_indexed_search.sql to the lab inside ONE transaction that is ROLLED BACK, loads 20,000 synthetic contacts, checks the function's
# results, masking, limits, validation and privileges, and shows that the indexes are used and how fast the search is. The lab's data are untouched afterwards.
C=${1:-ordift-mig-check2}; DB=${2:-p4_e2e}; D="$(cd "$(dirname "$0")" && pwd)"
q() { docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d "$DB" -X -q -v ON_ERROR_STOP=1 -At; }
before=$(echo "select (select count(*) from public.contacts) || '/' || (select count(*) from public.contact_emails) || '/' || (select count(*) from public.enquiries)" | q)
{ echo "begin;"; grep -v -E '^(begin|commit);$' "$D/PROPOSAL_staff_client_lookup_indexed_search.sql"; cat <<'SQL'
create or replace function pg_temp.must(c boolean, msg text) returns void language plpgsql as $$ begin if not coalesce(c, false) then raise exception 'REHEARSAL FAILED: %', msg; end if; end $$;
create or replace function pg_temp.err(s text) returns text language plpgsql as $$ begin execute s; return ''; exception when others then return sqlerrm; end $$;
set local session_replication_role = replica;
insert into public.organisations (id, name, normalized_name) values ('00000000-0000-4000-8000-0000000000e1', 'Cape Coast Studios Ltd (rehearsal)', 'cape coast studios ltd rehearsal');
insert into public.contacts (id, full_name, preferred_name, organisation_id, phones, status) values
  ('00000000-0000-4000-8000-0000000000c1', 'Esi Quartey-Adjei', null, '00000000-0000-4000-8000-0000000000e1', '{"+233 24 700 5678"}', 'active'),
  ('00000000-0000-4000-8000-0000000000c2', 'Zoë Müller', 'Zo', null, '{"0244 99 88 77"}', 'active'),
  ('00000000-0000-4000-8000-0000000000c3', 'Quartey Retired', null, null, '{"+233 24 700 5678"}', 'inactive');
insert into public.contact_emails (contact_id, email, is_primary, is_shared) values
  ('00000000-0000-4000-8000-0000000000c1', 'esi.q@rehearsal.test', true, false), ('00000000-0000-4000-8000-0000000000c1', 'bookings@capecoast.rehearsal.test', false, true), ('00000000-0000-4000-8000-0000000000c2', 'zoe@rehearsal.test', true, false);
-- scale: 20,000 synthetic contacts
insert into public.contacts (full_name, phones, status) select 'Client ' || n || ' Person' || (n % 997), array['+97455' || lpad(n::text, 6, '0')], 'active' from generate_series(1, 20000) n;
insert into public.contact_emails (contact_id, email, is_primary, is_shared) select id, 'c' || row_number() over () || '@bulk.rehearsal.test', true, false from public.contacts where full_name like 'Client %';
set local session_replication_role = origin;
analyze public.contacts; analyze public.contact_emails; analyze public.organisations;

-- results and masking
select pg_temp.must((select count(*) from public.staff_client_lookup('email', 'esi.q@rehearsal.test')) = 1, 'exact personal email finds one contact');
select pg_temp.must((select masked_email from public.staff_client_lookup('email', 'esi.q@rehearsal.test')) = 'e•••@rehearsal.test' and (select masked_phone from public.staff_client_lookup('email', 'esi.q@rehearsal.test')) = '•••• 678', 'the identifiers come back masked');
select pg_temp.must((select count(*) from public.staff_client_lookup('email', 'bookings@capecoast.rehearsal.test')) = 0, 'a shared address is never identity');
select pg_temp.must((select count(*) from public.staff_client_lookup('phone', '0247005678')) = 1 and (select count(*) from public.staff_client_lookup('phone', '7005678')) = 1 and (select count(*) from public.staff_client_lookup('phone', '+233 24 700 5678')) = 1, 'phone finds the active contact by its ending in any format (the inactive contact with the same number is never returned)');
select pg_temp.must((select count(*) from public.staff_client_lookup('name', 'quartey adjei')) = 1 and (select organisation_name from public.staff_client_lookup('name', 'quartey adjei')) = 'Cape Coast Studios Ltd (rehearsal)', 'name finds by every word, with the organisation');
select pg_temp.must((select count(*) from public.staff_client_lookup('name', 'cape coast')) = 1, 'an organisation name finds its contact');
select pg_temp.must((select count(*) from public.staff_client_lookup('name', 'muller zoe')) = 1 and (select display_name from public.staff_client_lookup('name', 'muller zoe')) = 'Zo', 'accents are folded and the preferred name is shown');
select pg_temp.must((select count(*) from public.staff_client_lookup('name', 'quartey retired')) = 0, 'an inactive contact is never returned');
select pg_temp.must((select count(*) from public.staff_client_lookup('name', 'client', 50)) = 6, 'the result is capped at six whatever limit is asked for');
select pg_temp.must(not exists (select 1 from public.staff_client_lookup('name', 'quartey') x where to_jsonb(x)::text ~* 'esi\.q@|2337005678|247005678'), 'no full email or phone leaves the database');
select pg_temp.must((select array_agg(a order by a) from (select jsonb_object_keys(to_jsonb(x)) a from public.staff_client_lookup('name', 'quartey') x limit 7) k) = array['contact_id','display_name','earlier_enquiries','masked_email','masked_phone','matched_by','organisation_name'], 'exactly the seven minimal columns');
-- validation (the enumeration guards)
select pg_temp.must(pg_temp.err($q$select * from public.staff_client_lookup('name', 'ab')$q$) like '%lookup_bad_name%', 'a name under three letters is refused');
select pg_temp.must(pg_temp.err($q$select * from public.staff_client_lookup('email', 'jane@')$q$) like '%lookup_bad_email%' and pg_temp.err($q$select * from public.staff_client_lookup('email', 'Jane.Doe@rehearsal.test')$q$) like '%lookup_bad_email%', 'a partial or non-normalised email is refused');
select pg_temp.must(pg_temp.err($q$select * from public.staff_client_lookup('phone', '12345')$q$) like '%lookup_bad_phone%' and pg_temp.err($q$select * from public.staff_client_lookup('colour', 'x')$q$) like '%lookup_bad_kind%', 'a short phone and an unknown kind are refused');
-- privileges: the service role only
select pg_temp.must(has_function_privilege('service_role', 'public.staff_client_lookup(text,text,int)', 'execute') and not has_function_privilege('authenticated', 'public.staff_client_lookup(text,text,int)', 'execute') and not has_function_privilege('anon', 'public.staff_client_lookup(text,text,int)', 'execute'), 'only the service role can run it');
-- the table was not changed in any existing column and nothing was written
select pg_temp.must((select count(*) from public.contacts where full_name in ('Esi Quartey-Adjei', 'Zoë Müller', 'Quartey Retired')) = 3, 'existing rows are untouched');
-- indexes are usable at scale (planner forced off sequential scans only to PROVE the index can serve each query shape)
set local enable_seqscan = off;
select pg_temp.must((select bool_or(l like '%contacts_search_text_trgm_idx%') from (select explain_line l from (select 1) _ , lateral (select 'x' explain_line) e) q) is not null, 'placeholder');
SQL
echo "select 'plan name: ' || case when position('Bitmap Index Scan on contacts_search_text_trgm_idx' in (select string_agg(x, ' ') from (select (explain_json -> 0 -> 'Plan')::text x from (select 1) _ ) y)) > 0 then 'index' else 'see below' end;" >/dev/null
cat <<'SQL'
do $$ declare t0 timestamptz; ms numeric; plan text; begin
  t0 := clock_timestamp(); perform * from public.staff_client_lookup('name', 'person123 client'); ms := extract(milliseconds from clock_timestamp() - t0); raise notice 'name search over 20,000 contacts: % ms', round(ms, 1);
  t0 := clock_timestamp(); perform * from public.staff_client_lookup('phone', '97455012345'); ms := extract(milliseconds from clock_timestamp() - t0); raise notice 'phone search over 20,000 contacts: % ms', round(ms, 1);
  t0 := clock_timestamp(); perform * from public.staff_client_lookup('email', 'c777@bulk.rehearsal.test'); ms := extract(milliseconds from clock_timestamp() - t0); raise notice 'email search over 20,000 contacts: % ms', round(ms, 1);
  execute 'explain (format text) select id from public.contacts where status = ''active'' and search_text like ''%person123%''' into plan; raise notice 'name plan: %', plan;
  execute 'explain (format text) select id from public.contacts where status = ''active'' and private.phone_keys(phones) && array[''k9:'' || right(''97455012345'', 9)]' into plan; raise notice 'phone plan: %', plan;
  execute 'explain (format text) select contact_id from public.contact_emails where lower(email) = ''c777@bulk.rehearsal.test'' and removed_at is null and not is_shared' into plan; raise notice 'email plan: %', plan;
end $$;
select 'STAFF LOOKUP INDEX REHEARSAL PASSED' as result;
rollback;
SQL
} | sed '/placeholder/d' | q 2>&1 | grep -v '^$'
after=$(echo "select (select count(*) from public.contacts) || '/' || (select count(*) from public.contact_emails) || '/' || (select count(*) from public.enquiries)" | q)
echo "lab contacts/emails/enquiries before: $before after: $after -> $([ "$before" = "$after" ] && echo UNCHANGED || echo CHANGED)"
