-- Rollback for 0163: removes the three organisation-registry tables ONLY if nothing has been recorded in them
-- (otherwise it refuses, so no organisation, application or approval record can be lost). Safe to run before any record is entered.
begin;
do $$
begin
  if exists (select 1 from public.organisation_relationships) or exists (select 1 from public.supplier_applications) or exists (select 1 from public.organisations) then
    raise exception 'down_0163 refused: organisation registry records already exist';
  end if;
end $$;
drop table public.organisation_relationships;
drop table public.supplier_applications;
drop table public.organisations;
drop function private.organisation_relationships_guard();
drop function private.supplier_applications_guard();
drop function private.organisations_guard();
commit;
