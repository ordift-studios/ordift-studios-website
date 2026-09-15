-- Ordift Studios Compliance/COMP-SYS-1, Phase B7 Step 6 (2026-09-15) —
-- controlled reconciliation of Mishael Adjei's two pre-existing
-- Employment Agreement drafts (ORD-AGR-2026-000002 and -000003),
-- Founder-authorized after a full reconciliation report confirmed:
-- same actor (966bf3f7-...), same master/version (OS-LGL-007 v1.0),
-- identical parties, byte-for-byte identical frozen Schedule A
-- snapshot content, created back-to-back ~7 seconds apart with no
-- other activity between them — the exact signature of the pre-fix
-- Create Draft no-feedback/double-submission defect, not two
-- deliberately different agreements.
--
-- This performs EXACTLY what the existing canonical
-- transitionAgreementStatus() (agreementEngine.ts) would do for
-- ORD-AGR-2026-000002 (agreement id abf13dec-6526-49f3-aa53-d5c1dc9e0bd6)
-- moving draft -> cancelled — no new status, lifecycle, table, or
-- bypass invented:
--   1. status = 'cancelled', cancelled_at = now() (STATUS_TIMESTAMP_COLUMN['cancelled']),
--      guarded by the SAME atomic "still in the expected prior status"
--      compare-and-swap the real function uses (`where status = 'draft'`).
--   2. The identical activity_log entry the real function logs
--      (action 'legal.agreement.status_changed', metadata
--      {fromStatus, toStatus, isIssued}).
-- A migration is used instead of invoking the real function directly
-- because this environment's .env.local has no Supabase credentials
-- (grep-confirmed, established constraint throughout this engagement)
-- — same precedent as migrations 0107/0109/0110/0111.
--
-- transitionAgreementStatus() itself has no "reason" parameter, so the
-- fuller cancellation reason is recorded as its own, separate,
-- clearly-labeled activity_log entry — the same established pattern
-- this Legal Suite already uses for supplementary audit detail beyond
-- one structured status-change event, not a new mechanism.
--
-- superseded_by_agreement_id is deliberately NOT set: grep-confirmed,
-- transitionAgreementStatus() does not write this column for ANY
-- transition, and no other function anywhere writes it either — the
-- canonical lifecycle mechanism, as it actually exists in code today,
-- does not extend to recording this relationship. Fabricating a direct
-- write to it here would bypass the one real service function that
-- owns agreement status changes. Reported as a genuine gap rather than
-- worked around, per explicit instruction.
--
-- Untouched by this migration: agreement_snapshots, agreement_parties,
-- master_id/master_version_id, created_at/created_by, and every row
-- for ORD-AGR-2026-000003 — this only ever updates the single
-- targeted agreements row (guarded by both id AND current status) and
-- inserts two new activity_log rows.

begin;

update public.agreements
set status = 'cancelled',
    cancelled_at = now(),
    updated_at = now()
where id = 'abf13dec-6526-49f3-aa53-d5c1dc9e0bd6'
  and status = 'draft';

insert into public.activity_log (actor_user_id, action, entity_type, entity_id, metadata)
select '966bf3f7-16fe-4f35-9b71-bc0408b3975c', 'legal.agreement.status_changed', 'agreement', 'abf13dec-6526-49f3-aa53-d5c1dc9e0bd6',
       jsonb_build_object('fromStatus', 'draft', 'toStatus', 'cancelled', 'isIssued', false)
where exists (
  select 1 from public.agreements where id = 'abf13dec-6526-49f3-aa53-d5c1dc9e0bd6' and status = 'cancelled'
) and not exists (
  select 1 from public.activity_log
  where entity_id = 'abf13dec-6526-49f3-aa53-d5c1dc9e0bd6' and action = 'legal.agreement.status_changed'
);

insert into public.activity_log (actor_user_id, action, entity_type, entity_id, metadata)
select '966bf3f7-16fe-4f35-9b71-bc0408b3975c', 'legal.agreement.cancellation_reason_recorded', 'agreement', 'abf13dec-6526-49f3-aa53-d5c1dc9e0bd6',
       jsonb_build_object(
         'reason', 'Accidental duplicate draft — created by the pre-fix Create Draft no-feedback/double-submission behaviour. Reconciliation confirmed identical master/version, parties and frozen Schedule A content to ORD-AGR-2026-000003, with back-to-back creation approximately 7 seconds apart.',
         'relatedAgreementReference', 'ORD-AGR-2026-000003',
         'relatedAgreementId', '013e7fd7-7186-4489-9bf0-e43b41387996'
       )
where exists (
  select 1 from public.agreements where id = 'abf13dec-6526-49f3-aa53-d5c1dc9e0bd6' and status = 'cancelled'
) and not exists (
  select 1 from public.activity_log
  where entity_id = 'abf13dec-6526-49f3-aa53-d5c1dc9e0bd6' and action = 'legal.agreement.cancellation_reason_recorded'
);

commit;
