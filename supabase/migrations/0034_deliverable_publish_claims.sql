-- Batch 5 hardening — atomic duplicate-publish protection (2026-08-20).
--
-- Real gap found while re-verifying Batch 5's regression suite: the
-- original duplicate-publish guard in createDeliverableAction was a
-- plain SELECT-then-INSERT (a read, then a separate write, no
-- database-enforced mutual exclusion between them). Under genuinely
-- concurrent identical requests, every caller can complete the SELECT
-- (each independently seeing "no recent duplicate") before any of them
-- commits their INSERT, so all of them proceed — proven empirically: a
-- 6-way Promise.all of identical publish attempts produced 6 successful
-- writes, not 1, reproducibly.
--
-- Fix: a separate, disposable claim table with a genuine UNIQUE
-- constraint — enforced by Postgres's own index at the storage layer,
-- not a subquery a second transaction could race past — combined with
-- an atomic claim-or-reclaim function. Deliberately NOT a permanent
-- uniqueness constraint on `deliverables` itself: that would satisfy
-- the concurrency requirement but permanently block a legitimate later
-- republish of the same title+url, which must always remain possible.
-- A claim older than the duplicate window is atomically reclaimed
-- rather than treated as a permanent block.
create table public.deliverable_publish_claims (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  title text not null,
  url text not null,
  claimed_at timestamptz not null default now(),
  constraint deliverable_publish_claims_key unique (entity_type, entity_id, title, url)
);

comment on table public.deliverable_publish_claims is
  'Batch 5 hardening (2026-08-20) — atomic duplicate-publish guard for createDeliverableAction, via publish_deliverable_with_claim(). Rows are transient: a genuine publish attempt claims one; if the actual deliverable insert then fails for any reason, the whole function call (claim included) rolls back automatically as a single transaction — a failed attempt never leaves a stale claim blocking immediate retry, and this rollback is inherent to the single-function design, not a separate delete step that could itself race. A claim older than its duplicate_window is atomically reclaimed (not permanently blocked), so the same title+url can always be legitimately republished later.';

alter table public.deliverable_publish_claims enable row level security;

-- Staff/admin read only (internal reconciliation/audit record, not
-- client-facing) — same shape as payment_completion_claims' own policy.
-- All writes happen exclusively inside the SECURITY DEFINER function
-- below, via the service-role client.
create policy "deliverable_publish_claims: staff read"
  on public.deliverable_publish_claims
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.deliverable_publish_claims to authenticated;
grant select, insert, update, delete on public.deliverable_publish_claims to service_role;

-- Single atomic function covering both the claim and the actual
-- deliverable insert, so a failure anywhere in the sequence rolls back
-- everything as one unit — this is the "stronger transactional design"
-- alternative to a separate claim-then-release: there is no window in
-- which a claim exists without its deliverable, or vice versa, visible
-- to any other transaction, and no manual release step that could
-- itself introduce a race.
--
-- Returns exactly one row: (deliverable_id, claim_status), where
-- claim_status is 'published' (this call won and the deliverable now
-- exists — proceed with activity logging + Files Ready email in the
-- caller) or 'duplicate' (a genuine recent duplicate — deliverable_id
-- is null, do nothing further). A real error (e.g. an invalid
-- category_id) is not caught here — it propagates as a normal
-- Postgres/PostgREST error, which is exactly what makes the automatic
-- rollback of the claim happen; the caller sees a plain RPC error and
-- can retry immediately, since nothing persisted.
create or replace function public.publish_deliverable_with_claim(
  p_entity_type text,
  p_entity_id uuid,
  p_category_id uuid,
  p_title text,
  p_description text,
  p_url text,
  p_thumbnail_url text,
  p_published_by uuid,
  p_duplicate_window interval default interval '15 seconds'
) returns table (deliverable_id uuid, claim_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim_id uuid;
  v_deliverable_id uuid;
begin
  insert into deliverable_publish_claims (entity_type, entity_id, title, url)
  values (p_entity_type, p_entity_id, p_title, p_url)
  on conflict (entity_type, entity_id, title, url) do nothing
  returning id into v_claim_id;

  if v_claim_id is null then
    -- A claim for this exact key already exists. Only reclaim it —
    -- treat this as a legitimate new, later publish — once real time
    -- has genuinely passed; otherwise this is a true rapid duplicate.
    update deliverable_publish_claims
    set claimed_at = now()
    where entity_type = p_entity_type
      and entity_id = p_entity_id
      and title = p_title
      and url = p_url
      and claimed_at < now() - p_duplicate_window
    returning id into v_claim_id;
  end if;

  if v_claim_id is null then
    return query select null::uuid, 'duplicate'::text;
    return;
  end if;

  -- We own the claim. If this insert fails for any reason, the
  -- exception propagates unhandled, and Postgres rolls back this
  -- entire function invocation — including the claim insert/update
  -- above — as a single transaction. No deliverable, no claim, no
  -- trace; the caller can retry immediately.
  insert into deliverables (entity_type, entity_id, category_id, title, description, url, thumbnail_url, published_by)
  values (p_entity_type, p_entity_id, p_category_id, p_title, p_description, p_url, p_thumbnail_url, p_published_by)
  returning id into v_deliverable_id;

  return query select v_deliverable_id, 'published'::text;
end;
$$;

revoke all on function public.publish_deliverable_with_claim(text, uuid, uuid, text, text, text, text, uuid, interval) from public;
grant execute on function public.publish_deliverable_with_claim(text, uuid, uuid, text, text, text, text, uuid, interval) to service_role;
