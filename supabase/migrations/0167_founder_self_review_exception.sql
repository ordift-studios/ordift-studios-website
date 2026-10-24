-- PROPOSAL (2026-10-22) - NOT APPLIED ANYWHERE. Applying it requires the Founder's separate written authorization and a
-- verified backup. Status: rehearsed on a disposable local PostgreSQL 17.6 with synthetic data (all suites passing);
-- Production compatibility confirmed read-only on 2026-10-22 (PostgreSQL 17.6, migration ledger head 0166, no name collisions).
-- A rehearsal on a restored Production copy has NOT yet been run.
--
-- ORDIFT-POL-FSR-001 - Founder Self-Review & Client Deliverable Release Exception.
--
-- Today project_files forbids anyone recording themselves as reviewer/releaser of a file they uploaded or submitted
-- (constraint project_files_release_separation, plus an application rule that also covers the assigned professional).
-- That rule stays in force for everyone. This migration adds ONE governed way for the verified Founder to review and
-- release their own work on an engagement where they are the actual performer, and makes the rule enforceable
-- database-side:
--
--   * founder_identities             - the durable, explicitly governed Founder identity (at most one active).
--   * founder_common_control_accounts- other logins under the Founder's control; they are NEVER independent reviewers.
--   * self_review_exception_holders  - the explicit authorization of the exception for that identity (revocable).
--   * self_review_exceptions         - engagement-scoped exception: justification + conflict acknowledgement, expiring.
--   * self_review_file_views         - server-side evidence that the Founder opened each image in the review viewer.
--   * self_review_declarations       - append-only fixed selection (review or release), with a database-computed hash.
--   * self_review_declaration_files  - per-file decision and TRUTHFUL outcome (pending / applied / failed).
--   * self_review_events             - append-only audit trail written by triggers.
--
-- Cross-table rules are enforced by TRIGGERS (a CHECK constraint may not query other tables). Column-only rules stay
-- as CHECK constraints. Nothing here reads, moves or changes any existing row; no backfill; no client email; no
-- release. Existing normal approval and release behaviour is unchanged for everyone who is not a performer.
--
-- Locking: the exception row is only ever SHARE-locked inside other transactions (declaration insert, validation) and
-- is updated (closed) in a transaction that takes no other lock, so closing cannot deadlock with a decision in flight;
-- it simply waits, and a decision that starts after the close fails validation. Within a decision the order is always
-- declaration_files (FOR UPDATE) -> project_files (row lock by UPDATE). Unique partial indexes make "one active
-- Founder", "one active holder" and "one open exception per engagement" race-proof.
begin;

-- ------------------------------------------------------------------------------------------ helpers
-- Generic guards. Updatable columns are passed as trigger arguments; everything else is immutable.
create or replace function private.fsr_no_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'fsr: % rows are permanent evidence and cannot be deleted', tg_table_name using errcode = '42501';
end $$;

create or replace function private.fsr_no_truncate() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'fsr: % rows are permanent evidence and cannot be truncated', tg_table_name using errcode = '42501';
end $$;

create or replace function private.fsr_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'fsr: % is append-only', tg_table_name using errcode = '42501';
end $$;

-- Only the listed columns (tg_argv) may change; a row whose "status" is 'revoked' or 'closed' never changes again.
create or replace function private.fsr_limited_update() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
  v_col text;
begin
  foreach v_col in array tg_argv loop
    v_old := v_old - v_col;
    v_new := v_new - v_col;
  end loop;
  if v_old is distinct from v_new then
    raise exception 'fsr: only % may change on %', array_to_string(tg_argv, ', '), tg_table_name using errcode = '42501';
  end if;
  if (to_jsonb(old) ->> 'status') in ('revoked', 'closed') or (to_jsonb(old) ->> 'revoked_at') is not null then
    raise exception 'fsr: a revoked or closed % is final', tg_table_name using errcode = '42501';
  end if;
  return new;
end $$;

-- ------------------------------------------------------------------------------------------ 1. Founder identity
create table public.founder_identities (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  status text not null default 'active' check (status in ('active', 'revoked')),
  designation_reference text not null check (char_length(btrim(designation_reference)) >= 20),
  designated_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_reason text,
  constraint founder_identities_revocation_shape check (
    (status = 'active' and revoked_at is null and revoked_reason is null)
    or (status = 'revoked' and revoked_at is not null and char_length(btrim(coalesce(revoked_reason, ''))) >= 10))
);
comment on table public.founder_identities is
  'The durable Founder identity used by ORDIFT-POL-FSR-001. Created only by a Founder-authorized operator step (never by an application screen); profile_id is immutable; at most one active row.';
create unique index founder_identities_one_active on public.founder_identities (business_id) where status = 'active';
create unique index founder_identities_profile_active on public.founder_identities (profile_id) where status = 'active';
create trigger founder_identities_limited_update before update on public.founder_identities
  for each row execute function private.fsr_limited_update('status', 'revoked_at', 'revoked_reason');
create trigger founder_identities_no_delete before delete on public.founder_identities
  for each row execute function private.fsr_no_delete();

-- ------------------------------------------------------------------------------------------ 2. linked logins
create table public.founder_common_control_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  founder_identity_id uuid not null references public.founder_identities (id),
  profile_id uuid not null references public.profiles (id),
  note text not null check (char_length(btrim(note)) >= 10),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_reason text,
  constraint founder_common_control_revocation_shape check (
    (revoked_at is null and revoked_reason is null) or (revoked_at is not null and char_length(btrim(coalesce(revoked_reason, ''))) >= 10))
);
comment on table public.founder_common_control_accounts is
  'Logins under the Founder''s common control (for example a second Super Admin account). They are never independent reviewers of the Founder''s work and can never use the exception. Registering one does not alter the account itself.';
create unique index founder_common_control_one_active on public.founder_common_control_accounts (profile_id) where revoked_at is null;

create or replace function private.fsr_common_control_insert_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_founder uuid;
begin
  select f.profile_id into v_founder from public.founder_identities f where f.id = new.founder_identity_id and f.status = 'active';
  if v_founder is null then raise exception 'fsr: the Founder identity is not active'; end if;
  if v_founder = new.profile_id then raise exception 'fsr: the Founder profile cannot be registered as a linked account of itself'; end if;
  return new;
end $$;
create trigger founder_common_control_insert_guard before insert on public.founder_common_control_accounts
  for each row execute function private.fsr_common_control_insert_guard();
create trigger founder_common_control_limited_update before update on public.founder_common_control_accounts
  for each row execute function private.fsr_limited_update('revoked_at', 'revoked_reason');
create trigger founder_common_control_no_delete before delete on public.founder_common_control_accounts
  for each row execute function private.fsr_no_delete();

-- ------------------------------------------------------------------------------------------ 3. exception holder
create table public.self_review_exception_holders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  founder_identity_id uuid not null references public.founder_identities (id),
  policy_code text not null default 'ORDIFT-POL-FSR-001' check (policy_code = 'ORDIFT-POL-FSR-001'),
  authorization_reference text not null check (char_length(btrim(authorization_reference)) >= 20),
  effective_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  created_at timestamptz not null default now(),
  constraint self_review_holders_window check (expires_at is null or expires_at > effective_at),
  constraint self_review_holders_revocation_shape check (
    (revoked_at is null and revoked_reason is null) or (revoked_at is not null and char_length(btrim(coalesce(revoked_reason, ''))) >= 10))
);
comment on table public.self_review_exception_holders is
  'Explicit, revocable authorization of ORDIFT-POL-FSR-001 for the Founder identity. No active holder = the exception is unavailable to everyone.';
create unique index self_review_holders_one_active on public.self_review_exception_holders (founder_identity_id) where revoked_at is null;
create trigger self_review_holders_limited_update before update on public.self_review_exception_holders
  for each row execute function private.fsr_limited_update('revoked_at', 'revoked_reason', 'expires_at');
create trigger self_review_holders_no_delete before delete on public.self_review_exception_holders
  for each row execute function private.fsr_no_delete();

-- Lookup helpers. They are LANGUAGE sql, so PostgreSQL validates the tables they reference when the function is created:
-- they must therefore be defined after those tables exist (found by the first real-engine rehearsal).
create or replace function private.fsr_active_founder(p_profile uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select f.id from public.founder_identities f where f.profile_id = p_profile and f.status = 'active' limit 1
$$;

create or replace function private.fsr_active_holder(p_founder_identity uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select h.id from public.self_review_exception_holders h
   where h.founder_identity_id = p_founder_identity and h.revoked_at is null and h.effective_at <= now()
     and (h.expires_at is null or h.expires_at > now())
   limit 1
$$;

-- The Founder's "group": the PROFILE id of the Founder, for the Founder's own profile OR any login registered under the Founder's
-- common control. It is keyed on the Founder's profile (not on a founder_identities row) so that revoking and later re-designating
-- the Founder identity can never separate the Founder from the registered logins (found by the three-account rehearsal: a login
-- registered against an older identity row stopped matching a newly designated one). It is deliberately NOT limited to an ACTIVE
-- identity: revoking the exception or the identity must never turn a registered login back into an "independent" reviewer of the
-- Founder's work. Only revoking the registration itself does that.
create or replace function private.fsr_group(p_profile uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select f.profile_id from public.founder_identities f where f.profile_id = p_profile limit 1),
    (select f.profile_id from public.founder_common_control_accounts c join public.founder_identities f on f.id = c.founder_identity_id
      where c.profile_id = p_profile and c.revoked_at is null limit 1))
$$;

-- ------------------------------------------------------------------------------------------ 4. engagement exception
create table public.self_review_exceptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  engagement_id uuid not null references public.engagements (id),
  holder_id uuid not null references public.self_review_exception_holders (id),
  founder_profile_id uuid not null references public.profiles (id),
  justification text not null,
  conflict_acknowledgement text not null,
  conflict_acknowledged_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_at timestamptz not null default now(),
  expires_at timestamptz not null,
  closed_at timestamptz,
  closed_reason text,
  constraint self_review_exceptions_justification check (
    char_length(btrim(justification)) >= 30
    and array_length(regexp_split_to_array(btrim(justification), '\s+'), 1) >= 5),
  constraint self_review_exceptions_ack check (char_length(btrim(conflict_acknowledgement)) >= 40),
  constraint self_review_exceptions_window check (expires_at > opened_at),
  constraint self_review_exceptions_max_window check (expires_at <= opened_at + interval '7 days'),
  constraint self_review_exceptions_closure_shape check (
    (status = 'open' and closed_at is null and closed_reason is null)
    or (status = 'closed' and closed_at is not null and char_length(btrim(coalesce(closed_reason, ''))) >= 5))
);
comment on table public.self_review_exceptions is
  'One governed exception for ONE engagement. Covers only the declarations made under it; it never covers files added later and never another Crew Support job.';
create unique index self_review_exceptions_one_open on public.self_review_exceptions (engagement_id) where status = 'open';
create index self_review_exceptions_engagement_idx on public.self_review_exceptions (engagement_id, opened_at);

create or replace function private.fsr_exception_insert_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_founder_identity uuid;
  v_holder_profile uuid;
  v_payee uuid;
  v_entity text;
begin
  v_founder_identity := private.fsr_active_founder(new.founder_profile_id);
  if v_founder_identity is null then raise exception 'fsr: only the active, verified Founder identity can open the exception'; end if;
  if private.fsr_active_holder(v_founder_identity) is distinct from new.holder_id then raise exception 'fsr: the exception is not currently authorized for this Founder (holder missing, revoked or expired)'; end if;
  select e.payee_profile_id, e.entity_type into v_payee, v_entity from public.engagements e where e.id = new.engagement_id;
  if v_payee is distinct from new.founder_profile_id then raise exception 'fsr: the Founder is not the assigned performer of this engagement'; end if;
  if v_entity is distinct from 'crew_support_slot' then raise exception 'fsr: the exception applies only to Crew Support assignments'; end if;
  if new.status <> 'open' then raise exception 'fsr: an exception is created open'; end if;
  -- The seven-day window is the database's decision, not the caller's: whatever expiry was asked for is replaced.
  new.opened_at := now();
  new.expires_at := new.opened_at + interval '7 days';
  -- An exception that has lapsed (expired, or whose authorization was revoked/ended) must not block a new one: close it
  -- first, with the reason recorded. Concurrent attempts are still serialized by the one-open unique index.
  update public.self_review_exceptions e
     set status = 'closed', closed_at = now(), closed_reason = 'Closed automatically: the exception expired or its authorization is no longer active'
   where e.engagement_id = new.engagement_id and e.status = 'open'
     and (e.expires_at <= now()
          or not exists (select 1 from public.self_review_exception_holders h
                          where h.id = e.holder_id and h.revoked_at is null and h.effective_at <= now() and (h.expires_at is null or h.expires_at > now())));
  return new;
end $$;
create trigger self_review_exceptions_insert_guard before insert on public.self_review_exceptions
  for each row execute function private.fsr_exception_insert_guard();
create trigger self_review_exceptions_limited_update before update on public.self_review_exceptions
  for each row execute function private.fsr_limited_update('status', 'closed_at', 'closed_reason');
create trigger self_review_exceptions_no_delete before delete on public.self_review_exceptions
  for each row execute function private.fsr_no_delete();

-- ------------------------------------------------------------------------------------------ 5. viewing evidence
create table public.self_review_file_views (
  id uuid primary key default gen_random_uuid(),
  exception_id uuid not null references public.self_review_exceptions (id),
  file_id uuid not null references public.project_files (id),
  viewer_profile_id uuid not null references public.profiles (id),
  viewed_at timestamptz not null default now(),
  file_version integer not null,
  file_size_bytes bigint,
  file_storage_path text not null
);
comment on table public.self_review_file_views is
  'Server-side record that the review viewer issued a link for this exact version of the file to the Founder during the exception. Evidence the file was opened - not proof of visual inspection - and never the only control.';
create index self_review_file_views_lookup on public.self_review_file_views (exception_id, file_id, viewed_at);

create or replace function private.fsr_view_insert_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ex public.self_review_exceptions%rowtype;
  v_file public.project_files%rowtype;
begin
  select * into v_ex from public.self_review_exceptions where id = new.exception_id;
  if v_ex.id is null or v_ex.status <> 'open' or v_ex.expires_at <= now() then raise exception 'fsr: the exception is not open'; end if;
  if v_ex.founder_profile_id is distinct from new.viewer_profile_id then raise exception 'fsr: only the Founder can generate viewing evidence'; end if;
  select * into v_file from public.project_files where id = new.file_id;
  if v_file.id is null or v_file.engagement_id is distinct from v_ex.engagement_id then raise exception 'fsr: the file does not belong to the exception''s engagement'; end if;
  new.file_version := v_file.version;
  new.file_size_bytes := v_file.size_bytes;
  new.file_storage_path := v_file.storage_path;
  new.viewed_at := now();
  return new;
end $$;
create trigger self_review_file_views_insert_guard before insert on public.self_review_file_views
  for each row execute function private.fsr_view_insert_guard();
create trigger self_review_file_views_append_only before update or delete on public.self_review_file_views
  for each row execute function private.fsr_append_only();

-- ------------------------------------------------------------------------------------------ 6. declarations
create table public.self_review_declarations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  exception_id uuid not null references public.self_review_exceptions (id),
  kind text not null check (kind in ('review', 'release')),
  actor_profile_id uuid not null references public.profiles (id),
  file_ids uuid[] not null check (cardinality(file_ids) between 1 and 200),
  selection_snapshot jsonb not null check (jsonb_typeof(selection_snapshot) = 'array'),
  selection_hash text not null,
  review_confirmed_at timestamptz,
  confirmation_text text not null check (char_length(btrim(confirmation_text)) >= 20),
  release_set_confirmed_at timestamptz,
  typed_file_count integer not null,
  created_at timestamptz not null default now(),
  constraint self_review_declarations_review_confirmed check (kind <> 'review' or review_confirmed_at is not null),
  constraint self_review_declarations_release_confirmed check (kind <> 'release' or release_set_confirmed_at is not null),
  constraint self_review_declarations_count_matches check (typed_file_count = cardinality(file_ids))
);
comment on table public.self_review_declarations is
  'Append-only fixed selection for ONE review or release operation. The hash is computed by the database from the stored snapshot. A declaration is never itself proof of success: see self_review_declaration_files.outcome.';
create index self_review_declarations_exception_idx on public.self_review_declarations (exception_id, created_at);

create or replace function private.fsr_declaration_insert_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ex public.self_review_exceptions%rowtype;
  v_file public.project_files%rowtype;
  v_id uuid;
begin
  select * into v_ex from public.self_review_exceptions where id = new.exception_id for share;
  if v_ex.id is null or v_ex.status <> 'open' or v_ex.expires_at <= now() then raise exception 'fsr: the exception is not open or has expired'; end if;
  if v_ex.founder_profile_id is distinct from new.actor_profile_id then raise exception 'fsr: only the exception''s Founder can declare under it'; end if;
  if private.fsr_active_founder(new.actor_profile_id) is null then raise exception 'fsr: the Founder identity is not active'; end if;
  if private.fsr_active_holder(private.fsr_active_founder(new.actor_profile_id)) is distinct from v_ex.holder_id then raise exception 'fsr: the exception authorization is no longer active'; end if;
  if (select count(distinct x) from unnest(new.file_ids) x) <> cardinality(new.file_ids) then raise exception 'fsr: duplicate files in the selection'; end if;

  foreach v_id in array new.file_ids loop
    select * into v_file from public.project_files where id = v_id;
    if v_file.id is null or v_file.engagement_id is distinct from v_ex.engagement_id then raise exception 'fsr: file % is not part of the exception''s engagement', v_id; end if;
    if v_file.purged_at is not null then raise exception 'fsr: file % has been purged', v_id; end if;
    if v_file.file_kind not in ('deliverable', 'revision', 'final_approved') then raise exception 'fsr: file % is not a deliverable-type file', v_id; end if;
    -- the stored snapshot must describe the file exactly as it is now
    if not exists (
      select 1 from jsonb_array_elements(new.selection_snapshot) s
       where s ->> 'id' = v_id::text and (s ->> 'version')::int = v_file.version
         and (s ->> 'size_bytes') is not distinct from v_file.size_bytes::text and s ->> 'storage_path' = v_file.storage_path) then
      raise exception 'fsr: the snapshot does not match file %', v_id;
    end if;
    if new.kind = 'review' then
      if v_file.release_status not in ('submitted', 'approved', 'changes_requested') then raise exception 'fsr: file % is not awaiting review', v_id; end if;
      if not exists (
        select 1 from public.self_review_file_views w
         where w.exception_id = new.exception_id and w.file_id = v_id and w.viewer_profile_id = new.actor_profile_id
           and w.file_version = v_file.version and w.file_size_bytes is not distinct from v_file.size_bytes
           and w.file_storage_path = v_file.storage_path
           and w.viewed_at >= coalesce(v_file.submitted_for_release_at, v_file.uploaded_at)) then
        raise exception 'fsr: file % has not been opened in the review viewer for this exception', v_id;
      end if;
    else
      if v_file.release_status <> 'approved' then raise exception 'fsr: file % is not approved, so it cannot be released', v_id; end if;
    end if;
  end loop;

  new.selection_hash := encode(sha256(convert_to(new.selection_snapshot::text, 'utf8')), 'hex');
  new.created_at := now();
  return new;
end $$;
create trigger self_review_declarations_insert_guard before insert on public.self_review_declarations
  for each row execute function private.fsr_declaration_insert_guard();
create trigger self_review_declarations_append_only before update or delete on public.self_review_declarations
  for each row execute function private.fsr_append_only();

-- ------------------------------------------------------------------------------------------ 7. per-file decisions and truthful outcomes
create table public.self_review_declaration_files (
  id uuid primary key default gen_random_uuid(),
  declaration_id uuid not null references public.self_review_declarations (id),
  file_id uuid not null references public.project_files (id),
  decision text not null check (decision in ('approve', 'request_changes', 'reject', 'release')),
  note text,
  outcome text not null default 'pending' check (outcome in ('pending', 'applied', 'failed')),
  outcome_error text,
  outcome_at timestamptz,
  created_at timestamptz not null default now(),
  constraint self_review_decl_files_unique unique (declaration_id, file_id),
  constraint self_review_decl_files_note check (decision in ('approve', 'release') or char_length(btrim(coalesce(note, ''))) >= 5),
  constraint self_review_decl_files_outcome_shape check (
    (outcome = 'pending' and outcome_at is null and outcome_error is null)
    or (outcome = 'applied' and outcome_at is not null and outcome_error is null)
    or (outcome = 'failed' and outcome_at is not null and outcome_error is not null))
);
comment on table public.self_review_declaration_files is
  'The decision declared for each file and what actually happened. A declaration whose files are not all applied is never reported as successful.';

create or replace function private.fsr_decl_file_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_decl public.self_review_declarations%rowtype;
begin
  if tg_op = 'INSERT' then
    select * into v_decl from public.self_review_declarations where id = new.declaration_id;
    if v_decl.id is null or not (new.file_id = any (v_decl.file_ids)) then raise exception 'fsr: the file is not part of the declared selection'; end if;
    if (v_decl.kind = 'release') <> (new.decision = 'release') then raise exception 'fsr: the decision does not match the declaration kind'; end if;
    if new.outcome <> 'pending' then raise exception 'fsr: a decision starts pending'; end if;
    return new;
  end if;
  -- UPDATE: only the outcome may change, and an applied outcome is final
  if new.declaration_id is distinct from old.declaration_id or new.file_id is distinct from old.file_id
     or new.decision is distinct from old.decision or new.note is distinct from old.note then
    raise exception 'fsr: a declared decision cannot be altered';
  end if;
  if old.outcome = 'applied' then raise exception 'fsr: an applied outcome is final'; end if;
  return new;
end $$;
create trigger self_review_decl_files_guard before insert or update on public.self_review_declaration_files
  for each row execute function private.fsr_decl_file_guard();
create trigger self_review_decl_files_no_delete before delete on public.self_review_declaration_files
  for each row execute function private.fsr_no_delete();

-- ------------------------------------------------------------------------------------------ 8. append-only audit events
create table public.self_review_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  event text not null,
  exception_id uuid,
  declaration_id uuid,
  file_id uuid,
  actor_profile_id uuid,
  detail jsonb not null default '{}'::jsonb
);
create trigger self_review_events_append_only before update or delete on public.self_review_events
  for each row execute function private.fsr_append_only();

create or replace function private.fsr_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'self_review_exceptions' then
    if tg_op = 'INSERT' then
      insert into public.self_review_events (event, exception_id, actor_profile_id, detail)
      values ('exception_opened', new.id, new.founder_profile_id, jsonb_build_object('engagement_id', new.engagement_id, 'expires_at', new.expires_at, 'justification', new.justification));
    elsif new.status = 'closed' and old.status = 'open' then
      insert into public.self_review_events (event, exception_id, actor_profile_id, detail)
      values ('exception_closed', new.id, new.founder_profile_id, jsonb_build_object('reason', new.closed_reason));
    end if;
  elsif tg_table_name = 'self_review_declarations' then
    insert into public.self_review_events (event, exception_id, declaration_id, actor_profile_id, detail)
    values ('declaration_' || new.kind, new.exception_id, new.id, new.actor_profile_id, jsonb_build_object('file_count', cardinality(new.file_ids), 'selection_hash', new.selection_hash));
  elsif tg_table_name = 'self_review_declaration_files' then
    if tg_op = 'UPDATE' and new.outcome is distinct from old.outcome then
      insert into public.self_review_events (event, declaration_id, file_id, detail)
      values ('file_' || new.outcome, new.declaration_id, new.file_id, jsonb_build_object('decision', new.decision, 'error', new.outcome_error));
    end if;
  elsif tg_table_name = 'self_review_exception_holders' or tg_table_name = 'founder_identities' or tg_table_name = 'founder_common_control_accounts' then
    insert into public.self_review_events (event, detail)
    values (tg_table_name || '_' || lower(tg_op), jsonb_build_object('row_id', new.id));
  end if;
  return null;
end $$;
create trigger self_review_exceptions_audit after insert or update on public.self_review_exceptions for each row execute function private.fsr_audit();
create trigger self_review_declarations_audit after insert on public.self_review_declarations for each row execute function private.fsr_audit();
create trigger self_review_decl_files_audit after update on public.self_review_declaration_files for each row execute function private.fsr_audit();
create trigger self_review_holders_audit after insert or update on public.self_review_exception_holders for each row execute function private.fsr_audit();
create trigger founder_identities_audit after insert or update on public.founder_identities for each row execute function private.fsr_audit();
create trigger founder_common_control_audit after insert or update on public.founder_common_control_accounts for each row execute function private.fsr_audit();

-- ------------------------------------------------------------------------------------------ 9. project_files integration
alter table public.project_files
  add column release_review_declaration_id uuid references public.self_review_declarations (id),
  add column release_declaration_id uuid references public.self_review_declarations (id);
comment on column public.project_files.release_review_declaration_id is 'Set only when the reviewer was the performer under ORDIFT-POL-FSR-001; validated by trigger.';
comment on column public.project_files.release_declaration_id is 'Set only when the releaser was the performer under ORDIFT-POL-FSR-001; validated by trigger.';

-- Column-only rule kept as a CHECK (it queries no other table): the reviewer/releaser may equal the uploader or
-- submitter ONLY when a declaration reference is present. WHETHER that declaration is valid is checked by trigger.
alter table public.project_files drop constraint project_files_release_separation;
alter table public.project_files add constraint project_files_release_separation check (
  (release_reviewed_by is null
    or (release_reviewed_by is distinct from uploaded_by and release_reviewed_by is distinct from submitted_for_release_by)
    or release_review_declaration_id is not null)
  and (released_by is null
    or (released_by is distinct from uploaded_by and released_by is distinct from submitted_for_release_by)
    or release_declaration_id is not null));

-- The existing server-only guard (authenticated/anon can never change release columns) now also covers the new columns.
create or replace function private.guard_project_file_release_columns() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.release_status is distinct from 'private' or new.client_title is not null or new.client_description is not null
       or new.submitted_for_release_at is not null or new.submitted_for_release_by is not null or new.release_reviewed_by is not null
       or new.release_reviewed_at is not null or new.release_review_note is not null or new.released_at is not null
       or new.released_by is not null or new.deliverable_id is not null
       or new.release_review_declaration_id is not null or new.release_declaration_id is not null then
      raise exception 'release_columns_server_only' using errcode = '42501';
    end if;
  elsif (new.release_status, new.release_category, new.client_title, new.client_description, new.submitted_for_release_at, new.submitted_for_release_by,
         new.release_reviewed_by, new.release_reviewed_at, new.release_review_note, new.released_at, new.released_by, new.deliverable_id,
         new.release_review_declaration_id, new.release_declaration_id)
        is distinct from
        (old.release_status, old.release_category, old.client_title, old.client_description, old.submitted_for_release_at, old.submitted_for_release_by,
         old.release_reviewed_by, old.release_reviewed_at, old.release_review_note, old.released_at, old.released_by, old.deliverable_id,
         old.release_review_declaration_id, old.release_declaration_id) then
    raise exception 'release_columns_server_only' using errcode = '42501';
  end if;
  return new;
end $$;

-- Validates a declaration for one file and one actor. Raises with a specific message on the first failure.
create or replace function private.fsr_validate_declaration(p_decl uuid, p_kind text, p_file public.project_files, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_decl public.self_review_declarations%rowtype;
  v_ex public.self_review_exceptions%rowtype;
  v_row public.self_review_declaration_files%rowtype;
  v_expected text;
begin
  select * into v_decl from public.self_review_declarations where id = p_decl;
  if v_decl.id is null then raise exception 'fsr: unknown declaration'; end if;
  if v_decl.kind <> p_kind then raise exception 'fsr: this declaration is for a % operation', v_decl.kind; end if;
  if v_decl.actor_profile_id is distinct from p_actor then raise exception 'fsr: the declaration belongs to a different person'; end if;
  if v_decl.created_at < now() - interval '2 hours' then raise exception 'fsr: the declaration is stale - declare again'; end if;
  select * into v_ex from public.self_review_exceptions where id = v_decl.exception_id for share;
  if v_ex.status <> 'open' or v_ex.expires_at <= now() then raise exception 'fsr: the exception is closed or expired'; end if;
  if v_ex.engagement_id is distinct from p_file.engagement_id then raise exception 'fsr: the exception covers a different engagement'; end if;
  if v_ex.founder_profile_id is distinct from p_actor or private.fsr_active_founder(p_actor) is null then raise exception 'fsr: the actor is not the verified Founder'; end if;
  if private.fsr_active_holder(private.fsr_active_founder(p_actor)) is distinct from v_ex.holder_id then raise exception 'fsr: the exception authorization is no longer active'; end if;
  if not (p_file.id = any (v_decl.file_ids)) then raise exception 'fsr: the file is not in the declared selection'; end if;
  -- the file must still be exactly what was declared (a file changed or replaced after the declaration cannot ride on it)
  if not exists (
    select 1 from jsonb_array_elements(v_decl.selection_snapshot) s
     where s ->> 'id' = p_file.id::text and (s ->> 'version')::int = p_file.version
       and (s ->> 'size_bytes') is not distinct from p_file.size_bytes::text and s ->> 'storage_path' = p_file.storage_path) then
    raise exception 'fsr: the file changed after it was declared (snapshot no longer matches) - declare again';
  end if;
  select * into v_row from public.self_review_declaration_files where declaration_id = p_decl and file_id = p_file.id for update;
  if v_row.id is null then raise exception 'fsr: no decision was declared for this file'; end if;
  v_expected := case v_row.decision when 'approve' then 'approved' when 'request_changes' then 'changes_requested' when 'reject' then 'withdrawn' when 'release' then 'released' end;
  if p_file.release_status is distinct from v_expected then raise exception 'fsr: the declared decision (%) does not match the resulting status (%)', v_row.decision, p_file.release_status; end if;
  if p_kind = 'review' and p_file.release_review_note is distinct from v_row.note and v_row.decision <> 'approve' then raise exception 'fsr: the review note differs from the declared note'; end if;
end $$;

create or replace function private.fsr_check_actor(p_file public.project_files, p_actor uuid, p_kind text, p_decl uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_perf uuid[];
  v_assignee uuid;
  v_group uuid;
begin
  select e.payee_profile_id into v_assignee from public.engagements e where e.id = p_file.engagement_id;
  v_perf := array_remove(array[p_file.uploaded_by, p_file.submitted_for_release_by, v_assignee], null);
  v_group := private.fsr_group(p_actor);
  -- A login under the Founder's common control is never independent of the Founder's work, in either direction.
  if v_group is not null and exists (select 1 from unnest(v_perf) pf where pf is distinct from p_actor and private.fsr_group(pf) = v_group) then
    raise exception 'fsr: accounts under the Founder''s common control are not independent reviewers';
  end if;
  if p_actor = any (v_perf) then
    if p_decl is null then raise exception 'fsr: reviewing or releasing your own work requires a valid self-review declaration'; end if;
    perform private.fsr_validate_declaration(p_decl, p_kind, p_file, p_actor);
  elsif p_decl is not null then
    raise exception 'fsr: a self-review declaration may be used only by the performer';
  end if;
end $$;

create or replace function private.project_files_fsr_separation_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.release_reviewed_by is not null
     and (new.release_reviewed_by is distinct from old.release_reviewed_by or new.release_review_declaration_id is distinct from old.release_review_declaration_id) then
    perform private.fsr_check_actor(new, new.release_reviewed_by, 'review', new.release_review_declaration_id);
  end if;
  if new.released_by is not null
     and (new.released_by is distinct from old.released_by or new.release_declaration_id is distinct from old.release_declaration_id) then
    perform private.fsr_check_actor(new, new.released_by, 'release', new.release_declaration_id);
  end if;
  if new.release_review_declaration_id is not null and new.release_reviewed_by is null then raise exception 'fsr: a review declaration needs a recorded reviewer'; end if;
  if new.release_declaration_id is not null and new.released_by is null then raise exception 'fsr: a release declaration needs a recorded releaser'; end if;
  return new;
end $$;
create trigger project_files_fsr_separation_guard before update on public.project_files
  for each row execute function private.project_files_fsr_separation_guard();

-- ------------------------------------------------------------------------------------------ 10. server functions (service_role only)
-- Each function is one transaction. If anything fails, nothing it did persists; the caller then records the failure
-- through fsr_record_failure (its own transaction), so a declaration is never left looking successful.

create or replace function public.fsr_apply_review(p_declaration uuid, p_file uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.self_review_declaration_files%rowtype;
  v_decl public.self_review_declarations%rowtype;
  v_status text;
  v_from text[];
begin
  select * into v_decl from public.self_review_declarations where id = p_declaration;
  if v_decl.id is null or v_decl.kind <> 'review' then raise exception 'fsr: not a review declaration'; end if;
  select * into v_row from public.self_review_declaration_files where declaration_id = p_declaration and file_id = p_file for update;
  if v_row.id is null then raise exception 'fsr: no decision was declared for this file'; end if;
  if v_row.outcome = 'applied' then return 'already_applied'; end if;
  v_status := case v_row.decision when 'approve' then 'approved' when 'request_changes' then 'changes_requested' when 'reject' then 'withdrawn' end;
  v_from := case v_row.decision when 'approve' then array['submitted'] when 'request_changes' then array['submitted', 'approved'] else array['submitted', 'approved', 'changes_requested'] end;
  update public.project_files
     set release_status = v_status, release_reviewed_by = v_decl.actor_profile_id, release_reviewed_at = now(),
         release_review_note = v_row.note, release_review_declaration_id = p_declaration
   where id = p_file and release_status = any (v_from);
  if not found then raise exception 'fsr: the file changed or is no longer in a reviewable state'; end if;
  update public.self_review_declaration_files set outcome = 'applied', outcome_at = now(), outcome_error = null where id = v_row.id;
  return 'applied';
end $$;

create or replace function public.fsr_claim_release(p_declaration uuid, p_file uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.self_review_declaration_files%rowtype;
  v_decl public.self_review_declarations%rowtype;
begin
  select * into v_decl from public.self_review_declarations where id = p_declaration;
  if v_decl.id is null or v_decl.kind <> 'release' then raise exception 'fsr: not a release declaration'; end if;
  select * into v_row from public.self_review_declaration_files where declaration_id = p_declaration and file_id = p_file for update;
  if v_row.id is null then raise exception 'fsr: no release was declared for this file'; end if;
  if v_row.outcome = 'applied' then return 'already_applied'; end if;
  update public.project_files
     set release_status = 'released', released_at = now(), released_by = v_decl.actor_profile_id, release_declaration_id = p_declaration
   where id = p_file and release_status = 'approved';
  if not found then raise exception 'fsr: the file is not approved any more'; end if;
  return 'claimed';
end $$;

-- Called after the client-facing deliverable row exists; only then is the release outcome 'applied'.
create or replace function public.fsr_confirm_release(p_declaration uuid, p_file uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_row public.self_review_declaration_files%rowtype;
begin
  select * into v_row from public.self_review_declaration_files where declaration_id = p_declaration and file_id = p_file for update;
  if v_row.id is null then raise exception 'fsr: no release was declared for this file'; end if;
  -- "applied" must mean the file really is released under THIS declaration AND the client-facing deliverable exists.
  if not exists (select 1 from public.project_files f
                  where f.id = p_file and f.release_status = 'released' and f.release_declaration_id = p_declaration and f.deliverable_id is not null) then
    raise exception 'fsr: the release is not complete: the file is not released under this declaration or has no client-facing deliverable';
  end if;
  update public.self_review_declaration_files set outcome = 'applied', outcome_at = now(), outcome_error = null where id = v_row.id and outcome <> 'applied';
end $$;

-- Puts a claimed-but-unpublished release back to 'approved' and records the failure truthfully.
create or replace function public.fsr_revert_release(p_declaration uuid, p_file uuid, p_error text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_row public.self_review_declaration_files%rowtype;
begin
  select * into v_row from public.self_review_declaration_files where declaration_id = p_declaration and file_id = p_file for update;
  if v_row.id is null then raise exception 'fsr: no release was declared for this file'; end if;
  if v_row.outcome = 'applied' then raise exception 'fsr: an applied release cannot be reverted'; end if;
  update public.project_files
     set release_status = 'approved', released_at = null, released_by = null, release_declaration_id = null
   where id = p_file and release_declaration_id = p_declaration and release_status = 'released' and deliverable_id is null;
  update public.self_review_declaration_files
     set outcome = 'failed', outcome_at = now(), outcome_error = coalesce(nullif(btrim(p_error), ''), 'release failed')
   where declaration_id = p_declaration and file_id = p_file and outcome <> 'applied';
end $$;

create or replace function public.fsr_record_failure(p_declaration uuid, p_file uuid, p_error text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.self_review_declaration_files
     set outcome = 'failed', outcome_at = now(), outcome_error = coalesce(nullif(btrim(p_error), ''), 'failed')
   where declaration_id = p_declaration and file_id = p_file and outcome = 'pending';
end $$;

-- Derived, never stored: what a declaration actually achieved.
create or replace view public.self_review_declaration_status with (security_invoker = true) as
select d.id as declaration_id, d.exception_id, d.kind, d.created_at,
       count(f.*) as files,
       count(f.*) filter (where f.outcome = 'applied') as applied,
       count(f.*) filter (where f.outcome = 'failed') as failed,
       count(f.*) filter (where f.outcome = 'pending') as pending,
       case when count(f.*) filter (where f.outcome = 'applied') = count(f.*) and count(f.*) > 0 then 'completed'
            when count(f.*) filter (where f.outcome = 'applied') > 0 then 'partial'
            when count(f.*) filter (where f.outcome = 'failed') > 0 then 'failed'
            else 'pending' end as status
  from public.self_review_declarations d
  left join public.self_review_declaration_files f on f.declaration_id = d.id
 group by d.id;

-- ------------------------------------------------------------------------------------------ 11. privileges
-- TRUNCATE bypasses row triggers, so it is blocked on every evidence table by a statement trigger (it also stops
-- TRUNCATE ... CASCADE from reaching project_files through the new declaration columns).
create trigger founder_identities_no_truncate before truncate on public.founder_identities for each statement execute function private.fsr_no_truncate();
create trigger founder_common_control_no_truncate before truncate on public.founder_common_control_accounts for each statement execute function private.fsr_no_truncate();
create trigger self_review_holders_no_truncate before truncate on public.self_review_exception_holders for each statement execute function private.fsr_no_truncate();
create trigger self_review_exceptions_no_truncate before truncate on public.self_review_exceptions for each statement execute function private.fsr_no_truncate();
create trigger self_review_file_views_no_truncate before truncate on public.self_review_file_views for each statement execute function private.fsr_no_truncate();
create trigger self_review_declarations_no_truncate before truncate on public.self_review_declarations for each statement execute function private.fsr_no_truncate();
create trigger self_review_decl_files_no_truncate before truncate on public.self_review_declaration_files for each statement execute function private.fsr_no_truncate();
create trigger self_review_events_no_truncate before truncate on public.self_review_events for each statement execute function private.fsr_no_truncate();

alter table public.founder_identities enable row level security;
alter table public.founder_common_control_accounts enable row level security;
alter table public.self_review_exception_holders enable row level security;
alter table public.self_review_exceptions enable row level security;
alter table public.self_review_file_views enable row level security;
alter table public.self_review_declarations enable row level security;
alter table public.self_review_declaration_files enable row level security;
alter table public.self_review_events enable row level security;

create policy "founder_identities: super admin read" on public.founder_identities for select to authenticated using ((select private.is_super_admin()));
create policy "founder_common_control: super admin read" on public.founder_common_control_accounts for select to authenticated using ((select private.is_super_admin()));
create policy "self_review_holders: super admin read" on public.self_review_exception_holders for select to authenticated using ((select private.is_super_admin()));
create policy "self_review_exceptions: super admin read" on public.self_review_exceptions for select to authenticated using ((select private.is_super_admin()));
create policy "self_review_views: super admin read" on public.self_review_file_views for select to authenticated using ((select private.is_super_admin()));
create policy "self_review_declarations: super admin read" on public.self_review_declarations for select to authenticated using ((select private.is_super_admin()));
create policy "self_review_decl_files: super admin read" on public.self_review_declaration_files for select to authenticated using ((select private.is_super_admin()));
create policy "self_review_events: super admin read" on public.self_review_events for select to authenticated using ((select private.is_super_admin()));

revoke all on public.founder_identities, public.founder_common_control_accounts, public.self_review_exception_holders, public.self_review_exceptions,
  public.self_review_file_views, public.self_review_declarations, public.self_review_declaration_files, public.self_review_events from public, anon, authenticated, service_role;
grant select on public.founder_identities, public.founder_common_control_accounts, public.self_review_exception_holders, public.self_review_exceptions,
  public.self_review_file_views, public.self_review_declarations, public.self_review_declaration_files, public.self_review_events to authenticated;
grant select, insert, update on public.founder_identities, public.founder_common_control_accounts, public.self_review_exception_holders, public.self_review_exceptions to service_role;
grant select, insert on public.self_review_file_views, public.self_review_declarations, public.self_review_events to service_role;
grant select, insert, update on public.self_review_declaration_files to service_role;
revoke all on public.self_review_declaration_status from public, anon, authenticated, service_role;
grant select on public.self_review_declaration_status to service_role;

revoke all on function public.fsr_apply_review(uuid, uuid), public.fsr_claim_release(uuid, uuid), public.fsr_confirm_release(uuid, uuid),
  public.fsr_revert_release(uuid, uuid, text), public.fsr_record_failure(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fsr_apply_review(uuid, uuid), public.fsr_claim_release(uuid, uuid), public.fsr_confirm_release(uuid, uuid),
  public.fsr_revert_release(uuid, uuid, text), public.fsr_record_failure(uuid, uuid, text) to service_role;
revoke all on function private.fsr_active_founder(uuid), private.fsr_active_holder(uuid), private.fsr_group(uuid) from public, anon, authenticated;

commit;
