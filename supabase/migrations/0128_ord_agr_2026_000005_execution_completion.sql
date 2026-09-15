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
-- all. It performs EXACTLY the sequence of database writes the
-- now-fixed advanceAgreementToFullyExecuted() function would perform
-- for this agreement — sent -> viewed -> accepted_for_signature ->
-- fully_executed, each an atomic CAS UPDATE guarded on the expected
-- prior status, each followed by the same activity_log entry
-- transitionAgreementStatus() itself would have written — because this
-- environment's .env.local has no Supabase credentials at all
-- (grep-confirmed: only VERCEL_OIDC_TOKEN is present), so there is no
-- way to invoke the real service function against Production from this
-- session (same constraint documented in migration 0109).
--
-- actor_user_id is null throughout, matching
-- transitionAgreementStatus()'s own documented "genuine system-derived
-- transition" case — this was never a human decision to mark the
-- agreement executed; it is the recorded consequence of evidence that
-- already, genuinely exists.

begin;

update public.agreements
set status = 'viewed', viewed_at = now()
where id = '70359ce5-7039-40ab-96db-319819ba51d4' and status = 'sent';

insert into public.activity_log (actor_user_id, action, entity_type, entity_id, metadata)
select null, 'legal.agreement.status_changed', 'agreement', '70359ce5-7039-40ab-96db-319819ba51d4',
  '{"fromStatus":"sent","toStatus":"viewed","isIssued":true}'::jsonb
where exists (
  select 1 from public.agreements where id = '70359ce5-7039-40ab-96db-319819ba51d4' and status = 'viewed'
);

update public.agreements
set status = 'accepted_for_signature'
where id = '70359ce5-7039-40ab-96db-319819ba51d4' and status = 'viewed';

insert into public.activity_log (actor_user_id, action, entity_type, entity_id, metadata)
select null, 'legal.agreement.status_changed', 'agreement', '70359ce5-7039-40ab-96db-319819ba51d4',
  '{"fromStatus":"viewed","toStatus":"accepted_for_signature","isIssued":true}'::jsonb
where exists (
  select 1 from public.agreements where id = '70359ce5-7039-40ab-96db-319819ba51d4' and status = 'accepted_for_signature'
);

update public.agreements
set status = 'fully_executed', executed_at = now()
where id = '70359ce5-7039-40ab-96db-319819ba51d4' and status = 'accepted_for_signature';

insert into public.activity_log (actor_user_id, action, entity_type, entity_id, metadata)
select null, 'legal.agreement.status_changed', 'agreement', '70359ce5-7039-40ab-96db-319819ba51d4',
  '{"fromStatus":"accepted_for_signature","toStatus":"fully_executed","isIssued":true}'::jsonb
where exists (
  select 1 from public.agreements where id = '70359ce5-7039-40ab-96db-319819ba51d4' and status = 'fully_executed'
);

commit;
