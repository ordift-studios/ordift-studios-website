-- Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 10 (2026-09-14) —
-- INTELLECTUAL PROPERTY, FILES AND PORTFOLIO USE (Ghana), OS-HR-GH-005
-- section 3.
--
-- INSPECTION SUMMARY: 3.1 (work product/pre-existing IP ownership) is a
-- declarative legal principle already governed by the employment
-- agreement (OS-LGL-007) and general IP law — it names no workflow to
-- build and no new table is created for it here, avoiding speculative
-- schema for a principle rather than a process. 3.2 (company file
-- handover on separation, deletion of unauthorized copies without
-- requiring deletion of unrelated personal files) is already covered
-- by offboarding_handover_items (migration 0092, category='file' /
-- 'credential') — reusing existing infrastructure rather than
-- duplicating it.
--
-- 3.3 (portfolio/BTS use) is the one genuinely new workflow: "Employees
-- do not gain automatic publication rights merely because they
-- captured/edited/created material." The real client/model release
-- infrastructure already exists (agreement_releases.usage_rights.portfolio,
-- migration 0071) — this migration adds only the employee-initiated
-- request/controlled-approval layer on top of it, referencing that
-- existing table rather than duplicating release-rights data.

begin;

create table public.portfolio_use_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  requested_by uuid not null references public.profiles (id),
  description text not null,
  related_agreement_id uuid references public.agreements (id),
  related_release_id uuid references public.agreement_releases (id),
  status text not null default 'requested',
  confidentiality_checked boolean not null default false,
  embargo_checked boolean not null default false,
  contractual_restrictions_checked boolean not null default false,
  release_rights_checked boolean not null default false,
  approved_assets text,
  approved_platforms jsonb,
  approved_timing text,
  approved_conditions text,
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decision_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.portfolio_use_requests is
  'OS-HR-GH-005 3.3: "Portfolio or BTS use requires controlled approval after client/model releases, confidentiality, embargoes and contractual restrictions are checked. Approval can specify assets, platforms, timing and conditions." The four *_checked booleans are the real, explicit gate — approvePortfolioUseRequest() (src/lib/organization/portfolioUse.ts) requires all four to be true, as explicit caller-supplied confirmations at approval time, never defaulted, before status can become approved. related_release_id references the existing agreement_releases table (migration 0071) rather than duplicating usage-rights data — release_rights_checked records that the approver actually consulted that release''s usage_rights.portfolio value (or determined no such release applies), never an automatic join-based approval. status: requested | approved | declined.';

create index portfolio_use_requests_profile_idx on public.portfolio_use_requests (profile_id);

alter table public.portfolio_use_requests enable row level security;

create policy "portfolio_use_requests: read own or admin" on public.portfolio_use_requests
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.portfolio_use_requests to authenticated;
grant select, insert, update on public.portfolio_use_requests to service_role;

create trigger portfolio_use_requests_set_updated_at
  before update on public.portfolio_use_requests
  for each row execute function public.set_updated_at();

commit;
