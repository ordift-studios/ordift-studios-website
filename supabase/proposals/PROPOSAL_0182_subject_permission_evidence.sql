-- PROPOSED 0182 (NOT APPLIED, NOT in supabase/migrations): structured permission evidence for the people and property shown in a portfolio photograph.
-- Scope: three NEW append-only tables and ONE replaced function (portfolio_use_eligibility, same signature and return type, with ONE extra condition on the internal stage). Nothing else changes.
-- A photograph is externally eligible only if, in addition to everything 0170/0171 already require: (1) a reviewer has DECLARED what it shows, and (2) every person or property listed for it has a permission
-- that is VERIFIED by a separate management act, not withdrawn, not expired, and covers the destination. A grant that is only recorded, or only referenced, counts for nothing. Children can be covered only by a parent or guardian.
-- No identification documents are collected or stored: a grant stores who gave it, in what capacity, what kind of evidence exists and WHERE it is kept (a reference), never the evidence itself.
begin;

-- 1. What the reviewer says the photograph shows. Append-only; the latest row counts.
create table public.portfolio_people_declarations (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  project_file_id uuid not null references public.project_files (id),
  declaration text not null check (declaration in ('none_shown', 'people_or_property_shown')),
  note text,
  declared_by uuid not null references public.profiles (id),
  declared_at timestamptz not null default now()
);
create index portfolio_declaration_file on public.portfolio_people_declarations (project_file_id, seq desc);

-- 2. The people and property shown, one row per subject (a label, not a name). A removal is a later row pointing at the one it removes.
create table public.portfolio_file_subjects (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  project_file_id uuid not null references public.project_files (id),
  action text not null default 'added' check (action in ('added', 'removed')),
  subject_kind text not null check (subject_kind in ('adult', 'child', 'property')),
  label text not null check (char_length(btrim(label)) between 3 and 120),
  supersedes_id uuid references public.portfolio_file_subjects (id),
  recorded_by uuid not null references public.profiles (id),
  recorded_at timestamptz not null default now(),
  constraint subject_removal_shape check ((action = 'added' and supersedes_id is null) or (action = 'removed' and supersedes_id is not null))
);
create index portfolio_subject_file on public.portfolio_file_subjects (project_file_id, seq desc);

-- 3. Permission for a subject: granted, then verified by a separate row, and possibly withdrawn by a later one.
create table public.portfolio_subject_permissions (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  subject_id uuid not null references public.portfolio_file_subjects (id),
  decision text not null check (decision in ('granted', 'verified', 'withdrawn')),
  supersedes_id uuid references public.portfolio_subject_permissions (id),
  grantor_kind text check (grantor_kind in ('subject_self', 'parent_guardian', 'authorized_representative', 'property_owner', 'signed_release')),
  grantor_name text check (grantor_name is null or char_length(btrim(grantor_name)) between 2 and 120),
  grantor_relationship text check (grantor_relationship is null or char_length(btrim(grantor_relationship)) <= 120),
  evidence_kind text check (evidence_kind in ('signed_form', 'written_message', 'release_agreement', 'other_written')),
  evidence_reference text check (evidence_reference is null or char_length(btrim(evidence_reference)) between 10 and 500),
  agreement_id uuid references public.agreements (id),
  allowed_destinations text[] not null default '{}' check (allowed_destinations <@ array['portfolio','website','social_media','client_samples','journal','brochure','print_collateral','paid_advertising']),
  restrictions text check (restrictions is null or char_length(btrim(restrictions)) <= 1000),
  expires_on date,
  note text,
  recorded_by uuid not null references public.profiles (id),
  recorded_at timestamptz not null default now(),
  constraint subject_grant_shape check (decision <> 'granted' or (supersedes_id is null and grantor_kind is not null and grantor_name is not null and evidence_kind is not null and evidence_reference is not null and cardinality(allowed_destinations) > 0)),
  constraint subject_follow_up_shape check (decision = 'granted' or (supersedes_id is not null and char_length(btrim(coalesce(note, ''))) >= 10)),
  constraint subject_release_shape check ((evidence_kind = 'release_agreement') = (agreement_id is not null))
);
create index portfolio_subject_perm_subject on public.portfolio_subject_permissions (subject_id, seq desc);
create index portfolio_subject_perm_supersedes on public.portfolio_subject_permissions (supersedes_id) where supersedes_id is not null;

-- Guards: management authority only; the shape rules the CHECKs cannot express; append-only.
create function private.portfolio_people_declaration_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_portfolio_authority(new.declared_by) then raise exception 'only the Founder or an authorised executive admin may declare what a photograph shows'; end if;
  return new;
end $$;
create trigger portfolio_people_declaration_guard before insert on public.portfolio_people_declarations for each row execute function private.portfolio_people_declaration_guard();
create trigger portfolio_people_declaration_append_only before update or delete on public.portfolio_people_declarations for each row execute function private.portfolio_append_only();

create function private.portfolio_file_subject_guard() returns trigger language plpgsql security definer set search_path = '' as $$
declare t record;
begin
  if not private.is_portfolio_authority(new.recorded_by) then raise exception 'only the Founder or an authorised executive admin may list who or what a photograph shows'; end if;
  if new.action = 'removed' then
    select * into t from public.portfolio_file_subjects where id = new.supersedes_id;
    if not found or t.action <> 'added' or t.project_file_id <> new.project_file_id then raise exception 'a removal must point at an earlier entry for the same photograph'; end if;
    if exists (select 1 from public.portfolio_file_subjects x where x.supersedes_id = new.supersedes_id) then raise exception 'that entry was already removed'; end if;
    new.subject_kind := t.subject_kind; new.label := t.label;
  end if;
  return new;
end $$;
create trigger portfolio_file_subject_guard before insert on public.portfolio_file_subjects for each row execute function private.portfolio_file_subject_guard();
create trigger portfolio_file_subject_append_only before update or delete on public.portfolio_file_subjects for each row execute function private.portfolio_append_only();

create function private.portfolio_subject_permission_guard() returns trigger language plpgsql security definer set search_path = '' as $$
declare s record; tgt record; ag record;
begin
  if not private.is_portfolio_authority(new.recorded_by) then raise exception 'only the Founder or an authorised executive admin may record or verify permission for a person or property shown'; end if;
  if new.decision = 'granted' then
    select * into s from public.portfolio_file_subjects where id = new.subject_id;
    if not found or s.action <> 'added' or exists (select 1 from public.portfolio_file_subjects x where x.supersedes_id = s.id) then raise exception 'that person or property is not an active entry for the photograph'; end if;
    if s.subject_kind = 'child' and new.grantor_kind <> 'parent_guardian' then raise exception 'permission for a child can only be given by a parent or legal guardian'; end if;
    if s.subject_kind = 'adult' and new.grantor_kind not in ('subject_self', 'authorized_representative', 'signed_release') then raise exception 'permission for an adult comes from that person, their authorised representative or a signed release'; end if;
    if s.subject_kind = 'property' and new.grantor_kind not in ('property_owner', 'authorized_representative', 'signed_release') then raise exception 'permission for property comes from its owner, their authorised representative or a signed release'; end if;
    if new.agreement_id is not null then
      select status into ag from public.agreements where id = new.agreement_id;
      if not found or ag.status not in ('fully_executed', 'active', 'completed') then raise exception 'the agreement is not fully executed: a draft or partly signed agreement establishes no permission'; end if;
    end if;
  else
    select * into tgt from public.portfolio_subject_permissions where id = new.supersedes_id;
    if not found or tgt.decision <> 'granted' or tgt.subject_id <> new.subject_id then raise exception 'a verification or withdrawal must point at a grant for the same person or property'; end if;
    if new.decision = 'verified' and exists (select 1 from public.portfolio_subject_permissions w where w.supersedes_id = new.supersedes_id and w.decision = 'withdrawn') then raise exception 'that grant was already withdrawn'; end if;
  end if;
  return new;
end $$;
create trigger portfolio_subject_permission_guard before insert on public.portfolio_subject_permissions for each row execute function private.portfolio_subject_permission_guard();
create trigger portfolio_subject_permission_append_only before update or delete on public.portfolio_subject_permissions for each row execute function private.portfolio_append_only();

-- 4. The ONE changed function: same signature and return type as 0171. The internal stage now also needs the people condition; every earlier condition is unchanged.
create or replace function public.portfolio_use_eligibility(p_file uuid, p_destination text, p_on date default current_date)
returns table (eligible boolean, rights_ok boolean, rights_reason text, internal_ok boolean, internal_reason text)
language plpgsql stable security definer set search_path = '' as $$
declare m record; rv record; ro boolean; rr text; io boolean := false; ir text; dec text; shown boolean; missing boolean;
begin
  select s.effective, s.reason into m from public.marketing_permission_state(p_file, p_destination, p_on) s;
  ro := coalesce(m.effective, false); rr := coalesce(m.reason, 'no_permission_on_record');
  select r.decision, r.destinations into rv from public.portfolio_internal_reviews r where r.project_file_id = p_file order by r.seq desc limit 1;
  if not found then ir := 'no_internal_review';
  elsif rv.decision = 'approved' then
    if p_destination = any (rv.destinations) then io := true; ir := 'approved'; else ir := 'destination_not_approved'; end if;
  elsif rv.decision = 'returned' then ir := 'returned_for_further_review';
  else ir := rv.decision; end if;
  if io then
    select d.declaration into dec from public.portfolio_people_declarations d where d.project_file_id = p_file order by d.seq desc limit 1;
    select exists (select 1 from public.portfolio_file_subjects s where s.project_file_id = p_file and s.action = 'added' and not exists (select 1 from public.portfolio_file_subjects x where x.supersedes_id = s.id)) into shown;
    select exists (
      select 1 from public.portfolio_file_subjects s
      where s.project_file_id = p_file and s.action = 'added' and not exists (select 1 from public.portfolio_file_subjects x where x.supersedes_id = s.id)
        and not exists (
          select 1 from public.portfolio_subject_permissions g
          where g.subject_id = s.id and g.decision = 'granted' and p_destination = any (g.allowed_destinations) and (g.expires_on is null or g.expires_on >= p_on)
            and exists (select 1 from public.portfolio_subject_permissions v where v.supersedes_id = g.id and v.decision = 'verified')
            and not exists (select 1 from public.portfolio_subject_permissions w where w.supersedes_id = g.id and w.decision = 'withdrawn'))) into missing;
    if dec is null then io := false; ir := 'people_not_declared';
    elsif dec = 'people_or_property_shown' and not shown then io := false; ir := 'people_shown_but_none_listed';
    elsif missing then io := false; ir := 'people_permission_missing'; end if;
  end if;
  return query select (ro and io), ro, rr, io, ir;
end $$;
revoke all on function public.portfolio_use_eligibility(uuid, text, date) from public, anon, authenticated;
grant execute on function public.portfolio_use_eligibility(uuid, text, date) to service_role;

-- 5. Privileges: server code only. These tables name guardians and describe people in photographs, so no signed-in role can read them directly.
alter table public.portfolio_people_declarations enable row level security;
alter table public.portfolio_file_subjects enable row level security;
alter table public.portfolio_subject_permissions enable row level security;
revoke all on public.portfolio_people_declarations, public.portfolio_file_subjects, public.portfolio_subject_permissions from anon, authenticated, service_role;
grant select, insert on public.portfolio_people_declarations, public.portfolio_file_subjects, public.portfolio_subject_permissions to service_role;
revoke all on function private.portfolio_people_declaration_guard(), private.portfolio_file_subject_guard(), private.portfolio_subject_permission_guard() from public, anon, authenticated;

commit;
