# Ordift Studios — Payment Security Review

**Status:** Design review, produced as part of the Architecture Approval Gate — **original 2026-08-06 status, now stale; see the correction below.**
**Date:** 2026-08-06

**Status correction (2026-08-10, Production Readiness Reconciliation):** the line above ("no gateway accounts created, no migrations applied, no live credentials connected, no code committed") no longer describes reality. Migration `0024_payments_foundation.sql` is applied to **staging** and verified; Paystack **test-mode** credentials are connected on staging; the full payments module (checkout, webhook, bank-transfer workflow, receipts, admin approval) is built and has been smoke-tested end-to-end on staging with real Paystack test-mode transactions (Card and Mobile Money), per `PAYSTACK_PRODUCTION_HANDOVER.md` §6–§7. Every control this document describes as a design intent has since been checked against the real implementation by `WORKSTREAM_I_SECURITY_REREVIEW.md` (2026-08-10) — that review found and fixed one real gap this design didn't anticipate (bank-transfer initiation trusted a client-supplied entity ID/amount) and confirmed every other control described below (webhook signature verification, idempotency, amount/currency validation, RLS, refund-row-not-mutation, audit logging) matches the live code. §18's "Workstream H, still pending on the roadmap" is also stale — Workstream H completed 2026-08-10. **Nothing here has been re-verified against Production** — Production has no payments schema, no Paystack configuration, and no live credentials of any kind; every control below is proven true on staging only.

Every control below is either (a) a direct reuse of a mechanism already live and proven elsewhere in this codebase, cited by file, or (b) a new control this design introduces, explicitly marked **New**. Nothing here is aspirational or generic — each item states the actual mechanism this project will use.

---

## 1. Hosted Checkout vs. Direct Card Handling

**Hosted checkout only.** Paystack's checkout flow (and, per the current research, both Qatar candidates) redirects the customer to the provider's own hosted payment page or embeds a provider-controlled iframe/widget — Ordift's own frontend and servers never receive, transmit, or render a raw card number, expiry date, or CVV at any point. The `PaymentProvider.initCharge()` interface (architecture proposal §3) returns a `checkoutUrl` for exactly this reason — the browser navigates there directly; card fields never pass through an Ordift-controlled form.

**What this rules out by construction:** no card-data validation logic, no PAN storage, no card-data transmission logic exists anywhere in this codebase's payment module, because there is never a point where Ordift's code sees that data.

---

## 2. PCI Scope and Expected SAQ Responsibility

Because of §1, Ordift Studios falls into the simplest PCI DSS self-assessment tier for a hosted-checkout/redirect integration — **SAQ A** (or the equivalent self-assessment tier under whichever card network's current PCI SSC program applies) — a self-completed annual questionnaire, not an external audit. This was already established in `PAYMENT_COST_REGISTER.md` §2 as a $0 mandatory-obligation, $0-cost item.

**This scope classification depends entirely on the hosted-checkout architecture holding.** If a future decision ever introduces a custom card-entry form (even one that just relays fields to the gateway via JS, e.g. an "embedded fields" integration), the PCI scope changes materially and this section must be revisited before that change ships — flagged here as a standing constraint on future work, not just a current-state description.

---

## 3. Confirmation: No Raw Card Numbers, CVV, or Reusable Card Credentials Are Ever Stored

Confirmed against the draft schema (`supabase/migrations/0024_payments_foundation.sql`): the `payments` table stores `gateway_reference` (an opaque provider-issued transaction ID), `provider`, amounts, and currency/conversion fields — no column exists for a card number, CVV, expiry date, or a reusable card token. This isn't an oversight to fix later; it's deliberate, matching §1's hosted-checkout design. If a future "save this card for next time" feature is ever requested, it would use the gateway's own tokenization (a provider-side reference token, not raw card data) — reserved as a future decision, not built now, and explicitly out of scope for Phase 1–4.

---

## 4. API-Key and Secret Storage

Follows the exact existing pattern used for every other secret in this codebase — confirmed via `.env.example`'s established conventions (`SUPABASE_SECRET_KEY`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `SENTRY_AUTH_TOKEN`, all server-only, never `NEXT_PUBLIC_`-prefixed):

- `PAYSTACK_SECRET_KEY` (and later, the Qatar provider's equivalent) — server-only environment variable, read only inside API routes/server actions, never returned in any API response, never logged.
- Any public key the gateway requires client-side (e.g. Paystack's public key for redirect construction, if applicable) follows the same public/secret split already established for Turnstile (`NEXT_PUBLIC_TURNSTILE_SITE_KEY` vs. `TURNSTILE_SECRET_KEY`) and Supabase (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` vs. `SUPABASE_SECRET_KEY`) — a public key is safe to expose by design; the secret key never is.
- Staging and production use **separate** Paystack keys (test-mode vs. live-mode), matching this project's absolute rule of never sharing credentials across environments (already enforced for Sanity datasets and Supabase projects).
- Real banking details (`bank_accounts` table) are populated only via the Admin Platform UI or a manual SQL insert against the live database — **never** hardcoded in a migration file, a seed script, or committed to git in any form. The draft migration (§6 of Part 6 below) seeds zero real banking rows for exactly this reason.

---

## 5. Webhook Signature Verification

**Mandatory before any webhook payload is trusted — no exceptions.** `PaymentProvider.verifyWebhookSignature(rawBody, headers)` (architecture proposal §3) is called first, on the raw, unparsed request body, before any JSON parsing or business logic runs. Paystack signs webhooks with an **HMAC-SHA512** signature (corrected 2026-08-06 — an earlier draft of this document said SHA-256, which was wrong; caught and fixed while implementing `src/lib/payments/providers/paystack.ts`) in the `x-paystack-signature` header, computed over the raw request body using the secret key — verification recomputes the HMAC server-side using Node's `crypto.timingSafeEqual` and rejects on any length or content mismatch.

**Fail-closed on verification failure:** an unverified or invalid-signature webhook is rejected (HTTP 401) and never reaches the status-update logic — matching this project's established fail-closed philosophy (the staging gate, the holding-page bypass, and Turnstile verification all fail closed on ambiguous state).

---

## 6. Webhook Replay Protection

Two layers, both already proven patterns in this codebase:

- **Idempotency** (§7 below) is the primary defense — a replayed webhook for an already-processed event is a no-op, not a security hole, because the payment status transition is idempotent by `gateway_reference`/`idempotency_key`.
- **Timestamp/age check (New):** webhooks older than a bounded window (e.g. 5 minutes, matching typical provider retry windows) are rejected even with a valid signature, limiting the blast radius if a signature were ever compromised or a request captured and resent much later. Paystack's own signature doesn't include a timestamp nonce, so this is an Ordift-side addition, not a gateway feature being relied on.

---

## 7. Idempotency

**Reuses `src/lib/shared/idempotency.ts` directly** — the same Redis-backed (Upstash, with in-memory fallback for local dev) idempotency store already used by every form-submission API route (Enquiries, Workshop Registrations). For payments specifically:

- Every webhook event is keyed by the provider's own event ID (Paystack includes a unique event reference) and checked against the idempotency store before any database write. A duplicate delivery — which Paystack's own retry behavior guarantees will happen occasionally — returns the cached result without reprocessing.
- The `payments.idempotency_key` column (draft migration, unique constraint) provides a second, database-level guarantee: even if the Redis-layer check were ever bypassed, a duplicate insert against the same key fails at the database constraint level rather than silently creating a second charge record.
- **Fail-open behavior inherited from the existing idempotency module is deliberately NOT carried over for payments.** The existing module fails open (treats a Redis outage as "uncached, proceed") because a missed idempotency check on a form submission just risks a duplicate enquiry — low cost. For payments, a missed idempotency check risks a duplicate charge or double-processed refund — high cost. **New:** the payment webhook handler will fail closed on an idempotency-store outage (return a retriable error to the gateway rather than proceeding uncached), accepting a delayed webhook over a duplicate-processing risk. This is the one deliberate deviation from the existing shared module's behavior and will be implemented as payment-specific wrapping logic around the shared store, not a change to the shared module itself (which correctly stays fail-open for its existing, lower-stakes callers).

---

## 8. Duplicate-Payment Prevention

Beyond webhook-level idempotency (§7), the checkout-initiation path itself prevents a customer from accidentally starting two simultaneous charges for the same amount owed:

- **New:** before `initCharge()` is called, the server checks for an existing `pending`/`awaiting_verification` payment against the same `entity_type`/`entity_id` and `payment_type`. If one exists and hasn't expired, the customer is routed back to it rather than a fresh charge being initiated — preventing the classic "double-click checkout" or "opened two tabs" scenario.
- A checkout session's exchange-rate lock (architecture proposal §2) has a bounded validity window; an abandoned, expired session doesn't block a genuine retry, but an active one does.

---

## 9. Amount and Currency Validation

**Server-side only, never trusting client input for the amount actually charged:**

- The `reference_amount_usd` for any payable entity (a booking, a workshop registration) is resolved server-side from the entity's own stored price at the moment checkout is initiated — never accepted as a parameter from the client request. This mirrors how existing form submissions (Enquiries, Workshop Registrations) already resolve authoritative values server-side rather than trusting client-supplied fields.
- The converted local-currency amount shown at checkout is computed server-side from the locked exchange rate (§2 of the architecture proposal), not computed client-side and merely displayed.
- On webhook receipt, the amount confirmed by the gateway is compared against the `converted_amount` recorded at checkout-initiation time. A mismatch beyond a small, explicitly-defined tolerance (to allow for legitimate gateway rounding) marks the payment `failed` rather than `completed` and raises a Sentry alert — never silently accepted.

---

## 10. Server-Side Quotation Validation

Extends §9: the *quotation itself* — the USD price for a booking, deposit, or workshop registration — is validated server-side against the authoritative source (the booking/workshop record, or a staff-set price on a project) at the moment checkout is initiated, not trusted from any client-supplied value, form state, or URL parameter. This closes the class of bug where a manipulated client request could attempt to check out at an arbitrary lower price.

---

## 11. Rate Limiting

**Reuses `src/lib/shared/rateLimit.ts` directly** — the same Redis-backed sliding-window limiter (10-minute window, atomic Lua-script evaluation, in-memory fallback) already protecting every public form-submission endpoint. Applied to:
- Checkout-initiation endpoints (prevents automated abuse attempting to probe pricing or spam checkout-session creation).
- The bank-transfer proof-upload endpoint (prevents storage abuse via repeated large uploads).

Webhook-receiving endpoints are **not** rate-limited the same way — they're authenticated by signature (§5), not by request volume, since the gateway itself controls webhook delivery rate; an artificial rate limit there would risk dropping legitimate provider retries.

---

## 12. Fraud and Suspicious-Payment Handling

Per `PAYMENT_COST_REGISTER.md` §2's explicit finding: **no dedicated third-party fraud-detection service is recommended at the modeled transaction volume** (20–400/month) — Paystack's and the Qatar candidates' built-in card-network fraud tooling (3D Secure where applicable, standard risk rules) is already priced into the transaction fee and is the appropriate control at this scale. What this design does add:

- **New — anomaly flag, not a block:** a payment whose amount, currency, or entity relationship falls outside expected bounds (e.g. an unusually large deposit relative to the entity's quoted price) is logged and surfaced to staff via the existing `activity_log`/admin notification pattern, not silently processed or silently rejected — a human reviews it, consistent with how the bank-transfer approval workflow (§14) already puts a human in the loop for the payment method with the least gateway-side fraud tooling.
- **Revisit trigger:** if a measured chargeback or fraud rate emerges post-launch, a dedicated tool becomes a reasonable reconsideration — explicitly not pre-built now (`PAYMENT_COST_REGISTER.md` §2).

---

## 13. Bank-Transfer Proof Security

- Proof-of-payment files (screenshots, PDFs) are uploaded to **private Supabase Storage**, using the same auth-gated upload pattern already proven for Portfolio media (`src/app/api/admin/portfolio`'s upload route: size/type validation, capability-gated). Payment proofs additionally require the uploader to be the authenticated owner of the payment record (or staff acting on their behalf), not just any authenticated user.
- **No public bucket, no public URL.** Files are never in a publicly-listable or publicly-readable bucket — access is exclusively through §14's signed-URL mechanism.
- File-type validation is allow-listed (image formats + PDF only), matching the existing Portfolio upload validation's approach rather than a deny-list.

---

## 14. Private Storage and Signed Access

- Proof-of-payment files are served exclusively via short-lived **signed URLs** generated server-side after an authorization check (the requester is the payment's owner, or staff/admin) — never a permanent public link, never embedded directly in an email or the database as a bare accessible path.
- This matches the storage-access pattern already required for any sensitive media on this platform and extends it specifically to financial-evidence documents, which carry higher sensitivity than portfolio images.

---

## 15. Role and Permission Controls

**Reuses the exact `WorkflowCapabilityMatrix` pattern already proven for Portfolio** (`src/lib/admin/portfolioPermissions.ts`, `hasCapability()`/`getGrantedCapabilities()` in `src/lib/workflow/engine.ts`) rather than inventing a new permission system:

- A new `PAYMENT_CAPABILITIES` matrix defines granular capabilities (e.g. `view_own`, `view_all`, `approve_bank_transfer`, `reject_bank_transfer`, `issue_refund`, `manage_bank_accounts`, `manage_currencies`) per role, following the same super_admin/admin-collapse and staff/contractor-tier pattern already established.
- **Clients** see only their own payment history (`user_id = auth.uid()` at the RLS layer, already written into the draft migration's `payments: own read` policy) — no capability grant can widen this, since it's enforced at the database level, not just in application code.
- **All payment writes happen server-side only** — the draft migration deliberately does not grant `authenticated`-role INSERT/UPDATE on `payments` (§4 of the earlier proposal), matching the existing enquiries/workshop_registrations pattern where all writes go through server actions or webhook handlers using the service-role client, never a direct client-side write.

---

## 16. Refund Authorization

- Refunds require a capability grant (`issue_refund` in the `PAYMENT_CAPABILITIES` matrix above) — not available to every staff member by default, matching the deliberate narrowness already used for `publish` in the Portfolio matrix.
- Every refund creates a **new** `payments` row with `payment_type = 'refund'` (architecture proposal §11) rather than mutating the original payment record — preserving the original charge's history intact and giving refunds their own audit trail entry.
- **New:** a refund action requires an explicit reason/note, stored on the refund row (reusing the `review_notes` field already in the draft schema) — no refund is issued without a recorded justification, mirroring the bank-transfer `review_notes` pattern.

---

## 17. Audit Logging

**Reuses the existing `activity_log` table and the Audit Identity Standard** (already documented as a platform-wide architectural rule — actor identity resolves via `profiles.member_number`, never a raw name, per the existing standard applied to Portfolio and every other audited action): every payment status transition (created, completed, failed, refunded, bank-transfer submitted/approved/rejected) writes an `activity_log` entry with the resolved actor identity — the customer for a self-service action, the resolved staff member for an approval/rejection/refund.

This gives the "permanent audit trail" requirement from the original scope for free, from infrastructure already proven platform-wide, rather than a new bespoke audit mechanism.

---

## 18. Backup and Recovery

- The `payments` table is covered by whatever Supabase backup/PITR strategy already governs every other production table on this project (documented in the existing `DISASTER_RECOVERY.md`) — no separate backup mechanism is being introduced, since Supabase's project-level backup doesn't distinguish by table.
- **New consideration specific to payments:** because `payments` is financial data, a restore-drill scenario should specifically verify that a restored `payments` table's `idempotency_key` uniqueness and `gateway_reference` values remain consistent with what the gateway's own transaction records show — a payments-specific addition to whatever the existing disaster-recovery drill already covers, not a wholesale new recovery process. This should be folded into the next scheduled Disaster Recovery review (Workstream H, still pending on the roadmap) once payments are live, rather than duplicating that document here.

---

## 19. Incident-Response Procedure

**New for payments specifically, layered on top of the existing Sentry-based error monitoring (Workstream C):**

1. A payment-webhook processing failure, signature-verification failure, or amount-mismatch (§9) triggers a Sentry alert tagged distinctly from general application errors (e.g. a `payments` Sentry tag/context), so it's triageable separately from routine errors.
2. **Suspected compromised key:** rotate the affected key immediately (§21) at the provider dashboard, which invalidates the old key; no code deploy is required for key rotation itself, only an environment-variable update — this is a deliberate design property of keeping keys out of code.
3. **Suspected double-charge or reconciliation mismatch:** staff use the reconciliation CSV export (architecture proposal §10, Phase 4) to compare Ordift's `payments` records against the gateway's own dashboard/settlement report — any discrepancy is investigated before any refund or correction is issued, not auto-corrected.
4. This procedure will be expanded into a fuller runbook once the Paystack integration is live and a first real incident-response drill can be run against it — this section establishes the mechanism, not a fully rehearsed runbook yet.

---

## 20. Secure Sandbox/Testing Rules

- Paystack (and any future Qatar provider) sandbox/test-mode keys are used exclusively in local development and the staging environment — never in production, matching the absolute staging/production credential-separation rule already enforced for Sanity datasets and Supabase projects throughout this project.
- **New:** a test-mode payment can never transition to `completed` against a production database — the payment-provider adapter checks `SITE_ENV`/the active Supabase project and refuses to process a test-mode webhook against a production-configured environment, and vice versa, as a defense-in-depth check beyond simply "using the right key."
- Sandbox transactions never touch real banking details — Ghana `bank_accounts` rows used in staging are clearly marked as test data, never real account numbers (consistent with §4's "no real banking details ever committed" rule extending to staging seed data too).

---

## 21. Production Credential Separation

Already covered by §4 and §20's environment-separation rules; restated here as its own explicit item per your request:
- **Staging:** Paystack test-mode secret key, staging Supabase project, staging `bank_accounts` rows (test data only).
- **Production:** Paystack live-mode secret key, production Supabase project, real `bank_accounts` rows (entered only after your explicit approval, never hardcoded).
- No credential, of any kind, is ever shared between the two environments — this project's standing rule, unchanged for payments.

---

## 22. Key Rotation

- **New:** Paystack (and future Qatar provider) secret keys should be rotated on a defined schedule (recommend annually at minimum, or immediately on any suspected exposure per §19) — rotation is a Vercel environment-variable update plus a corresponding key regeneration at the provider's dashboard, requiring no code change and no downtime if done correctly (update the env var, redeploy, then revoke the old key at the provider — not the reverse order).
- This rotation event, once it happens, is exactly the kind of change `PAYMENT_COST_REGISTER.md` §0's standing rule expects to be logged — not a new cost, but an operational event worth a note in that document's service register for traceability.

---

## 23. Logs and Sensitive-Data Redaction

- **New, explicit rule for this module:** no log statement (console, Sentry breadcrumb, or otherwise) in the payment code path ever includes a full card number (moot, since it's never received — §1), a full bank account number, a webhook's raw secret/signature value, or a full API key. Where logging a reference is useful for debugging (e.g. a bank account number for a manual bank-transfer review), only the last 4 digits are logged, matching common financial-industry log-redaction practice.
- Sentry's own data-scrubbing (enabled by default, and already configured via this project's `Sentry.init()` calls in `src/instrumentation.ts`/`src/instrumentation-client.ts`) provides a second layer, but the code-level rule above is the primary control — redaction shouldn't depend solely on a third-party tool's defaults.

---

## Summary: what's reused vs. genuinely new

| Control | Status |
|---|---|
| Idempotency store | Reused (`idempotency.ts`), with one deliberate fail-closed deviation for payments (§7) |
| Rate limiting | Reused (`rateLimit.ts`) as-is |
| Audit logging + actor identity | Reused (`activity_log` + Audit Identity Standard) as-is |
| Role/capability gating | Reused pattern (`WorkflowCapabilityMatrix`), new `PAYMENT_CAPABILITIES` matrix |
| Private storage + capability-gated upload | Reused pattern (Portfolio upload route), extended to proof-of-payment |
| Environment/credential separation | Reused existing project-wide rule, applied to gateway keys |
| Webhook signature verification | New (gateway-specific, no existing equivalent in this codebase) |
| Webhook replay/age check | New |
| Server-side amount/quotation validation | New |
| Duplicate-checkout prevention | New |
| Signed-URL access for proof-of-payment | New (extends the storage pattern's access mechanism) |
| Fraud anomaly flagging | New, deliberately lightweight per the cost-register finding |
| Payment incident-response procedure | New |
| Key rotation schedule | New (operational practice, not code) |
| Log redaction rule for financial data | New, explicit rule for this module |

This review will be re-run as a checklist against the actual implemented code once Phase 2 (Paystack integration) is built — see `PAYMENT_TEST_PLAN.md` for the corresponding test coverage for every item above.
