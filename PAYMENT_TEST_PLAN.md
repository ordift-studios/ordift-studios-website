# Ordift Studios — Payment Module Test Plan

**Status:** Test plan, part of the Architecture Approval Gate. No tests exist yet — this defines what will be written once implementation begins, following the exact testing architecture and conventions already established in Workstream A (`npm test` → `vitest run`; `npm run test:integration` → `vitest run --config vitest.integration.config.ts`; existing suites like `src/lib/shared/idempotency.test.ts`, `src/lib/shared/rateLimit.test.ts`, `src/lib/enquiry/bookingWorkflow.integration.test.ts`).
**Date:** 2026-08-06

Tests are organized by the same unit-vs-integration split already used across the codebase: **unit tests** are pure-function/module tests with no external dependency (colocated `*.test.ts`); **integration tests** exercise real Supabase (staging project) and real code paths end-to-end (colocated `*.integration.test.ts`, run via `test:integration`). Gateway calls themselves are never made against the real Paystack API in automated tests — Paystack's sandbox/test-mode plus mocked webhook payloads cover that, consistent with how this project has never depended on live third-party services inside its automated suite.

---

## 1. Unit Tests

| Area | What's tested | New file (proposed) |
|---|---|---|
| Currency conversion | `reference_amount_usd × exchange_rate = converted_amount` rounding rules; rejection of a stale/expired locked rate | `src/lib/payments/currency.test.ts` |
| `PaymentProvider` interface conformance | A mock provider implementation satisfies the interface shape; `PaymentProvider` selection resolves the correct provider for a given country/currency config row | `src/lib/payments/providerRegistry.test.ts` |
| Payment status state machine | Valid transitions only (`pending → completed`, `awaiting_verification → completed/rejected`, etc.); invalid transitions (e.g. `completed → pending`) are rejected | `src/lib/payments/statusMachine.test.ts` |
| Webhook signature verification (Paystack) | Valid signature accepted; tampered body rejected; missing header rejected; wrong secret rejected | `src/lib/payments/providers/paystack.test.ts` |
| Amount/currency validation (Security Review §9) | Server-resolved quoted amount matches expectation; a mismatched gateway-confirmed amount is flagged, not silently accepted | `src/lib/payments/validation.test.ts` |
| Receipt generation | Correct fields populate for a standard payment vs. a refund receipt | `src/lib/payments/receipt.test.ts` |

---

## 2. Integration Tests (staging Supabase, real RLS)

Follows the exact pattern of `src/lib/portal/rls.integration.test.ts` and `src/lib/enquiry/bookingWorkflow.integration.test.ts` — real staging database, real policies, cleaned up after each run via the existing test-data-cleanup convention (`verify:staging-test-cleanup`).

| Area | What's tested |
|---|---|
| `payments` RLS | A client can read only their own `payments` rows; staff/admin can read all; no `authenticated`-role client can INSERT/UPDATE directly (matches the draft migration's grants) |
| `bank_accounts`/`currencies`/`payment_country_config` RLS | Readable by any authenticated user; writable only by staff/admin |
| Full deposit → balance → full lifecycle | A sequence of payments against one entity correctly accumulates, and the entity's computed "amount paid" / "balance due" is correct at each step |
| Bank-transfer workflow end-to-end | Submit → `awaiting_verification` → staff approve → `completed` → booking/workshop status auto-continues; and the reject path → `rejected` → resubmission creates a new proof against the same attempt, not a new payment row |
| Refund creates a new row | Refunding a `completed` payment creates a `payment_type = 'refund'` row without mutating the original |
| `activity_log` entries | Every transition (submit, approve, reject, refund, complete, fail) writes a correctly-attributed `activity_log` entry per the Audit Identity Standard |

---

## 3. Sandbox Transactions (Paystack test mode)

Manual + scripted verification against Paystack's real sandbox environment (not mocked) before any production key is used — the one place this plan deliberately does use a real (test-mode) third-party call, since webhook signature/timing behavior can't be fully simulated any other way with confidence:

- [ ] Successful card payment, full amount
- [ ] Successful card payment, deposit amount only
- [ ] Successful Mobile Money payment (MTN test simulator, if Paystack's sandbox supports it — confirm during Phase 2 build)
- [ ] Declined card (Paystack provides specific test card numbers for this)
- [ ] Cancelled checkout (customer backs out of the hosted page)
- [ ] A full deposit → balance sequence, confirming the booking's balance-due updates correctly between the two real sandbox transactions

---

## 4. Webhook-Signature Tests

- [ ] Valid Paystack test-mode webhook signature → accepted, processed
- [ ] Tampered payload with an otherwise-valid-looking signature → rejected (HTTP 401), no database write
- [ ] Missing `x-paystack-signature` header entirely → rejected
- [ ] Signature computed with the wrong secret (simulating a misconfigured key) → rejected
- [ ] Confirm the rejection path itself doesn't leak whether the payload or the signature was the specific problem (avoid giving an attacker a signal to iterate against)

---

## 5. Replayed Webhook Tests

- [ ] The exact same valid webhook payload/signature delivered twice → second delivery is a no-op (idempotency store hit), payment status unchanged, no duplicate `activity_log` entry
- [ ] A valid webhook older than the replay-age window (Security Review §6) → rejected even with a correct signature
- [ ] A valid webhook within the age window but for an already-`completed` payment (e.g. gateway's own retry after a slow-but-successful first processing) → no-op, not treated as an error

---

## 6. Duplicate Webhook Tests

Distinct from replay (§5) — this covers the idempotency-store-outage fail-closed behavior specifically called out in Security Review §7:

- [ ] With the idempotency store (Redis) simulated as unavailable, a webhook delivery returns a retriable error rather than proceeding uncached (confirms the deliberate fail-closed deviation from the shared module's normal fail-open behavior)
- [ ] Once the store is available again, the gateway's natural retry succeeds normally

---

## 7. Duplicate Checkout Tests

- [ ] Two checkout-initiation requests in quick succession for the same entity/payment_type → second request returns the existing pending session rather than creating a second one (Security Review §8, UX Spec §6)
- [ ] After the first pending session expires (rate-lock window elapsed), a new checkout-initiation request is allowed to create a fresh session

---

## 8. Wrong-Amount Tests

- [ ] A webhook reporting a gateway-confirmed amount that doesn't match the `converted_amount` recorded at checkout (beyond the defined rounding tolerance) → payment marked `failed`, not `completed`, and a Sentry alert fires (Security Review §9/§19)
- [ ] An amount within the defined rounding tolerance → accepted normally, confirming the tolerance isn't so tight it breaks on legitimate gateway rounding

---

## 9. Wrong-Currency Tests

- [ ] A webhook reporting a settlement/payment currency different from what was locked at checkout-initiation → flagged, not silently accepted, same treatment as a wrong-amount mismatch
- [ ] Confirm `exchange_rate_source`/`conversion_performed_by` are populated correctly for a gateway-side vs. Ordift-side conversion scenario, once that distinction is actually observable from a real sandbox response

---

## 10. Expired Checkout Tests

- [ ] A checkout session whose locked exchange rate has passed its validity window, when the client attempts to complete payment against it → the flow forces a fresh rate-lock (re-runs the confirmation screen, UX Spec §4 step 2) rather than completing at a stale rate
- [ ] An abandoned pending payment past a defined staleness threshold doesn't block a later legitimate retry for the same entity (distinguishing "still active, block duplicates" from "abandoned, allow retry" — Security Review §8)

---

## 11. Successful and Failed Mobile Money Tests

- [ ] Successful MTN Mobile Money sandbox transaction → `completed`, receipt generated, booking/workshop status continues correctly
- [ ] Failed/declined Mobile Money transaction → `failed`, client sees the neutral failure UI (UX Spec §5), payment row retained for support visibility
- [ ] Confirm Telecel Cash and AirtelTigo Money are exercised too if Paystack's sandbox exposes distinct test paths for each (to be confirmed during Phase 2 — Paystack's hosted checkout may present these as one unified "Mobile Money" flow rather than requiring separate test paths)

---

## 12. Successful and Failed Card Tests

- [ ] Successful card payment (Paystack test card) → `completed`
- [ ] Declined card (Paystack's documented decline test card) → `failed`, correct UI/message
- [ ] International card (a non-Ghana-issued test card, if Paystack's sandbox supports simulating this) → confirms the flow doesn't assume every card is Ghana-issued, relevant for eventual cross-border customers even before Qatar goes live

---

## 13. Bank-Transfer Review Tests

- [ ] Proof upload succeeds with a valid image/PDF within size limits; rejected for disallowed file types or oversize files (matching the Security Review §13 validation)
- [ ] Submission correctly transitions the payment to `awaiting_verification` and creates the staff notification
- [ ] Staff approval (with `approve_bank_transfer` capability) → `completed`, booking/workshop auto-continues, `activity_log` entry correct
- [ ] Staff approval attempt **without** the capability → rejected server-side (not just hidden client-side — confirms the capability check is enforced where it matters)
- [ ] Staff rejection with a reason → `rejected`, client notified with the reason visible
- [ ] Staff rejection **without** a reason → rejected at the application layer (matches the "every rejection/refund carries a recorded reason" rule, Security Review §16)
- [ ] Resubmission after rejection creates a new proof against the same payment attempt, not a new row (UX Spec §10)
- [ ] Proof file is retrievable only via a signed URL, and only by the payment's owner or staff/admin — a direct/guessed storage path returns unauthorized (Security Review §14)

---

## 14. Refund and Partial-Refund Tests

- [ ] Full refund on a `completed` gateway payment creates a correctly-linked `payment_type = 'refund'` row for the full amount
- [ ] Partial refund creates a refund row for less than the original amount; the entity's computed balance reflects the partial refund correctly
- [ ] Refund attempt without the `issue_refund` capability → rejected server-side
- [ ] Refund attempt without a reason → rejected
- [ ] Bank-transfer "refund" (manual process, UX Spec §11) correctly records a `provider = 'bank_transfer'` refund row without attempting to call any gateway API

---

## 15. Email Receipt Tests

Follows the existing stubbed-Resend integration-test pattern already used for `src/lib/shared/email/dispatch.integration.test.ts`:

- [ ] A completed payment triggers exactly one receipt email, with the correct amount, currency, exchange rate, and entity description
- [ ] A refund triggers a distinct refund-receipt email (not a reused charge-receipt template)
- [ ] Receipt PDF is downloadable both from the immediate confirmation screen and later from Payment History — same generated document, not two different formats

---

## 16. Permission Tests

Extends the existing permission-boundary-test pattern already proven for Portfolio/Enquiries/Workshop Registrations (`src/lib/portal/adminAccess.integration.test.ts` and similar):

- [ ] Client cannot read another client's `payments` rows (RLS-level, not just UI-hidden)
- [ ] Client cannot directly INSERT/UPDATE a `payments` row via any client-accessible path (confirms no `authenticated`-role write grant exists, matching the draft migration)
- [ ] Staff without `approve_bank_transfer` cannot approve a transfer (§13)
- [ ] Staff without `issue_refund` cannot issue a refund (§14)
- [ ] Staff without `manage_bank_accounts`/`manage_currencies` cannot modify reference data

---

## 17. Audit-Log Tests

- [ ] Every status transition listed in §2's "activity_log entries" row produces exactly one correctly-attributed entry — no missing entries, no duplicate entries for a single logical transition
- [ ] Actor identity resolves via `profiles.member_number` per the Audit Identity Standard, including for the automated/webhook-driven `completed` transition (which has no human "actor" in the traditional sense — confirm this resolves to a sensible system-attributed entry rather than breaking the resolver)

---

## 18. Storage-Security Tests

- [ ] Proof-of-payment bucket is confirmed **not** publicly listable or readable (a direct unauthenticated request to a known/guessed path fails)
- [ ] Signed URLs expire correctly after their defined window
- [ ] A signed URL generated for one user's proof cannot be reused by a different authenticated user session that isn't staff/admin

---

## 19. Staging Isolation

- [ ] Confirm Paystack test-mode key is the only key ever present in the staging environment's configuration — a live-mode key accidentally set in staging is treated as a configuration error to catch, not a silent risk (a startup check, similar in spirit to the existing `SITE_ENV`/dataset-mismatch protections already in place for Sanity/Supabase)
- [ ] Confirm no real `bank_accounts` row (with genuine banking details) exists in the staging database at any point — staging seed data is clearly marked as test data
- [ ] Confirm a staging-environment webhook cannot be processed against the production database and vice versa (Security Review §20)

---

## 20. Production-Readiness Checklist

This section intentionally mirrors `PAYMENT_FINANCE_ARCHITECTURE_PROPOSAL.md` §16 rather than duplicating a second, divergent checklist — §16 remains the authoritative, fillable-in production readiness checklist; this test plan is what generates the evidence for each of its items. Once Phase 2 (Paystack integration) is implemented, this plan's suites are run and their results are what populate §16's checkboxes with real pass/fail outcomes, not just a plan.

---

## 21. Rollback Plan

Mirrors the Migration Plan's rollback approach (`PAYMENT_FINANCE_ARCHITECTURE_PROPOSAL.md` §14 step 7), extended to cover application code once it exists:

1. **Before any real payment has been processed in production:** rollback is simply reverting the deployed code to the prior commit and, if needed, dropping the 4 payment tables — no data-migration risk, matching the migration plan's existing framing.
2. **After real payments exist in production:** code can still be rolled back (revert deploy), but the `payments` table itself is never rolled back/dropped — it's financial history. A code-level regression discovered post-launch is fixed forward (a new deploy), not resolved by reverting data.
3. **Gateway-side rollback:** if a newly-deployed Paystack integration exhibits a serious issue in production (e.g. incorrect amount calculation), the fastest safe mitigation is disabling the "Pay Now" entry points (a feature flag or a quick conditional, not a database change) while the code issue is fixed — stopping new payments from being initiated without touching any existing payment record.
4. This rollback plan will be rehearsed once, in staging, against a simulated failure before the production go-live authorization (§20's production-readiness gate), not left untested until a real incident.
