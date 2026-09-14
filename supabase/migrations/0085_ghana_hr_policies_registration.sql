-- Ordift Studios Compliance/COMP-SYS-1, Phase B3 Step 1 (2026-09-14) —
-- GHANA HR POLICY DOCUMENT REGISTRATION (OS-HR-GH-002 through 006).
--
-- Registers the remaining five documents from the Founder-supplied
-- "ORDIFT Ghana HR / Employment Controlled Package v1.0" as controlled
-- documents, using the exact same reused legal_document_masters/
-- legal_document_versions machinery as migration 0084 (no new schema
-- change here at all — the two columns it added are sufficient).
-- None of these adapts OS-LGL-007 directly the way OS-HR-GH-001 does
-- (they are internal HR policy, not a Schedule C jurisdiction
-- adaptation of the employment agreement) — adapts_master_id stays
-- null for all five; applies_to_jurisdiction is 'GH' for all five.
--
-- Content only. No attendance/leave/payroll/discipline/offboarding
-- engine reads any of these files yet — that implementation is
-- separate, later work, tracked as the explicit remaining scope in
-- this phase's own report.

begin;

insert into public.legal_document_masters (business_id, canonical_code, title, classification, applies_to_jurisdiction)
select public.ordift_studios_business_id(), v.code, v.title, 'internal_governance', 'GH'
from (values
  ('OS-HR-GH-002', 'Employment, Working Time, Attendance & Leave Policy'),
  ('OS-HR-GH-003', 'Compensation, Benefits, Performance & Career Policy'),
  ('OS-HR-GH-004', 'Conduct, Wellbeing, Equality, Discipline & Speak-Up Policy'),
  ('OS-HR-GH-005', 'Information Security, Privacy, AI, IP, Assets, Travel & Safeguarding Policy'),
  ('OS-HR-GH-006', 'Separation, Offboarding, Final Settlement & Employment Records Procedure')
) as v(code, title)
where not exists (select 1 from public.legal_document_masters where canonical_code = v.code);

insert into public.legal_document_versions
  (business_id, master_id, version, status, approved_by, approved_at, effective_date, content_reference, notes)
select
  public.ordift_studios_business_id(), m.id, '1.0', 'active',
  'Ordift Studios - Management (Founder-approved Decisions 1-100 reconciliation)',
  '2026-09-14T00:00:00Z', '2026-09-14', v.content_reference, v.notes
from public.legal_document_masters m
join (values
  ('OS-HR-GH-002', 'src/lib/legal/documents/os-hr-gh-002-employment-working-time-attendance-leave-policy.ts',
    'Registered 2026-09-14 (COMP-SYS-1 Phase B3 Step 1) from the Founder-supplied "ORDIFT Ghana HR / Employment Controlled Package v1.0". Source SHA-256 independently recomputed and verified to match the package''s own manifest exactly: DOCX c2d80f9c6210e975b652bb3859511048e25dbe0dc74d698f612ed3e204fd781d, PDF a7c97ddd05e708fccba5eb2cf10f0ba33690a1f560b6e6e401a95d967c3216f0.'),
  ('OS-HR-GH-003', 'src/lib/legal/documents/os-hr-gh-003-compensation-benefits-performance-career-policy.ts',
    'Registered 2026-09-14 (COMP-SYS-1 Phase B3 Step 1). Source SHA-256 verified: DOCX f85ffb9f5645dcb362834911927811a57f572e3bf4ff1821c94435f3241c2a86, PDF d1a3cfebd80c92b0251516fde2ff7cf4aac9efba744690a9e236042bf31f9ef1.'),
  ('OS-HR-GH-004', 'src/lib/legal/documents/os-hr-gh-004-conduct-wellbeing-equality-discipline-speakup-policy.ts',
    'Registered 2026-09-14 (COMP-SYS-1 Phase B3 Step 1). Source SHA-256 verified: DOCX bf41c8b2fbd969fa59b8804d9172deec73ac00edb2ffad5c781549ae8024bea2, PDF 4a9451e4af691e74be75cbdf9da8f6d96aa6f55ca47354be0a9e96b9707126b6.'),
  ('OS-HR-GH-005', 'src/lib/legal/documents/os-hr-gh-005-infosec-privacy-ai-ip-assets-travel-safeguarding-policy.ts',
    'Registered 2026-09-14 (COMP-SYS-1 Phase B3 Step 1). Source SHA-256 verified: DOCX 74aa3da5816519eee7d1b027c772fe57a94ee9b137febab3f4f8074bf92260b8, PDF 598ddecc960606d27b024542cdd3b4f5d42e27f286c3aa21315b6870c1e972f2.'),
  ('OS-HR-GH-006', 'src/lib/legal/documents/os-hr-gh-006-separation-offboarding-final-settlement-procedure.ts',
    'Registered 2026-09-14 (COMP-SYS-1 Phase B3 Step 1). Source SHA-256 verified: DOCX 0fba9e38f50d84d89cbfcbcb99a29dd9788aa6e589af9a2711f7bd25bebb7b79, PDF 5ab37157d3f0eb4939b289f8ac9b1ed0f56728363b65bacafd7a7c77a4391f8b.')
) as v(code, content_reference, notes) on v.code = m.canonical_code
where not exists (select 1 from public.legal_document_versions ver where ver.master_id = m.id and ver.version = '1.0');

update public.legal_document_masters m
set current_version_id = v.id
from public.legal_document_versions v
where v.master_id = m.id and v.version = '1.0'
  and m.canonical_code in ('OS-HR-GH-002', 'OS-HR-GH-003', 'OS-HR-GH-004', 'OS-HR-GH-005', 'OS-HR-GH-006')
  and m.current_version_id is null;

commit;
