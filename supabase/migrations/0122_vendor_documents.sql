-- Ordift Studios Vendor Completion Phase — Vendor Document/Evidence
-- Management (2026-09-15).
--
-- The existing vendor architecture (vendor_profiles, the "vendor" role,
-- the vendor_supplier engagement_type, payee_profiles/Universal
-- Payables) has no document-upload mechanism at all today — the Vendor
-- Portal & Vendor Onboarding Readiness Audit confirmed
-- ownerHasFilesModule() explicitly returns false for the vendor
-- relationship (that flag governs PROJECT deliverable files, a
-- deliberately different concern from vendor onboarding EVIDENCE, e.g.
-- a company registration certificate — this table is new, not a
-- workaround of that flag).
--
-- Shape combines two existing precedents rather than inventing a third:
--   - employing_entity_documents (migration 0105) — owner-scoped
--     evidence file + private Storage bucket + uploaded_by/uploaded_at.
--   - legal_document_versions (migration 0067) — review status +
--     reviewer + timestamp + expiry (retired_at-equivalent) +
--     supersession chain (supersedes_id).
--
-- Ownership key is vendor_profile_id, referencing public.profiles
-- directly (not public.vendor_profiles) — same convention already used
-- by public.payment_instructions.profile_id, since profiles is the one
-- universal identity table and vendor_profiles.id is itself always
-- equal to profiles.id (1:1).
--
-- document_type/status are unconstrained text (no CHECK), matching
-- this codebase's established convention for an application-validated
-- classification field (leave_requests.status, work_pattern_type,
-- etc.) — the application currently recognizes status values
-- 'pending_review' | 'approved' | 'rejected'.

begin;

create table public.vendor_documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  vendor_profile_id uuid not null references public.profiles (id),
  document_type text not null,
  storage_path text not null,
  notes text,
  status text not null default 'pending_review',
  uploaded_by uuid not null references public.profiles (id),
  uploaded_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  expires_at date,
  supersedes_id uuid references public.vendor_documents (id),
  created_at timestamptz not null default now()
);

comment on table public.vendor_documents is
  'Vendor onboarding/compliance evidence — company registration, tax certificate, bank-detail evidence, signed agreement scans, etc. Distinct from public.project_files (deliverable work product) and from public.employing_entity_documents (a DIFFERENT ownership concept — Ordift''s own legal entities, not an external vendor). status: pending_review | approved | rejected (application-validated, unconstrained). supersedes_id chains to the prior version of the same evidence when re-uploaded, mirroring legal_document_versions.';

alter table public.vendor_documents enable row level security;

-- Vendor reads only their own documents; staff/admin read all.
create policy "vendor_documents: read own or staff" on public.vendor_documents
  for select
  to authenticated
  using ((select auth.uid()) = vendor_profile_id or (select private.is_staff_or_admin()));

-- A vendor may upload evidence for their OWN profile only (uploaded_by
-- must be the vendor themself), or staff/admin may upload on a
-- vendor's behalf.
create policy "vendor_documents: vendor insert own or staff" on public.vendor_documents
  for insert
  to authenticated
  with check (
    (select private.is_staff_or_admin())
    or ((select auth.uid()) = vendor_profile_id and (select auth.uid()) = uploaded_by)
  );

-- Review fields (status/reviewed_by/reviewed_at) are staff/admin-only —
-- a vendor must never be able to mark their own evidence "approved".
create policy "vendor_documents: staff review" on public.vendor_documents
  for update
  to authenticated
  using ((select private.is_staff_or_admin()))
  with check ((select private.is_staff_or_admin()));

grant select, insert, update on public.vendor_documents to authenticated;
grant select, insert, update, delete on public.vendor_documents to service_role;

-- Private bucket, same size/MIME convention as legal-entity-documents
-- (0105) — vendor evidence is small compliance paperwork, not raw
-- production media (project-media's 5GB ceiling is the wrong precedent
-- here).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vendor-documents',
  'vendor-documents',
  false,
  10485760, -- 10MB
  array['application/pdf', 'image/jpeg', 'image/png']
);

-- Object path convention: {vendor_profile_id}/{uuid}-{filename} — same
-- storage.foldername(name)[1] technique used by every other private
-- bucket in this codebase (e.g. project-media, 0051).
create policy "vendor-documents: staff manage" on storage.objects
  for all
  to authenticated
  using (bucket_id = 'vendor-documents' and (select private.is_staff_or_admin()))
  with check (bucket_id = 'vendor-documents' and (select private.is_staff_or_admin()));

create policy "vendor-documents: vendor read own" on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'vendor-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "vendor-documents: vendor insert own" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'vendor-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

commit;
