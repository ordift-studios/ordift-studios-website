-- Migration 0180 — INDEPENDENT-INSTRUCTOR STANDARDS, ACKNOWLEDGEMENTS, SESSION SCHEDULES AND RIGHTS MATRIX. NOT applied to Production until the Founder authorizes the apply step (backup gate + exact file hash).
-- Rollback: supabase/proposals/ROLLBACK_0180_instructor_standards_and_assignments.sql. Rehearsed locally: src/lib/instructors/instructors.localdb.e2e.ts.
--
-- WHAT (reusable for every independent instructor; nothing is specific to one person).
--   * instructor_standards_versions: the versioned Independent Instructor Standards. A version is a DRAFT until management ADOPTS it. Adoption is refused by the database unless the full text contains no
--     unresolved "[[DECISION" placeholder and the designated contact, safeguarding contact, escalation contact and emergency instructions are all recorded (nothing is invented). Adopted text is frozen
--     (the only later change is retirement). At most one version is adopted at a time. The text's SHA-256 is computed by the database.
--   * instructor_standards_acknowledgements: one row per person per version: the exact version and hash acknowledged, typed full name, consent statement, IP and user agent, timestamp. Append-only.
--     The database refuses an acknowledgement of anything but the CURRENTLY ADOPTED version, and of any hash that differs from that version's hash (an unadopted draft can never be acknowledged).
--   * instructor_session_schedules + instructor_rights_matrix: one assignment = one Session Schedule (instructor, programme, venue, dates, duration, frequency, responsibilities, compensation reference,
--     regulatory clearance) plus its Rights Matrix. A schedule is PROPOSED until approved; approval is refused by the database unless the framework agreement is executed, the person has acknowledged the
--     adopted standards, regulatory clearance is recorded with a reference, the Rights Matrix has NO unset permission and no unresolved decision, and the core terms are present. Approved terms are frozen.
--     Rights default to UNSET: nothing is granted unless a person records it.
--
-- NOT HERE. No existing table, function, policy, grant or row is touched. Employee HR policies (policy_acknowledgements) are not used. The signature vault, banking and payments are not touched.
-- PRIVACY. Row-level security ON, no policy for signed-in roles: only server code (service role) after its own authority checks. The service role can select, insert and update (guards limit updates); never delete.

begin;

-- ---------------------------------------------------------------------------------------------------------------- standards versions
create table public.instructor_standards_versions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  applies_to text not null default 'independent_instructor' check (applies_to = 'independent_instructor'),
  version_label text not null check (char_length(btrim(version_label)) between 1 and 40),
  title text not null check (char_length(btrim(title)) between 3 and 200),
  body_text text not null check (char_length(body_text) between 200 and 60000),
  body_sha256 text not null default '' ,
  designated_contact text,
  safeguarding_contact text,
  escalation_contact text,
  emergency_instructions text,
  status text not null default 'draft' check (status in ('draft', 'adopted', 'retired')),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default clock_timestamp(),
  adopted_by uuid references public.profiles (id),
  adopted_at timestamptz,
  adoption_note text,
  retired_by uuid references public.profiles (id),
  retired_at timestamptz,
  unique (applies_to, version_label),
  check ((status = 'draft' and adopted_at is null and retired_at is null)
      or (status = 'adopted' and adopted_at is not null and adopted_by is not null and retired_at is null)
      or (status = 'retired' and adopted_at is not null and retired_at is not null))
);
create unique index instructor_standards_one_adopted on public.instructor_standards_versions (applies_to) where status = 'adopted';
comment on table public.instructor_standards_versions is 'Versioned Independent Instructor Standards. Draft until adopted by management (database refuses adoption with unresolved placeholders or missing contacts); adopted text is frozen; one adopted version at a time.';

create or replace function private.instructor_standards_versions_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  frozen text[] := array['id', 'business_id', 'applies_to', 'created_by', 'created_at'];
  k text;
begin
  if tg_op = 'DELETE' then raise exception 'instructor_standards_versions rows are never deleted' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'a new standards version must start as a draft' using errcode = '42501'; end if;
    new.body_sha256 := encode(sha256(convert_to(new.body_text, 'UTF8')), 'hex');
    return new;
  end if;
  foreach k in array frozen loop
    if (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then raise exception 'standards version field is immutable (%)', k using errcode = '42501'; end if;
  end loop;
  if old.status = 'draft' and new.status = 'draft' then
    new.body_sha256 := encode(sha256(convert_to(new.body_text, 'UTF8')), 'hex');
    return new;
  elsif old.status = 'draft' and new.status = 'adopted' then
    new.body_sha256 := encode(sha256(convert_to(new.body_text, 'UTF8')), 'hex');
    if new.body_text like '%[[DECISION%' then raise exception 'adoption refused: the text still contains an unresolved [[DECISION placeholder' using errcode = '42501'; end if;
    if char_length(btrim(coalesce(new.designated_contact, ''))) < 5 or char_length(btrim(coalesce(new.safeguarding_contact, ''))) < 5
       or char_length(btrim(coalesce(new.escalation_contact, ''))) < 5 or char_length(btrim(coalesce(new.emergency_instructions, ''))) < 5 then
      raise exception 'adoption refused: the designated contact, safeguarding contact, escalation contact and emergency instructions must all be recorded' using errcode = '42501';
    end if;
    new.adopted_at := clock_timestamp();
    if new.adopted_by is null then raise exception 'adoption refused: no adopter recorded' using errcode = '42501'; end if;
    return new;
  elsif old.status = 'adopted' and new.status = 'retired' then
    if (to_jsonb(new) - 'status' - 'retired_by' - 'retired_at') <> (to_jsonb(old) - 'status' - 'retired_by' - 'retired_at') then raise exception 'only retirement may change an adopted version' using errcode = '42501'; end if;
    new.retired_at := clock_timestamp();
    if new.retired_by is null then raise exception 'retirement refused: no person recorded' using errcode = '42501'; end if;
    return new;
  end if;
  raise exception 'this standards version change is not allowed (% -> %)', old.status, new.status using errcode = '42501';
end $$;
revoke all on function private.instructor_standards_versions_guard() from public, anon, authenticated;
create trigger instructor_standards_versions_guard before insert or update or delete on public.instructor_standards_versions for each row execute function private.instructor_standards_versions_guard();

-- ---------------------------------------------------------------------------------------------------------------- acknowledgements (append-only)
create table public.instructor_standards_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  version_id uuid not null references public.instructor_standards_versions (id),
  document_sha256 text not null check (document_sha256 ~ '^[0-9a-f]{64}$'),
  typed_full_name text not null check (char_length(btrim(typed_full_name)) >= 3),
  consent_statement text not null check (char_length(btrim(consent_statement)) >= 20),
  ip_address text,
  user_agent text,
  acknowledged_at timestamptz not null default clock_timestamp(),
  unique (profile_id, version_id)
);
create index instructor_standards_ack_profile_idx on public.instructor_standards_acknowledgements (profile_id, acknowledged_at desc);

create or replace function private.instructor_standards_ack_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v record;
begin
  if tg_op <> 'INSERT' then raise exception 'instructor_standards_acknowledgements is append-only' using errcode = '42501'; end if;
  select status, body_sha256 into v from public.instructor_standards_versions where id = new.version_id;
  if not found or v.status <> 'adopted' then raise exception 'acknowledgement refused: only the currently adopted standards can be acknowledged (a draft or retired version cannot)' using errcode = '42501'; end if;
  if new.document_sha256 <> v.body_sha256 then raise exception 'acknowledgement refused: the acknowledged hash is not the adopted text''s hash' using errcode = '42501'; end if;
  return new;
end $$;
revoke all on function private.instructor_standards_ack_guard() from public, anon, authenticated;
create trigger instructor_standards_ack_guard before insert or update or delete on public.instructor_standards_acknowledgements for each row execute function private.instructor_standards_ack_guard();

-- ---------------------------------------------------------------------------------------------------------------- session schedules
create table public.instructor_session_schedules (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  instructor_profile_id uuid not null references public.profiles (id),
  agreement_id uuid not null references public.agreements (id),
  engagement_id uuid references public.workshop_instructor_engagements (id),
  workshop_id text,
  programme_name text not null check (char_length(btrim(programme_name)) between 3 and 200),
  venue text not null check (char_length(btrim(venue)) between 3 and 300),
  timezone text not null default 'Africa/Accra' check (char_length(btrim(timezone)) between 3 and 60),
  first_session_at timestamptz not null,
  last_session_at timestamptz,
  duration_minutes integer not null check (duration_minutes between 15 and 1440),
  frequency text not null check (char_length(btrim(frequency)) between 3 and 200),
  responsibilities text not null check (char_length(btrim(responsibilities)) between 10 and 2000),
  compensation_reference text not null check (char_length(btrim(compensation_reference)) between 3 and 300),
  regulatory_clearance text not null default 'pending' check (regulatory_clearance in ('pending', 'not_required', 'confirmed')),
  regulatory_evidence_reference text,
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'cancelled', 'completed')),
  standards_version_id uuid references public.instructor_standards_versions (id),
  proposed_by uuid not null references public.profiles (id),
  created_at timestamptz not null default clock_timestamp(),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  closed_by uuid references public.profiles (id),
  closed_at timestamptz,
  close_note text,
  check (last_session_at is null or last_session_at >= first_session_at),
  check ((status = 'proposed' and approved_at is null and closed_at is null)
      or (status = 'approved' and approved_at is not null and approved_by is not null and standards_version_id is not null and closed_at is null)
      or (status in ('cancelled', 'completed') and closed_at is not null))
);
create index instructor_session_schedules_instructor_idx on public.instructor_session_schedules (instructor_profile_id, first_session_at desc);
comment on table public.instructor_session_schedules is 'One independent-instructor assignment. PROPOSED until approved; the database refuses approval unless the agreement is executed, the adopted standards are acknowledged, regulatory clearance is recorded and the rights matrix is fully resolved. Approved terms are frozen.';

create table public.instructor_rights_matrix (
  schedule_id uuid primary key references public.instructor_session_schedules (id),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  teaching_materials_use text not null default 'unset' check (teaching_materials_use in ('unset', 'permitted', 'not_permitted')),
  material_ownership text not null default 'unset' check (material_ownership in ('unset', 'instructor_retains', 'assigned_to_ordift', 'licensed_to_ordift')),
  photography text not null default 'unset' check (photography in ('unset', 'permitted', 'not_permitted')),
  recording text not null default 'unset' check (recording in ('unset', 'permitted', 'not_permitted')),
  participant_data_access text not null default 'unset' check (participant_data_access in ('unset', 'none', 'limited_to_session', 'data_processing_terms_required')),
  publication_promotion text not null default 'unset' check (publication_promotion in ('unset', 'permitted', 'not_permitted')),
  sharing_reuse_restrictions text,
  agreement_policy_references text,
  unresolved_decisions text,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default clock_timestamp()
);
comment on table public.instructor_rights_matrix is 'Per-assignment rights. Every permission starts UNSET and is never inferred; unresolved decisions are flagged in unresolved_decisions. Editable only while the schedule is proposed.';

create or replace function private.instructor_session_schedules_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  frozen text[] := array['id', 'business_id', 'instructor_profile_id', 'agreement_id', 'proposed_by', 'created_at'];
  k text; m record; v record; a record;
begin
  if tg_op = 'DELETE' then raise exception 'instructor_session_schedules rows are never deleted' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if new.status <> 'proposed' then raise exception 'a new schedule must start as proposed' using errcode = '42501'; end if;
    if not exists (select 1 from public.agreements g where g.id = new.agreement_id and g.primary_context_reference = new.instructor_profile_id::text) then raise exception 'the agreement does not belong to this instructor' using errcode = '42501'; end if;
    return new;
  end if;
  foreach k in array frozen loop
    if (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then raise exception 'schedule field is immutable (%)', k using errcode = '42501'; end if;
  end loop;
  if old.status = 'proposed' and new.status = 'proposed' then return new; end if;
  if old.status = 'proposed' and new.status = 'cancelled' then
    if new.closed_by is null then raise exception 'cancellation refused: no person recorded' using errcode = '42501'; end if;
    new.closed_at := clock_timestamp(); return new;
  end if;
  if old.status = 'proposed' and new.status = 'approved' then
    if new.approved_by is null then raise exception 'approval refused: no approver recorded' using errcode = '42501'; end if;
    select executed_at into a from public.agreements where id = new.agreement_id;
    if a.executed_at is null then raise exception 'approval refused: the framework agreement is not executed' using errcode = '42501'; end if;
    select id, body_sha256 into v from public.instructor_standards_versions where applies_to = 'independent_instructor' and status = 'adopted';
    if not found then raise exception 'approval refused: no instructor standards are adopted' using errcode = '42501'; end if;
    if not exists (select 1 from public.instructor_standards_acknowledgements x where x.profile_id = new.instructor_profile_id and x.version_id = v.id and x.document_sha256 = v.body_sha256) then
      raise exception 'approval refused: the instructor has not acknowledged the adopted standards' using errcode = '42501';
    end if;
    if new.regulatory_clearance not in ('not_required', 'confirmed') or char_length(btrim(coalesce(new.regulatory_evidence_reference, ''))) < 5 then
      raise exception 'approval refused: regulatory clearance (or a documented reason none is required) is not recorded with a reference' using errcode = '42501';
    end if;
    select * into m from public.instructor_rights_matrix where schedule_id = new.id;
    if not found or m.teaching_materials_use = 'unset' or m.material_ownership = 'unset' or m.photography = 'unset' or m.recording = 'unset' or m.participant_data_access = 'unset' or m.publication_promotion = 'unset' then
      raise exception 'approval refused: the rights matrix has unset permissions' using errcode = '42501';
    end if;
    if char_length(btrim(coalesce(m.unresolved_decisions, ''))) > 0 then raise exception 'approval refused: the rights matrix has unresolved decisions flagged for management' using errcode = '42501'; end if;
    new.standards_version_id := v.id;
    new.approved_at := clock_timestamp();
    return new;
  end if;
  if old.status = 'approved' and new.status in ('completed', 'cancelled') then
    if (to_jsonb(new) - 'status' - 'closed_by' - 'closed_at' - 'close_note') <> (to_jsonb(old) - 'status' - 'closed_by' - 'closed_at' - 'close_note') then raise exception 'approved terms are frozen' using errcode = '42501'; end if;
    if new.closed_by is null then raise exception 'closing refused: no person recorded' using errcode = '42501'; end if;
    new.closed_at := clock_timestamp(); return new;
  end if;
  raise exception 'this schedule change is not allowed (% -> %)', old.status, new.status using errcode = '42501';
end $$;
revoke all on function private.instructor_session_schedules_guard() from public, anon, authenticated;
create trigger instructor_session_schedules_guard before insert or update or delete on public.instructor_session_schedules for each row execute function private.instructor_session_schedules_guard();

create or replace function private.instructor_rights_matrix_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s record;
begin
  if tg_op = 'DELETE' then raise exception 'instructor_rights_matrix rows are never deleted' using errcode = '42501'; end if;
  select status into s from public.instructor_session_schedules where id = new.schedule_id;
  if not found or s.status <> 'proposed' then raise exception 'the rights matrix can only be changed while the schedule is proposed' using errcode = '42501'; end if;
  if tg_op = 'UPDATE' and new.schedule_id <> old.schedule_id then raise exception 'the matrix cannot be moved to another schedule' using errcode = '42501'; end if;
  new.updated_at := clock_timestamp();
  return new;
end $$;
revoke all on function private.instructor_rights_matrix_guard() from public, anon, authenticated;
create trigger instructor_rights_matrix_guard before insert or update or delete on public.instructor_rights_matrix for each row execute function private.instructor_rights_matrix_guard();

-- ---------------------------------------------------------------------------------------------------------------- privileges: server code only
alter table public.instructor_standards_versions enable row level security;
alter table public.instructor_standards_acknowledgements enable row level security;
alter table public.instructor_session_schedules enable row level security;
alter table public.instructor_rights_matrix enable row level security;
revoke all on public.instructor_standards_versions, public.instructor_standards_acknowledgements, public.instructor_session_schedules, public.instructor_rights_matrix from anon, authenticated, service_role;
grant select, insert, update on public.instructor_standards_versions to service_role;
grant select, insert on public.instructor_standards_acknowledgements to service_role;
grant select, insert, update on public.instructor_session_schedules to service_role;
grant select, insert, update on public.instructor_rights_matrix to service_role;

commit;
