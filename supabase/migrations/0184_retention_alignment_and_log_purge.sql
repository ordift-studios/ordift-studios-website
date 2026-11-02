-- PROPOSED 0184 REVISION 4 (NOT APPLIED). Revision 3 (sha256 fe1ae342...374c) is superseded. Revision 4 adds ONLY section 12 (finding L6): a database-level guard so that an ERASED permission can never be verified again, including by a direct service-role write. Nothing in revisions 1-3 is changed and no 0182 function is replaced.
-- PROPOSED 0184 REVISION 3 (NOT APPLIED, NOT in supabase/migrations). Independent review corrections to revision 2 (sha256 050fcd4d...8315): (a) the erasure locks the grant row so a concurrent verification cannot slip in between the check and the erasure; (b) the purge locks the two hold tables so a hold
-- placed during a purge is never missed; (c) hold-log rows are protected by a hold at EITHER level (a file-level log row survives while its job is held, a job-level log row survives while any of its photographs is held); (d) the permission 'end' is the EARLIEST end event (withdrawal, replacement, past expiry
-- or removal of the person from the photograph), so the retention clock is not started later than the permission actually ended, and a removed person's grant is no longer treated as in force. Everything else is identical to revision 2.
-- PROPOSED 0184 REVISION 2 (revision 1, sha256 18d05f71...c1fa, is superseded). Revision 2 changes ONLY the permanent purge audit: it records a fixed reason CODE instead of free text, so the audit holds nothing but necessary metadata
-- (table, row count, cutoff, policy years, reason code, who, when) and can be kept permanently without carrying personal details. Everything else is identical to revision 1.
-- PROPOSED 0184 (original text follows). Depends on 0182 revision 2 and 0183 revision 3 (it reads portfolio_retention_policy and marketing_permission_job_holds). Management directions (2 Nov 2026):
--  1. ALIGN the 0182 erasure function with a recorded BASIS and the adopted retention POLICY (six years after the later of the permission's end and the last authorised use is a management policy value recorded in portfolio_retention_policy; nothing is seeded here).
--     Valid data-subject requests and legal erasure obligations keep working: those bases skip the period but never the in-force, hold or in-use safeguards.
--  2. HOLD protections: the erasure also respects a JOB-level hold (0183), not only the photograph-level hold of 0182.
--  3. A controlled REVIEW and PURGE mechanism for the erasure and hold LOGS: a read-only preview, and a purge function that deletes only rows older than the adopted period whose file/job has no active hold, writes a permanent purge-audit row, and is
--     management-only, confirmed and reasoned. Nothing runs automatically.
--  4. AUDIT INTEGRITY: the purge audit table is append-only and itself never purged; log rows can otherwise never be updated or deleted; no 0182 safeguard is weakened (every earlier refusal still applies; the new function is strictly stricter).
begin;

-- 1. basis on the subject-permission erasure log (nullable only so any earlier row stays valid; the function always supplies it)
alter table public.portfolio_subject_redactions add column basis text check (basis is null or basis in ('retention_period_ended', 'data_subject_request', 'legal_requirement', 'other_documented'));

-- 2. permanent minimal audit of purges (no personal data; never purged)
create table public.portfolio_log_purges (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  purged_table text not null check (purged_table in ('portfolio_subject_redactions', 'portfolio_file_holds', 'marketing_permission_redactions', 'marketing_permission_job_holds')),
  rows_purged integer not null check (rows_purged >= 0),
  cutoff_date date not null,
  retention_years integer not null,
  reason_code text not null check (reason_code in ('retention_period_expired', 'annual_retention_review', 'legal_requirement', 'data_subject_request', 'policy_change')),   -- a fixed code, never free text: the permanent audit carries no personal details
  confirmed boolean not null check (confirmed),
  purged_by uuid not null references public.profiles (id),
  purged_at timestamptz not null default now()
);
create trigger portfolio_log_purge_append_only before update or delete on public.portfolio_log_purges for each row execute function private.portfolio_append_only();

-- 3. the four log tables stay append-only, with ONE exception: DELETE inside the purge function (transaction-local flag). UPDATE is never allowed.
create function private.portfolio_log_immutable() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then raise exception '% rows are append-only', tg_table_name; end if;
  if coalesce(current_setting('ordift.log_purge', true), '') <> 'on' then raise exception '% rows are append-only; only the controlled purge may remove expired rows', tg_table_name; end if;
  return old;
end $$;
drop trigger portfolio_subject_redaction_append_only on public.portfolio_subject_redactions;
drop trigger portfolio_file_hold_append_only on public.portfolio_file_holds;
drop trigger marketing_permission_redaction_append_only on public.marketing_permission_redactions;
drop trigger marketing_permission_job_hold_append_only on public.marketing_permission_job_holds;
create trigger portfolio_subject_redaction_immutable before update or delete on public.portfolio_subject_redactions for each row execute function private.portfolio_log_immutable();
create trigger portfolio_file_hold_immutable before update or delete on public.portfolio_file_holds for each row execute function private.portfolio_log_immutable();
create trigger marketing_permission_redaction_immutable before update or delete on public.marketing_permission_redactions for each row execute function private.portfolio_log_immutable();
create trigger marketing_permission_job_hold_immutable before update or delete on public.marketing_permission_job_holds for each row execute function private.portfolio_log_immutable();

-- 4. read-only PREFLIGHT for a subject permission (the erasure function calls it, so the two can never disagree)
create function public.portfolio_subject_permission_erasure_check(p_permission uuid, p_basis text default 'retention_period_ended')
returns table (blockers text[], earliest_retention_date date, ended_on date, last_use_on date)
language plpgsql stable security definer set search_path = '' as $$
declare g record; sub record; b text[] := '{}'; years integer; held text; ended date; lastuse date; earliest date; j record; removed_on date;
begin
  select * into g from public.portfolio_subject_permissions where id = p_permission;
  if not found or g.decision <> 'granted' then return query select array['choose a recorded grant']::text[], null::date, null::date, null::date; return; end if;
  select * into sub from public.portfolio_file_subjects where id = g.subject_id;
  select min(r.recorded_at)::date into removed_on from public.portfolio_file_subjects r where r.supersedes_id = sub.id and r.action = 'removed';
  if (exists (select 1 from public.portfolio_subject_permissions v where v.supersedes_id = g.id and v.decision = 'verified')
      and not exists (select 1 from public.portfolio_subject_permissions w where w.supersedes_id = g.id and w.decision in ('withdrawn', 'granted'))
      and (g.expires_on is null or g.expires_on >= current_date)
      and removed_on is null) then
    b := array_append(b, 'that permission is still in force: withdraw it (or wait for its expiry) before erasing its details'); end if;
  select h.action into held from public.portfolio_file_holds h where h.project_file_id = sub.project_file_id order by h.seq desc limit 1;
  if held = 'placed' then b := array_append(b, 'a hold is in place on this photograph (dispute, complaint, audit or legal obligation): release it before erasing'); end if;
  select * into j from private.project_file_job(sub.project_file_id);
  if found then
    select h.action into held from public.marketing_permission_job_holds h where h.job_type = j.job_type and h.job_id = j.job_id order by h.seq desc limit 1;
    if held = 'placed' then b := array_append(b, 'a hold is in place on this photograph''s job (dispute, complaint, audit or legal obligation): release it before erasing'); end if;
  end if;
  if exists (select 1 from (select distinct on (u.destination) u.destination, u.action from public.portfolio_use_events u where u.project_file_id = sub.project_file_id order by u.destination, u.seq desc) cur
             where cur.action in ('published', 'shared') and cur.destination = any (g.allowed_destinations)) then
    b := array_append(b, 'the photograph is still in use for a use this permission covered: end or review that use before erasing the evidence behind it'); end if;
  -- the permission ENDED at the EARLIEST of: withdrawal or replacement, a past expiry date, or removal of the person from the photograph (least() ignores the events that did not happen)
  select least((select min(w.recorded_at)::date from public.portfolio_subject_permissions w where w.supersedes_id = g.id and w.decision in ('withdrawn', 'granted')),
               case when g.expires_on is not null and g.expires_on < current_date then g.expires_on end,
               removed_on) into ended;
  select max(u.occurred_at)::date into lastuse from public.portfolio_use_events u where u.project_file_id = sub.project_file_id;
  if p_basis = 'retention_period_ended' then
    select p.retention_years into years from public.portfolio_retention_policy p order by p.seq desc limit 1;
    if years is null then b := array_append(b, 'no retention policy has been recorded by management, so the retention basis cannot be used');
    elsif ended is null then b := array_append(b, 'the permission has not ended (it was never withdrawn, replaced or expired), so the retention period has not started');
    else
      earliest := (greatest(ended, coalesce(lastuse, ended)) + make_interval(years => years))::date;
      if earliest > current_date then b := array_append(b, ('the adopted retention period has not ended: the earliest date on this basis is ' || earliest::text)); end if;
    end if;
  end if;
  return query select b, earliest, ended, lastuse;
end $$;
revoke all on function public.portfolio_subject_permission_erasure_check(uuid, text) from public, anon, authenticated;
grant execute on function public.portfolio_subject_permission_erasure_check(uuid, text) to service_role;

-- 5. the aligned erasure function REPLACES the 0182 one (the old four-argument signature is dropped). It is strictly stricter: every 0182 refusal still applies, plus basis, period (retention basis), job-level hold, and a 10-200 character reason without personal details.
drop function public.portfolio_subject_permission_redact(uuid, uuid, text, boolean);
create function public.portfolio_subject_permission_redact(p_permission uuid, p_actor uuid, p_reason text, p_basis text, p_confirm_permitted boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare g record; chk record; blocker text;
begin
  if not private.is_portfolio_authority(p_actor) then raise exception 'only the Founder or an authorised executive admin may erase permission details'; end if;
  if p_basis is null or p_basis not in ('retention_period_ended', 'data_subject_request', 'legal_requirement', 'other_documented') then raise exception 'state the basis for the erasure'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 10 and 200 then raise exception 'state the reason for the erasure in 10 to 200 characters, without names or personal details'; end if;
  if p_confirm_permitted is distinct from true then raise exception 'confirm that erasure is permitted: no dispute, legal obligation, audit or active permission still needs this evidence'; end if;
  select * into g from public.portfolio_subject_permissions where id = p_permission for update;   -- serialises against a concurrent verification, withdrawal or replacement of this grant
  if not found or g.decision <> 'granted' then raise exception 'choose a recorded grant'; end if;
  select * into chk from public.portfolio_subject_permission_erasure_check(p_permission, p_basis);
  foreach blocker in array chk.blockers loop raise exception '%', blocker; end loop;
  perform set_config('ordift.redaction', 'on', true);
  update public.portfolio_subject_permissions set grantor_name = '[erased]', grantor_relationship = case when grantor_relationship is null then null else '[erased]' end,
    authority_reference = case when authority_reference is null then null else '[erased under retention policy]' end, evidence_reference = '[erased under retention policy]', note = case when note is null then null else '[erased under retention policy]' end
    where id = g.id or supersedes_id = g.id;
  perform set_config('ordift.redaction', 'off', true);
  insert into public.portfolio_subject_redactions (permission_id, reason, basis, confirmed_permitted, redacted_by) values (g.id, btrim(p_reason), p_basis, true, p_actor);
end $$;
revoke all on function public.portfolio_subject_permission_redact(uuid, uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.portfolio_subject_permission_redact(uuid, uuid, text, text, boolean) to service_role;

-- helpers. A log row is protected while ANY hold touches what it concerns: the photograph's own latest hold, its job's latest hold, and (for a job) any photograph of that job held.
create function private.portfolio_file_log_free_of_hold(p_file uuid) returns boolean language plpgsql stable security definer set search_path = '' as $$
declare j record;
begin
  if p_file is null then return false; end if;
  if (select h.action from public.portfolio_file_holds h where h.project_file_id = p_file order by h.seq desc limit 1) = 'placed' then return false; end if;
  select * into j from private.project_file_job(p_file);
  if found and (select h.action from public.marketing_permission_job_holds h where h.job_type = j.job_type and h.job_id = j.job_id order by h.seq desc limit 1) = 'placed' then return false; end if;
  return true;
end $$;
create function private.portfolio_job_log_free_of_hold(p_job_type text, p_job_id uuid) returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if (select h.action from public.marketing_permission_job_holds h where h.job_type = p_job_type and h.job_id = p_job_id order by h.seq desc limit 1) = 'placed' then return false; end if;
  if exists (select 1 from public.portfolio_file_holds fh cross join lateral private.project_file_job(fh.project_file_id) j where j.job_type = p_job_type and j.job_id = p_job_id
             and fh.seq = (select max(x.seq) from public.portfolio_file_holds x where x.project_file_id = fh.project_file_id) and fh.action = 'placed') then return false; end if;
  return true;
end $$;
create function private.portfolio_subject_log_free_of_hold(p_permission uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select private.portfolio_file_log_free_of_hold((select s.project_file_id from public.portfolio_subject_permissions p join public.portfolio_file_subjects s on s.id = p.subject_id where p.id = p_permission));
$$;
create function private.portfolio_record_log_free_of_hold(p_record uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select private.portfolio_job_log_free_of_hold(m.job_type, m.job_id) from public.marketing_permission_records m where m.id = p_record), false);
$$;

-- 6. PURGE REVIEW (read-only): how many log rows are past the adopted period and free of any active hold. NULL cutoff = no policy recorded.
create function public.portfolio_log_purge_preview()
returns table (log_table text, eligible_rows bigint, cutoff_date date)
language plpgsql stable security definer set search_path = '' as $$
declare years integer; c date;
begin
  select p.retention_years into years from public.portfolio_retention_policy p order by p.seq desc limit 1;
  if years is null then
    return query select t, 0::bigint, null::date from unnest(array['portfolio_subject_redactions','portfolio_file_holds','marketing_permission_redactions','marketing_permission_job_holds']) t; return; end if;
  c := (current_date - make_interval(years => years))::date;
  return query select 'portfolio_subject_redactions'::text, (select count(*) from public.portfolio_subject_redactions r where r.redacted_at::date < c and private.portfolio_subject_log_free_of_hold(r.permission_id)), c;
  return query select 'portfolio_file_holds'::text, (select count(*) from public.portfolio_file_holds h where h.recorded_at::date < c and private.portfolio_file_log_free_of_hold(h.project_file_id)), c;
  return query select 'marketing_permission_redactions'::text, (select count(*) from public.marketing_permission_redactions r where r.redacted_at::date < c and private.portfolio_record_log_free_of_hold(r.record_id)), c;
  return query select 'marketing_permission_job_holds'::text, (select count(*) from public.marketing_permission_job_holds h where h.recorded_at::date < c and private.portfolio_job_log_free_of_hold(h.job_type, h.job_id)), c;
end $$;

-- 7. the controlled PURGE: management only, a fixed reason code, an explicit confirmation, one table at a time; deletes only the rows the preview counts; leaves a permanent audit row in the SAME transaction. Never runs automatically.
create function public.portfolio_log_purge(p_table text, p_actor uuid, p_reason_code text, p_confirm boolean) returns integer
language plpgsql security definer set search_path = '' as $$
declare years integer; c date; n integer;
begin
  if not private.is_portfolio_authority(p_actor) then raise exception 'only the Founder or an authorised executive admin may purge expired log rows'; end if;
  if p_reason_code is null or p_reason_code not in ('retention_period_expired', 'annual_retention_review', 'legal_requirement', 'data_subject_request', 'policy_change') then raise exception 'choose the documented reason for the purge'; end if;
  if p_confirm is distinct from true then raise exception 'confirm that purging is permitted: no dispute, legal obligation or audit still needs these log rows'; end if;
  if p_table not in ('portfolio_subject_redactions', 'portfolio_file_holds', 'marketing_permission_redactions', 'marketing_permission_job_holds') then raise exception 'choose one of the four log tables'; end if;
  select p.retention_years into years from public.portfolio_retention_policy p order by p.seq desc limit 1;
  if years is null then raise exception 'no retention policy has been recorded by management, so nothing can be purged'; end if;
  c := (current_date - make_interval(years => years))::date;
  lock table public.portfolio_file_holds, public.marketing_permission_job_holds in share row exclusive mode;   -- a hold placed while a purge runs is never missed
  perform set_config('ordift.log_purge', 'on', true);
  if p_table = 'portfolio_subject_redactions' then
    with d as (delete from public.portfolio_subject_redactions r where r.redacted_at::date < c and private.portfolio_subject_log_free_of_hold(r.permission_id) returning 1) select count(*) into n from d;
  elsif p_table = 'portfolio_file_holds' then
    with d as (delete from public.portfolio_file_holds h where h.recorded_at::date < c and private.portfolio_file_log_free_of_hold(h.project_file_id) returning 1) select count(*) into n from d;
  elsif p_table = 'marketing_permission_redactions' then
    with d as (delete from public.marketing_permission_redactions r where r.redacted_at::date < c and private.portfolio_record_log_free_of_hold(r.record_id) returning 1) select count(*) into n from d;
  else
    with d as (delete from public.marketing_permission_job_holds h where h.recorded_at::date < c and private.portfolio_job_log_free_of_hold(h.job_type, h.job_id) returning 1) select count(*) into n from d;
  end if;
  perform set_config('ordift.log_purge', 'off', true);
  insert into public.portfolio_log_purges (purged_table, rows_purged, cutoff_date, retention_years, reason_code, confirmed, purged_by) values (p_table, n, c, years, p_reason_code, true, p_actor);
  return n;
end $$;
revoke all on function public.portfolio_log_purge_preview(), public.portfolio_log_purge(text, uuid, text, boolean), private.portfolio_log_immutable(), private.portfolio_file_log_free_of_hold(uuid), private.portfolio_job_log_free_of_hold(text, uuid), private.portfolio_subject_log_free_of_hold(uuid), private.portfolio_record_log_free_of_hold(uuid) from public, anon, authenticated;
grant execute on function public.portfolio_log_purge_preview(), public.portfolio_log_purge(text, uuid, text, boolean) to service_role;

alter table public.portfolio_log_purges enable row level security;
revoke all on public.portfolio_log_purges from anon, authenticated, service_role;
grant select, insert on public.portfolio_log_purges to service_role;

-- 12. L6: an erased permission can never be verified, reactivated or restored. A NEW trigger (the 0182 guard is untouched) refuses a 'verified' row whose grant has been erased, whoever writes it. A grant counts as erased if its details carry the erasure marker OR an erasure-log row
-- exists, so the protection survives a later purge of the erasure log. The grant row is read FOR SHARE, which serialises against an erasure in progress (the erasure holds the same row FOR UPDATE). A withdrawal is never blocked (it is protective), and a NEW permission may still be recorded
-- from the person concerned (new evidence, not a restoration). There is no restoration mechanism: if one is ever approved it needs its own migration.
create function private.portfolio_subject_permission_erased_guard() returns trigger language plpgsql security definer set search_path = '' as $$
declare t record;
begin
  if new.decision = 'verified' and new.supersedes_id is not null then
    select id, grantor_name into t from public.portfolio_subject_permissions where id = new.supersedes_id for share;
    if found and (t.grantor_name = '[erased]' or exists (select 1 from public.portfolio_subject_redactions r where r.permission_id = t.id)) then
      raise exception 'the personal details of that permission were erased, so it cannot be verified again: record a new permission';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.portfolio_subject_permission_erased_guard() from public, anon, authenticated;
create trigger portfolio_subject_permission_erased_guard before insert on public.portfolio_subject_permissions for each row execute function private.portfolio_subject_permission_erased_guard();

commit;
