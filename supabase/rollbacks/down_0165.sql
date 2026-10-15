-- Rollback for 0165: removes the four new tables and the document-metadata columns ONLY if nothing has been recorded in them
-- (otherwise it refuses, so no registration, signatory or expense record can be lost). Safe to run before the registry data step.
begin;
do $$
begin
  if exists (select 1 from public.entity_registrations) or exists (select 1 from public.entity_signatories) or exists (select 1 from public.entity_expenses) then
    raise exception 'down_0165 refused: registry records already exist';
  end if;
  if exists (select 1 from public.employing_entity_documents where file_sha256 is not null or original_filename is not null or relation is not null) then
    raise exception 'down_0165 refused: documents already carry the new metadata';
  end if;
end $$;
drop table public.entity_expenses;
drop table public.entity_signatories;
drop table public.entity_registrations;
drop function private.entity_expenses_guard();
drop function private.entity_registrations_guard();
alter table public.employing_entity_documents drop constraint employing_entity_documents_relation_shape;
drop index if exists public.employing_entity_documents_hash_idx;
alter table public.employing_entity_documents
  drop column original_filename, drop column mime_type, drop column size_bytes, drop column file_sha256, drop column issued_on,
  drop column expires_on, drop column issuing_authority, drop column relation, drop column related_document_id;
commit;
