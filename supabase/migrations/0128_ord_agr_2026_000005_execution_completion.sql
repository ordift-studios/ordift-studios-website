-- One-off corrective completion for ORD-AGR-2026-000005 (2026-09-16),
-- explicitly authorized by the Founder/Super Admin, scoped ONLY to
-- repairing the missed agreement-status transition after both genuine
-- signatures were already recorded.
--
-- Root cause (fixed in application code this same phase,
-- agreementLifecycle.ts/agreementEngine.ts/signatureEngine.ts):
-- recordSignatorySignature() attempted a single direct "sent" ->
-- "fully_executed" transition, which is never a valid single hop
-- (isValidAgreementLifecycleTransition("sent","fully_executed") is
-- false — "sent" only leads to viewed/expired/cancelled).
-- transitionAgreementStatus() correctly refused; the refusal was
-- silently discarded. Both real signature_evidence rows (Lady
-- Anim-Tetey as vendor, Myredlive Anim-Tetey as ordift) were already
-- genuinely and correctly recorded — this migration does not touch
-- signature_evidence, signature_signatories, or agreement_snapshots at
-- all. It applies ONLY the same agreements-table state
-- advanceAgreementToFullyExecuted() would produce (sent -> viewed ->
-- accepted_for_signature -> fully_executed, each an atomic CAS UPDATE
-- guarded on the expected prior status) — because this environment's
-- .env.local has no Supabase credentials at all (grep-confirmed: only
-- VERCEL_OIDC_TOKEN is present), so there is no way to invoke the real
-- service function against Production from this session (same
-- constraint documented in migration 0109).
--
-- Deliberately does NOT insert synthetic activity_log rows to imitate
-- what transitionAgreementStatus()'s own logActivity() call would have
-- written — a hand-authored row claiming to be an organic system event
-- is a different, less honest thing than what actually happened here.
-- The genuine, tamper-evident record of THIS corrective action is this
-- migration file itself: version-controlled, timestamped by its own
-- commit, and tracked in Supabase's migration history
-- (supabase_migrations.schema_migrations) — that is the real audit
-- trail for a one-off manual repair, not a fabricated activity_log
-- entry pretending otherwise.

-- Double-keyed on both id and agreement_reference (redundant with each
-- other by construction, but kept as two independent guards rather
-- than one) plus the expected prior status on every UPDATE — this can
-- only ever touch the single row that is genuinely
-- ORD-AGR-2026-000005, and only when it is genuinely still sitting at
-- the exact prior status each step expects, never any other agreement
-- and never an unexpected state.

begin;

update public.agreements
set status = 'viewed', viewed_at = now()
where id = '70359ce5-7039-40ab-96db-319819ba51d4'
  and agreement_reference = 'ORD-AGR-2026-000005'
  and status = 'sent';

update public.agreements
set status = 'accepted_for_signature'
where id = '70359ce5-7039-40ab-96db-319819ba51d4'
  and agreement_reference = 'ORD-AGR-2026-000005'
  and status = 'viewed';

update public.agreements
set status = 'fully_executed', executed_at = now()
where id = '70359ce5-7039-40ab-96db-319819ba51d4'
  and agreement_reference = 'ORD-AGR-2026-000005'
  and status = 'accepted_for_signature';

commit;
