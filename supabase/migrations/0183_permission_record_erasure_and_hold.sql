-- PROPOSED 0183, REVISION 3 (fail-closed stored-file rule: a record that still references a stored evidence file can NEVER be erased, because the system cannot verify that the file was removed and a person's confirmation must not stand in for evidence; no override exists. Production holds 0 such records).
-- REVISION 2 text follows: for the management retention policy (NOT APPLIED, NOT in supabase/migrations; the first 0183 candidate, sha256 96ddcd18...9c3f, was never approved and is superseded). Adds: an append-only RETENTION POLICY record (no value is seeded: until management records one, erasure on the
-- 'retention_period_ended' basis is refused), a recorded BASIS for every erasure, a read-only PREFLIGHT that lists what blocks an erasure, and enforcement of the adopted period for the retention basis.
-- PROPOSED 0183 (original text follows). Depends on migration 0182 revision 2 (it reuses portfolio_file_holds). Narrow follow-up to 0170: lawful retention, restriction and CONTROLLED ERASURE of the personal details in the older client-permission records
-- (marketing_permission_records), with a job-level legal/dispute HOLD. It changes NO decision, destination, scope, date, supersession, verification state or eligibility result: marketing_permission_state / portfolio_use_eligibility read none of the erasable columns.
-- Erasable columns only: grantor_name, evidence_summary, note (the stored-file reference is never altered; a record with one cannot be erased). Everything else, and the append-only history, is preserved.
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

-- The adopted retention period for permission evidence (management policy choice, not a statutory period). NO ROW IS SEEDED: recording one is a management act. Append-only; the latest row applies.
create table public.portfolio_retention_policy (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  retention_years integer not null check (retention_years between 1 and 50),
  policy_note text not null check (char_length(btrim(policy_note)) between 10 and 500),   -- what was decided, and that longer retention applies only where a legal obligation, limitation period, dispute or hold requires it
  adopted_by uuid not null references public.profiles (id),
  adopted_at timestamptz not null default now()
);
create function private.portfolio_retention_policy_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_portfolio_authority(new.adopted_by) then raise exception 'only the Founder or an authorised executive admin may record the retention policy'; end if;
  return new;
end $$;
create trigger portfolio_retention_policy_guard before insert on public.portfolio_retention_policy for each row execute function private.portfolio_retention_policy_guard();
create trigger portfolio_retention_policy_append_only before update or delete on public.portfolio_retention_policy for each row execute function private.portfolio_append_only();

create table public.marketing_permission_redactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  record_id uuid not null references public.marketing_permission_records (id),
  reason text not null check (char_length(btrim(reason)) between 10 and 200),   -- no names or personal details
  basis text not null check (basis in ('retention_period_ended', 'data_subject_request', 'legal_requirement', 'other_documented')),
  confirmed_permitted boolean not null check (confirmed_permitted),
  redacted_by uuid not null references public.profiles (id),
  redacted_at timestamptz not null default now()
);
create trigger marketing_permission_redaction_append_only before update or delete on public.marketing_permission_redactions for each row execute function private.portfolio_append_only();

-- The table stays append-only. The ONLY change allowed is by the erasure function, which sets a transaction-local flag and may alter only the three personal columns, only to erasure markers.
drop trigger marketing_permission_append_only on public.marketing_permission_records;
create function private.marketing_permission_immutable() returns trigger language plpgsql set search_path = '' as $$
declare personal text[] := array['grantor_name', 'evidence_summary', 'note'];
begin
  if tg_op = 'DELETE' then raise exception 'marketing_permission_records rows are never deleted'; end if;
  if coalesce(current_setting('ordift.redaction', true), '') <> 'on' then raise exception 'marketing_permission_records rows are append-only'; end if;
  if (to_jsonb(new) - personal) is distinct from (to_jsonb(old) - personal) then raise exception 'only personal fields may be erased'; end if;
  return new;
end $$;
create trigger marketing_permission_immutable before update or delete on public.marketing_permission_records for each row execute function private.marketing_permission_immutable();

-- READ-ONLY PREFLIGHT: what stops an erasure right now, as readable messages, plus the earliest date the adopted retention period allows. Callable by the server only; used by the erasure function itself so the two can never disagree.
create function public.marketing_permission_record_erasure_check(p_record uuid, p_basis text default 'retention_period_ended')
returns table (blockers text[], earliest_retention_date date, ended_on date, last_use_on date)
language plpgsql stable security definer set search_path = '' as $$
declare g record; root uuid; b text[] := '{}'; years integer; held text; ended date; lastuse date; earliest date;
begin
  select * into g from public.marketing_permission_records where id = p_record;
  if not found then return query select array['record not found']::text[], null::date, null::date, null::date; return; end if;
  root := coalesce(g.supersedes_id, g.id);
  select * into g from public.marketing_permission_records where id = root;
  if g.decision = 'granted'
     and (g.verification_status = 'verified' or exists (select 1 from public.marketing_permission_records v where v.supersedes_id = g.id and v.decision = 'verified'))
     and not exists (select 1 from public.marketing_permission_records w where w.supersedes_id = g.id and w.decision = 'withdrawn')
     and (g.expires_on is null or g.expires_on >= current_date) then
    b := array_append(b, 'that permission is still in force: withdraw it (or wait for its expiry) before erasing its details'); end if;
  select h.action into held from public.marketing_permission_job_holds h where h.job_type = g.job_type and h.job_id = g.job_id order by h.seq desc limit 1;
  if held = 'placed' then b := array_append(b, 'a hold is in place on this job (dispute, complaint, audit or legal obligation): release it before erasing'); end if;
  if exists (select 1 from public.portfolio_file_holds fh cross join lateral private.project_file_job(fh.project_file_id) j where j.job_type = g.job_type and j.job_id = g.job_id
             and fh.seq = (select max(x.seq) from public.portfolio_file_holds x where x.project_file_id = fh.project_file_id) and fh.action = 'placed') then
    b := array_append(b, 'a hold is in place on a photograph of this job: release it before erasing'); end if;
  if exists (select 1 from (select distinct on (u.project_file_id, u.destination) u.project_file_id, u.destination, u.action from public.portfolio_use_events u order by u.project_file_id, u.destination, u.seq desc) cur
             cross join lateral private.project_file_job(cur.project_file_id) j
             where j.job_type = g.job_type and j.job_id = g.job_id and cur.action in ('published', 'shared') and cur.destination = any (g.allowed_destinations)) then
    b := array_append(b, 'a photograph of this job is still in use for a use this permission covered: end or review that use before erasing the evidence behind it'); end if;
  if exists (select 1 from public.marketing_permission_records r where (r.id = g.id or r.supersedes_id = g.id) and r.evidence_storage_path is not null) then
    b := array_append(b, 'a stored evidence file reference exists: the system cannot verify that the file was removed, so erasure of this record is refused (no override)'); end if;
  -- when did the permission end, and when was the last authorised use?
  select coalesce((select min(w.recorded_at)::date from public.marketing_permission_records w where w.supersedes_id = g.id and w.decision = 'withdrawn'),
                  case when g.decision = 'declined' then g.recorded_at::date end,
                  case when g.expires_on is not null and g.expires_on < current_date then g.expires_on end) into ended;
  select max(u.occurred_at)::date into lastuse from public.portfolio_use_events u cross join lateral private.project_file_job(u.project_file_id) j where j.job_type = g.job_type and j.job_id = g.job_id;
  if p_basis = 'retention_period_ended' then
    select p.retention_years into years from public.portfolio_retention_policy p order by p.seq desc limit 1;
    if years is null then b := array_append(b, 'no retention policy has been recorded by management, so the retention basis cannot be used');
    elsif ended is null then b := array_append(b, 'the permission has not ended (it was never withdrawn, declined or expired), so the retention period has not started');
    else
      earliest := (greatest(ended, coalesce(lastuse, ended)) + make_interval(years => years))::date;
      if earliest > current_date then b := array_append(b, ('the adopted retention period has not ended: the earliest date on this basis is ' || earliest::text)); end if;
    end if;
  end if;
  return query select b, earliest, ended, lastuse;
end $$;
revoke all on function public.marketing_permission_record_erasure_check(uuid, text) from public, anon, authenticated;
grant execute on function public.marketing_permission_record_erasure_check(uuid, text) to service_role;

create function public.marketing_permission_record_redact(p_record uuid, p_actor uuid, p_reason text, p_basis text, p_confirm_permitted boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare g record; root uuid; chk record; blocker text;
begin
  if not private.is_portfolio_authority(p_actor) then raise exception 'only the Founder or an authorised executive admin may erase permission details'; end if;
  if p_basis is null or p_basis not in ('retention_period_ended', 'data_subject_request', 'legal_requirement', 'other_documented') then raise exception 'state the basis for the erasure'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 10 and 200 then raise exception 'state the reason for the erasure in 10 to 200 characters, without names or personal details'; end if;
  if p_confirm_permitted is distinct from true then raise exception 'confirm that erasure is permitted: no dispute, legal obligation, audit or active permission still needs this evidence'; end if;
  select * into g from public.marketing_permission_records where id = p_record;
  if not found then raise exception 'record not found'; end if;
  root := coalesce(g.supersedes_id, g.id);                                  -- a verification or withdrawal is erased together with the grant it follows
  select * into g from public.marketing_permission_records where id = root;
  select * into chk from public.marketing_permission_record_erasure_check(root, p_basis);
  foreach blocker in array chk.blockers loop raise exception '%', blocker; end loop;
  perform set_config('ordift.redaction', 'on', true);
  update public.marketing_permission_records set grantor_name = '[erased]', evidence_summary = case when evidence_summary is null then null else '[erased under retention policy]' end,
    note = case when note is null then null else '[erased under retention policy]' end
    where id = g.id or supersedes_id = g.id;
  perform set_config('ordift.redaction', 'off', true);
  insert into public.marketing_permission_redactions (record_id, reason, basis, confirmed_permitted, redacted_by) values (g.id, btrim(p_reason), p_basis, true, p_actor);
end $$;
revoke all on function public.marketing_permission_record_redact(uuid, uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.marketing_permission_record_redact(uuid, uuid, text, text, boolean) to service_role;

alter table public.marketing_permission_job_holds enable row level security;
alter table public.marketing_permission_redactions enable row level security;
alter table public.portfolio_retention_policy enable row level security;
revoke all on public.marketing_permission_job_holds, public.marketing_permission_redactions, public.portfolio_retention_policy from anon, authenticated, service_role;
grant select, insert on public.marketing_permission_job_holds, public.marketing_permission_redactions, public.portfolio_retention_policy to service_role;
revoke all on function private.marketing_permission_job_hold_guard(), private.marketing_permission_immutable(), private.portfolio_retention_policy_guard() from public, anon, authenticated;

commit;
