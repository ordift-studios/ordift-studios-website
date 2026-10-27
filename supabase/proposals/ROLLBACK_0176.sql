-- Rollback for proposed migration 0176 (PDF document editions). LOCAL / PROPOSED — not applied anywhere.
-- Safe only when no APPROVED edition has to be kept. Check first, and export approved editions if the count is not 0:
--   select count(*) from public.pdf_document_editions where status in ('approved','superseded');
begin;
drop function if exists public.approve_pdf_edition(uuid, uuid, text, text, timestamptz, jsonb);
drop table if exists public.pdf_document_editions;
drop function if exists private.pdf_document_editions_guard();
commit;
