-- Ordift Studios Legal Suite — LEGAL-SYS-1, Phase F (2026-09-08).
-- Provider-neutral Signature Engine foundation — additive schema only.
-- No real agreement has been sent and no real signature request exists
-- after this migration; it establishes the transactional architecture
-- for later, separately-tested wiring (Admin UI / Client Portal /
-- real dispatch). No paid e-signature provider is used or assumed.
--
-- Traceability chain this schema exists to support (master prompt,
-- continuation authorization message):
--   MASTER -> VERSION -> AGREEMENT -> SNAPSHOT/SCHEDULE -> ISSUED
--   ARTIFACT -> SHA-256 -> SIGNATURE EVENTS -> EXECUTED ARTIFACT/
--   EVIDENCE
-- agreements.issued_document_sha256 (added below) is the "ISSUED
-- ARTIFACT -> SHA-256" link; signature_evidence.document_sha256 copies
-- that same hash at the moment of signing, binding what was actually
-- signed to what was actually issued — never a fresh, independently
-- computed hash at signature time.

begin;

-- ============================================================
-- agreements: issued-artifact hash binding
-- ============================================================
alter table public.agreements
  add column issued_document_sha256 text,
  add column issued_document_recorded_at timestamptz,
  add column issued_document_recorded_by uuid references public.profiles (id);

comment on column public.agreements.issued_document_sha256 is
  'SHA-256 of the exact issued artifact (the document actually sent for signature) — set once via recordIssuedDocumentHash() (agreementEngine.ts), never recomputed afterward. A signature request cannot be created (createSignatureRequest(), Phase F) until this is present, so a signature process can never attach to an agreement with no defined issued artifact.';

-- ============================================================
-- signature_requests
-- ============================================================
-- One request per agreement (an agreement is re-issued as a NEW
-- request, never by mutating a prior one, if signing must restart —
-- Part 31: nothing is ever hard-deleted or silently rewritten).
create table public.signature_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  agreement_id uuid not null references public.agreements (id),
  status text not null default 'created',
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  completed_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id),
  revoked_reason text,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.signature_requests is
  'Signature Engine foundation (LEGAL-SYS-1, Phase F). status: see SIGNATURE_REQUEST_STATUSES in src/lib/legal/signatureLifecycle.ts — created/sent/in_progress/completed/declined/expired/revoked/cancelled, derived from its signatories'' own statuses (deriveSignatureRequestStatus()), never set arbitrarily.';

create index signature_requests_agreement_id_idx on public.signature_requests (agreement_id);
create index signature_requests_status_idx on public.signature_requests (status);

alter table public.signature_requests enable row level security;

-- Admin-tier only. External signatories never authenticate against
-- Supabase at all — their entire access path is the high-entropy
-- tokenized lookup performed server-side with the service_role client
-- (signatureEngine.ts's verifySignatoryToken()), which deliberately
-- bypasses RLS the same documented way every other service-role admin
-- client call in this codebase does. No anon/authenticated policy is
-- granted here for that reason — a narrower, safer boundary than
-- giving external signatories any direct table access.
create policy "signature_requests: admin read" on public.signature_requests
  for select
  to authenticated
  using ((select private.is_admin_or_super_admin()));

-- Client Portal (Phase H): a party to the underlying agreement may
-- read the request's aggregate status (e.g. "in_progress"/
-- "completed") for their OWN agreement only — the same "own party
-- read" boundary already established on agreements/agreement_parties/
-- agreement_snapshots/agreement_schedules/agreement_amendments.
create policy "signature_requests: own party read" on public.signature_requests
  for select
  to authenticated
  using (
    exists (
      select 1 from public.agreement_parties ap
      where ap.agreement_id = signature_requests.agreement_id and ap.profile_id = (select auth.uid())
    )
  );

grant select on public.signature_requests to authenticated;
grant select, insert, update, delete on public.signature_requests to service_role;

create trigger signature_requests_set_updated_at
  before update on public.signature_requests
  for each row execute function public.set_updated_at();

-- ============================================================
-- signature_signatories
-- ============================================================
-- One row per party who must sign, resolved from agreement_parties at
-- request-creation time. role is denormalized/frozen from
-- agreement_parties.party_role at that moment — a later change to the
-- party record must never silently alter what an in-flight signatory
-- row says its role was.
create table public.signature_signatories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  signature_request_id uuid not null references public.signature_requests (id) on delete cascade,
  agreement_party_id uuid not null references public.agreement_parties (id),
  role text not null,
  status text not null default 'pending',
  token_hash text,
  token_created_at timestamptz,
  token_expires_at timestamptz,
  token_revoked_at timestamptz,
  viewed_at timestamptz,
  consented_at timestamptz,
  signed_at timestamptz,
  declined_at timestamptz,
  declined_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (signature_request_id, agreement_party_id)
);

comment on table public.signature_signatories is
  'One row per required signatory. token_hash is a SHA-256 hash of a high-entropy access token — the raw token itself is NEVER persisted anywhere (signatureTokens.ts generates it, returns it exactly once to the caller, and only its hash is stored). status: see SIGNATORY_STATUSES in src/lib/legal/signatureLifecycle.ts — pending/viewed/consented/signed/declined/expired/revoked.';

create index signature_signatories_request_id_idx on public.signature_signatories (signature_request_id);
-- A hash lookup must be exact and fast; uniqueness also guarantees two
-- signatories can never collide onto the same access token by
-- construction (astronomically unlikely already, enforced anyway).
create unique index signature_signatories_token_hash_idx on public.signature_signatories (token_hash) where token_hash is not null;

alter table public.signature_signatories enable row level security;

create policy "signature_signatories: admin read" on public.signature_signatories
  for select
  to authenticated
  using ((select private.is_admin_or_super_admin()));

-- Client Portal (Phase H): a signatory with a real portal account may
-- read their OWN signatory row (their signing status/timestamps) —
-- token_hash is exposed by this policy too, but it is a one-way
-- SHA-256 digest (signatureTokens.ts) with no path back to the raw
-- token, so reading it grants no access; the raw token itself is never
-- stored anywhere a policy like this could expose. Postgres RLS is
-- row-level, not column-level — narrowing this further would need a
-- view, deliberately left for the separately-authorized wiring phase.
create policy "signature_signatories: own read" on public.signature_signatories
  for select
  to authenticated
  using (
    exists (
      select 1 from public.agreement_parties ap
      where ap.id = signature_signatories.agreement_party_id and ap.profile_id = (select auth.uid())
    )
  );

grant select on public.signature_signatories to authenticated;
grant select, insert, update, delete on public.signature_signatories to service_role;

create trigger signature_signatories_set_updated_at
  before update on public.signature_signatories
  for each row execute function public.set_updated_at();

-- ============================================================
-- signature_events — append-only audit trail
-- ============================================================
-- Never updated once inserted. Every state change recorded elsewhere
-- (viewed_at, consented_at, signed_at, ...) has a corresponding event
-- row here — the columns are for fast/cheap current-state reads, the
-- events table is the durable evidentiary trail.
create table public.signature_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  signatory_id uuid not null references public.signature_signatories (id) on delete cascade,
  event_type text not null,
  actor_type text not null,
  occurred_at timestamptz not null default now(),
  ip_address inet,
  user_agent text,
  metadata jsonb not null default '{}'
);

comment on table public.signature_events is
  'Append-only. event_type: request_created/link_generated/viewed/consent_given/signed/declined/expired/revoked/reminder_sent. actor_type: system/external_signatory/admin — never a profile join for the external-signatory case, since an external party usually has no profiles row at all.';

create index signature_events_signatory_id_idx on public.signature_events (signatory_id);
create index signature_events_occurred_at_idx on public.signature_events (occurred_at);

alter table public.signature_events enable row level security;

create policy "signature_events: admin read" on public.signature_events
  for select
  to authenticated
  using ((select private.is_admin_or_super_admin()));

grant select on public.signature_events to authenticated;
-- Insert-only for service_role — no update/delete grant at all, making
-- "append-only" a real database-level guarantee, not just convention.
grant select, insert on public.signature_events to service_role;

-- ============================================================
-- signature_evidence — one immutable row per completed signature
-- ============================================================
create table public.signature_evidence (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  signatory_id uuid not null references public.signature_signatories (id),
  document_sha256 text not null,
  signature_method text not null,
  typed_full_name text not null,
  consent_statement text not null,
  ip_address inet,
  user_agent text,
  signed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (signatory_id)
);

comment on table public.signature_evidence is
  'Immutable execution evidence — one row per signatory, created exactly once at the moment of signing, never updated afterward. document_sha256 is copied from agreements.issued_document_sha256 at signing time (the binding link in the traceability chain), not independently recomputed.';

create index signature_evidence_signatory_id_idx on public.signature_evidence (signatory_id);

alter table public.signature_evidence enable row level security;

create policy "signature_evidence: admin read" on public.signature_evidence
  for select
  to authenticated
  using ((select private.is_admin_or_super_admin()));

grant select on public.signature_evidence to authenticated;
-- Insert-only for service_role — no update/delete grant, so
-- "immutable execution evidence" is enforced at the database level.
grant select, insert on public.signature_evidence to service_role;

commit;
