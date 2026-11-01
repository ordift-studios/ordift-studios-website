-- PROPOSED 0183 (NOT APPLIED, NOT in supabase/migrations). Depends on migration 0182 revision 2 (it reuses portfolio_file_holds). Narrow follow-up to 0170: lawful retention, restriction and CONTROLLED ERASURE of the personal details in the older client-permission records
-- (marketing_permission_records), with a job-level legal/dispute HOLD. It changes NO decision, destination, scope, date, supersession, verification state or eligibility result: marketing_permission_state / portfolio_use_eligibility read none of the erasable columns.
-- Erasable columns only: grantor_name, evidence_summary, evidence_storage_path, note. Everything else, and the append-only history, is preserved.
begin;

create table public.marketing_permission_job_holds (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  job_type text not null check (job_type in ('crew_support_request', 'engagement')),
  job_id uuid not null,
  action text not null check (action in ('placed', 'released')),
  reason text not null check (char_length(btrim(reason)) between 10 and 200),   -- no names or personal details: say what kind of dispute, complaint, audit or obligation
  recorded_by uuid not null references public.profiles (id),
  recorded_at timestamptz not null default now()
);
create index marketing_permission_hold_job on public.marketing_permission_job_holds (job_type, job_id, seq desc);
create function private.marketing_permission_job_hold_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_portfolio_authority(new.recorded_by) then raise exception 'only the Founder or an authorised executive admin may place or release a hold'; end if;
  return new;
end $$;
create trigger marketing_permission_job_hold_guard before insert on public.marketing_permission_job_holds for each row execute function private.marketing_permission_job_hold_guard();
create trigger marketing_permission_job_hold_append_only before update or delete on public.marketing_permission_job_holds for each row execute function private.portfolio_append_only();

create table public.marketing_permission_redactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  record_id uuid not null references public.marketing_permission_records (id),
  reason text not null check (char_length(btrim(reason)) between 10 and 200),   -- no names or personal details
  confirmed_permitted boolean not null check (confirmed_permitted),
  storage_object_removed boolean not null,
  redacted_by uuid not null references public.profiles (id),
  redacted_at timestamptz not null default now()
);
create trigger marketing_permission_redaction_append_only before update or delete on public.marketing_permission_redactions for each row execute function private.portfolio_append_only();

-- The table stays append-only. The ONLY change allowed is by the erasure function, which sets a transaction-local flag and may alter only the four personal columns, only to erasure markers (or null for the storage path).
drop trigger marketing_permission_append_only on public.marketing_permission_records;
create function private.marketing_permission_immutable() returns trigger language plpgsql set search_path = '' as $$
declare personal text[] := array['grantor_name', 'evidence_summary', 'evidence_storage_path', 'note'];
begin
  if tg_op = 'DELETE' then raise exception 'marketing_permission_records rows are never deleted'; end if;
  if coalesce(current_setting('ordift.redaction', true), '') <> 'on' then raise exception 'marketing_permission_records rows are append-only'; end if;
  if (to_jsonb(new) - personal) is distinct from (to_jsonb(old) - personal) then raise exception 'only personal fields may be erased'; end if;
  return new;
end $$;
create trigger marketing_permission_immutable before update or delete on public.marketing_permission_records for each row execute function private.marketing_permission_immutable();

create function public.marketing_permission_record_redact(p_record uuid, p_actor uuid, p_reason text, p_confirm_permitted boolean, p_storage_object_removed boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare g record; root uuid; in_force boolean; held text; in_use boolean; has_path boolean;
begin
  if not private.is_portfolio_authority(p_actor) then raise exception 'only the Founder or an authorised executive admin may erase permission details'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 10 and 200 then raise exception 'state the reason for the erasure in 10 to 200 characters, without names or personal details'; end if;
  if p_confirm_permitted is distinct from true then raise exception 'confirm that erasure is permitted: no dispute, legal obligation, audit or active permission still needs this evidence'; end if;
  select * into g from public.marketing_permission_records where id = p_record;
  if not found then raise exception 'record not found'; end if;
  root := coalesce(g.supersedes_id, g.id);                                  -- a verification or withdrawal is erased together with the grant it follows
  select * into g from public.marketing_permission_records where id = root;
  -- an in-force grant (verified, not withdrawn, not expired) is never erased
  select (g.decision = 'granted'
    and (g.verification_status = 'verified' or exists (select 1 from public.marketing_permission_records v where v.supersedes_id = g.id and v.decision = 'verified'))
    and not exists (select 1 from public.marketing_permission_records w where w.supersedes_id = g.id and w.decision = 'withdrawn')
    and (g.expires_on is null or g.expires_on >= current_date)) into in_force;
  if in_force then raise exception 'that permission is still in force: withdraw it (or wait for its expiry) before erasing its details'; end if;
  select h.action into held from public.marketing_permission_job_holds h where h.job_type = g.job_type and h.job_id = g.job_id order by h.seq desc limit 1;
  if held = 'placed' then raise exception 'a hold is in place on this job (dispute, complaint, audit or legal obligation): release it before erasing'; end if;
  if exists (select 1 from public.portfolio_file_holds fh cross join lateral private.project_file_job(fh.project_file_id) j where j.job_type = g.job_type and j.job_id = g.job_id
             and fh.seq = (select max(x.seq) from public.portfolio_file_holds x where x.project_file_id = fh.project_file_id) and fh.action = 'placed') then
    raise exception 'a hold is in place on a photograph of this job: release it before erasing'; end if;
  select exists (select 1 from (select distinct on (u.project_file_id, u.destination) u.project_file_id, u.destination, u.action from public.portfolio_use_events u order by u.project_file_id, u.destination, u.seq desc) cur
    cross join lateral private.project_file_job(cur.project_file_id) j
    where j.job_type = g.job_type and j.job_id = g.job_id and cur.action in ('published', 'shared') and cur.destination = any (g.allowed_destinations)) into in_use;
  if in_use then raise exception 'a photograph of this job is still in use for a use this permission covered: end or review that use before erasing the evidence behind it'; end if;
  select exists (select 1 from public.marketing_permission_records r where (r.id = g.id or r.supersedes_id = g.id) and r.evidence_storage_path is not null) into has_path;
  if has_path and p_storage_object_removed is not true then raise exception 'a stored evidence file is attached: remove the file from storage first, then confirm that it was removed'; end if;
  perform set_config('ordift.redaction', 'on', true);
  update public.marketing_permission_records set grantor_name = '[erased]', evidence_summary = case when evidence_summary is null then null else '[erased under retention policy]' end,
    note = case when note is null then null else '[erased under retention policy]' end, evidence_storage_path = null
    where id = g.id or supersedes_id = g.id;
  perform set_config('ordift.redaction', 'off', true);
  insert into public.marketing_permission_redactions (record_id, reason, confirmed_permitted, storage_object_removed, redacted_by) values (g.id, btrim(p_reason), true, coalesce(p_storage_object_removed, false), p_actor);
end $$;
revoke all on function public.marketing_permission_record_redact(uuid, uuid, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.marketing_permission_record_redact(uuid, uuid, text, boolean, boolean) to service_role;

alter table public.marketing_permission_job_holds enable row level security;
alter table public.marketing_permission_redactions enable row level security;
revoke all on public.marketing_permission_job_holds, public.marketing_permission_redactions from anon, authenticated, service_role;
grant select, insert on public.marketing_permission_job_holds, public.marketing_permission_redactions to service_role;
revoke all on function private.marketing_permission_job_hold_guard(), private.marketing_permission_immutable() from public, anon, authenticated;

commit;
