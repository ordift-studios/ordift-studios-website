-- LOCAL REHEARSAL ONLY (throwaway database; synthetic rows; rolls back). Not part of any release.
begin;
set local session_replication_role = replica;   -- synthetic source rows only: skip FK checks on project_files/engagements for the rehearsal


create table public.portfolio_candidates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  project_file_id uuid not null unique references public.project_files (id),         -- the SOURCE file; one candidate record per file
  service text, event_type text, style text, location text, jurisdiction text,          -- organising tags (optional)
  caption text,
  status text not null default 'candidate' check (status in ('candidate', 'shortlisted', 'withdrawn')),
  added_by uuid not null references public.profiles (id),
  added_at timestamptz not null default now(),
  withdrawn_by uuid references public.profiles (id), withdrawn_at timestamptz, withdrawn_reason text,
  constraint candidate_withdrawal_shape check ((status = 'withdrawn') = (withdrawn_at is not null and withdrawn_by is not null))
);

-- Marketing clearance: one row per DECISION, newest wins; a withdrawal is a new row, so history is never rewritten.
create table public.portfolio_marketing_clearances (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,                                                    -- strict decision order (timestamps can tie inside one transaction)
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  project_file_id uuid not null references public.project_files (id),
  status text not null check (status in ('cleared', 'restricted', 'not_cleared', 'withdrawn')),
  evidence_source text not null check (evidence_source in ('client_release', 'signed_agreement', 'consent_form', 'ordift_owned_work', 'other_written')),
  evidence_reference text not null check (char_length(btrim(evidence_reference)) >= 10),   -- what the evidence is and where it is kept
  agreement_release_id uuid,                                                                  -- optional link to an existing agreement release (usage rights)
  authorized_uses text[] not null default '{}' check (authorized_uses <@ array['website_slideshow','public_portfolio','client_samples','brochure','rate_card','journal','social','paid_ads']),
  restrictions text,
  expires_on date,
  reviewed_by uuid not null references public.profiles (id),
  reviewed_at timestamptz not null default now(),
  supersedes_id uuid references public.portfolio_marketing_clearances (id),
  withdrawal_reason text,
  constraint clearance_cleared_needs_uses check (status not in ('cleared', 'restricted') or cardinality(authorized_uses) > 0),
  constraint clearance_withdrawal_reason check (status <> 'withdrawn' or char_length(btrim(coalesce(withdrawal_reason, ''))) >= 10)
);
create index portfolio_clearance_file on public.portfolio_marketing_clearances (project_file_id, seq desc);

-- The CURRENT clearance of a file = its latest decision.
create view public.portfolio_current_clearance with (security_invoker = true) as
  select distinct on (project_file_id) project_file_id, status, authorized_uses, restrictions, expires_on, evidence_source, evidence_reference, reviewed_by, reviewed_at, id as clearance_id
  from public.portfolio_marketing_clearances order by project_file_id, seq desc;

-- Where a candidate is being used. The database refuses a destination the current clearance does not authorise.
create table public.portfolio_destination_selections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  candidate_id uuid not null references public.portfolio_candidates (id),
  project_file_id uuid not null references public.project_files (id),
  destination text not null check (destination in ('website_slideshow','public_portfolio','client_samples','brochure','rate_card','journal','social','paid_ads')),
  collection_label text,
  display_order integer not null default 0,
  status text not null default 'selected' check (status in ('selected', 'removed')),
  selected_by uuid not null references public.profiles (id),
  selected_at timestamptz not null default now(),
  removed_by uuid references public.profiles (id), removed_at timestamptz,
  constraint selection_removal_shape check ((status = 'removed') = (removed_at is not null and removed_by is not null))
);
create unique index portfolio_one_live_selection on public.portfolio_destination_selections (candidate_id, destination, coalesce(collection_label, '')) where status = 'selected';

create function private.portfolio_selection_guard() returns trigger language plpgsql set search_path = '' as $$
declare c record;
begin
  if tg_op = 'UPDATE' then
    if (to_jsonb(old) - 'status' - 'removed_by' - 'removed_at') is distinct from (to_jsonb(new) - 'status' - 'removed_by' - 'removed_at') or old.status <> 'selected' then
      raise exception 'a destination selection can only be removed, not edited'; end if;
    return new;
  end if;
  if new.project_file_id <> (select project_file_id from public.portfolio_candidates where id = new.candidate_id) then raise exception 'selection does not match its candidate'; end if;
  select status, authorized_uses, expires_on into c from public.portfolio_current_clearance where project_file_id = new.project_file_id;
  if not found or c.status not in ('cleared', 'restricted') then raise exception 'this photograph is NOT cleared for marketing use'; end if;
  if not (new.destination = any (c.authorized_uses)) then raise exception 'this photograph is not cleared for %', new.destination; end if;
  if c.expires_on is not null and c.expires_on < current_date then raise exception 'the marketing clearance for this photograph has expired'; end if;
  return new;
end $$;
create trigger portfolio_selection_guard before insert or update on public.portfolio_destination_selections for each row execute function private.portfolio_selection_guard();

create function private.portfolio_append_only() returns trigger language plpgsql set search_path = '' as $$
begin raise exception '% rows are append-only', tg_table_name; end $$;
create trigger portfolio_clearance_append_only before update or delete on public.portfolio_marketing_clearances for each row execute function private.portfolio_append_only();
create trigger portfolio_selection_no_delete before delete on public.portfolio_destination_selections for each row execute function private.portfolio_append_only();
create trigger portfolio_candidate_no_delete before delete on public.portfolio_candidates for each row execute function private.portfolio_append_only();

alter table public.portfolio_candidates enable row level security; alter table public.portfolio_marketing_clearances enable row level security; alter table public.portfolio_destination_selections enable row level security;
create policy "portfolio_candidates: staff read" on public.portfolio_candidates for select to authenticated using ((select private.is_staff_or_admin()));
create policy "portfolio_clearances: staff read" on public.portfolio_marketing_clearances for select to authenticated using ((select private.is_staff_or_admin()));
create policy "portfolio_selections: staff read" on public.portfolio_destination_selections for select to authenticated using ((select private.is_staff_or_admin()));
grant select on public.portfolio_candidates, public.portfolio_marketing_clearances, public.portfolio_destination_selections, public.portfolio_current_clearance to authenticated;
grant select, insert, update on public.portfolio_candidates, public.portfolio_destination_selections to service_role;
grant select, insert on public.portfolio_marketing_clearances to service_role;
grant select on public.portfolio_current_clearance to service_role;
insert into auth.users (id,email) values ('00000000-0000-4000-8000-0000000000c9','p@rehearsal.test') on conflict do nothing;
insert into public.profiles (id, full_name, access_status) values ('00000000-0000-4000-8000-0000000000c9','Reviewer','active') on conflict do nothing;
set local session_replication_role = origin;
do $$
declare u uuid := '00000000-0000-4000-8000-0000000000c9'; f1 uuid := gen_random_uuid(); f2 uuid := gen_random_uuid(); cand1 uuid; cand2 uuid; cl1 uuid;
begin
  set local session_replication_role = replica;
  insert into public.project_files (id, engagement_id, file_kind, storage_bucket, storage_path, original_filename, mime_type, size_bytes, uploaded_by) values (f1, gen_random_uuid(), 'final_approved','project-media','synthetic/1.jpg','1.jpg','image/jpeg',10,u),(f2, gen_random_uuid(), 'final_approved','project-media','synthetic/2.jpg','2.jpg','image/jpeg',10,u);
  insert into public.portfolio_candidates (project_file_id, service, added_by) values (f1,'photography',u) returning id into cand1;
  insert into public.portfolio_candidates (project_file_id, service, added_by) values (f2,'photography',u) returning id into cand2;
  set local session_replication_role = origin;
  begin insert into public.portfolio_candidates (project_file_id, added_by) values (f1,u); raise exception 'REHEARSAL FAIL: duplicate candidate'; exception when unique_violation then raise notice 'ok: one candidate record per source photograph'; end;
  -- no clearance on record = cannot be selected for ANY destination
  begin insert into public.portfolio_destination_selections (candidate_id, project_file_id, destination, selected_by) values (cand1,f1,'public_portfolio',u); raise exception 'REHEARSAL FAIL: uncleared'; exception when raise_exception then if sqlerrm like 'REHEARSAL%' then raise; end if; raise notice 'ok: an image with no clearance cannot be selected for public use'; end;
  begin insert into public.portfolio_marketing_clearances (project_file_id, status, evidence_source, evidence_reference, authorized_uses, reviewed_by) values (f1,'cleared','client_release','Signed release dated 5 Oct, kept in the job file','{}',u); raise exception 'REHEARSAL FAIL: cleared without uses'; exception when check_violation then raise notice 'ok: a clearance must name at least one authorised use'; end;
  begin insert into public.portfolio_marketing_clearances (project_file_id, status, evidence_source, evidence_reference, authorized_uses, reviewed_by) values (f1,'cleared','client_release','Signed release dated 5 Oct, kept in the job file','{tv_ads}',u); raise exception 'REHEARSAL FAIL: unknown use'; exception when check_violation then raise notice 'ok: only known destinations can be authorised'; end;
  begin insert into public.portfolio_marketing_clearances (project_file_id, status, evidence_source, evidence_reference, authorized_uses, reviewed_by) values (f1,'cleared','client_release','short','{brochure}',u); raise exception 'REHEARSAL FAIL: no evidence'; exception when check_violation then raise notice 'ok: a clearance without a described evidence reference is refused'; end;
  insert into public.portfolio_marketing_clearances (project_file_id, status, evidence_source, evidence_reference, authorized_uses, reviewed_by) values (f1,'cleared','client_release','Signed release dated 5 Oct, kept in the job file','{brochure,client_samples}',u) returning id into cl1;
  insert into public.portfolio_destination_selections (candidate_id, project_file_id, destination, collection_label, selected_by) values (cand1,f1,'brochure','Weddings',u);
  raise notice 'ok: a cleared image can be selected for a destination it is cleared for';
  begin insert into public.portfolio_destination_selections (candidate_id, project_file_id, destination, selected_by) values (cand1,f1,'public_portfolio',u); raise exception 'REHEARSAL FAIL: wrong destination'; exception when raise_exception then if sqlerrm like 'REHEARSAL%' then raise; end if; raise notice 'ok: a destination the clearance does not authorise is refused'; end;
  begin insert into public.portfolio_destination_selections (candidate_id, project_file_id, destination, collection_label, selected_by) values (cand1,f1,'brochure','Weddings',u); raise exception 'REHEARSAL FAIL: duplicate selection'; exception when unique_violation then raise notice 'ok: no duplicate selection of the same image for the same collection'; end;
  begin insert into public.portfolio_destination_selections (candidate_id, project_file_id, destination, selected_by) values (cand2,f1,'brochure',u); raise exception 'REHEARSAL FAIL: mismatched'; exception when raise_exception then if sqlerrm like 'REHEARSAL%' then raise; end if; raise notice 'ok: a selection must match its candidate'; end;
  begin update public.portfolio_marketing_clearances set status='not_cleared' where id=cl1; raise exception 'REHEARSAL FAIL: edit'; exception when raise_exception then if sqlerrm like 'REHEARSAL%' then raise; end if; raise notice 'ok: clearance history cannot be edited'; end;
  -- withdrawal is a new row; afterwards NEW selections are refused, the earlier record stays visible
  insert into public.portfolio_marketing_clearances (project_file_id, status, evidence_source, evidence_reference, authorized_uses, reviewed_by, supersedes_id, withdrawal_reason) values (f1,'withdrawn','client_release','Client emailed withdrawing consent, kept in the job file','{}',u,cl1,'Client withdrew consent on 20 October');
  begin insert into public.portfolio_destination_selections (candidate_id, project_file_id, destination, collection_label, selected_by) values (cand1,f1,'brochure','Other',u); raise exception 'REHEARSAL FAIL: withdrawn'; exception when raise_exception then if sqlerrm like 'REHEARSAL%' then raise; end if; raise notice 'ok: after withdrawal no new selection is possible'; end;
  if (select count(*) from public.portfolio_marketing_clearances where project_file_id=f1) <> 2 then raise exception 'REHEARSAL FAIL: history'; end if;
  raise notice 'ok: withdrawal keeps the earlier clearance in history';
  -- expiry
  insert into public.portfolio_marketing_clearances (project_file_id, status, evidence_source, evidence_reference, authorized_uses, expires_on, reviewed_by) values (f2,'cleared','consent_form','Model release for one year, kept in the job file','{brochure}', current_date - 1, u);
  begin insert into public.portfolio_destination_selections (candidate_id, project_file_id, destination, selected_by) values (cand2,f2,'brochure',u); raise exception 'REHEARSAL FAIL: expired'; exception when raise_exception then if sqlerrm like 'REHEARSAL%' then raise; end if; raise notice 'ok: an expired clearance cannot be used for a new selection'; end;
end $$;
rollback;
