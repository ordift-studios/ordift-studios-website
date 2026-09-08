-- Ordift Studios Legal Suite — LEGAL-SYS-1, Phase D-0 + First
-- Implementation Block (2026-09-08).
--
-- INSPECTION SUMMARY (full detail in the Discovery Report) — the only
-- pre-existing legal infrastructure is a real, live, in-CODE (not
-- database-backed) "Enterprise Legal Series" (OSELS): 4 approved public
-- documents (Privacy Policy, Cookie Policy, Website Terms, Master
-- Booking Terms) served from src/lib/legal/registry.ts at
-- /legal/privacy, /legal/cookies, /legal/terms, /legal/booking. Those 4
-- documents use OS-LGL-001..004 as their own document codes — which
-- COLLIDE with the newly-approved 21-document canonical catalogue's
-- OS-LGL-001..004 (Personal Portrait/Wedding-Event/Commercial/Model-
-- Talent-Release). Per explicit direction, the NEW canonical catalogue
-- wins and is NOT renumbered; the 4 existing documents' OS-LGL-00x
-- codes become LEGACY identifiers, reconciled below onto their correct
-- canonical codes (015/016/017, and 014 for Booking Terms — NOT
-- assumed identical to the not-yet-supplied counsel-approved OS-LGL-014
-- Official Master). Nothing about the existing TypeScript content
-- files, the /legal/[slug] route, or the live public URLs is touched
-- by this migration — this is a purely additive metadata/governance
-- layer sitting alongside that unchanged content source.
--
-- No agreement/signature/release tables are created in this migration.
-- Per explicit instruction ("do not create unnecessary empty
-- complexity simply because these names appeared in the original
-- prompt"), this first implementation block builds only the master/
-- version registry foundation — the minimum genuinely needed now. Its
-- id/business_id/append-only-versioning shape is deliberately the same
-- established pattern already proven for production_budgets (0062) and
-- authority_grants (0042/0065), so agreements/signature_requests/etc.
-- can be added cleanly in a later phase without reshaping this
-- foundation.

begin;

-- ============================================================
-- legal_document_masters — one row per canonical OS-LGL-0xx code
-- ============================================================
-- classification mirrors the master prompt's own Part 3 categories —
-- transaction/signable agreements, releases/authorizations, public
-- legal documents, and internal governance — never treated
-- identically. current_version_id is nullable and gains its FK
-- constraint after legal_document_versions exists (circular
-- reference), pointing at whichever version is currently the
-- authoritative one for that master (may be an 'active' legacy-mapped
-- version, or a not-yet-active 'approved' version where no content
-- exists yet — see below).
create table public.legal_document_masters (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  canonical_code text not null,
  title text not null,
  classification text not null,
  current_version_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  unique (business_id, canonical_code)
);

comment on table public.legal_document_masters is
  'One row per canonical OS-LGL-0xx document code from the approved 21-document Ordift Studios Legal Suite catalogue (LEGAL-SYS-1). Metadata/governance only — the actual rendered content for already-published documents still lives in the existing in-code OSELS registry (src/lib/legal/registry.ts) until a real controlled document-import process exists. classification: transaction_agreement | release_authorization | public_legal_document | internal_governance (unconstrained text, application-validated, same precedent as activity_log.action).';

create index legal_document_masters_classification_idx on public.legal_document_masters (classification);

alter table public.legal_document_masters enable row level security;

-- Admin-tier read (not broad staff) — legal template governance status
-- is more analogous to an Admin/Governance function than routine staff
-- work, matching recruitment_interview_panels' "admin read" precedent
-- rather than the broader "staff read" tier. No policy for insert/
-- update/delete — every write goes through service-role application
-- code (src/lib/legal/masterRegistry.ts), same "never a direct
-- authenticated write" pattern used for positions/departments/
-- authority_grants/production_market_rates.
create policy "legal_document_masters: admin read" on public.legal_document_masters
  for select
  to authenticated
  using ((select private.is_admin_or_super_admin()));

grant select on public.legal_document_masters to authenticated;
grant select, insert, update, delete on public.legal_document_masters to service_role;

-- ============================================================
-- legal_document_versions — append-only per master
-- ============================================================
-- Same append-only principle as production_budgets/authority_grants:
-- a version is never UPDATEd to represent a different version — a new
-- status transition (approved -> active, active -> retired, etc.) is
-- an UPDATE of the *same* version row's status/timestamp columns
-- (matching the template lifecycle in Part 5, which is a state
-- machine on one version, not a new version per state), while
-- supersedes_id links a genuinely NEW version (a real content
-- replacement) back to the one it replaces — never both conflated.
-- legacy_code / public_slug / content_reference capture exactly the
-- "document code and public URL are separate concepts" + traceability
-- requirement: a version's content may be the pre-existing OSELS
-- content (legacy_code + content_reference pointing into that
-- registry, public_slug matching its live URL) or the not-yet-supplied
-- new Official Master (legacy_code null, content_reference null until
-- imported). document_hash stays null until a real freeze/import
-- process exists to compute it — never fabricated.
create table public.legal_document_versions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  master_id uuid not null references public.legal_document_masters (id),
  version text not null,
  status text not null default 'draft',
  approved_by text,
  approved_at timestamptz,
  effective_date date,
  activated_at timestamptz,
  retired_at timestamptz,
  supersedes_id uuid references public.legal_document_versions (id),
  legacy_code text,
  public_slug text,
  content_reference text,
  document_hash text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

comment on table public.legal_document_versions is
  'Append-only version history per legal_document_masters row. status: draft | legal_review | approved | active | retired | superseded (unconstrained text, application-validated — see src/lib/legal/masterCatalogue.ts). Approval and Production Activation are deliberately separate states — a version reaching "approved" never auto-transitions to "active". legacy_code/public_slug/content_reference/document_hash together give full traceability from a canonical master back to whichever pre-existing OSELS content (if any) it was reconciled from, without ever mutating that original content.';
comment on column public.legal_document_versions.effective_date is
  'Null until genuinely set at production activation — never fabricated. The 4 legacy-mapped versions (015/016/017/014) carry their REAL pre-existing effective dates from the already-live OSELS documents; the other 17 masters'' v1.0 approved versions have this null until a real activation decision is made.';
comment on column public.legal_document_versions.approved_by is
  'Free text, not a profile FK — "Legal Counsel" (the new Official Masters) or "Management" (the pre-existing legacy-mapped content) are both real, distinct, non-Ordift-account approvers.';

create index legal_document_versions_master_id_idx on public.legal_document_versions (master_id);
create index legal_document_versions_status_idx on public.legal_document_versions (status);

alter table public.legal_document_versions enable row level security;

create policy "legal_document_versions: admin read" on public.legal_document_versions
  for select
  to authenticated
  using ((select private.is_admin_or_super_admin()));

grant select on public.legal_document_versions to authenticated;
grant select, insert, update, delete on public.legal_document_versions to service_role;

alter table public.legal_document_masters
  add constraint legal_document_masters_current_version_fkey
  foreign key (current_version_id) references public.legal_document_versions (id);

-- ============================================================
-- Seed — the 21 canonical masters (metadata only; no legal prose is
-- ever stored in this table or invented by this migration)
-- ============================================================
insert into public.legal_document_masters (business_id, canonical_code, title, classification)
values
  (public.ordift_studios_business_id(), 'OS-LGL-001', 'Personal Portrait Agreement', 'transaction_agreement'),
  (public.ordift_studios_business_id(), 'OS-LGL-002', 'Wedding & Event Photography/Videography Agreement', 'transaction_agreement'),
  (public.ordift_studios_business_id(), 'OS-LGL-003', 'Commercial / Advertising Production Agreement', 'transaction_agreement'),
  (public.ordift_studios_business_id(), 'OS-LGL-004', 'Model / Talent Appearance, Image & Usage Rights Release', 'release_authorization'),
  (public.ordift_studios_business_id(), 'OS-LGL-005', 'Property / Location Release & Production Authorization', 'release_authorization'),
  (public.ordift_studios_business_id(), 'OS-LGL-006', 'RAW / Source Files Release & Licence Agreement', 'transaction_agreement'),
  (public.ordift_studios_business_id(), 'OS-LGL-007', 'Employee Employment Agreement', 'transaction_agreement'),
  (public.ordift_studios_business_id(), 'OS-LGL-008', 'Independent Contractor / Freelancer Agreement', 'transaction_agreement'),
  (public.ordift_studios_business_id(), 'OS-LGL-009', 'Vendor / Supplier Agreement', 'transaction_agreement'),
  (public.ordift_studios_business_id(), 'OS-LGL-010', 'Instructor / Workshop Facilitator Agreement', 'transaction_agreement'),
  (public.ordift_studios_business_id(), 'OS-LGL-011', 'Partnership / Collaboration Agreement', 'transaction_agreement'),
  (public.ordift_studios_business_id(), 'OS-LGL-012', 'Referral Agreement', 'transaction_agreement'),
  (public.ordift_studios_business_id(), 'OS-LGL-013', 'Sponsorship / Value Exchange Agreement', 'transaction_agreement'),
  (public.ordift_studios_business_id(), 'OS-LGL-014', 'Client Service Terms & General Booking Agreement', 'transaction_agreement'),
  (public.ordift_studios_business_id(), 'OS-LGL-015', 'Website / Platform Terms', 'public_legal_document'),
  (public.ordift_studios_business_id(), 'OS-LGL-016', 'Privacy Notice / Privacy Policy', 'public_legal_document'),
  (public.ordift_studios_business_id(), 'OS-LGL-017', 'Cookie Notice / Cookie Policy', 'public_legal_document'),
  (public.ordift_studios_business_id(), 'OS-LGL-018', 'Data Processing Agreement', 'transaction_agreement'),
  (public.ordift_studios_business_id(), 'OS-LGL-019', 'Confidentiality / Mutual NDA', 'transaction_agreement'),
  (public.ordift_studios_business_id(), 'OS-LGL-020', 'Data / Security Incident & Breach Response Standard', 'internal_governance'),
  (public.ordift_studios_business_id(), 'OS-LGL-021', 'Model / Talent Management Agreement', 'transaction_agreement');

-- ============================================================
-- Seed — every master's v1.0 "APPROVED" version (the real,
-- user-asserted fact: Legal Counsel has approved all 21 documents and
-- all 61 operative variables). No content, no effective date, no
-- activation for any of them yet — Approval and Production Activation
-- remain separate states.
-- ============================================================
insert into public.legal_document_versions (business_id, master_id, version, status, approved_by, notes)
select public.ordift_studios_business_id(), m.id, '1.0', 'approved', 'Legal Counsel',
  'Official Master v1.0 — approved by Legal Counsel. Content not yet imported through the controlled document-import process; effective date to be set at production activation.'
from public.legal_document_masters m
where m.business_id = public.ordift_studios_business_id();

-- Every master's current_version_id starts pointing at this v1.0
-- approved (not active) version — correct even for the 4 masters
-- reconciled from pre-existing live content below, which then get a
-- SECOND, separate 'active' version representing what is genuinely
-- live today; current_version_id is repointed to THAT one immediately
-- after, since it is what real users actually see in Production.
update public.legal_document_masters m
set current_version_id = v.id
from public.legal_document_versions v
where v.master_id = m.id and v.version = '1.0' and v.status = 'approved'
  and m.business_id = public.ordift_studios_business_id();

-- ============================================================
-- Legacy reconciliation — OS-LGL-015/016/017/014
-- ============================================================
-- Each of these 4 masters ALSO gets a second version row representing
-- the pre-existing, genuinely-live OSELS content, now correctly filed
-- under its canonical code instead of the colliding legacy OS-LGL-00x
-- identifier. Every value below is transcribed verbatim from the real,
-- existing document-control metadata in src/lib/legal/documents/*.ts —
-- nothing here is fabricated. current_version_id is repointed to each
-- of these 'active' rows, since that is what is truthfully live in
-- Production right now — NOT the new v1.0 "approved" placeholder,
-- which has no content yet. The public URL itself (/legal/privacy,
-- /legal/cookies, /legal/terms, /legal/booking) is untouched — only
-- recorded here via public_slug for traceability.
--
-- OS-LGL-014 is explicitly NOT assumed identical to the future
-- counsel-approved Official Master — this row is documented as the
-- pre-existing Booking Terms content only, pending real supersession
-- once the actual OS-LGL-014 master content is supplied.
insert into public.legal_document_versions
  (business_id, master_id, version, status, approved_by, effective_date, legacy_code, public_slug, content_reference, notes)
select public.ordift_studios_business_id(), m.id, v.version, 'active', v.approved_by, v.effective_date::date, v.legacy_code, v.public_slug, v.content_reference, v.notes
from public.legal_document_masters m
join (values
  ('OS-LGL-016', '1.2', 'Management', '2026-08-05', 'OS-LGL-001', 'privacy', 'legal-registry:privacy',
    'Pre-existing Enterprise Legal Series (OSELS) content, reconciled from legacy code OS-LGL-001 onto canonical OS-LGL-016. Live at /legal/privacy, unchanged by this reconciliation.'),
  ('OS-LGL-017', '1.0', 'Management', '2026-08-05', 'OS-LGL-002', 'cookies', 'legal-registry:cookies',
    'Pre-existing OSELS content, reconciled from legacy code OS-LGL-002 onto canonical OS-LGL-017. Live at /legal/cookies, unchanged by this reconciliation.'),
  ('OS-LGL-015', '1.0', 'Management', '2026-08-05', 'OS-LGL-003', 'terms', 'legal-registry:terms',
    'Pre-existing OSELS content, reconciled from legacy code OS-LGL-003 onto canonical OS-LGL-015. Live at /legal/terms, unchanged by this reconciliation.'),
  ('OS-LGL-014', '1.0', 'Management', '2026-08-05', 'OS-LGL-004', 'booking', 'legal-registry:booking',
    'Pre-existing Master Booking Terms & Conditions, reconciled from legacy code OS-LGL-004 onto canonical OS-LGL-014. This is the EXISTING content only — NOT assumed identical to the future counsel-approved OS-LGL-014 Official Master. Live at /legal/booking, unchanged by this reconciliation.')
) as v(canonical_code, version, approved_by, effective_date, legacy_code, public_slug, content_reference, notes)
  on m.canonical_code = v.canonical_code
where m.business_id = public.ordift_studios_business_id();

update public.legal_document_masters m
set current_version_id = v.id
from public.legal_document_versions v
where v.master_id = m.id and v.status = 'active'
  and m.canonical_code in ('OS-LGL-014', 'OS-LGL-015', 'OS-LGL-016', 'OS-LGL-017')
  and m.business_id = public.ordift_studios_business_id();

commit;
