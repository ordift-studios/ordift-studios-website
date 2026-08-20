-- TD-043 completion-idempotency architectural remediation (2026-08-19)
--
-- A real Staging Test 5 payment (PAY-2026-000040) reproduced the same
-- duplicate payment.completed activity_log symptom seen on
-- PAY-2026-000033, despite migration 0029's claim table showing
-- exactly one row for the claim itself. Root-cause investigation
-- (recorded in TD-043) could not conclusively confirm the exact
-- mechanism, but identified a real architectural weakness regardless:
-- the stale-claim decision compared application-side Date.now()
-- against a database-generated claimed_at across multiple round
-- trips, and each completion side effect used a "check marker ->
-- act -> write marker" pattern gated on an in-memory snapshot rather
-- than an atomic database operation. This migration removes both
-- risk classes structurally, independent of ever confirming the
-- original mechanism:
--
-- 1. acquire_payment_completion_claim() — the entire claim/steal
--    decision now happens in one atomic Postgres round trip per
--    attempt, using only Postgres's own now(). No application clock
--    is ever consulted.
-- 2. claim_and_log_payment_activity() — claiming the activity-log
--    step and inserting the activity_log row happen in one
--    transaction; if either fails, neither persists.
-- 3. payment_receipt_jobs — a durable transactional outbox for
--    receipt emails, uniquely constrained per (payment_id, outcome)
--    so concurrent completions cannot create two jobs, with real
--    status/attempt/error state so a failed send is a visible,
--    retryable row rather than a silently lost email.
--
-- Partial unique indexes on activity_log for the three terminal
-- payment-outcome actions were considered as additional schema-level
-- defense-in-depth, but a pre-migration check found exactly the two
-- known historical duplicate pairs (PAY-2026-000033, PAY-2026-000040)
-- already violate that constraint. Per explicit instruction, existing
-- activity_log rows are never altered/merged/deleted to force a
-- constraint to pass — those indexes are deferred, not included here.

-- ============================================================
-- 1. Atomic, database-authoritative claim acquisition
-- ============================================================
create or replace function public.acquire_payment_completion_claim(
  p_payment_id uuid,
  p_outcome text,
  p_source text,
  p_stale_after interval default interval '2 minutes'
) returns setof public.payment_completion_claims
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    insert into payment_completion_claims (payment_id, outcome, source)
    values (p_payment_id, p_outcome, p_source)
    on conflict (payment_id, outcome) do nothing
    returning *;

  if found then
    return;
  end if;

  -- Stale-claim takeover — evaluated entirely in Postgres using its
  -- own now(), never the caller's Date.now(). Every caller, regardless
  -- of which machine/clock it runs on, asks this exact same question
  -- of this exact same authority.
  return query
    update payment_completion_claims
    set claimed_at = now(), source = p_source
    where payment_id = p_payment_id
      and outcome = p_outcome
      and completed_at is null
      and claimed_at < now() - p_stale_after
    returning *;
end;
$$;

revoke all on function public.acquire_payment_completion_claim(uuid, text, text, interval) from public;
grant execute on function public.acquire_payment_completion_claim(uuid, text, text, interval) to service_role;

-- ============================================================
-- 2. Atomic activity-step claim + activity_log insert, one transaction
-- ============================================================
create or replace function public.claim_and_log_payment_activity(
  p_payment_id uuid,
  p_outcome text,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_metadata jsonb
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows int;
begin
  update payment_completion_claims
  set activity_logged_at = now()
  where payment_id = p_payment_id
    and outcome = p_outcome
    and activity_logged_at is null;

  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    -- Someone else already logged this exact step — no insert, no
    -- rollback needed since nothing was written.
    return false;
  end if;

  insert into activity_log (actor_user_id, action, entity_type, entity_id, metadata)
  values (null, p_action, p_entity_type, p_entity_id, p_metadata);

  return true;
end;
$$;

revoke all on function public.claim_and_log_payment_activity(uuid, text, text, text, text, jsonb) from public;
grant execute on function public.claim_and_log_payment_activity(uuid, text, text, text, text, jsonb) to service_role;

-- ============================================================
-- 3. Durable receipt-dispatch outbox
-- ============================================================
create table public.payment_receipt_jobs (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id),
  outcome text not null default 'completed',
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  attempt_count int not null default 0,
  last_attempted_at timestamptz,
  last_error text,
  provider_result text, -- e.g. Resend send mode ('sent'|'logged') — an operational record, not a guarantee of delivery
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payment_id, outcome)
);

comment on table public.payment_receipt_jobs is
  'TD-043 — durable transactional outbox for payment receipt emails. A job''s existence (enforced unique per payment_id+outcome) prevents duplicate sends; its status/attempt/error state means a failed or stuck send is a visible, retryable row, never a silently lost email.';

create trigger set_payment_receipt_jobs_updated_at
  before update on public.payment_receipt_jobs
  for each row execute function public.set_updated_at();

create index payment_receipt_jobs_status_idx on public.payment_receipt_jobs (status) where status <> 'sent';

alter table public.payment_receipt_jobs enable row level security;

create policy "payment_receipt_jobs: staff read" on public.payment_receipt_jobs
  for select to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.payment_receipt_jobs to authenticated;
grant select, insert, update on public.payment_receipt_jobs to service_role;
