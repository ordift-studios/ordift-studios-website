-- Ordift Partnerships & Collaborations — Referral Payable Bridge
-- (2026-09-07)
--
-- INSPECTION SUMMARY:
--   - Confirmed 0063 is the latest applied migration (local=remote=0063,
--     Partnerships & Collaborations V1) before writing this file — this
--     migration is 0064.
--   - payment_obligations (0046) was inspected: it already carries the
--     exact polymorphic source_type/source_reference pattern this
--     bridge needs (source_type='partnership_referral_commission_event',
--     source_reference=<event id>) — no new FK pattern was invented.
--   - engagements.payment_obligation_id (0046/Phase 3.3) was inspected
--     as the established precedent for THIS EXACT bridge shape: a
--     nullable, one-way link from a domain record to the single
--     payment_obligations row it produced, checked before creating a
--     new one (see createEngagementPayable() in
--     src/lib/payables/engagements.ts) and set atomically afterward.
--     This migration adds the identical column to
--     partnership_referral_commission_events for the identical reason
--     — durable idempotency ("has this event already been submitted to
--     Payables") that survives far longer than createPaymentObligation()'s
--     own 30-second recent-duplicate window (payoutObligations.ts),
--     which is a secondary safety net, not the primary guard here.
--   - payee_profiles (0049) was inspected again: partnership_opportunities
--     had no way to record which payee profile a referral partner
--     should be paid through. A nullable payee_profile_id column is
--     added there — the minimum coherent link the spec explicitly
--     anticipated ("reuse existing payee onboarding/linking path... do
--     not fabricate one"). This is NOT a payables/payment-destination
--     record itself — it only says "if this partner needs to be paid,
--     here is their existing payee profile"; verifying payment details
--     and actually paying remain entirely inside the existing Payables
--     flow, untouched by this migration.
--   - Both additions are nullable, additive columns on tables created
--     in migration 0063 (this session) — no data migration, no
--     backfill, no destructive statement. 0063 itself is not modified.
--   - No new table, no new RLS policy needed (both new columns live on
--     tables whose existing "staff read" RLS policy already covers
--     them).

begin;

alter table public.partnership_referral_commission_events
  add column payment_obligation_id uuid references public.payment_obligations (id);

comment on column public.partnership_referral_commission_events.payment_obligation_id is
  'Set exactly once, by approveReferralCommissionForPayment() (referralCommissions.ts), the first time this Earned commission is deliberately approved for payment — never by a Calculated/Earned transition. Durable idempotency guard: a repeat "Approve for Payment" click/retry checks this column first and returns the existing payment_obligations row rather than creating a second one. The commission event''s own status column never advances past "approved_for_payment" here — the actual "paid" observation is read live from this linked payment_obligations row (Finance''s own source of truth), never duplicated onto this table.';

alter table public.partnership_opportunities
  add column payee_profile_id uuid references public.payee_profiles (id);

comment on column public.partnership_opportunities.payee_profile_id is
  'Optional link to an existing payee profile for this opportunity''s counterpart/partner, set only when the partner genuinely needs to be paid (e.g. a referral commission). Reuses the existing Payables payee-onboarding flow — this column never creates, verifies, or implies a payee/payment destination on its own; it is simply the reference approveReferralCommissionForPayment() checks before allowing a referral commission to be submitted to Payables.';

commit;
