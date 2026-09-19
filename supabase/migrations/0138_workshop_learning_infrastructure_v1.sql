-- Workshop / Instructor Portal / Participant Learning Portal V1
-- (2026-09-19).
--
-- Purely additive against the already-substantial, already-live
-- Workshop system audited before this migration: Sanity `workshop`
-- content (title/description/capacity/dates/venue/instructors/flat
-- agenda array with no per-block date/instructor/venue), Supabase
-- workshop_registrations (+ ticket_types, attendance_status,
-- certificate_issued/certificate_url — all pre-existing, untouched),
-- workshop_instructor_engagements (compensation, reused unchanged),
-- workshop_travel_assistance_requests (unchanged). Nothing here
-- duplicates any of that.
--
-- Six new tables close the genuine gaps the audit found — none of
-- this existed anywhere in the schema:
--   workshop_sessions              — the real OPERATIONAL schedule
--     (dated, timed, per-block instructor/venue), separate from
--     Sanity's `agenda` array (which stays exactly what it already
--     is: flat public marketing copy, Studio-edited, untouched).
--   workshop_materials             — governed teaching resources with
--     tiered visibility (admin/instructor/participant).
--   workshop_announcements         — workshop-scoped communications.
--   workshop_briefs                — creative briefs/exercises.
--   workshop_submissions           — a participant's own submitted
--     work against a brief.
--   workshop_submission_feedback   — instructor critique, append-only
--     (a submission may receive more than one feedback row over time
--     — e.g. after a revision — so history is never overwritten).
--
-- Authorization pattern deliberately copies the ALREADY-ESTABLISHED
-- convention this exact Workshop system uses (see
-- src/lib/workshops/instructorEngagements.ts's isEngagedOnWorkshop()):
-- RLS here stays simple (staff/admin coarse read, service_role full
-- access — the same shape as workshop_instructor_engagements'
-- "admin read" policy) and the REAL instructor/participant scoping
-- happens server-side, in the TS layer, via createAdminClient() plus
-- an explicit engagement/registration-ownership check before any read
-- or write — exactly like listRegistrationsForInstructorWorkshop()
-- and updateWorkshopAttendanceAsInstructor() already do. This is not
-- a weaker approach than per-row RLS: every one of these tables is
-- reachable only through server-only library functions (never a
-- direct client-side Supabase query), so the admin-client app-layer
-- check IS the enforcement boundary, matching this codebase's
-- established pattern throughout (vendor_documents' own
-- canAccessVendorDocuments() dual-actor check is the other precedent
-- for this same idiom).
--
-- workshop_id / session's own workshop_id are text, referencing the
-- Sanity workshop document id — the exact same no-FK convention every
-- other workshop table in this schema already uses (ticket_types,
-- workshop_instructor_engagements), since workshop content itself
-- lives in Sanity, not Postgres.

begin;

-- ============================================================
-- Sessions — the operational schedule
-- ============================================================
create table public.workshop_sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  workshop_id text not null,
  session_date date not null,
  start_time time not null,
  end_time time,
  title text not null,
  description text,
  session_type text not null default 'session',
  instructor_profile_id uuid references public.profiles (id),
  location_override text,
  internal_notes text,
  participant_notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

comment on table public.workshop_sessions is
  'The real, dated, timed operational schedule for a workshop — deliberately separate from Sanity workshop.agenda (a flat, undated, public marketing-copy array with no per-block instructor/venue, Studio-edited, unaffected by this table). A simple one-day workshop is not required to have any rows here at all; the admin dashboard and portals fall back to the workshop''s own single startDate/endDate when no session rows exist. session_type is unconstrained application-validated text (e.g. session|break|practical|critique), matching this schema''s established convention for this class of field. instructor_profile_id is optional — a simple workshop need not assign a per-session instructor, and the workshop-level workshop_instructor_engagements record remains the source of truth for who is engaged overall.';

comment on column public.workshop_sessions.location_override is
  'Session-specific venue/room or online-joining text, when it differs from the workshop-level venue in Sanity. Null = use the workshop-level venue.';

alter table public.workshop_sessions enable row level security;

create policy "workshop_sessions: staff read" on public.workshop_sessions
  for select to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.workshop_sessions to authenticated;
grant select, insert, update, delete on public.workshop_sessions to service_role;

create trigger workshop_sessions_set_updated_at
  before update on public.workshop_sessions
  for each row execute function public.set_updated_at();

create index workshop_sessions_workshop_id_idx on public.workshop_sessions (workshop_id, session_date, start_time);
create index workshop_sessions_instructor_idx on public.workshop_sessions (instructor_profile_id) where instructor_profile_id is not null;

-- ============================================================
-- Materials — governed teaching resources
-- ============================================================
create table public.workshop_materials (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  workshop_id text not null,
  session_id uuid references public.workshop_sessions (id) on delete set null,
  title text not null,
  description text,
  storage_path text,
  external_url text,
  visibility text not null default 'participant',
  available_from timestamptz,
  uploaded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workshop_materials_location_check check (storage_path is not null or external_url is not null)
);

comment on table public.workshop_materials is
  'Governed workshop teaching resources — PDFs, images, reference/RAW/PSD files, lighting diagrams, presets, worksheets, briefs, post-session resources. Exactly one of storage_path (private workshop-materials Storage bucket, signed-URL delivery only — never a public/authenticated-read policy) or external_url (a reference video/link) is expected. visibility: ''admin'' | ''instructor'' | ''participant'' (application-validated, unconstrained) — ordered narrowest-to-widest audience is the OPPOSITE of intuitive naming, so the real rule lives in code, not the DB: ''admin'' = internal-only, ''instructor'' = admin+engaged instructors, ''participant'' = admin+instructors+registered participants. available_from supports pre/session/post-workshop timing (null = available immediately once visible).';

alter table public.workshop_materials enable row level security;

create policy "workshop_materials: staff read" on public.workshop_materials
  for select to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.workshop_materials to authenticated;
grant select, insert, update, delete on public.workshop_materials to service_role;

create trigger workshop_materials_set_updated_at
  before update on public.workshop_materials
  for each row execute function public.set_updated_at();

create index workshop_materials_workshop_id_idx on public.workshop_materials (workshop_id);

-- Private bucket — same shape/precedent as vendor-documents (0122):
-- staff manage everything; there is deliberately NO authenticated
-- read/insert policy for instructors or participants, because
-- visibility here is tiered (admin/instructor/participant) in a way a
-- storage-object-path RLS policy cannot express — every non-staff
-- download goes through a signed URL minted server-side only after
-- the visibility + engagement/registration check in
-- src/lib/workshops/materials.ts passes. This is a STRICTER posture
-- than vendor-documents' "owner reads their own folder" policy, not a
-- weaker one.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'workshop-materials',
  'workshop-materials',
  false,
  524288000, -- 500MB — creative reference/RAW/PSD files are large; still bounded, not unlimited
  null -- creative files span many types (images, PDFs, RAW, PSD, video); no single allow-list fits, matching project-media's precedent of leaving this unconstrained for creative work product
);

create policy "workshop-materials: staff manage" on storage.objects
  for all to authenticated
  using (bucket_id = 'workshop-materials' and (select private.is_staff_or_admin()))
  with check (bucket_id = 'workshop-materials' and (select private.is_staff_or_admin()));

-- ============================================================
-- Announcements — workshop-scoped communications
-- ============================================================
create table public.workshop_announcements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  workshop_id text not null,
  session_id uuid references public.workshop_sessions (id) on delete set null,
  title text not null,
  message text not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.workshop_announcements is
  'Workshop-scoped communications (venue change, preparation reminder, new material available, schedule adjustment, post-workshop resources) — a lightweight, in-portal announcement list. Deliberately NOT a second general messaging system: the existing "Notify Registrants" email broadcast (sendWorkshopNoticeAction, unchanged) remains the email-delivery mechanism for urgent notices; this table is the persistent, workshop-scoped read history participants and instructors see inside their own portals.';

alter table public.workshop_announcements enable row level security;

create policy "workshop_announcements: staff read" on public.workshop_announcements
  for select to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.workshop_announcements to authenticated;
grant select, insert, update, delete on public.workshop_announcements to service_role;

create index workshop_announcements_workshop_id_idx on public.workshop_announcements (workshop_id, created_at desc);

-- ============================================================
-- Briefs — creative briefs / exercises / practical assignments
-- ============================================================
create table public.workshop_briefs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  workshop_id text not null,
  session_id uuid references public.workshop_sessions (id) on delete set null,
  title text not null,
  instructions text not null,
  due_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.workshop_briefs is
  'A Creative Brief / Exercise / Practical Assignment for a workshop (Ordift terminology — deliberately not "homework"/"assignment" in the generic school sense). due_at is optional (many workshop practicals are same-session, no due date at all).';

alter table public.workshop_briefs enable row level security;

create policy "workshop_briefs: staff read" on public.workshop_briefs
  for select to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.workshop_briefs to authenticated;
grant select, insert, update, delete on public.workshop_briefs to service_role;

create trigger workshop_briefs_set_updated_at
  before update on public.workshop_briefs
  for each row execute function public.set_updated_at();

create index workshop_briefs_workshop_id_idx on public.workshop_briefs (workshop_id);

-- ============================================================
-- Submissions — a participant's own submitted work against a brief
-- ============================================================
create table public.workshop_submissions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  brief_id uuid not null references public.workshop_briefs (id) on delete cascade,
  registration_id uuid not null references public.workshop_registrations (id) on delete cascade,
  note text,
  storage_paths text[] not null default '{}',
  revision_of uuid references public.workshop_submissions (id),
  submitted_at timestamptz not null default now()
);

comment on table public.workshop_submissions is
  'A participant''s own submitted work (files/media + optional note) against a workshop_brief — tied to registration_id (their own workshop_registrations row), never a separate participant identity. revision_of chains to the prior submission when a revision is explicitly requested and resubmitted (see workshop_submission_feedback.status) — a resubmission is always a NEW row, never an overwrite of the original, preserving full history.';

alter table public.workshop_submissions enable row level security;

create policy "workshop_submissions: staff read" on public.workshop_submissions
  for select to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.workshop_submissions to authenticated;
grant select, insert, update, delete on public.workshop_submissions to service_role;

create index workshop_submissions_brief_id_idx on public.workshop_submissions (brief_id);
create index workshop_submissions_registration_id_idx on public.workshop_submissions (registration_id);

-- Same bucket as materials (private, staff-manage-only policy already
-- covers it) — participant uploads go through a signed upload URL
-- minted server-side only after verifying the caller owns the target
-- registration_id, exactly the materials-download pattern mirrored
-- for the opposite (upload) direction.

-- ============================================================
-- Submission feedback — instructor critique, append-only history
-- ============================================================
create table public.workshop_submission_feedback (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  submission_id uuid not null references public.workshop_submissions (id) on delete cascade,
  instructor_profile_id uuid not null references public.profiles (id),
  feedback_text text not null,
  status text not null default 'reviewed',
  attachment_url text,
  created_at timestamptz not null default now()
);

comment on table public.workshop_submission_feedback is
  'Instructor critique on a specific submission — append-only (never updated or deleted by application code) so feedback history is preserved exactly as given, matching this codebase''s "never silently overwrite a historical record" convention (e.g. attendance corrections). status: ''reviewed'' | ''revision_requested'' (application-validated, unconstrained) — never an academic grade/GPA/score, per policy. A participant sees only feedback on THEIR OWN submissions; group/shared critique is explicitly out of scope for V1 (would require a future, explicitly-configured workshop setting, never a default).';

alter table public.workshop_submission_feedback enable row level security;

create policy "workshop_submission_feedback: staff read" on public.workshop_submission_feedback
  for select to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.workshop_submission_feedback to authenticated;
grant select, insert, update, delete on public.workshop_submission_feedback to service_role;

create index workshop_submission_feedback_submission_id_idx on public.workshop_submission_feedback (submission_id);

commit;
