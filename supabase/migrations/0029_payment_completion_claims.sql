-- TD-043 idempotency hardening — payment_completion_claims
--
-- Real staging testing (2026-08-18/19) proved that relying solely on
-- payments' own `.eq("status","pending")` conditional UPDATE to gate
-- completion side effects (entity sync, activity log, receipt email)
-- was insufficient: a Paystack webhook and the customer's own browser-
-- triggered verify reconciliation, arriving roughly a second apart for
-- the same real payment, both ended up running the full "completed"
-- side-effect sequence — two activity_log rows, and (Staging's own
-- email-suppression aside) would have been two real receipt emails in
-- Production.
--
-- This table makes Postgres the authoritative, structurally-different
-- guard: an INSERT protected by a unique constraint, not another
-- conditional UPDATE on the same row already under suspicion. Only one
-- caller can ever win the claim for a given (payment_id, outcome) pair;
-- every other caller is told to stand down before touching anything
-- else. The per-step *_at columns let a caller that crashed partway
-- through resume safely later without re-running whatever already
-- succeeded (see gatewaySync.ts).
--
-- payment_id + outcome is the primary key rather than payment_id alone
-- *deliberately*: a single payment_id can legitimately need a claim
-- more than once across its lifetime — e.g. an earlier 'failed' report
-- followed, much later, by a genuine 'completed' report for the same
-- gateway reference. This table only ever gates re-running side
-- effects for an outcome that's already been (or is currently being)
-- processed; it does not itself decide which outcome is authoritative
-- for the payment — that remains payments.status's own job via its
-- existing (unchanged) conditional UPDATE. See gatewaySync.ts's
-- handling of a 'completed' claim arriving after the payment was
-- already resolved to 'failed' (or vice versa) — logged for staff
-- review rather than silently auto-correcting a financial state.
create table public.payment_completion_claims (
  payment_id uuid not null references public.payments (id),
  outcome text not null check (outcome in ('completed', 'failed', 'amount_mismatch')),
  source text not null, -- 'webhook' | 'verify' — whichever caller most recently held/stole the claim
  claimed_at timestamptz not null default now(),
  entity_synced_at timestamptz,
  activity_logged_at timestamptz,
  receipt_dispatched_at timestamptz, -- 'completed' outcome only; stays null for 'failed'/'amount_mismatch'
  completed_at timestamptz, -- null until every required step for this outcome has finished
  primary key (payment_id, outcome)
);

comment on table public.payment_completion_claims is
  'TD-043 — exactly-once claim + step-granular progress markers for gateway payment outcome side effects, preventing a concurrent webhook/verify/reconciliation race from repeating a customer-facing or audit side effect.';

create index payment_completion_claims_stale_idx on public.payment_completion_claims (claimed_at) where completed_at is null;

alter table public.payment_completion_claims enable row level security;

-- Staff/admin only (internal reconciliation/audit record, not
-- client-facing) — same shape as payment_webhook_events's own policy.
-- All writes happen server-side via the service-role client only.
create policy "payment_completion_claims: staff read" on public.payment_completion_claims
  for select to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.payment_completion_claims to authenticated;
grant select, insert, update on public.payment_completion_claims to service_role;
