begin;

-- ============================================================
-- Phase H.1/H.2 (2026-09-04) — External Workforce Portal + Media
-- Lifecycle. Purely additive: no existing table/column/constraint is
-- dropped or narrowed, no existing row is touched, no existing policy
-- is removed. Every check constraint widened below only ADDS an
-- allowed value; every new table/policy/function is net-new.
-- ============================================================

-- ------------------------------------------------------------
-- Part 1 — engagement-scoped access, parallel to (not a replacement
-- for) private.has_project_access(). Deliberately a separate function
-- rather than force-fitting engagements into project_assignments:
-- engagements already has a direct, singular payee_profile_id column
-- (one contractor per engagement, by the existing Payables design —
-- see 0049), unlike project_assignments' many-to-many model built for
-- enquiry/workshop_registration. Reusing the simpler, already-correct
-- ownership shape is safer than bending a differently-shaped table to
-- fit. Mirrors has_project_access()'s exact security posture (security
-- definer, stable, empty search_path, same profile-active checks).
-- ------------------------------------------------------------
create or replace function private.has_engagement_access(p_engagement_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.engagements e
    join public.profiles p on p.id = e.payee_profile_id
    where e.id = p_engagement_id
      and e.payee_profile_id = (select auth.uid())
      and p.access_status = 'active'
      and (p.access_expires_at is null or p.access_expires_at > now())
  );
$$;

revoke all on function private.has_engagement_access(uuid) from public, anon, authenticated, service_role;
grant execute on function private.has_engagement_access(uuid) to authenticated;

-- ------------------------------------------------------------
-- Part 2 — widen project_updates.entity_type to also allow
-- 'engagement', additively (existing 'enquiry'/'workshop_registration'
-- rows and policies are completely untouched), then add the matching
-- read/insert policies for the new entity_type using the new
-- function above. Reuses project_updates as the Feedback/Updates
-- surface for engagement-linked work, per instruction — no new table.
-- ------------------------------------------------------------
alter table public.project_updates drop constraint project_updates_entity_type_check;
alter table public.project_updates add constraint project_updates_entity_type_check
  check (entity_type in ('enquiry', 'workshop_registration', 'engagement'));

create policy "project_updates: contractor read assigned engagement" on public.project_updates
  for select
  to authenticated
  using (entity_type = 'engagement' and (select private.has_engagement_access(entity_id)));

create policy "project_updates: contractor insert assigned engagement" on public.project_updates
  for insert
  to authenticated
  with check (
    entity_type = 'engagement'
    and author_user_id = (select auth.uid())
    and (select private.has_engagement_access(entity_id))
  );

-- ------------------------------------------------------------
-- Part 3 — project_files: additive, new table. Owner is always the
-- engagement (payee_profile_id already IS the assigned contractor);
-- no separate assignment table needed for this. File bytes are never
-- stored here — storage_bucket/storage_path point at the actual
-- Supabase Storage object.
-- ------------------------------------------------------------
create table public.project_files (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  engagement_id uuid not null references public.engagements (id),
  file_kind text not null check (file_kind in (
    'source_raw', 'source_reference', 'intermediate', 'working',
    'deliverable', 'final_approved', 'revision', 'archive_reference', 'other'
  )),
  storage_bucket text not null default 'project-media',
  storage_path text not null,
  original_filename text not null,
  mime_type text,
  size_bytes bigint,
  version integer not null default 1,
  uploaded_by uuid not null references public.profiles (id),
  uploaded_at timestamptz not null default now(),
  notes text,
  -- Lifecycle (Section 14-22 of the Phase H.1/H.2 spec). A file
  -- progresses active -> backup_required -> backup_confirmed ->
  -- eligible_for_cleanup -> cleanup_scheduled -> purged. Nothing
  -- automated writes this column yet in this migration — application
  -- code drives every transition, and the purge job (added in library
  -- code, not here) only ever acts on rows already satisfying every
  -- gate in Section 17.
  lifecycle_state text not null default 'active' check (lifecycle_state in (
    'active', 'backup_required', 'backup_confirmed', 'eligible_for_cleanup', 'cleanup_scheduled', 'purged'
  )),
  retain boolean not null default false,
  retain_until timestamptz,
  backup_confirmed_by uuid references public.profiles (id),
  backup_confirmed_at timestamptz,
  purge_scheduled_at timestamptz,
  purged_at timestamptz,
  purge_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.project_files is
  'Metadata for large media (RAW/video/PSD/deliverables) uploaded to the project-media Storage bucket for a Universal Payables engagement. File bytes are never stored here — storage_bucket/storage_path reference the actual Supabase Storage object, uploaded/downloaded exclusively via short-lived signed URLs generated server-side after an authorization check (same established convention as payment-proofs/payout-evidence/recruitment-applications). Rows for a purged file are retained permanently (purged_at set, storage object deleted) — see Section 22 of the Phase H.1/H.2 spec: this preserves project history without paying indefinitely for the actual bytes. final_approved files are never purge-eligible regardless of any other flag — classification determines retention, not file extension or lifecycle_state alone.';

create index project_files_engagement_idx on public.project_files (engagement_id);
create index project_files_lifecycle_idx on public.project_files (lifecycle_state) where purged_at is null;

alter table public.project_files enable row level security;

create policy "project_files: staff manage" on public.project_files
  for all
  to authenticated
  using ((select private.is_staff_or_admin()))
  with check ((select private.is_staff_or_admin()));

create policy "project_files: contractor read own engagement" on public.project_files
  for select
  to authenticated
  using ((select private.has_engagement_access(engagement_id)));

-- Contractor may upload their own submitted work (deliverable/revision)
-- against an assigned engagement, but not source/reference material
-- (staff-provided) and never a file already marked final_approved on
-- insert — matches "Ordift reviews... editor uploads revised version"
-- from the spec while keeping staff as the sole authority over what
-- counts as a source asset or a final, retained deliverable.
create policy "project_files: contractor insert own deliverable" on public.project_files
  for insert
  to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and file_kind in ('deliverable', 'revision')
    and (select private.has_engagement_access(engagement_id))
  );

-- No authenticated UPDATE/DELETE policy: a contractor can never alter
-- lifecycle_state, retain, backup confirmation, or any other field of
-- their own or anyone else's file row (including their own uploads) —
-- only staff (via the "staff manage" policy above, which covers ALL
-- commands) can. No DELETE policy exists for any authenticated role at
-- all; the purge job runs exclusively via the service-role admin
-- client, matching this schema's established "no destructive path for
-- ordinary users" convention (e.g. exchange_rates has no
-- update/delete policy either).

grant select, insert on public.project_files to authenticated;
grant select, insert, update, delete on public.project_files to service_role;

-- ------------------------------------------------------------
-- Part 4 — the private media bucket. NOT public. File size ceiling set
-- to 5GB per object (comfortably covers RAW batches and typical single
-- video clips; well below Supabase Pro's actual 500GB/file platform
-- ceiling, chosen as a deliberate MVP guard-rail against one runaway
-- upload — raisable later without a migration, it's a plain bucket
-- setting). MIME allow-list is deliberately broad (RAW camera files
-- have no universally-registered MIME type and commonly arrive as
-- application/octet-stream) — access is gated by per-engagement RLS
-- and short-lived signed URLs, not by MIME filtering, which is a
-- content-type hint, not a security boundary.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-media',
  'project-media',
  false,
  5368709120, -- 5GB
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/tiff', 'image/heic', 'image/heif', 'image/bmp',
    'image/vnd.adobe.photoshop', 'application/x-photoshop', 'application/photoshop',
    'image/x-canon-cr2', 'image/x-canon-cr3', 'image/x-nikon-nef', 'image/x-sony-arw',
    'image/x-adobe-dng', 'image/x-panasonic-rw2', 'image/x-olympus-orf', 'image/x-fuji-raf',
    'application/octet-stream',
    'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm', 'video/mpeg',
    'application/pdf', 'application/zip', 'application/x-zip-compressed',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
);

-- Object path convention: {engagement_id}/{uuid}-{filename} — first
-- path segment is the owning engagement's id, matching the existing
-- storage.foldername(name)[1] technique used by every other private
-- bucket. Primary authorization happens server-side (admin client,
-- after an explicit has_engagement_access()-equivalent check) before
-- any signed URL is ever issued — these RLS policies are defense in
-- depth for the same reason the download-signed-URL buckets already
-- carry policies despite reads going through signed URLs today.
create policy "project-media: staff manage" on storage.objects
  for all
  to authenticated
  using (bucket_id = 'project-media' and (select private.is_staff_or_admin()))
  with check (bucket_id = 'project-media' and (select private.is_staff_or_admin()));

create policy "project-media: contractor read own engagement" on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'project-media'
    and (select private.has_engagement_access((storage.foldername(name))[1]::uuid))
  );

create policy "project-media: contractor insert own engagement" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'project-media'
    and (select private.has_engagement_access((storage.foldername(name))[1]::uuid))
  );

commit;
