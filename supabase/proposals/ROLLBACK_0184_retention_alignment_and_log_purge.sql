-- Rolls back PROPOSED 0184: restores the 0182 four-argument erasure function and the original append-only triggers on the four log tables, and drops what 0184 added. Purged log rows cannot be restored (export the purge audit first if rows exist).
begin;
drop function public.portfolio_log_purge(text, uuid, text, boolean);
drop function public.portfolio_log_purge_preview();
drop function private.portfolio_subject_log_free_of_hold(uuid);
drop function private.portfolio_record_log_free_of_hold(uuid);
drop function private.portfolio_file_log_free_of_hold(uuid);
drop function private.portfolio_job_log_free_of_hold(text, uuid);
drop table public.portfolio_log_purges;
drop trigger portfolio_subject_redaction_immutable on public.portfolio_subject_redactions;
drop trigger portfolio_file_hold_immutable on public.portfolio_file_holds;
drop trigger marketing_permission_redaction_immutable on public.marketing_permission_redactions;
drop trigger marketing_permission_job_hold_immutable on public.marketing_permission_job_holds;
create trigger portfolio_subject_redaction_append_only before update or delete on public.portfolio_subject_redactions for each row execute function private.portfolio_append_only();
create trigger portfolio_file_hold_append_only before update or delete on public.portfolio_file_holds for each row execute function private.portfolio_append_only();
create trigger marketing_permission_redaction_append_only before update or delete on public.marketing_permission_redactions for each row execute function private.portfolio_append_only();
create trigger marketing_permission_job_hold_append_only before update or delete on public.marketing_permission_job_holds for each row execute function private.portfolio_append_only();
drop function private.portfolio_log_immutable();
drop function public.portfolio_subject_permission_redact(uuid, uuid, text, text, boolean);
drop function public.portfolio_subject_permission_erasure_check(uuid, text);
alter table public.portfolio_subject_redactions drop column basis;
create function public.portfolio_subject_permission_redact(p_permission uuid, p_actor uuid, p_reason text, p_confirm_permitted boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare g record; sub record; in_force boolean; held text; in_use boolean;
begin
  if not private.is_portfolio_authority(p_actor) then raise exception 'only the Founder or an authorised executive admin may erase permission details'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'state the reason for the erasure'; end if;
  if p_confirm_permitted is distinct from true then raise exception 'confirm that erasure is permitted: no dispute, legal obligation, audit or active permission still needs this evidence'; end if;
  select * into g from public.portfolio_subject_permissions where id = p_permission;
  if not found or g.decision <> 'granted' then raise exception 'choose a recorded grant'; end if;
  select * into sub from public.portfolio_file_subjects where id = g.subject_id;
  select (exists (select 1 from public.portfolio_subject_permissions v where v.supersedes_id = g.id and v.decision = 'verified')
    and not exists (select 1 from public.portfolio_subject_permissions w where w.supersedes_id = g.id and w.decision in ('withdrawn', 'granted'))
    and (g.expires_on is null or g.expires_on >= current_date)) into in_force;
  if in_force then raise exception 'that permission is still in force: withdraw it (or wait for its expiry) before erasing its details'; end if;
  select h.action into held from public.portfolio_file_holds h where h.project_file_id = sub.project_file_id order by h.seq desc limit 1;
  if held = 'placed' then raise exception 'a hold is in place on this photograph (dispute, complaint, audit or legal obligation): release it before erasing'; end if;
  select exists (select 1 from (select distinct on (u.destination) u.destination, u.action from public.portfolio_use_events u where u.project_file_id = sub.project_file_id order by u.destination, u.seq desc) cur
    where cur.action in ('published', 'shared') and cur.destination = any (g.allowed_destinations)) into in_use;
  if in_use then raise exception 'the photograph is still in use for a use this permission covered: end or review that use before erasing the evidence behind it'; end if;
  perform set_config('ordift.redaction', 'on', true);
  update public.portfolio_subject_permissions set grantor_name = '[erased]', grantor_relationship = case when grantor_relationship is null then null else '[erased]' end, authority_reference = case when authority_reference is null then null else '[erased under retention policy]' end, evidence_reference = '[erased under retention policy]', note = case when note is null then null else '[erased under retention policy]' end
    where id = g.id or supersedes_id = g.id;
  perform set_config('ordift.redaction', 'off', true);
  insert into public.portfolio_subject_redactions (permission_id, reason, confirmed_permitted, redacted_by) values (g.id, btrim(p_reason), true, p_actor);
end $$;
revoke all on function public.portfolio_subject_permission_redact(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.portfolio_subject_permission_redact(uuid, uuid, text, boolean) to service_role;
commit;
