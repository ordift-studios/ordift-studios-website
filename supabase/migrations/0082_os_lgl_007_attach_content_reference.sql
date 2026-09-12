begin;

-- Sequence 1, E.5 Stage 3C, correction — migration 0081 assumed
-- OS-LGL-007 had no existing legal_document_versions row and guarded
-- its insert with `where not exists (...)`. Production already had a
-- pre-existing placeholder v1.0 row for OS-LGL-007 from an earlier
-- Legal Suite phase (approved_by 'Legal Counsel', notes explicitly
-- stating "Content not yet imported through the controlled
-- document-import process") — so 0081's insert correctly no-opped
-- rather than duplicating it, but left content_reference null. This
-- migration attaches the real content only where it is still unset,
-- and only for that exact pre-existing row — it never overwrites
-- approved_by/approved_at/status, which reflect a decision already on
-- record before this stage. The historical note is preserved, not
-- deleted; this only appends a fact.
update public.legal_document_versions v
set content_reference = 'src/lib/legal/documents/os-lgl-007-employee-employment-agreement.ts',
    notes = coalesce(v.notes, '') || ' Content imported 2026-09-12 (E.5 Stage 3C) — see content_reference; verbatim transcription of the Founder-supplied Official Master v1.0 PDF, no wording changed.'
from public.legal_document_masters m
where v.master_id = m.id
  and m.canonical_code = 'OS-LGL-007'
  and v.version = '1.0'
  and v.content_reference is null;

commit;
