-- Rollback for 0164: removes the two directory tables and the four link columns ONLY if nothing has been recorded in them
-- (otherwise it refuses, so no contact, address or link can be lost). Safe to run before any contact is entered or any record is linked.
begin;
do $$
begin
  if exists (select 1 from public.contacts) or exists (select 1 from public.contact_emails) then
    raise exception 'down_0164 refused: directory contacts already exist';
  end if;
  if exists (select 1 from public.enquiries where contact_id is not null or organisation_id is not null)
     or exists (select 1 from public.client_quotations where contact_id is not null or organisation_id is not null) then
    raise exception 'down_0164 refused: enquiries or quotations are already linked to the directory';
  end if;
end $$;
drop trigger enquiries_directory_link_guard on public.enquiries;
drop trigger client_quotations_directory_link_guard on public.client_quotations;
drop function private.directory_link_guard();
alter table public.enquiries drop column contact_id, drop column organisation_id;
alter table public.client_quotations drop column contact_id, drop column organisation_id;
drop table public.contact_emails;
drop table public.contacts;
drop function private.contact_emails_guard();
drop function private.contacts_guard();
commit;
