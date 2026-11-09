-- READ-ONLY. Produces existing.json for scripts/legal/planMasterRegistration.ts (--existing). Run only through the established read-only helper, in a read-only transaction. Changes nothing.
select json_build_object(
  'masterExists', true,
  'currentVersionId', m.current_version_id,
  'versions', coalesce((select json_agg(json_build_object('id', v.id, 'version', v.version, 'status', v.status, 'legacyCode', v.legacy_code,
      'docxPath', v.master_docx_storage_path, 'docxSha256', v.master_docx_sha256, 'pdfPath', v.master_pdf_storage_path, 'pdfSha256', v.master_pdf_sha256) order by v.created_at)
    from public.legal_document_versions v where v.master_id = m.id), '[]'::json))
from public.legal_document_masters m where m.canonical_code = 'OS-LGL-014';
