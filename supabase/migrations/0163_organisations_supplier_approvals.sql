-- Organisation registry and supplier-approval confirmation (v1). SCHEMA ONLY — this migration inserts no organisation,
-- no application and no data of any kind; real records are entered through the Admin screens after release.
--
-- Three new tables, nothing existing is altered:
--   organisations               one row per organisation, whatever its relationship to Ordift. Duplicate names are refused here
--                               (unique normalised name); near-duplicates are caught in the application layer and shown to a person.
--   supplier_applications       an application Ordift submitted to an organisation to become ITS supplier, and — once a person has
--                               pasted the organisation's approval email and confirmed it — the evidence and who confirmed it.
--                               The email itself is not stored: only the sender's domain, subject, date, the receiving server's
--                               authentication verdicts, a short excerpt and a hash (so the same email cannot be attached twice).
--   organisation_relationships  how an organisation relates to Ordift: kind 'client' (the organisation has approved Ordift as ITS supplier,
--                               so Ordift sells to it) or 'vendor' (the organisation supplies services TO Ordift — reserved; the existing
--                               vendor and production-supplier records are NOT migrated here, and no screen creates this kind yet).
--                               One row per organisation and kind, so one organisation can be both without being duplicated.
--
-- By design nothing here references a booking, quotation, invoice, payable, payment or any financial record, and no trigger
-- creates one: confirming an approval records a relationship and nothing else.
-- Super-Admin-only to read; written only by server code (service role). Rows are never deleted.
begin;

-- ------------------------------------------------------------------ organisations
create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  name text not null check (length(btrim(name)) between 1 and 200),
  normalized_name text not null check (length(normalized_name) between 1 and 200 and normalized_name = lower(normalized_name)),
  primary_domain text check (primary_domain is null or primary_domain ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'),
  notes text check (notes is null or length(notes) <= 2000),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, normalized_name)
);
create index organisations_primary_domain_idx on public.organisations (business_id, primary_domain) where primary_domain is not null;
comment on table public.organisations is 'Shared organisation record. Relationship to Ordift lives in organisation_relationships, so one organisation is never duplicated per relationship. normalized_name is computed by the application (src/lib/organisations/names.ts).';

-- ------------------------------------------------------------------ supplier_applications
create table public.supplier_applications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  organisation_name text not null check (length(btrim(organisation_name)) between 1 and 200),
  normalized_name text not null check (length(normalized_name) between 1 and 200 and normalized_name = lower(normalized_name)),
  contact_domain text check (contact_domain is null or contact_domain ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'),
  reference text check (reference is null or length(btrim(reference)) between 1 and 120),
  submitted_on date not null,
  submission_notes text check (submission_notes is null or length(submission_notes) <= 2000),
  status text not null default 'submitted' check (status in ('submitted', 'pending_confirmation', 'approved', 'declined', 'withdrawn')),
  -- Set when an administrator confirms the approval (or at recording time if the organisation is already registered).
  organisation_id uuid references public.organisations (id),
  -- Evidence from the pasted approval email. The email text itself is not kept.
  approval_sender_domain text,
  approval_subject text check (approval_subject is null or length(approval_subject) <= 300),
  approval_sent_on date,
  approval_spf text check (approval_spf is null or approval_spf in ('pass', 'fail', 'none', 'unknown')),
  approval_dkim text check (approval_dkim is null or approval_dkim in ('pass', 'fail', 'none', 'unknown')),
  approval_dmarc text check (approval_dmarc is null or approval_dmarc in ('pass', 'fail', 'none', 'unknown')),
  approval_dkim_aligned boolean,
  approval_excerpt text check (approval_excerpt is null or length(approval_excerpt) <= 2000),
  approval_text_sha256 text check (approval_text_sha256 is null or approval_text_sha256 ~ '^[0-9a-f]{64}$'),
  approval_match_level text check (approval_match_level is null or approval_match_level in ('strong', 'review', 'weak')),
  approval_signals jsonb,
  approval_submitted_by uuid references public.profiles (id),
  approval_submitted_at timestamptz,
  -- Human confirmation.
  confirmed_by uuid references public.profiles (id),
  confirmed_at timestamptz,
  confirmation_note text check (confirmation_note is null or length(confirmation_note) <= 2000),
  acknowledged_review boolean,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_applications_pending_shape check (status <> 'pending_confirmation' or (approval_text_sha256 is not null and approval_submitted_at is not null)),
  constraint supplier_applications_approved_shape check (status <> 'approved' or (organisation_id is not null and confirmed_by is not null and confirmed_at is not null and approval_text_sha256 is not null))
);
create unique index supplier_applications_approval_hash_uniq on public.supplier_applications (business_id, approval_text_sha256) where approval_text_sha256 is not null;
create index supplier_applications_status_idx on public.supplier_applications (business_id, status, submitted_on desc);
create index supplier_applications_organisation_idx on public.supplier_applications (organisation_id) where organisation_id is not null;
comment on column public.supplier_applications.approval_spf is 'SPF result AS PASTED by a person in the email headers. Not independently verified; pasted headers can be edited or invented. Same for approval_dkim, approval_dmarc and approval_dkim_aligned.';
comment on column public.supplier_applications.approval_sender_domain is 'Sender domain as read from text a person pasted. Not independently verified.';
comment on column public.supplier_applications.approval_match_level is 'How consistent the pasted email is with the application (strong / review / weak). A hint for a person, never proof; every approval still needs a person to attest (acknowledged_review) and confirm.';
comment on table public.supplier_applications is 'An application Ordift submitted to an organisation to become its supplier. Approved only by an administrator confirming a pasted approval email; an email alone never changes anything. Creates no booking, invoice, payable or payment.';

-- ------------------------------------------------------------------ organisation_relationships
create table public.organisation_relationships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  organisation_id uuid not null references public.organisations (id),
  kind text not null check (kind in ('client', 'vendor')),
  status text not null default 'prospect' check (status in ('prospect', 'approved', 'inactive')),
  approved_at timestamptz,
  source_application_id uuid references public.supplier_applications (id),
  notes text check (notes is null or length(notes) <= 2000),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, kind),
  constraint organisation_relationships_approved_shape check (status <> 'approved' or approved_at is not null),
  constraint organisation_relationships_source_is_client check (source_application_id is null or kind = 'client')
);
create index organisation_relationships_kind_idx on public.organisation_relationships (business_id, kind, status);
comment on table public.organisation_relationships is 'kind client = the organisation has approved Ordift as ITS supplier (Ordift sells to it). kind vendor = the organisation supplies services TO Ordift (reserved; existing vendor / production-supplier records are not migrated). approved_at is set once and never rewritten.';

-- ------------------------------------------------------------------ guards: never deleted, approved facts frozen
create or replace function private.organisations_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'organisations are never deleted; mark the organisation inactive' using errcode = '42501'; end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function private.organisations_guard() from public;
create trigger organisations_guard before update or delete on public.organisations for each row execute function private.organisations_guard();

create or replace function private.supplier_applications_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'supplier applications are never deleted; withdraw or decline the application' using errcode = '42501'; end if;
  if old.status = 'approved' then
    if (new.status, new.organisation_name, new.normalized_name, new.reference, new.submitted_on, new.organisation_id, new.approval_text_sha256, new.approval_sender_domain, new.confirmed_by, new.confirmed_at)
       is distinct from
       (old.status, old.organisation_name, old.normalized_name, old.reference, old.submitted_on, old.organisation_id, old.approval_text_sha256, old.approval_sender_domain, old.confirmed_by, old.confirmed_at) then
      raise exception 'an approved supplier application cannot be edited' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function private.supplier_applications_guard() from public;
create trigger supplier_applications_guard before update or delete on public.supplier_applications for each row execute function private.supplier_applications_guard();

create or replace function private.organisation_relationships_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'organisation relationships are never deleted; mark the relationship inactive' using errcode = '42501'; end if;
  if old.approved_at is not null and new.approved_at is distinct from old.approved_at then
    raise exception 'the original approval date of a relationship cannot be rewritten' using errcode = '42501';
  end if;
  if new.organisation_id is distinct from old.organisation_id or new.kind is distinct from old.kind then
    raise exception 'a relationship cannot be moved to another organisation or kind' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function private.organisation_relationships_guard() from public;
create trigger organisation_relationships_guard before update or delete on public.organisation_relationships for each row execute function private.organisation_relationships_guard();

-- ------------------------------------------------------------------ access: Super Admin read, server-side write
alter table public.organisations enable row level security;
create policy "organisations: super admin only" on public.organisations for select to authenticated using ((select private.is_super_admin()));
revoke all on public.organisations from anon, authenticated, service_role;
grant select on public.organisations to authenticated;
grant select, insert, update on public.organisations to service_role;

alter table public.supplier_applications enable row level security;
create policy "supplier_applications: super admin only" on public.supplier_applications for select to authenticated using ((select private.is_super_admin()));
revoke all on public.supplier_applications from anon, authenticated, service_role;
grant select on public.supplier_applications to authenticated;
grant select, insert, update on public.supplier_applications to service_role;

alter table public.organisation_relationships enable row level security;
create policy "organisation_relationships: super admin only" on public.organisation_relationships for select to authenticated using ((select private.is_super_admin()));
revoke all on public.organisation_relationships from anon, authenticated, service_role;
grant select on public.organisation_relationships to authenticated;
grant select, insert, update on public.organisation_relationships to service_role;

commit;
