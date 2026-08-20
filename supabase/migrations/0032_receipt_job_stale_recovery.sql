-- TD-043 defense-in-depth: receipt-job stale 'processing' recovery
-- (2026-08-19, approved decision report)
--
-- The unconditional-side-effect review found a genuine, if narrow, gap:
-- if the process dispatching a receipt crashes between marking a
-- payment_receipt_jobs row 'processing' and finalizing it to
-- 'sent'/'failed', the job is left stuck at 'processing' forever — the
-- existing retryReceiptJobAction() deliberately excludes 'processing'
-- from its retry guard (to correctly prevent stealing a genuinely
-- in-flight send), but that same guard gives no way to distinguish a
-- job that's actually still in flight from one orphaned by a crash
-- minutes ago. No cron/scheduler/heartbeat infrastructure is being
-- added to close this — per instruction, recovery stays entirely
-- within the existing staff-triggered Retry Receipt workflow.
--
-- This function is the DB-authoritative decision for that workflow,
-- mirroring acquire_payment_completion_claim()'s own pattern
-- (migration 0030): the staleness test uses only Postgres's own now(),
-- never an application clock, and the claim (the UPDATE that flips the
-- job back to 'processing' and bumps attempt_count) happens in the same
-- atomic statement as the eligibility check, so two concurrent retry
-- attempts against the same stale job can never both win. A job whose
-- status is 'sent' can never match any branch of the WHERE clause
-- below, and a job whose status is 'processing' but not yet past the
-- threshold cannot either — both stay exactly as protected as they
-- were before this migration. It never touches payments or creates a
-- new payment_receipt_jobs row — it only ever UPDATEs one existing row
-- by id.
--
-- Threshold: 2 minutes, matching acquire_payment_completion_claim()'s
-- own default for consistency across TD-043's timing decisions. There
-- is no other significance to this exact number; it can be revisited
-- independently of this migration if real operation shows it should
-- differ from the top-level claim's window.
create or replace function public.reclaim_stale_receipt_job(
  p_job_id uuid,
  p_stale_after interval default interval '2 minutes'
) returns setof public.payment_receipt_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    update payment_receipt_jobs
    set status = 'processing',
        attempt_count = attempt_count + 1,
        last_attempted_at = now()
    where id = p_job_id
      and (
        status in ('pending', 'failed')
        or (status = 'processing' and last_attempted_at < now() - p_stale_after)
      )
    returning *;
end;
$$;

comment on function public.reclaim_stale_receipt_job is
  'TD-043 — DB-authoritative claim for the staff-triggered Retry Receipt workflow. Claims a pending/failed job unconditionally, or a processing job only once it has been stuck past p_stale_after (evaluated entirely by Postgres''s own now()). A sent job, or a processing job not yet stale, matches no branch and returns zero rows. Never touches payments or creates a new job row.';

revoke all on function public.reclaim_stale_receipt_job(uuid, interval) from public;
grant execute on function public.reclaim_stale_receipt_job(uuid, interval) to service_role;
