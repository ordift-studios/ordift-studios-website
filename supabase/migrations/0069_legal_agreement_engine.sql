-- Ordift Studios Legal Suite — LEGAL-SYS-1, Phase E (2026-09-08).
-- Agreement Engine foundation — additive schema only. Nothing in this
-- migration creates, issues, sends, or executes a real agreement; it
-- establishes the minimum robust transactional architecture the master
-- prompt's Part 11 asked for, ready for a later, separately-tested
-- wiring pass (Admin UI / Client Portal / real generation flow).
--
-- Deliberately does NOT create signature_requests/agreement_signatures/
-- signature_evidence (Phase F) — those are a distinct, separately-
-- scoped follow-on phase per the master prompt's own phase split.

begin;

-- ============================================================
-- Collision-safe agreement reference sequence (Part 13)
-- ============================================================
-- A genuine Postgres sequence — atomic by construction, no row-locking
-- table needed, no possibility of two concurrent issuances racing to
-- the same number. The year portion of ORD-AGR-YYYY-###### is supplied
-- by the application at format time (agreementReference.ts); this
-- sequence is a single, lifetime-monotonic counter, never reset per
-- year (simpler and equally collision-safe — a monotonic global
-- sequence trivially guarantees uniqueness even across a year
-- boundary, which a per-year-reset counter would need extra locking to
-- guarantee).
create sequence public.legal_agreement_reference_seq;

-- Thin RPC wrapper — the sequence name is a hardcoded literal inside
-- this function body, never a parameter/identifier built from caller
-- input, so this is safe to expose without any injection risk. Called
-- from generateNextAgreementReference() (agreementEngine.ts) via
-- supabase-js's .rpc(), since PostgREST has no first-class "call
-- nextval on an arbitrary sequence" endpoint.
create or replace function public.next_legal_agreement_reference_seq()
returns bigint
language sql
security definer
set search_path = ''
as $$
  select nextval('public.legal_agreement_reference_seq');
$$;

revoke all on function public.next_legal_agreement_reference_seq() from public;
revoke all on function public.next_legal_agreement_reference_seq() from anon;
grant execute on function public.next_legal_agreement_reference_seq() to service_role;

-- ============================================================
-- agreements
-- ============================================================
-- master_id/master_version_id are the FROZEN binding (Part 14: MASTER
-- != ISSUED AGREEMENT) — set once at issuance and never repointed to a
-- later master revision. classification is denormalized from the
-- master at issuance time for the same reason (a later master
-- reclassification must not retroactively change what an already-
-- issued agreement is treated as). primary_context_type/reference is a
-- polymorphic pointer to whatever real business object this agreement
-- relates to (an enquiry, a project, a partnership_opportunity, an
-- engagement, etc.) — reused, never duplicated, matching the
-- established polymorphic pattern already proven for
-- payment_obligations.source_type/source_reference.
create table public.agreements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  agreement_reference text not null,
  master_id uuid not null references public.legal_document_masters (id),
  master_version_id uuid not null references public.legal_document_versions (id),
  classification text not null,
  status text not null default 'draft',
  jurisdiction text,
  jurisdiction_review_required boolean not null default false,
  primary_context_type text,
  primary_context_reference text,
  issued_at timestamptz,
  sent_at timestamptz,
  viewed_at timestamptz,
  executed_at timestamptz,
  active_at timestamptz,
  completed_at timestamptz,
  declined_at timestamptz,
  cancelled_at timestamptz,
  expired_at timestamptz,
  terminated_at timestamptz,
  superseded_by_agreement_id uuid references public.agreements (id),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  unique (business_id, agreement_reference)
);

comment on table public.agreements is
  'Legal Suite Agreement Engine (LEGAL-SYS-1, Phase E). status: see AGREEMENT_LIFECYCLE_STATUSES in src/lib/legal/agreementLifecycle.ts — draft/internal_review/approved_for_issue/sent/viewed/changes_requested/accepted_for_signature/partially_signed/fully_executed/active/completed, plus exceptional declined/cancelled/expired/superseded/terminated. master_id/master_version_id are frozen at issuance — never repointed by a later master revision (Part 14). No row here is ever hard-deleted (Part 31) — cancel/expire/terminate/supersede states exist instead.';
comment on column public.agreements.jurisdiction_review_required is
  'Set by routeJurisdiction() (src/lib/legal/jurisdictionRouting.ts) whenever the engagement jurisdiction is unsupported, missing, or explicitly flagged complex/conflicting — never silently defaulted to a jurisdiction.';

create index agreements_status_idx on public.agreements (status);
create index agreements_master_id_idx on public.agreements (master_id);
create index agreements_primary_context_idx on public.agreements (primary_context_type, primary_context_reference);

alter table public.agreements enable row level security;

-- Admin-tier read for now — party-scoped read (a client/contractor
-- seeing only their OWN agreements) is added once agreement_parties
-- exists and a real party can be resolved against auth.uid(), in the
-- same migration below.
create policy "agreements: admin read" on public.agreements
  for select
  to authenticated
  using ((select private.is_admin_or_super_admin()));

grant select on public.agreements to authenticated;
grant select, insert, update, delete on public.agreements to service_role;

create trigger agreements_set_updated_at
  before update on public.agreements
  for each row execute function public.set_updated_at();

-- ============================================================
-- agreement_parties
-- ============================================================
-- party_role: client | ordift | guardian | talent | property_owner |
-- contractor | partner | authorized_representative (unconstrained
-- text, application-validated — same precedent as every other status/
-- role column in this codebase). Either profile_id (a real Ordift
-- system identity) or external_name/external_email (a counterparty
-- with no account — Part 17: "clients/counterparties should not
-- require an Admin account") — never both required, since most
-- external signatories will have neither an Admin nor even a portal
-- account yet.
create table public.agreement_parties (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  agreement_id uuid not null references public.agreements (id) on delete cascade,
  party_role text not null,
  profile_id uuid references public.profiles (id),
  external_name text,
  external_email text,
  created_at timestamptz not null default now()
);

comment on table public.agreement_parties is
  'One row per signatory/party to an agreement. Either profile_id (a real Ordift account) or external_name/external_email (a counterparty with no account) — a party never needs an Admin account to be recorded here (Part 17).';

create index agreement_parties_agreement_id_idx on public.agreement_parties (agreement_id);
create index agreement_parties_profile_id_idx on public.agreement_parties (profile_id);

alter table public.agreement_parties enable row level security;

-- A party may read their OWN row (and, via the policy on agreements
-- below, their own agreement) — the actual cross-user isolation
-- boundary this phase establishes even though no real agreement exists
-- yet to exercise it.
create policy "agreement_parties: admin or own read" on public.agreement_parties
  for select
  to authenticated
  using ((select private.is_admin_or_super_admin()) or profile_id = (select auth.uid()));

grant select on public.agreement_parties to authenticated;
grant select, insert, update, delete on public.agreement_parties to service_role;

-- Extends the agreements read policy: a party (by profile_id) may read
-- their OWN agreement, in addition to Admin/Super Admin. This is the
-- real "a client must never enumerate other clients' agreements"
-- boundary (Part 37) — scoped to exactly the rows they are a party to,
-- never a broader "all agreements of this classification" grant.
create policy "agreements: own party read" on public.agreements
  for select
  to authenticated
  using (
    exists (
      select 1 from public.agreement_parties ap
      where ap.agreement_id = agreements.id and ap.profile_id = (select auth.uid())
    )
  );

-- ============================================================
-- agreement_snapshots — immutable commercial/legal facts (Part 12)
-- ============================================================
-- Append-only — a real snapshot row is never UPDATEd once created.
-- Reuses Pricing/Quote/Booking as the source of truth (Part 12: "do
-- not duplicate pricing") — snapshot_data is a frozen COPY of whatever
-- real quote/booking facts applied at issuance, not a second live
-- pricing engine; source_reference points back to the real quote/
-- booking record this was copied from.
create table public.agreement_snapshots (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  agreement_id uuid not null references public.agreements (id) on delete cascade,
  snapshot_data jsonb not null,
  source_reference text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

comment on table public.agreement_snapshots is
  'Immutable, frozen commercial/legal facts captured at agreement issuance — accepted quote, service, package, market, duration, subjects, add-ons, discounts, currency, total, booking fee/payment requirement, relevant partnership/referral relationship, etc. Reuses Pricing/Quote/Booking as the source of truth (source_reference) — never a second, independently-computed pricing engine.';

create index agreement_snapshots_agreement_id_idx on public.agreement_snapshots (agreement_id);

alter table public.agreement_snapshots enable row level security;

create policy "agreement_snapshots: admin or party read" on public.agreement_snapshots
  for select
  to authenticated
  using (
    (select private.is_admin_or_super_admin())
    or exists (select 1 from public.agreement_parties ap where ap.agreement_id = agreement_snapshots.agreement_id and ap.profile_id = (select auth.uid()))
  );

grant select on public.agreement_snapshots to authenticated;
grant select, insert, update, delete on public.agreement_snapshots to service_role;

-- ============================================================
-- agreement_schedules
-- ============================================================
-- schedule_code: A/B/C/D... matching each master's own schedule
-- structure (e.g. OS-LGL-001's Schedule A Booking Summary, Schedule B
-- Image Use Consent, Schedule C Minor/Guardian Consent, Schedule D
-- jurisdiction routing) — data jsonb holds the actual filled-in
-- schedule facts, never legal prose.
create table public.agreement_schedules (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  agreement_id uuid not null references public.agreements (id) on delete cascade,
  schedule_code text not null,
  title text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  unique (agreement_id, schedule_code)
);

alter table public.agreement_schedules enable row level security;

create policy "agreement_schedules: admin or party read" on public.agreement_schedules
  for select
  to authenticated
  using (
    (select private.is_admin_or_super_admin())
    or exists (select 1 from public.agreement_parties ap where ap.agreement_id = agreement_schedules.agreement_id and ap.profile_id = (select auth.uid()))
  );

grant select on public.agreement_schedules to authenticated;
grant select, insert, update, delete on public.agreement_schedules to service_role;

-- ============================================================
-- agreement_amendments — append-only, Part 24
-- ============================================================
-- Original Agreement -> Amendment 01 -> Amendment 02, never a silent
-- edit of the original executed contract. amendment_number is
-- sequential per agreement (enforced at the application layer, same
-- "verified by code reading" precedent as this codebase's other
-- sequential-numbering domains).
create table public.agreement_amendments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  agreement_id uuid not null references public.agreements (id),
  amendment_number int not null check (amendment_number > 0),
  reason text not null,
  changes jsonb not null default '{}',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  unique (agreement_id, amendment_number)
);

comment on table public.agreement_amendments is
  'Append-only material post-issue changes (Part 24). Never edits agreements or agreement_snapshots directly — a new amendment row records what changed and why, preserving the original issued facts untouched.';

alter table public.agreement_amendments enable row level security;

create policy "agreement_amendments: admin or party read" on public.agreement_amendments
  for select
  to authenticated
  using (
    (select private.is_admin_or_super_admin())
    or exists (select 1 from public.agreement_parties ap where ap.agreement_id = agreement_amendments.agreement_id and ap.profile_id = (select auth.uid()))
  );

grant select on public.agreement_amendments to authenticated;
grant select, insert, update, delete on public.agreement_amendments to service_role;

commit;
