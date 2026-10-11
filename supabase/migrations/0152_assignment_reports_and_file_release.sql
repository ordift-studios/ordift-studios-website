-- Crew Support assignment workspace: job-completion reports and the controlled release of an
-- assignment's files to the client. Extends the EXISTING engagements / project_files / deliverables /
-- enquiry_notes — no parallel file, deliverable or notification system.
--
-- 1. assignment_reports: append-only VERSIONS of a professional's job-completion report. The original is
--    never overwritten; a correction is a new version that names what it supersedes and why. Readable
--    only by the reporting professional and administrators (never clients). Written only by the server.
-- 2. project_files: release workflow columns. Every file stays PRIVATE (release_status = 'private') until
--    it is submitted, approved and released by management. Nothing about existing files changes.
-- 3. deliverables.project_file_id: links a client-visible deliverable to the private file it came from, so
--    the client can download it through an authorised, audited route (no public or raw storage link).
-- 4. New deliverable categories, as data (preview / thank-you / selections / gallery / video / design).
-- Additive only. No existing row is rewritten.
begin;

-- ------------------------------------------------------------------ 1. job reports
create table public.assignment_reports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  engagement_id uuid not null references public.engagements (id),
  slot_id uuid references public.crew_support_slots (id),
  request_id uuid references public.crew_support_requests (id),
  reporter_id uuid not null references public.profiles (id),
  version integer not null check (version >= 1),
  supersedes_id uuid references public.assignment_reports (id),
  correction_reason text,
  service_family text,
  actual_service_date date not null,
  actual_start_time text,
  actual_end_time text,
  completion_status text not null check (completion_status in ('completed', 'partial', 'not_performed')),
  went_smoothly boolean,
  answers jsonb not null default '{}'::jsonb,
  incidents text,
  client_requests text,
  additional_services text,
  outstanding_work text,
  remarks text,
  submitted_at timestamptz not null default now(),
  constraint assignment_reports_version_unique unique (engagement_id, version),
  constraint assignment_reports_correction_shape check (
    (version = 1 and supersedes_id is null and correction_reason is null)
    or (version > 1 and supersedes_id is not null and char_length(btrim(coalesce(correction_reason, ''))) >= 5)
  )
);
comment on table public.assignment_reports is
  'A professional''s job-completion report for one assignment (engagement). Append-only versions; INTERNAL — never shown to clients. An internal record to support fair review, not conclusive evidence.';
create index assignment_reports_engagement_idx on public.assignment_reports (engagement_id, version);

alter table public.assignment_reports enable row level security;
create policy "assignment_reports: reporter or admin read" on public.assignment_reports
  for select to authenticated using (reporter_id = (select auth.uid()) or (select private.is_admin_or_super_admin()));
revoke all on public.assignment_reports from anon, authenticated, service_role;
grant select on public.assignment_reports to authenticated;
-- append-only for everyone, including server code
grant select, insert on public.assignment_reports to service_role;

-- ------------------------------------------------------------------ 3. deliverable link
alter table public.deliverables add column project_file_id uuid references public.project_files (id);
create unique index deliverables_one_per_project_file on public.deliverables (project_file_id) where project_file_id is not null;

-- ------------------------------------------------------------------ 2. file release workflow
alter table public.project_files
  add column release_category text check (release_category is null or release_category in
    ('sneak_peek', 'thank_you_image', 'edited_selection', 'final_gallery', 'video_preview', 'final_video', 'design_draft', 'final_design', 'other')),
  add column release_status text not null default 'private' check (release_status in
    ('private', 'submitted', 'changes_requested', 'approved', 'released', 'withdrawn')),
  add column client_title text,
  add column client_description text,
  add column submitted_for_release_at timestamptz,
  add column submitted_for_release_by uuid references public.profiles (id),
  add column release_reviewed_by uuid references public.profiles (id),
  add column release_reviewed_at timestamptz,
  add column release_review_note text,
  add column released_at timestamptz,
  add column released_by uuid references public.profiles (id),
  add column deliverable_id uuid references public.deliverables (id);
create index project_files_release_idx on public.project_files (release_status) where release_status <> 'private';

-- Defence in depth: the release columns are changed ONLY by server code (service role), after the application
-- has checked who may approve or release. The existing "staff manage" policy would otherwise let any staff
-- member's own session set release_status = 'approved' directly, and the contractor insert policy would let a
-- contractor insert a row that already claims to be released. Both are refused here; migrations, the service
-- role and superusers are unaffected.
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
       or new.released_by is not null or new.deliverable_id is not null then
      raise exception 'release_columns_server_only' using errcode = '42501';
    end if;
  elsif (new.release_status, new.release_category, new.client_title, new.client_description, new.submitted_for_release_at, new.submitted_for_release_by,
         new.release_reviewed_by, new.release_reviewed_at, new.release_review_note, new.released_at, new.released_by, new.deliverable_id)
        is distinct from
        (old.release_status, old.release_category, old.client_title, old.client_description, old.submitted_for_release_at, old.submitted_for_release_by,
         old.release_reviewed_by, old.release_reviewed_at, old.release_review_note, old.released_at, old.released_by, old.deliverable_id) then
    raise exception 'release_columns_server_only' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function private.guard_project_file_release_columns() from public;
create trigger project_files_release_columns_guard before insert or update on public.project_files
  for each row execute function private.guard_project_file_release_columns();

-- ------------------------------------------------------------------ 4. categories (data)
insert into public.deliverable_categories (business_id, key, label, sort_order) values
  (public.ordift_studios_business_id(), 'sneak-peeks', 'Sneak Peeks', 12),
  (public.ordift_studios_business_id(), 'thank-you-images', 'Thank-You Images', 14),
  (public.ordift_studios_business_id(), 'edited-selections', 'Edited Selections', 16),
  (public.ordift_studios_business_id(), 'final-gallery', 'Final Photography Gallery', 18),
  (public.ordift_studios_business_id(), 'video-previews', 'Video Previews', 22),
  (public.ordift_studios_business_id(), 'design-drafts', 'Graphic Design Drafts', 24),
  (public.ordift_studios_business_id(), 'final-designs', 'Final Designs', 26)
on conflict (business_id, key) do nothing;

commit;
