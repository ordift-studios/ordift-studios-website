-- ROLLBACK for migration 0152 (assignment reports + file release). NOT a migration.
-- Run in one transaction only if 0152 must be backed out, then:
--   supabase migration repair --status reverted 0152
-- GUARDS: refuses to run if any report exists, any file has left 'private', or any deliverable was
-- released from a file (that data would be destroyed). A code-only problem needs no SQL: roll the Vercel
-- deployment back instead (the old code ignores the new columns and tables).
begin;
do $$
begin
  if exists (select 1 from public.assignment_reports) then raise exception 'Refusing: assignment_reports has rows'; end if;
  if exists (select 1 from public.project_files where release_status <> 'private' or release_category is not null or deliverable_id is not null) then
    raise exception 'Refusing: files carry release data'; end if;
  if exists (select 1 from public.deliverables where project_file_id is not null) then raise exception 'Refusing: deliverables were released from files'; end if;
end $$;
drop trigger if exists project_files_release_columns_guard on public.project_files;
drop function if exists private.guard_project_file_release_columns();
alter table public.project_files drop column if exists deliverable_id, drop column if exists released_by, drop column if exists released_at,
  drop column if exists release_review_note, drop column if exists release_reviewed_at, drop column if exists release_reviewed_by,
  drop column if exists submitted_for_release_by, drop column if exists submitted_for_release_at, drop column if exists client_description,
  drop column if exists client_title, drop column if exists release_status, drop column if exists release_category;
drop index if exists public.deliverables_one_per_project_file;
alter table public.deliverables drop column if exists project_file_id;
drop table if exists public.assignment_reports;
delete from public.deliverable_categories c where c.key in ('sneak-peeks','thank-you-images','edited-selections','final-gallery','video-previews','design-drafts','final-designs')
  and not exists (select 1 from public.deliverables d where d.category_id = c.id);
commit;
