-- Ordift Studios Legal Suite — LEGAL-SYS-1, Phase D.1 (2026-09-08).
-- Controlled Official Master ingestion — additive columns +
-- provenance table + a new private Supabase Storage bucket. No
-- existing table's rows are modified except adding nullable columns.
--
-- Source: ORDIFT_Legal_Suite_FINAL_Controlled_Release_v1.0.zip
-- (counsel-approved controlled release). Independently verified
-- immediately before this migration: all 48 files under
-- Official_Masters/ pass SHA-256 verification against the package's
-- own supplied manifest (48/48 OK, zero mismatches) — see the
-- completion report for the full verification record. Nothing in this
-- migration stores, paraphrases, or reconstructs legal PROSE — the
-- actual DOCX/PDF artifacts are the authoritative content, uploaded
-- unmodified to private storage; this migration only records WHERE
-- they live and their verified hash.

begin;

-- ============================================================
-- Private Storage — Official Master source artifacts
-- ============================================================
-- Same private-bucket + admin-tier-only-access pattern already proven
-- for payout-evidence (0049)/payment-proofs (0024)/project-media
-- (0051). No public read policy exists — DOCX source masters and PDF
-- renderings both stay private in this phase (Part 7: "PDF master
-- artifacts must remain private unless a particular published-policy
-- rendering is intentionally exposed through the application" — no
-- such exposure is authorized yet, per Part 33's activation gate).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'legal-masters',
  'legal-masters',
  false,
  5242880, -- 5MB — every ingested artifact is well under 1MB; generous headroom
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]
);

create policy "legal-masters: admin read" on storage.objects
  for select to authenticated
  using (bucket_id = 'legal-masters' and (select private.is_admin_or_super_admin()));

create policy "legal-masters: admin upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'legal-masters' and (select private.is_admin_or_super_admin()));

-- ============================================================
-- legal_document_versions — Official Master source artifact columns
-- ============================================================
-- Separate from the pre-existing generic content_reference/
-- document_hash columns (0067), which describe a version's RENDERED/
-- served content pointer (e.g. "legal-registry:privacy" for the 4
-- legacy-mapped versions) — these new columns specifically record the
-- two authoritative SOURCE artifacts (Part 8: "we require BOTH an
-- immutable authoritative source artifact AND structured/renderable
-- content") for a v1.0 Official Master, independent of whether that
-- version is active, approved-only, or anything else.
alter table public.legal_document_versions
  add column if not exists master_docx_storage_path text,
  add column if not exists master_docx_sha256 text,
  add column if not exists master_pdf_storage_path text,
  add column if not exists master_pdf_sha256 text,
  add column if not exists ingested_at timestamptz,
  add column if not exists ingested_by uuid references public.profiles (id);

comment on column public.legal_document_versions.master_docx_sha256 is
  'SHA-256 of the DOCX Official Master artifact, independently computed and cross-checked against the controlled release package''s own supplied hash manifest at ingestion time (Part 6: "compute SHA-256 hashes independently... a genuine unexplained mismatch is a HARD STOP"). Never fabricated.';

-- ============================================================
-- legal_suite_provenance_documents — release-level control artifacts
-- ============================================================
-- The controlled release package also includes documents that are not
-- per-master content: the Official Master Register, the Post-Counsel
-- Finalization Change Log, the FINAL-1C Production Certification, the
-- SHA-256 manifest itself, and the Counsel-Approved Variable
-- Placeholder Resolution Register. These have no single canonical_code
-- to attach to, so they get their own lean table rather than forcing
-- an artificial master row.
create table public.legal_suite_provenance_documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  title text not null,
  release_version text not null,
  storage_path text not null,
  sha256 text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

comment on table public.legal_suite_provenance_documents is
  'Release-level control/provenance artifacts from a controlled Legal Suite release package (Official Master Register, Post-Counsel Finalization Change Log, Production Certification, hash manifest, variable placeholder resolution register) — never per-master content, which belongs on legal_document_versions instead.';

alter table public.legal_suite_provenance_documents enable row level security;

create policy "legal_suite_provenance_documents: admin read" on public.legal_suite_provenance_documents
  for select
  to authenticated
  using ((select private.is_admin_or_super_admin()));

grant select on public.legal_suite_provenance_documents to authenticated;
grant select, insert, update, delete on public.legal_suite_provenance_documents to service_role;

commit;
