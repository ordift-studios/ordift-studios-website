-- Client Directory v1: people (contacts), their email addresses, and four nullable links from enquiries and quotations. ADDITIVE ONLY: two new
-- tables and four new empty columns. This migration inserts, updates and deletes nothing, links no existing record, and backfills nothing.
--
--   contacts          a person Ordift deals with. May belong to an organisation (public.organisations, migration 0163) or stand alone (an individual
--                     client). NOT a portal account: the optional profile_id links a contact to a registered account only when a Super Admin chooses to.
--   contact_emails    one row per address, so a person can have several. A PERSONAL address can belong to only one active contact; a SHARED address
--                     (info@, bookings@ ...) can be held by several contacts and is never used as identity. Addresses are never deleted: a removed
--                     address keeps its row with removed_at set.
--   enquiries.contact_id / organisation_id, client_quotations.contact_id / organisation_id
--                     which person enquired, and which organisation is the client being served. Links only: no entity, market, currency, amount,
--                     stage or payment is read from or written to them.
--
-- business_id on the new tables is the PLATFORM business scope (public.businesses, one row: Ordift Studios), exactly like every other table. It is
-- NOT a Ghana or Qatar legal entity. A client record therefore carries no exclusive entity; the legal entity that contracts, and the payment market,
-- stay on each enquiry / quotation (booking_contracting_entities, enquiries.payment_country), chosen explicitly and never inferred from the directory.
--
-- Super-Admin-only to read; written only by server code (service role); rows are never deleted. A guard trigger also stops any signed-in staff
-- session from setting the four link columns directly (staff may update enquiries and quotations through row-level security).
begin;

-- ------------------------------------------------------------------ contacts
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  full_name text not null check (length(btrim(full_name)) between 1 and 200),
  preferred_name text check (preferred_name is null or length(btrim(preferred_name)) between 1 and 100),
  job_title text check (job_title is null or length(job_title) <= 150),
  organisation_id uuid references public.organisations (id),
  profile_id uuid references public.profiles (id),
  phones text[] not null default '{}' check (cardinality(phones) <= 5),
  notes text check (notes is null or length(notes) <= 2000),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index contacts_profile_id_uniq on public.contacts (profile_id) where profile_id is not null;
create index contacts_organisation_idx on public.contacts (organisation_id) where organisation_id is not null;
comment on table public.contacts is 'A person Ordift deals with: an individual client, or one of several contacts at an organisation. Not a portal account (profile_id is an optional, human-approved link). phones holds digits only and is used for suggestions, never identity.';

-- ------------------------------------------------------------------ contact_emails
create table public.contact_emails (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  contact_id uuid not null references public.contacts (id),
  email text not null check (email = lower(email) and length(email) between 3 and 254 and email ~ '^[a-z0-9._%+''-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$'),
  is_primary boolean not null default false,
  is_shared boolean not null default false,
  removed_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
-- A personal address belongs to one active contact; a shared address may be held by several.
create unique index contact_emails_personal_email_uniq on public.contact_emails (business_id, email) where not is_shared and removed_at is null;
create unique index contact_emails_contact_email_uniq on public.contact_emails (contact_id, email) where removed_at is null;
create unique index contact_emails_one_primary_uniq on public.contact_emails (contact_id) where is_primary and removed_at is null;
create index contact_emails_email_idx on public.contact_emails (email) where removed_at is null;
comment on table public.contact_emails is 'Email addresses of contacts. A PERSONAL address (is_shared = false) can belong to only one active contact. A SHARED address (info@, bookings@ ...) may be held by several and is never identity. Addresses are never deleted; removed_at marks a removed address. Only lowercased: plus-tags and dots are kept, so two different people are never joined by normalisation.';

-- ------------------------------------------------------------------ the four nullable links
alter table public.enquiries
  add column contact_id uuid references public.contacts (id) on delete restrict,
  add column organisation_id uuid references public.organisations (id) on delete restrict;
create index enquiries_contact_idx on public.enquiries (contact_id) where contact_id is not null;
create index enquiries_organisation_idx on public.enquiries (organisation_id) where organisation_id is not null;

alter table public.client_quotations
  add column contact_id uuid references public.contacts (id) on delete restrict,
  add column organisation_id uuid references public.organisations (id) on delete restrict;
create index client_quotations_contact_idx on public.client_quotations (contact_id) where contact_id is not null;
create index client_quotations_organisation_idx on public.client_quotations (organisation_id) where organisation_id is not null;

comment on column public.enquiries.contact_id is 'The person who enquired (public.contacts). A link only; set by a Super Admin, never automatically.';
comment on column public.enquiries.organisation_id is 'The organisation being served as the client (public.organisations). A link only; carries no legal entity, market or amount.';
comment on column public.client_quotations.contact_id is 'The person the quotation is for (public.contacts). A link only.';
comment on column public.client_quotations.organisation_id is 'The organisation the quotation is for (public.organisations). A link only; carries no legal entity, market or amount.';

-- ------------------------------------------------------------------ guards
create or replace function private.contacts_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'contacts are never deleted; mark the contact inactive' using errcode = '42501'; end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function private.contacts_guard() from public;
create trigger contacts_guard before update or delete on public.contacts for each row execute function private.contacts_guard();

create or replace function private.contact_emails_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'contact email addresses are never deleted; remove the address instead' using errcode = '42501'; end if;
  if (new.contact_id, new.email, new.business_id) is distinct from (old.contact_id, old.email, old.business_id) then
    raise exception 'an email address cannot be edited or moved to another contact; remove it and add the new one' using errcode = '42501';
  end if;
  if old.removed_at is not null and new.removed_at is distinct from old.removed_at then
    raise exception 'a removed email address cannot be restored; add it again as a new address' using errcode = '42501';
  end if;
  if new.removed_at is not null then new.is_primary := false; end if;
  return new;
end $$;
revoke all on function private.contact_emails_guard() from public;
create trigger contact_emails_guard before update or delete on public.contact_emails for each row execute function private.contact_emails_guard();

-- Only a Super Admin (or server code, which runs as service_role) may set or change the directory links. Staff can update enquiries and quotations
-- through row-level security, so without this a staff session could re-point a record at someone else's contact or organisation.
create or replace function private.directory_link_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if (new.contact_id is not null or new.organisation_id is not null) and not private.is_super_admin() then
        raise exception 'directory links can only be set by a Super Admin' using errcode = '42501';
      end if;
    elsif (new.contact_id, new.organisation_id) is distinct from (old.contact_id, old.organisation_id) and not private.is_super_admin() then
      raise exception 'directory links can only be changed by a Super Admin' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.directory_link_guard() from public;
create trigger enquiries_directory_link_guard before insert or update on public.enquiries for each row execute function private.directory_link_guard();
create trigger client_quotations_directory_link_guard before insert or update on public.client_quotations for each row execute function private.directory_link_guard();

-- ------------------------------------------------------------------ access: Super Admin read, server-side write, no delete
alter table public.contacts enable row level security;
create policy "contacts: super admin only" on public.contacts for select to authenticated using ((select private.is_super_admin()));
revoke all on public.contacts from anon, authenticated, service_role;
grant select on public.contacts to authenticated;
grant select, insert, update on public.contacts to service_role;

alter table public.contact_emails enable row level security;
create policy "contact_emails: super admin only" on public.contact_emails for select to authenticated using ((select private.is_super_admin()));
revoke all on public.contact_emails from anon, authenticated, service_role;
grant select on public.contact_emails to authenticated;
grant select, insert, update on public.contact_emails to service_role;

commit;
