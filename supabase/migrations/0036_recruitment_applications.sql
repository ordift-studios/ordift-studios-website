-- Recruitment / "Join Our Team" applications (2026-08-24).
--
-- Deliberately its own table, not folded into `enquiries` — an
-- enquiry is a prospective CLIENT booking a service; a recruitment
-- application is a prospective COLLABORATOR applying to join the
-- studio. Different audience, different fields (CV, portrait, role
-- interest vs. service/budget/timeframe), different reviewers, and a
-- different eventual outcome (a hire, not a booking) — forcing it into
-- `enquiries.service` would mean bolting recruitment-only columns onto
-- a client-facing CRM table and complicating every existing enquiries
-- query/report with a second, unrelated row shape. Same "public
-- INSERT via service-role, staff/admin-only SELECT via RLS" security
-- shape as `enquiries`, applied independently.
--
-- Admin-only (not staff) read access, per explicit direction —
-- narrower than `enquiries`' staff-or-admin tier, since recruitment
-- applications carry more sensitive personal data (CV, headshot,
-- contact details) than a client enquiry does.
--
-- No column here ever creates or references an auth.users/profiles
-- row, and no trigger/function in this migration touches profiles,
-- user_roles, staff_details, public_profile_details, or
-- team_showcase_entries — submitting an application must never
-- automatically create a Staff account, an Admin account, or a public
-- Team profile. A future "Convert to Staff" / "Add to Team" admin
-- action can read full_name/email/phone from here to prefill an
-- invite, but that stays a deliberate, separate, manual admin action —
-- not built as part of this migration.

begin;

create table public.recruitment_applications (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  location text,
  role_interest text not null,
  engagement_type text,
  intro text,
  experience text,
  portfolio_url text,
  social_url text,
  availability text,
  message text,
  -- Storage object paths (bucket: recruitment-applications, private),
  -- never a public URL — the Admin review page generates a short-lived
  -- signed URL on demand via a server action, same pattern as
  -- payment-proofs (see 0024_payments_foundation.sql).
  photo_storage_path text,
  cv_storage_path text,
  consent_acknowledged boolean not null default false,
  status text not null default 'new'
    check (status in ('new', 'reviewing', 'shortlisted', 'interview', 'accepted', 'rejected', 'archived')),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  submitted_at timestamptz not null default now()
);

create index recruitment_applications_status_idx on public.recruitment_applications (status);
create index recruitment_applications_submitted_at_idx on public.recruitment_applications (submitted_at desc);

comment on table public.recruitment_applications is
  'Join Our Team applications (2026-08-24) — a prospective collaborator applying, never a Staff/Admin/Team-profile record on its own. Public submit via service-role only (see /api/careers/apply); admin-only read via RLS. photo_storage_path/cv_storage_path are private Storage object paths, resolved to signed URLs on demand by an admin-gated server action, never a direct public URL.';

alter table public.recruitment_applications enable row level security;

-- Admin/Super Admin only — narrower than the staff-or-admin tier most
-- internal tables use, per explicit direction (recruitment data is
-- more sensitive than a client enquiry).
create policy "recruitment_applications: admin read" on public.recruitment_applications
  for select to authenticated
  using ((select private.has_role('admin')) or (select private.is_super_admin()));

create policy "recruitment_applications: admin update" on public.recruitment_applications
  for update to authenticated
  using ((select private.has_role('admin')) or (select private.is_super_admin()))
  with check ((select private.has_role('admin')) or (select private.is_super_admin()));

grant select, update on public.recruitment_applications to authenticated;
grant select, insert, update, delete on public.recruitment_applications to service_role;

create trigger recruitment_applications_set_updated_at
  before update on public.recruitment_applications
  for each row execute function public.set_updated_at();

-- ============================================================
-- Storage — private bucket for CVs and profile-photograph uploads.
-- Same shape as payment-proofs (0024): public = false, access
-- exclusively via short-lived signed URLs generated server-side after
-- an admin-authorization check, never a public/listable path.
-- Applicants are never authenticated, so all writes happen via the
-- service-role client from /api/careers/apply — no `authenticated`
-- insert policy is needed or granted here.
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recruitment-applications',
  'recruitment-applications',
  false,
  8388608, -- 8MB, same ceiling as payment-proofs/portfolio/staff-portrait uploads
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
);

-- Object path convention: {application_id}/{photo|cv}-{filename} —
-- same technique as payment-proofs/staff-portraits (lets RLS check via
-- a path segment without a join, though reads here go through the
-- admin client + signed URLs regardless).
create policy "recruitment-applications: admin read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'recruitment-applications'
    and ((select private.has_role('admin')) or (select private.is_super_admin()))
  );

commit;
