-- PROPOSED - NOT APPLIED - NOT in supabase/migrations. Needs the Founder's separate written release confirmation.
-- NUMBER: 0171 (after 0170, which it requires). Part 3 of 3: STAGE 2 - internal creative/quality approval, and the control that re-checks BOTH stages at the moment of use.
-- Dependencies: 0169 (portfolio_candidates, private.is_portfolio_authority, private.portfolio_append_only), 0170 (public.marketing_permission_state).
--
-- Client permission alone never makes a photograph usable. A photograph may be PUBLISHED or SHARED for a destination only when
--   (1) a verified, in-force rights-holder permission covers that destination (0170), AND
--   (2) its latest internal review is an approval by the Founder / an authorised executive admin that names that destination.
-- Both are re-evaluated by the database at the actual action (portfolio_use_events insert). Withdrawal, expiry, rejection or revocation therefore blocks every FUTURE use,
-- and anything already in use is surfaced for review by the view below; nothing is ever unpublished automatically.
begin;

create table public.portfolio_internal_reviews (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  project_file_id uuid not null references public.project_files (id),
  candidate_id uuid not null references public.portfolio_candidates (id),
  decision text not null check (decision in ('approved', 'rejected', 'returned', 'revoked')),
  destinations text[] not null default '{}' check (destinations <@ array['portfolio','website','social_media','client_samples','journal','brochure','print_collateral','paid_advertising']),
  -- the four checks OS-HR-GH-005 3.3 already requires before portfolio use, plus the creative/quality judgement
  checks jsonb not null default '{}'::jsonb,
  notes text,
  reviewed_by uuid not null references public.profiles (id),
  reviewed_at timestamptz not null default now(),
  constraint review_approval_shape check (decision <> 'approved' or (cardinality(destinations) > 0 and
    checks @> '{"confidentiality":true,"embargo":true,"contractual_restrictions":true,"release_rights":true,"quality":true}'::jsonb)),
  constraint review_reason_shape check (decision = 'approved' or char_length(btrim(coalesce(notes, ''))) >= 3)
);
create index portfolio_review_file on public.portfolio_internal_reviews (project_file_id, seq desc);

create function private.portfolio_review_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_portfolio_authority(new.reviewed_by) then raise exception 'only the Founder or an authorised executive admin may decide internal portfolio approval'; end if;
  if new.project_file_id <> (select project_file_id from public.portfolio_candidates where id = new.candidate_id) then raise exception 'review does not match its candidate'; end if;
  if (select status from public.portfolio_candidates where id = new.candidate_id) = 'withdrawn' then raise exception 'this candidate has been withdrawn'; end if;
  return new;
end $$;
create trigger portfolio_review_guard before insert on public.portfolio_internal_reviews for each row execute function private.portfolio_review_guard();
create trigger portfolio_review_append_only before update or delete on public.portfolio_internal_reviews for each row execute function private.portfolio_append_only();

-- Where a photograph is actually used. The database refuses a use that does not pass BOTH stages right now; ending a use is always allowed.
create table public.portfolio_use_events (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  project_file_id uuid not null references public.project_files (id),
  destination text not null check (destination in ('portfolio','website','social_media','client_samples','journal','brochure','print_collateral','paid_advertising')),
  action text not null check (action in ('published', 'shared', 'ended')),
  reference text,                                     -- where: a CMS entry, a share name, a brochure title
  actor_id uuid not null references public.profiles (id),
  occurred_at timestamptz not null default now()
);
create index portfolio_use_file on public.portfolio_use_events (project_file_id, destination, seq desc);

-- Both stages, evaluated now. Server-only (service role).
create function public.portfolio_use_eligibility(p_file uuid, p_destination text, p_on date default current_date)
returns table (eligible boolean, rights_ok boolean, rights_reason text, internal_ok boolean, internal_reason text)
language plpgsql stable security definer set search_path = '' as $$
declare m record; rv record; ro boolean; rr text; io boolean := false; ir text;
begin
  select s.effective, s.reason into m from public.marketing_permission_state(p_file, p_destination, p_on) s;
  ro := coalesce(m.effective, false); rr := coalesce(m.reason, 'no_permission_on_record');
  select r.decision, r.destinations into rv from public.portfolio_internal_reviews r where r.project_file_id = p_file order by r.seq desc limit 1;
  if not found then ir := 'no_internal_review';
  elsif rv.decision = 'approved' then
    if p_destination = any (rv.destinations) then io := true; ir := 'approved'; else ir := 'destination_not_approved'; end if;
  elsif rv.decision = 'returned' then ir := 'returned_for_further_review';
  else ir := rv.decision; end if;
  return query select (ro and io), ro, rr, io, ir;
end $$;

-- The standing of many photographs for every destination in ONE call (for a job page). Capped so it cannot be used to scan the library.
create function public.portfolio_standing(p_files uuid[])
returns table (project_file_id uuid, destination text, eligible boolean, rights_reason text, internal_reason text)
language sql stable security definer set search_path = '' as $$
  select f, d.k, e.eligible, e.rights_reason, e.internal_reason
  from unnest(p_files[1:200]) f
  cross join (values ('portfolio'), ('website'), ('social_media'), ('client_samples'), ('journal'), ('brochure'), ('print_collateral'), ('paid_advertising')) d(k)
  cross join lateral public.portfolio_use_eligibility(f, d.k) e;
$$;

create function private.portfolio_use_guard() returns trigger language plpgsql security definer set search_path = '' as $$
declare e record;
begin
  if new.action in ('published', 'shared') then
    select * into e from public.portfolio_use_eligibility(new.project_file_id, new.destination);
    if not e.eligible then
      raise exception 'not eligible for %: permission = %, internal approval = %', new.destination, e.rights_reason, e.internal_reason; end if;
  end if;
  return new;
end $$;
create trigger portfolio_use_guard before insert on public.portfolio_use_events for each row execute function private.portfolio_use_guard();
create trigger portfolio_use_append_only before update or delete on public.portfolio_use_events for each row execute function private.portfolio_append_only();

-- Anything currently in use that no longer passes both stages: for human review, never an automatic takedown.
create view public.portfolio_uses_needing_review with (security_invoker = true) as
  select u.project_file_id, u.destination, u.reference, u.action, u.occurred_at as in_use_since, e.rights_reason, e.internal_reason
  from (select distinct on (project_file_id, destination) * from public.portfolio_use_events order by project_file_id, destination, seq desc) u
  cross join lateral public.portfolio_use_eligibility(u.project_file_id, u.destination) e
  where u.action in ('published', 'shared') and not e.eligible;

alter table public.portfolio_internal_reviews enable row level security;
alter table public.portfolio_use_events enable row level security;
create policy "portfolio_reviews: staff read" on public.portfolio_internal_reviews for select to authenticated using ((select private.is_staff_or_admin()));
create policy "portfolio_use: staff read" on public.portfolio_use_events for select to authenticated using ((select private.is_staff_or_admin()));
grant select on public.portfolio_internal_reviews, public.portfolio_use_events to authenticated;
grant select, insert on public.portfolio_internal_reviews, public.portfolio_use_events to service_role;
revoke all on function public.portfolio_use_eligibility(uuid, text, date) from public, anon, authenticated;
grant execute on function public.portfolio_use_eligibility(uuid, text, date) to service_role;
revoke all on function public.portfolio_standing(uuid[]) from public, anon, authenticated;
grant execute on function public.portfolio_standing(uuid[]) to service_role;
grant select on public.portfolio_uses_needing_review to service_role;
commit;
-- ROLLBACK (only while no genuine rows exist): drop view portfolio_uses_needing_review; drop function public.portfolio_standing(uuid[]); drop function public.portfolio_use_eligibility(uuid, text, date); drop table portfolio_use_events, portfolio_internal_reviews;
-- drop functions private.portfolio_review_guard(), private.portfolio_use_guard(). Then 0170, then 0169.
