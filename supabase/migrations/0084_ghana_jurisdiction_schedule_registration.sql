-- Ordift Studios Compliance/COMP-SYS-1, Phase B2 Step 2 (2026-09-14) —
-- GHANA CONTROLLED DOCUMENT REGISTRATION.
--
-- Registers OS-HR-GH-000 (Ghana Employment Policy Control Register &
-- Reconciliation Record) and OS-HR-GH-001 (Ghana Jurisdiction Schedule
-- C - Employment) as controlled legal documents, reusing the existing
-- legal_document_masters/legal_document_versions machinery unchanged —
-- no new parallel table. Adds exactly two nullable columns to
-- legal_document_masters so the existing model can express "this
-- document is a jurisdiction-specific schedule adapting another
-- master": adapts_master_id (self-referential FK, null for every
-- existing master including OS-LGL-007 itself) and
-- applies_to_jurisdiction (text, WorkforceJurisdiction-shaped,
-- app-validated — same "unconstrained text" precedent already used for
-- classification/status throughout this table family).
--
-- OS-LGL-007 itself is untouched by this migration — no row of it is
-- updated, no column of its master row changes. OS-HR-GH-001 is
-- registered as its own, separate legal_document_masters row that
-- POINTS AT OS-LGL-007 via adapts_master_id; it is never merged into
-- or confused with OS-LGL-007's own row.
--
-- Both new masters are set to their real, genuinely-live state directly
-- (status 'active', not the 'approved-but-not-yet-activated' pattern
-- used for not-yet-effective content elsewhere) because the Founder's
-- own controlled package states an actual effective date (14 September
-- 2026, already in force) and Management approval — the same "active"
-- treatment already given to the four legacy-reconciled documents
-- (014-017) in migration 0067 for content genuinely live today, not a
-- placeholder pattern.

begin;

alter table public.legal_document_masters
  add column if not exists adapts_master_id uuid references public.legal_document_masters (id),
  add column if not exists applies_to_jurisdiction text;

comment on column public.legal_document_masters.adapts_master_id is
  'Self-referential — set only on a jurisdiction-specific schedule (e.g. OS-HR-GH-001) that adapts another controlled master (e.g. OS-LGL-007) for one jurisdiction. Null for every global/standalone master, including the master being adapted itself. The adapted master''s own row/content is never altered by the existence of a schedule that adapts it.';
comment on column public.legal_document_masters.applies_to_jurisdiction is
  'WorkforceJurisdiction-shaped text (GH | QA | GB | DE_EU | US | OTHER — src/lib/compliance/requirementClassification.ts), app-validated, same unconstrained-text precedent as classification/status. Null for a global master; set on a jurisdiction-specific schedule to say which jurisdiction it governs.';

insert into public.legal_document_masters (business_id, canonical_code, title, classification, applies_to_jurisdiction)
select public.ordift_studios_business_id(), 'OS-HR-GH-000', 'Ghana Employment Policy Control Register & Reconciliation Record', 'internal_governance', 'GH'
where not exists (select 1 from public.legal_document_masters where canonical_code = 'OS-HR-GH-000');

insert into public.legal_document_masters (business_id, canonical_code, title, classification, applies_to_jurisdiction, adapts_master_id)
select public.ordift_studios_business_id(), 'OS-HR-GH-001', 'Ghana Jurisdiction Schedule C - Employment', 'jurisdiction_schedule', 'GH', m.id
from public.legal_document_masters m
where m.canonical_code = 'OS-LGL-007'
  and not exists (select 1 from public.legal_document_masters where canonical_code = 'OS-HR-GH-001');

comment on table public.legal_document_masters is
  'One row per canonical OS-LGL-0xx / OS-HR-GH-0xx document code (LEGAL-SYS-1 / COMP-SYS-1). Metadata/governance only — the actual rendered content lives in content_reference on the version row, or (for the 4 legacy-mapped public documents) the existing in-code OSELS registry. classification: transaction_agreement | release_authorization | public_legal_document | internal_governance | jurisdiction_schedule (unconstrained text, application-validated, same precedent as activity_log.action). adapts_master_id/applies_to_jurisdiction (added migration 0084) express a jurisdiction-specific schedule''s relationship to the master it adapts — see column comments.';

-- OS-HR-GH-000 v1.0 — active (Management-approved, effective 14 Sep 2026)
insert into public.legal_document_versions
  (business_id, master_id, version, status, approved_by, approved_at, effective_date, content_reference, notes)
select
  public.ordift_studios_business_id(), m.id, '1.0', 'active',
  'Ordift Studios - Management (Founder-approved Decisions 1-100 reconciliation)',
  '2026-09-14T00:00:00Z', '2026-09-14',
  'src/lib/legal/documents/os-hr-gh-000-ghana-employment-policy-control-register.ts',
  'Registered 2026-09-14 (COMP-SYS-1 Phase B2 Step 2) from the Founder-supplied "ORDIFT Ghana HR / Employment Controlled Package v1.0". Source SHA-256 independently recomputed and verified to match the package''s own manifest exactly: DOCX 62cc1a4b46418f4dbbfa142ac184b7989b4a2c36f94f2ac8cc3188ef4fe12ec1, PDF 76cb575a0dd978ea67f98d0782ef00cef9502b565ff6c8a0e346b8400eff6550.'
from public.legal_document_masters m
where m.canonical_code = 'OS-HR-GH-000'
  and not exists (select 1 from public.legal_document_versions v where v.master_id = m.id and v.version = '1.0');

update public.legal_document_masters m
set current_version_id = v.id
from public.legal_document_versions v
where v.master_id = m.id and v.version = '1.0' and m.canonical_code = 'OS-HR-GH-000' and m.current_version_id is null;

-- OS-HR-GH-001 v1.0 — active (Management-approved, effective 14 Sep 2026)
-- This is the exact row the OS-LGL-007 jurisdiction-schedule existence
-- gate (src/lib/legal/employeeAgreementJurisdictionGate.ts, Phase B2
-- Step 1) checks for. Its existence and 'active' status are what change
-- Ghana's gate outcome from NO_APPROVED_JURISDICTION_SCHEDULE to
-- APPROVED_SCHEDULE_AVAILABLE — see the accompanying code change in
-- this same phase.
insert into public.legal_document_versions
  (business_id, master_id, version, status, approved_by, approved_at, effective_date, content_reference, notes)
select
  public.ordift_studios_business_id(), m.id, '1.0', 'active',
  'Ordift Studios - Management (Founder-approved Decisions 1-100 reconciliation)',
  '2026-09-14T00:00:00Z', '2026-09-14',
  'src/lib/legal/documents/os-hr-gh-001-ghana-jurisdiction-schedule-c.ts',
  'Registered 2026-09-14 (COMP-SYS-1 Phase B2 Step 2) from the Founder-supplied "ORDIFT Ghana HR / Employment Controlled Package v1.0". Source SHA-256 independently recomputed and verified to match the package''s own manifest exactly: DOCX 0b875e2e9034532bbfd7016c3a5507f325b4397488d1155c912d5e2a5149549e, PDF 89ce5a945acc742a6a376a781bab49559401457ab905caa3f30e6a7b7c4f3145. Supplements OS-LGL-007 per that master''s own Clause 1.4 and Schedule C; does not alter OS-LGL-007''s own content_reference or text.'
from public.legal_document_masters m
where m.canonical_code = 'OS-HR-GH-001'
  and not exists (select 1 from public.legal_document_versions v where v.master_id = m.id and v.version = '1.0');

update public.legal_document_masters m
set current_version_id = v.id
from public.legal_document_versions v
where v.master_id = m.id and v.version = '1.0' and m.canonical_code = 'OS-HR-GH-001' and m.current_version_id is null;

commit;
