-- Rolls back PROPOSED 0183: restores the original append-only trigger on marketing_permission_records and drops what 0183 added. Erased details cannot be restored (export the two new tables first if rows exist).
begin;
drop trigger if exists marketing_permission_immutable on public.marketing_permission_records;
create trigger marketing_permission_append_only before update or delete on public.marketing_permission_records for each row execute function private.portfolio_append_only();
drop function public.marketing_permission_record_redact(uuid, uuid, text, text, boolean);
drop function public.marketing_permission_record_erasure_check(uuid, text);
drop table public.portfolio_retention_policy;
drop function private.portfolio_retention_policy_guard();
drop table public.marketing_permission_redactions;
drop table public.marketing_permission_job_holds;
drop function private.marketing_permission_job_hold_guard();
drop function private.marketing_permission_immutable();
commit;
