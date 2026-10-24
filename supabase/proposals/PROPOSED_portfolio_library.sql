-- PROPOSED - NOT APPLIED - NOT in supabase/migrations. Separate Founder authorization required. Independent of the enquiry-pricing proposal.
-- NUMBERING: after the ledger head (0167) and whichever held proposals are applied first (Vendor RLS 0168/0169, legal representation 0170, enquiry pricing).
-- Dependencies, all present in Production: businesses, profiles, project_files, engagements, private.is_staff_or_admin(), public.ordift_studios_business_id().
--
-- Purpose (Priority 4): an INTERNAL portfolio-candidate library that points at photographs already stored for jobs (no copies, no re-upload), per-image
-- marketing clearance (append-only, with evidence, authorised uses, restrictions, expiry, withdrawal), and destination selections that the DATABASE refuses
-- unless the image is currently cleared for that destination. Delivery, Final Approved status, retention and client galleries are never touched.
-- Additive only: no existing table or row changes; nothing is published by this migration; every existing image simply has no clearance (= not cleared).
begin;

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
commit;
-- ROLLBACK (only while no genuine rows exist): drop table portfolio_destination_selections, portfolio_marketing_clearances (and view portfolio_current_clearance first),
-- portfolio_candidates; drop functions private.portfolio_selection_guard, private.portfolio_append_only. No existing object is touched.
