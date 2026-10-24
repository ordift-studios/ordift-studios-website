-- Founder-approved 2026-10-25 for Production, to be applied in order 0168, 0169, 0170, 0171 with every application feature gate OFF. Additive only. Rehearsed locally (see supabase/proposals/RELEASE_PLAN_0168_0171.md).
-- NUMBER: 0170 (after 0169, which it requires). Part 2 of 3: STAGE 1 - rights-holder authorization (marketing permission).
-- Dependencies in Production: agreements (status, primary_context_type/reference), agreement_releases (usage_rights, duration, territory), profiles, project_files,
-- plus 0169 helpers (private.is_portfolio_authority, private.project_file_job, private.job_reference, private.portfolio_append_only).
--
-- Three ways permission can exist, all recorded in ONE append-only table so history is never rewritten:
--   contract        - an agreement the database itself checks: fully executed, linked to THIS job, with a recorded release whose usage rights cover every
--                     requested use. A bare contract signature without such a release is rejected, never inferred.
--   client_portal   - the client, signed in, answers a request an authority created for them. Nothing is preselected; refusal is recorded and touches no delivery.
--   admin_recorded  - the Founder / an executive admin registers permission obtained outside the platform, with grantor, capacity, method, evidence and who recorded it.
--                     Always labelled as administrator-recorded; never presented as a client portal action. No signature, date or wording is ever invented.
-- A grant counts only when verified. A job-wide decline/withdrawal blocks every earlier grant; a withdrawal of one grant closes just that grant.
begin;

create function private.destination_usage_right(p_destination text) returns text language sql immutable set search_path = '' as $$
  select case p_destination
    when 'portfolio' then 'portfolio' when 'client_samples' then 'portfolio'
    when 'website' then 'website' when 'journal' then 'website'
    when 'social_media' then 'organic_social'
    when 'brochure' then 'print' when 'print_collateral' then 'print'
    when 'paid_advertising' then 'paid_advertising' end;
$$;

create table public.marketing_permission_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  job_type text not null check (job_type in ('crew_support_request', 'engagement')),
  job_id uuid not null,
  addressed_to uuid not null references public.profiles (id),
  proposed_destinations text[] not null check (cardinality(proposed_destinations) > 0 and proposed_destinations <@ array['portfolio','website','social_media','client_samples','journal','brochure','print_collateral','paid_advertising']),
  file_ids uuid[],                                   -- null = every photograph of the job
  text_version text not null,
  status text not null default 'open' check (status in ('open', 'answered', 'cancelled')),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint permission_request_closed_shape check ((status = 'open') = (closed_at is null))
);
create unique index marketing_permission_one_open_request on public.marketing_permission_requests (job_type, job_id, addressed_to) where status = 'open';

create table public.marketing_permission_records (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  job_type text not null check (job_type in ('crew_support_request', 'engagement')),
  job_id uuid not null,
  source text not null check (source in ('contract', 'client_portal', 'admin_recorded')),
  decision text not null check (decision in ('granted', 'declined', 'withdrawn', 'verified')),
  supersedes_id uuid references public.marketing_permission_records (id),
  grantor_name text not null check (char_length(btrim(grantor_name)) >= 2),
  grantor_capacity text not null check (grantor_capacity in ('client', 'client_representative', 'commissioning_party', 'photographer_of_record', 'venue_or_property_owner', 'subject_individual', 'guardian', 'other')),
  grantor_profile_id uuid references public.profiles (id),
  allowed_destinations text[] not null default '{}' check (allowed_destinations <@ array['portfolio','website','social_media','client_samples','journal','brochure','print_collateral','paid_advertising']),
  file_ids uuid[],
  restrictions text,
  expires_on date,
  agreement_id uuid references public.agreements (id),
  agreement_clause text,
  permission_text_version text,
  request_id uuid references public.marketing_permission_requests (id),
  method text check (method in ('email', 'message', 'signed_document', 'verbal', 'other')),
  granted_on date,                                   -- only when established; never defaulted
  evidence_summary text,
  evidence_storage_path text,                        -- optional private storage object holding the supporting document/screenshot
  verification_status text not null default 'pending_verification' check (verification_status in ('verified', 'pending_verification')),
  note text,
  recorded_by uuid not null references public.profiles (id),
  recorded_at timestamptz not null default now(),
  constraint permission_grant_needs_uses check (decision <> 'granted' or cardinality(allowed_destinations) > 0),
  constraint permission_contract_shape check (source <> 'contract' or (agreement_id is not null and char_length(btrim(coalesce(agreement_clause, ''))) >= 2)),
  constraint permission_portal_shape check (source <> 'client_portal' or (grantor_profile_id is not null and grantor_profile_id = recorded_by and permission_text_version is not null)),
  constraint permission_admin_shape check (source <> 'admin_recorded' or (decision = 'verified' or (method is not null and char_length(btrim(coalesce(evidence_summary, ''))) >= 10))),
  constraint permission_close_needs_reason check (decision not in ('declined', 'withdrawn') or char_length(btrim(coalesce(note, ''))) >= 3 or source = 'client_portal'),
  constraint permission_verify_shape check (decision <> 'verified' or supersedes_id is not null),
  constraint permission_withdraw_target check (decision <> 'withdrawn' or source <> 'client_portal' or supersedes_id is not null)
);
create index marketing_permission_job on public.marketing_permission_records (job_type, job_id, seq desc);
create index marketing_permission_supersedes on public.marketing_permission_records (supersedes_id) where supersedes_id is not null;

create function private.marketing_permission_guard() returns trigger language plpgsql security definer set search_path = '' as $$
declare ag record; rel record; tgt record; req record; d text; ok boolean := true;
begin
  -- every named photograph must belong to THIS job (never mix jobs)
  if new.file_ids is not null and exists (select 1 from unnest(new.file_ids) f where not exists (select 1 from private.project_file_job(f) j where j.job_type = new.job_type and j.job_id = new.job_id)) then
    raise exception 'every photograph named must belong to this job'; end if;
  if new.supersedes_id is not null then
    select * into tgt from public.marketing_permission_records where id = new.supersedes_id;
    if not found or tgt.job_type <> new.job_type or tgt.job_id <> new.job_id then raise exception 'the record being superseded must belong to the same job'; end if;
    if new.decision = 'verified' and (tgt.decision <> 'granted' or tgt.source = 'client_portal') then raise exception 'only an administrator-recorded or contract-derived grant can be verified later'; end if;
    if new.decision = 'withdrawn' and tgt.decision <> 'granted' then raise exception 'only a grant can be withdrawn'; end if;
  end if;

  if new.source = 'admin_recorded' or new.decision = 'verified' or new.source = 'contract' then
    if not private.is_portfolio_authority(new.recorded_by) then raise exception 'only the Founder or an authorised executive admin may record or verify marketing permission'; end if;
  end if;

  if new.source = 'contract' and new.decision = 'granted' then
    select a.status, a.primary_context_type, a.primary_context_reference into ag from public.agreements a where a.id = new.agreement_id;
    if not found then raise exception 'agreement not found'; end if;
    if ag.status not in ('fully_executed', 'active', 'completed') then raise exception 'the agreement is not fully executed: a draft, issued or partly signed agreement establishes no permission'; end if;
    if ag.primary_context_type is distinct from new.job_type or ag.primary_context_reference is distinct from private.job_reference(new.job_type, new.job_id) then
      raise exception 'the agreement is not linked to this job'; end if;
    select r.usage_rights, r.duration, r.duration_end_date, r.territory into rel from public.agreement_releases r where r.agreement_id = new.agreement_id;
    if not found then raise exception 'the agreement records no marketing/usage release: signing a contract is not marketing consent'; end if;
    foreach d in array new.allowed_destinations loop
      if coalesce((rel.usage_rights ->> private.destination_usage_right(d))::boolean, false) is not true then
        raise exception 'the agreement''s release does not grant the usage right needed for %', d; end if;
    end loop;
    if rel.duration = 'fixed_term' and (new.expires_on is null or new.expires_on > rel.duration_end_date) then raise exception 'expiry must not extend beyond the release term'; end if;
    -- anything short of a clear, unlimited-territory, perpetual/fixed-term release still needs a human to verify the scope
    ok := rel.territory = 'worldwide' and rel.duration in ('perpetual', 'fixed_term');
    new.verification_status := case when ok then 'verified' else 'pending_verification' end;
  elsif new.source = 'client_portal' then
    if new.decision in ('granted', 'declined') then
      select * into req from public.marketing_permission_requests where id = new.request_id;
      if not found or req.status <> 'open' or req.addressed_to <> new.recorded_by or req.job_type <> new.job_type or req.job_id <> new.job_id then
        raise exception 'there is no open permission request addressed to you for this job'; end if;
      if new.decision = 'granted' and not (new.allowed_destinations <@ req.proposed_destinations) then raise exception 'you can only grant the uses that were requested'; end if;
      if new.decision = 'granted' and req.file_ids is not null and (new.file_ids is null or not (new.file_ids <@ req.file_ids)) then raise exception 'you can only grant the photographs that were requested'; end if;
      new.verification_status := 'verified';             -- the signed-in rights holder is the evidence; the wording version is recorded
    elsif new.decision = 'withdrawn' then
      if tgt.grantor_profile_id is distinct from new.recorded_by then raise exception 'only the person who granted permission can withdraw it from the portal'; end if;
      new.verification_status := 'verified';
    end if;
  elsif new.source = 'admin_recorded' and new.decision = 'granted' then
    -- the recorder states whether the evidence suffices; the authority check above stops anyone else marking it verified
    null;
  end if;
  if new.decision in ('declined', 'withdrawn', 'verified') and new.verification_status <> 'verified' and new.source <> 'admin_recorded' then new.verification_status := 'verified'; end if;
  return new;
end $$;
create trigger marketing_permission_guard before insert on public.marketing_permission_records for each row execute function private.marketing_permission_guard();
create trigger marketing_permission_append_only before update or delete on public.marketing_permission_records for each row execute function private.portfolio_append_only();

-- Answering a request closes it (a portal answer is the only thing that can); cancelling is by an authority.
create function private.marketing_permission_after() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.source = 'client_portal' and new.request_id is not null and new.decision in ('granted', 'declined') then
    update public.marketing_permission_requests set status = 'answered', closed_at = now() where id = new.request_id and status = 'open';
  end if;
  return new;
end $$;
create trigger marketing_permission_after after insert on public.marketing_permission_records for each row execute function private.marketing_permission_after();

create function private.marketing_permission_request_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'permission requests are never deleted'; end if;
  if tg_op = 'INSERT' then
    if not private.is_portfolio_authority(new.created_by) then raise exception 'only the Founder or an authorised executive admin may request permission'; end if;
    if new.file_ids is not null and exists (select 1 from unnest(new.file_ids) f where not exists (select 1 from private.project_file_job(f) j where j.job_type = new.job_type and j.job_id = new.job_id)) then
      raise exception 'every photograph named must belong to this job'; end if;
    return new;
  end if;
  if old.status <> 'open' or new.status not in ('answered', 'cancelled') or (to_jsonb(old) - 'status' - 'closed_at') is distinct from (to_jsonb(new) - 'status' - 'closed_at') then
    raise exception 'a permission request can only be closed'; end if;
  return new;
end $$;
create trigger marketing_permission_request_guard before insert or update or delete on public.marketing_permission_requests for each row execute function private.marketing_permission_request_guard();

-- Is this photograph, today, covered by an IN-FORCE permission for this destination? Read-only; callable by the server (service role) only, after its own authority checks.
create function public.marketing_permission_state(p_file uuid, p_destination text, p_on date default current_date)
returns table (effective boolean, reason text, record_id uuid, source text) language plpgsql stable security definer set search_path = '' as $$
declare j record; blocked bigint; g record; any_grant boolean := false; closed boolean := false; pend boolean := false; expd boolean := false; wrongd boolean := false; outs boolean := false;
begin
  select * into j from private.project_file_job(p_file);
  if not found then return query select false, 'file_has_no_job'::text, null::uuid, null::text; return; end if;
  select coalesce(max(r.seq), 0) into blocked from public.marketing_permission_records r where r.job_type = j.job_type and r.job_id = j.job_id and r.decision in ('declined', 'withdrawn') and r.supersedes_id is null;
  for g in select r.* from public.marketing_permission_records r where r.job_type = j.job_type and r.job_id = j.job_id and r.decision = 'granted' order by r.seq desc loop
    any_grant := true;
    if g.seq < blocked or exists (select 1 from public.marketing_permission_records w where w.supersedes_id = g.id and w.decision = 'withdrawn') then closed := closed or ((p_destination = any (g.allowed_destinations)) and (g.file_ids is null or p_file = any (g.file_ids))); continue; end if;
    if g.file_ids is not null and not (p_file = any (g.file_ids)) then outs := true; continue; end if;
    if not (p_destination = any (g.allowed_destinations)) then wrongd := true; continue; end if;
    if g.expires_on is not null and g.expires_on < p_on then expd := true; continue; end if;
    if g.verification_status <> 'verified' and not exists (select 1 from public.marketing_permission_records v where v.supersedes_id = g.id and v.decision = 'verified') then pend := true; continue; end if;
    return query select true, 'permission_in_force'::text, g.id, g.source; return;
  end loop;
  return query select false,
    case when not any_grant and blocked > 0 then 'declined_or_withdrawn' when not any_grant then 'no_permission_on_record'
         when pend then 'pending_verification' when expd then 'expired' when closed then 'declined_or_withdrawn' when wrongd then 'use_not_authorised' when outs then 'photograph_not_in_scope' else 'declined_or_withdrawn' end,
    null::uuid, null::text;
end $$;

alter table public.marketing_permission_requests enable row level security;
alter table public.marketing_permission_records enable row level security;
create policy "permission_requests: staff read" on public.marketing_permission_requests for select to authenticated using ((select private.is_staff_or_admin()));
create policy "permission_requests: addressee read" on public.marketing_permission_requests for select to authenticated using (addressed_to = (select auth.uid()));
create policy "permission_records: staff read" on public.marketing_permission_records for select to authenticated using ((select private.is_staff_or_admin()));
create policy "permission_records: grantor read own" on public.marketing_permission_records for select to authenticated using (grantor_profile_id = (select auth.uid()));
-- This project's default privileges give anon, authenticated and service_role TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on every new table (TRUNCATE would skip the append-only row triggers). Remove them, then grant only what is intended.
revoke all on public.marketing_permission_requests, public.marketing_permission_records from anon, authenticated, service_role;
grant select on public.marketing_permission_requests, public.marketing_permission_records to authenticated;
grant select, insert, update on public.marketing_permission_requests to service_role;
grant select, insert on public.marketing_permission_records to service_role;
revoke all on function public.marketing_permission_state(uuid, text, date) from public, anon, authenticated;
grant execute on function public.marketing_permission_state(uuid, text, date) to service_role;
commit;
-- ROLLBACK (only while no genuine rows exist): drop function public.marketing_permission_state(uuid, text, date); drop table marketing_permission_records, marketing_permission_requests;
-- drop functions private.marketing_permission_guard(), private.marketing_permission_after(), private.marketing_permission_request_guard(), private.destination_usage_right(text). Roll back 0171 first.
