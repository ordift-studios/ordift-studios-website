-- LOCAL ONLY (throwaway Docker Postgres). Fixtures for the M2a transaction-safety tests. Never run against Staging or Production.
\set ON_ERROR_STOP 1
create table if not exists public.m2a_fx (name text primary key, id uuid not null);

create or replace function public.m2a_expect(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm like p_expected then raise notice 'PASS  error [%] : %', p_expected, left(regexp_replace(p_sql, '\s+', ' ', 'g'), 70); return;
    else raise exception 'FAIL  expected [%] got [%] for %', p_expected, sqlerrm, left(p_sql, 90); end if;
  end;
  raise exception 'FAIL  no error (expected [%]) for %', p_expected, left(p_sql, 90);
end $$;

create or replace function public.m2a_assert(p_ok boolean, p_label text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FAIL  %', p_label; end if;
  raise notice 'PASS  %', p_label;
end $$;

create or replace function public.m2a_id(p_name text) returns uuid language sql stable as $$ select id from public.m2a_fx where name = p_name $$;

do $$
declare
  v_admin uuid := gen_random_uuid(); v_super uuid := gen_random_uuid(); v_plain uuid := gen_random_uuid(); v_ent uuid := gen_random_uuid();
  v_roleadmin uuid; v_rolesuper uuid;
begin
  insert into auth.users (id, aud, role, email) values
    (v_admin, 'authenticated', 'authenticated', 'm2a-admin@example.invalid'),
    (v_super, 'authenticated', 'authenticated', 'm2a-super@example.invalid'),
    (v_plain, 'authenticated', 'authenticated', 'm2a-plain@example.invalid');
  insert into public.profiles (id, full_name) values (v_admin, 'M2A Admin'), (v_super, 'M2A Super'), (v_plain, 'M2A Plain') on conflict (id) do nothing;
  update public.profiles set access_status = 'active' where id in (v_admin, v_super, v_plain);
  select id into v_roleadmin from public.roles where slug = 'admin'; select id into v_rolesuper from public.roles where slug = 'super_admin';
  insert into public.user_roles (user_id, role_id) values (v_admin, v_roleadmin), (v_super, v_rolesuper);
  insert into public.employing_entities (name, slug) values ('M2A Test Entity', 'm2a-test-entity') returning id into v_ent;
  insert into public.m2a_fx values ('admin', v_admin), ('super', v_super), ('plain', v_plain), ('entity', v_ent);
end $$;

-- Rates: GHS fresh with a source note (10 days old, previous row within 10%); QAR stale (45 days).
insert into public.exchange_rates (currency_code, rate_to_usd, effective_from, reason, updated_by) values
  ('GHS', 11.000000, now() - interval '40 days', 'M2A test previous rate', (select id from public.m2a_fx where name='super')),
  ('GHS', 11.089800, now() - interval '10 days', 'M2A test: official mid-rate', (select id from public.m2a_fx where name='super')),
  ('QAR', 3.640000, now() - interval '45 days', 'M2A test: pegged rate', (select id from public.m2a_fx where name='super'));
select 'fixtures ok' as result;
