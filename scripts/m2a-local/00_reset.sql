-- LOCAL ONLY. Removes every M2a test fixture (marker-based). Safe to run repeatedly.
set session_replication_role = replica;
do $$ begin
  if to_regclass('public.m2a_fx') is not null then
    delete from public.enquiry_amount_events where enquiry_id in (select id from public.enquiries where reference_number like 'M2A-%');
    delete from public.activity_log where actor_user_id in (select id from public.m2a_fx where name in ('admin','super','plain'));
  end if;
end $$;
delete from public.client_quotation_items where quotation_id in (select id from public.client_quotations where enquiry_id in (select id from public.enquiries where reference_number like 'M2A-%') or quotation_reference like 'M2A-Q-%');
delete from public.client_quotations where enquiry_id in (select id from public.enquiries where reference_number like 'M2A-%') or quotation_reference like 'M2A-Q-%';
delete from public.crew_support_requests where reference_number like 'M2A-%';
delete from public.enquiries where reference_number like 'M2A-%';
delete from public.booking_contracting_entities where basis = 'M2A test basis';
delete from public.employing_entities where slug = 'm2a-test-entity';
delete from public.exchange_rates where reason like 'M2A test%';
delete from public.user_roles where user_id in (select id from auth.users where email like 'm2a-%@example.invalid');
delete from public.profiles where id in (select id from auth.users where email like 'm2a-%@example.invalid');
delete from auth.users where email like 'm2a-%@example.invalid';
drop table if exists public.m2a_fx, public.m2a_snap;
drop function if exists public.m2a_expect(text, text), public.m2a_assert(boolean, text), public.m2a_id(text), public.m2a_mkenq(text, text, text, numeric, text, numeric), public.m2a_mkq(text, uuid, text, text, numeric, uuid, boolean), public.m2a_live(uuid);
select 'reset ok' as result;
