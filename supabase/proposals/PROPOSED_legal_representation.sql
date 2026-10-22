-- PROPOSED - NOT APPLIED - NOT in supabase/migrations. Separate Founder authorization, local rehearsal and a Production plan are required first.
-- Dependencies: businesses, profiles, employment_jurisdictions, legal_document_versions, private.is_admin_or_super_admin() (all exist in Production).
-- Purpose: legal firms, their individual representatives, jurisdiction-scoped appointments (with optional express interim arrangements) and
-- append-only review decisions that keep firm, reviewer, jurisdiction, document version, decision, date and evidence. Nothing here changes
-- legal_document_versions, agreements or entity signatories.
begin;

create table public.legal_firms (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  name text not null check (char_length(btrim(name)) >= 3),
  notes text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create table public.legal_representatives (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.legal_firms (id),
  full_name text not null check (char_length(btrim(full_name)) >= 3),
  profile_id uuid references public.profiles (id),              -- only if the person has an Ordift account; access is granted separately and expressly
  permitted_jurisdiction_ids uuid[] not null default '{}',       -- the jurisdictions this individual may see/act in (empty = none)
  status text not null default 'active' check (status in ('active', 'ended')),
  effective_from date not null, effective_to date,
  evidence_reference text not null check (char_length(btrim(evidence_reference)) >= 10),
  created_by uuid not null references public.profiles (id), created_at timestamptz not null default now()
);
create table public.legal_firm_appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  firm_id uuid not null references public.legal_firms (id),
  jurisdiction_id uuid not null references public.employment_jurisdictions (id),
  document_categories text[] not null default '{*}',
  interim_for_jurisdiction_id uuid references public.employment_jurisdictions (id),
  interim_authorisation_reference text,
  status text not null default 'active' check (status in ('active', 'ended')),
  effective_from date not null, effective_to date,
  evidence_reference text not null check (char_length(btrim(evidence_reference)) >= 10),
  appointed_by uuid not null references public.profiles (id), created_at timestamptz not null default now(),
  ended_by uuid references public.profiles (id), ended_reason text,
  constraint appointments_interim_needs_authorisation check (interim_for_jurisdiction_id is null or char_length(btrim(coalesce(interim_authorisation_reference, ''))) >= 10),
  constraint appointments_end_shape check ((status = 'active' and effective_to is null) or (status = 'ended' and effective_to is not null and char_length(btrim(coalesce(ended_reason, ''))) >= 10))
);
create table public.legal_review_decisions (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.legal_document_versions (id),
  firm_id uuid not null references public.legal_firms (id),
  representative_id uuid not null references public.legal_representatives (id),
  document_jurisdiction_id uuid not null references public.employment_jurisdictions (id),   -- the jurisdiction the document is FOR
  advice_basis_jurisdiction_id uuid not null references public.employment_jurisdictions (id), -- the jurisdiction the firm is appointed FOR
  provisional boolean not null,
  decision text not null check (decision in ('approved', 'changes_required', 'declined')),
  reviewed_on date not null check (reviewed_on <= current_date),
  evidence_reference text not null check (char_length(btrim(evidence_reference)) >= 10),
  recorded_by uuid not null references public.profiles (id), recorded_at timestamptz not null default now(),
  constraint decisions_provisional_consistent check (provisional = (document_jurisdiction_id <> advice_basis_jurisdiction_id))
);
create unique index legal_one_active_appointment_per_firm on public.legal_firm_appointments (jurisdiction_id, firm_id) where status = 'active';
create index legal_appointments_lookup on public.legal_firm_appointments (jurisdiction_id, status);
create index legal_decisions_version on public.legal_review_decisions (version_id, reviewed_on desc);
create index legal_representatives_firm on public.legal_representatives (firm_id);

create function private.legal_rep_immutable() returns trigger language plpgsql as $$
begin raise exception '% rows are append-only', tg_table_name; end $$;
-- an appointment or representative can only be ENDED: identity, jurisdiction, scope, dates of appointment and evidence never change
create function private.legal_rep_end_only() returns trigger language plpgsql as $$
begin
  if (to_jsonb(old) - 'status' - 'effective_to' - 'ended_by' - 'ended_reason') is distinct from (to_jsonb(new) - 'status' - 'effective_to' - 'ended_by' - 'ended_reason') then
    raise exception '% rows can only be ended, not edited', tg_table_name; end if;
  if old.status = 'ended' then raise exception 'an ended % is final', tg_table_name; end if;
  return new;
end $$;
create trigger legal_appointments_end_only before update on public.legal_firm_appointments for each row execute function private.legal_rep_end_only();
create trigger legal_representatives_end_only before update on public.legal_representatives for each row execute function private.legal_rep_end_only();
create trigger legal_review_decisions_no_change before update or delete on public.legal_review_decisions for each row execute function private.legal_rep_immutable();
create trigger legal_appointments_no_delete before delete on public.legal_firm_appointments for each row execute function private.legal_rep_immutable();

alter table public.legal_firms enable row level security; alter table public.legal_representatives enable row level security;
alter table public.legal_firm_appointments enable row level security; alter table public.legal_review_decisions enable row level security;
create policy "legal_firms: admin read" on public.legal_firms for select to authenticated using ((select private.is_admin_or_super_admin()));
create policy "legal_representatives: admin read" on public.legal_representatives for select to authenticated using ((select private.is_admin_or_super_admin()));
create policy "legal_firm_appointments: admin read" on public.legal_firm_appointments for select to authenticated using ((select private.is_admin_or_super_admin()));
create policy "legal_review_decisions: admin read" on public.legal_review_decisions for select to authenticated using ((select private.is_admin_or_super_admin()));
grant select on public.legal_firms, public.legal_representatives, public.legal_firm_appointments, public.legal_review_decisions to authenticated;
grant select, insert, update on public.legal_firms, public.legal_representatives, public.legal_firm_appointments to service_role;
grant select, insert on public.legal_review_decisions to service_role;
commit;
-- NUMBERING: ledger head is 0167. The vendor-documents RLS proposals are held back as 0168/0169, so this becomes 0170 if they are applied first, otherwise 0168.
-- ROLLBACK (only while no genuine rows exist): drop the four tables and private.legal_rep_immutable(), private.legal_rep_end_only().
