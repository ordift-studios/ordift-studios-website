-- PROPOSED - NOT APPLIED - NOT in supabase/migrations. Needs the Founder's separate written release confirmation.
-- NUMBER: 0169 (after 0168; ledger head verified read-only 2026-10-24: 0167). Part 1 of 3 for the portfolio library (0169 foundation, 0170 marketing permissions, 0171 internal approval + use control).
-- Dependencies, all present in Production: businesses, profiles, project_files, engagements, crew_support_slots, user_roles, roles, authority_grants,
-- private.is_staff_or_admin(), public.ordift_studios_business_id(). None of the new object names exist in Production (checked).
--
-- Purpose: an INTERNAL, private portfolio-candidate layer that POINTS at photographs already stored for jobs. No file is copied, uploaded or published;
-- delivery, Final Approved status, retention and client galleries are untouched. Additive only: no existing table or row changes.
begin;

-- ------------------------------------------------------------------ shared helpers (used by 0170 and 0171)
create function private.portfolio_append_only() returns trigger language plpgsql set search_path = '' as $$
begin raise exception '% rows are append-only', tg_table_name; end $$;

-- Final internal authority for portfolio decisions: a Super Admin, or a current (not revoked, in-date) company-wide executive_admin grant.
-- Mirrors src/lib/organization/authority.ts isSuperAdminId + isExecutiveAdmin so the database enforces what the application checks.
create function private.is_portfolio_authority(p_profile uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select p_profile is not null and (
    exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = p_profile and r.slug = 'super_admin')
    or exists (select 1 from public.authority_grants g where g.profile_id = p_profile and g.authority = 'executive_admin' and g.scope_department_id is null
               and g.revoked_at is null and g.effective_at <= now() and (g.expires_at is null or g.expires_at > now())));
$$;
revoke all on function private.is_portfolio_authority(uuid) from public, anon, authenticated;
grant execute on function private.is_portfolio_authority(uuid) to service_role;

-- A photograph belongs to exactly one JOB. Crew Support work is grouped by its request (several slots/photographers share one client); anything else by its engagement.
create function private.project_file_job(p_file uuid) returns table (job_type text, job_id uuid, engagement_id uuid) language sql stable security definer set search_path = '' as $$
  select case when s.id is not null then 'crew_support_request' else 'engagement' end,
         case when s.id is not null then s.request_id else e.id end,
         e.id
  from public.project_files f
  join public.engagements e on e.id = f.engagement_id
  left join public.crew_support_slots s on e.entity_type = 'crew_support_slot' and e.entity_id = s.id::text
  where f.id = p_file;
$$;
revoke all on function private.project_file_job(uuid) from public, anon, authenticated;
grant execute on function private.project_file_job(uuid) to service_role;

-- The reference an agreement uses for its primary context: the request's reference number, or the engagement id.
create function private.job_reference(p_job_type text, p_job_id uuid) returns text language sql stable security definer set search_path = '' as $$
  select case when p_job_type = 'crew_support_request' then (select reference_number from public.crew_support_requests where id = p_job_id)
              when p_job_type = 'engagement' then p_job_id::text end;
$$;
revoke all on function private.job_reference(text, uuid) from public, anon, authenticated;
grant execute on function private.job_reference(text, uuid) to service_role;

-- ------------------------------------------------------------------ candidates: one record per SOURCE file
create table public.portfolio_candidates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  project_file_id uuid not null unique references public.project_files (id),
  proposed_via text not null default 'picker' check (proposed_via in ('picker', 'final_approval', 'job_page')),
  service text, event_type text, style text, location text, jurisdiction text,
  caption text,
  status text not null default 'candidate' check (status in ('candidate', 'shortlisted', 'withdrawn')),
  added_by uuid not null references public.profiles (id),
  added_at timestamptz not null default now(),
  withdrawn_by uuid references public.profiles (id), withdrawn_at timestamptz, withdrawn_reason text,
  constraint candidate_withdrawal_shape check ((status = 'withdrawn') = (withdrawn_at is not null and withdrawn_by is not null))
);
comment on table public.portfolio_candidates is 'Staff may PROPOSE a photograph as a portfolio candidate. A candidate is private, is never published, and says nothing about permission or approval (see 0170 / 0171).';

-- ------------------------------------------------------------------ internal collections (several jobs -> one collection, no duplicated files)
create table public.portfolio_collections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  service_category text,                       -- e.g. the CMS category it will belong to; free text so it follows the CMS vocabulary
  cms_collection_ref text,                     -- optional pointer to an EXISTING CMS portfolio collection; nothing is written to the CMS by this table
  description text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create unique index portfolio_collection_name_live on public.portfolio_collections (lower(btrim(name))) where status = 'active';

create table public.portfolio_collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.portfolio_collections (id),
  candidate_id uuid not null references public.portfolio_candidates (id),
  display_order integer not null default 0,
  added_by uuid not null references public.profiles (id),
  added_at timestamptz not null default now(),
  removed_by uuid references public.profiles (id),
  removed_at timestamptz,
  constraint collection_item_removal_shape check ((removed_at is null) = (removed_by is null))
);
create unique index portfolio_collection_item_live on public.portfolio_collection_items (collection_id, candidate_id) where removed_at is null;

-- Items and candidates are never deleted; collections can only be archived; an item can only be removed (stamped), not edited.
create function private.portfolio_collection_item_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'collection items are never deleted'; end if;
  if (to_jsonb(old) - 'removed_by' - 'removed_at') is distinct from (to_jsonb(new) - 'removed_by' - 'removed_at') or old.removed_at is not null then
    raise exception 'a collection item can only be removed, not edited'; end if;
  return new;
end $$;
create trigger portfolio_collection_item_guard before update or delete on public.portfolio_collection_items for each row execute function private.portfolio_collection_item_guard();
create trigger portfolio_candidate_no_delete before delete on public.portfolio_candidates for each row execute function private.portfolio_append_only();
create trigger portfolio_collection_no_delete before delete on public.portfolio_collections for each row execute function private.portfolio_append_only();

alter table public.portfolio_candidates enable row level security;
alter table public.portfolio_collections enable row level security;
alter table public.portfolio_collection_items enable row level security;
create policy "portfolio_candidates: staff read" on public.portfolio_candidates for select to authenticated using ((select private.is_staff_or_admin()));
create policy "portfolio_collections: staff read" on public.portfolio_collections for select to authenticated using ((select private.is_staff_or_admin()));
create policy "portfolio_collection_items: staff read" on public.portfolio_collection_items for select to authenticated using ((select private.is_staff_or_admin()));
grant select on public.portfolio_candidates, public.portfolio_collections, public.portfolio_collection_items to authenticated;
grant select, insert, update on public.portfolio_candidates, public.portfolio_collections, public.portfolio_collection_items to service_role;
commit;
-- ROLLBACK (only while no genuine rows exist; after real use it needs a separate decision): drop table portfolio_collection_items, portfolio_collections, portfolio_candidates;
-- drop function private.portfolio_collection_item_guard(), private.job_reference(text, uuid), private.project_file_job(uuid), private.is_portfolio_authority(uuid), private.portfolio_append_only()
-- (drop the last only after 0170/0171 are rolled back: they use it). No existing object is touched.
