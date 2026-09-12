begin;

-- Sequence 1, E.5 Stage 3C — registers OS-LGL-007 (Employee Employment
-- Agreement, Official Master v1.0) as the first document run through
-- the real, reusable Legal Suite document-import architecture
-- (createDraftAgreement/addAgreementParty/attachAgreementSnapshot/
-- createSignatureRequest — all pre-existing, unchanged). Data only:
-- no schema change. The actual approved legal text is transcribed
-- verbatim in src/lib/legal/documents/os-lgl-007-employee-employment-agreement.ts
-- (content_reference below), never duplicated or altered here.
insert into public.legal_document_masters (canonical_code, title, classification)
select 'OS-LGL-007', 'Employee Employment Agreement', 'transaction_agreement'
where not exists (select 1 from public.legal_document_masters where canonical_code = 'OS-LGL-007');

insert into public.legal_document_versions (master_id, version, status, approved_by, content_reference)
select m.id, '1.0', 'approved', 'Myredlive Anim-Tetey (Founder) — supplied as Official Master v1.0, approved',
       'src/lib/legal/documents/os-lgl-007-employee-employment-agreement.ts'
from public.legal_document_masters m
where m.canonical_code = 'OS-LGL-007'
  and not exists (
    select 1 from public.legal_document_versions v where v.master_id = m.id and v.version = '1.0'
  );

update public.legal_document_masters m
set current_version_id = v.id
from public.legal_document_versions v
where v.master_id = m.id and v.version = '1.0' and m.canonical_code = 'OS-LGL-007' and m.current_version_id is null;

commit;
