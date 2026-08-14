# Ordift Studios — Payment & Finance Module Architecture Proposal

**Status:** Proposal for review. No accounts created, no migrations applied, no gateway integrations written, no code committed, nothing pushed or deployed. Everything below is for your approval before any implementation begins.
**Date:** 2026-08-06 (four passes — see §19 for the pre-staging architecture review, and §16 for the staging application + verification + smoke-test results, now complete). **Migration 0024 is live on staging** (project `omtmxvsjmlrnbtxiesqn`) as of this pass — production remains completely untouched. Full cost detail lives in `PAYMENT_COST_REGISTER.md`; the security, UX, and test specifications live in `PAYMENT_SECURITY_REVIEW.md`, `PAYMENT_UX_SPEC.md`, and `PAYMENT_TEST_PLAN.md`.

**This document, together with `PAYMENT_COST_REGISTER.md` and `supabase/migrations/0024_payments_foundation.sql`, is the complete implementation-gate package you asked for:**

1. Final architecture — §1–3
2. Final schema — §4 (narrative) + the migration file itself
3. Migration plan — §14
4. Cost register — `PAYMENT_COST_REGISTER.md`
5. Third-party subscription register — `PAYMENT_COST_REGISTER.md` §7
6. Merchant onboarding checklist — §15
7. Production readiness checklist — §16

"Final" here means final **for the Ghana-first, Qatar-architecture-ready scope you approved** — the Qatar gateway selection itself stays open pending your direct vendor conversation, exactly as instructed, and nothing in this package treats that as blocking.

---

## 1. Corrected Scope

This is being built as a **platform service within Ordift Studios**, not a multi-tenant finance system. It covers:

- **Organizational boundary:** Ordift Studios and its internal departments/services, including **Royce Model Management** (operates under Ordift, not a separate tenant). Lavish and Cedar, Finds & Fits, PrimeWash, and any other independently-operated venture are explicitly out of scope and would need their own separate system if that's ever wanted.
- **Payable activities covered now or reserved for later, all under one Ordift entity:** photography/videography/design/branding/content bookings, studio/equipment rentals, workshops/Academy, Royce Model Management services, subscriptions/memberships, deposits/instalments/balances/full payments, and — reserved, not built — vendor/instructor/model/affiliate payouts.
- **Not built now, schema reserves space for:** invoices, quotations, discounts, promo codes, gift cards, subscriptions, installment plans, tax, financial reporting, client invoicing, vendor payouts, affiliate commissions.

This confirmed clean against the existing schema: the `businesses` table (migration `0001_init.sql`) already exists for "multi-business readiness" but holds only one row today (`ordift-studios`). No second row is added. Royce Model Management becomes a new entry in the same lightweight style as the existing service/pathway list (`src/lib/enquiry/pathways.ts`), not a new tenant.

---

## 2. USD-Reference / Local-Settlement Currency Model

**This is the most consequential finding from the research:** neither Ghana's Paystack nor either Qatar candidate settles in USD — Paystack settles GHS to a Ghana bank account, and both MyFatoorah and Dibsy settle QAR to a Qatar bank account (confirmed via direct ToS language for both; neither publishes a USD-settlement option). This means **conversion happens at checkout, every time, for every non-USD payment** — there is no way around it with any gateway researched. The architecture below is designed for that reality.

### What gets recorded, per payment (every field you asked for)

| Field | Purpose |
|---|---|
| `reference_amount_usd` | The original USD amount quoted (service price, workshop fee, etc.) — never silently changed |
| `payment_currency` | What the customer actually pays in (GHS, QAR, or USD for international cards where supported) |
| `exchange_rate` | USD → payment_currency rate used for this transaction |
| `exchange_rate_source` | `ordift` (we fetched it), `gateway` (provider supplied it), `issuing_bank` (customer's bank converted, rate unknown to us) |
| `exchange_rate_locked_at` | Timestamp the rate was fixed for this checkout session |
| `converted_amount` | reference_amount_usd × exchange_rate — what was shown to the customer before confirming |
| `amount_collected` | Actual amount collected (normally = converted_amount; differs for partial payments) |
| `settlement_currency` | Currency that actually lands in Ordift's bank account |
| `gateway_fee` | Provider's processing fee for this transaction |
| `net_amount_received` | amount_collected − gateway_fee |
| `provider` | paystack / myfatoorah / dibsy / bank_transfer |
| `conversion_performed_by` | `ordift` \| `gateway` \| `issuing_bank` \| `other` |

**Checkout UX requirement carried into the design:** both the USD quoted amount and the local-currency converted amount are shown before confirmation — never a silent currency switch. A disclosure notes the customer's own bank/card issuer may apply a separate rate or foreign-transaction fee outside Ordift's control.

**What the research found about each gateway's conversion model** (answering your 5 investigation questions):

| Question | Paystack (Ghana) | MyFatoorah / Dibsy (Qatar) |
|---|---|---|
| Charge in USD, settle in local currency? | Not found — Paystack Ghana appears to be GHS-in, GHS-out | Not confirmed for either — both default to QAR-in, QAR-out per their own ToS |
| Charge in local currency after USD conversion? | This is the working model | This is the working model for both |
| Multi-currency settlement? | Not evidenced | Not evidenced for either |
| Lock exchange rate for a checkout session? | Gateway doesn't expose this — **we lock it ourselves** at checkout | Same — **we lock it ourselves** |
| Return rate/settlement details via API/webhook? | Not confirmed | Not confirmed for either |

**Conclusion:** the exchange rate is **Ordift's own responsibility**, not the gateway's. **Revised per your Part 6 instruction (2026-08-06):** Phase 1 uses an **admin-controlled exchange rate** — a staff member enters/updates the USD→local-currency rate in the Admin Platform, rather than fetching it from an automatic FX-data API. That rate is locked onto the checkout session and stored permanently on the payment record (`exchange_rate`, `exchange_rate_source = 'ordift'`, `exchange_rate_locked_at`) exactly as before — only *where the number comes from* has changed, not the locking/recording mechanism itself. This removes a dependency (no FX API account needed for Phase 1, see `PAYMENT_COST_REGISTER.md` §2) and gives you direct, explainable control over the rate customers see. **Future, optional:** an automatic FX provider (Open Exchange Rates was the researched option) can be adopted later if a justified case for it emerges — not built now.

---

## 3. Gateway-Agnostic Architecture

```ts
interface PaymentProvider {
  readonly id: string; // "paystack" | "myfatoorah" | "dibsy" | "bank_transfer"
  readonly supportedCurrencies: string[];
  initCharge(params: ChargeParams): Promise<{ checkoutUrl: string; providerReference: string }>;
  verifyWebhookSignature(rawBody: string, headers: Headers): boolean;
  parseWebhookEvent(rawBody: string): PaymentWebhookEvent;
  refund(params: RefundParams): Promise<RefundResult>;
}
```

- **Provider selection is config-driven**, not hardcoded: a small `country → currency → provider` mapping. Adding a new country later means adding a config row and a new class implementing the interface — no changes to booking, workshop, or checkout code.
- **This mirrors patterns already proven in this codebase**: the `contentRepository` abstraction (Sanity swappable without touching pages), the Sanity write-helper abstraction, and the workflow engine's entity-agnostic design (`src/lib/workflow/`).
- **Real constraint surfaced by research, factored into the design:** none of Paystack/MyFatoorah/Dibsy has an actively-maintained official Node/TypeScript SDK. Each provider implementation is a hand-rolled REST client against the interface above — expected and budgeted for, not a surprise mid-build.

---

## 4. Database Schema & Migrations (proposed, not applied)

**Core `payments` table** — one row per transaction/attempt, polymorphic against any payable entity (reusing the exact `entity_type`/`entity_id` pattern already established in migration `0023_workflow_engine.sql` for `workflow_statuses`):

- Identity: `id`, `business_id` (defaults to Ordift, same pattern as every existing table), `record_id` (reuses the existing Record ID standard for a human-readable reference)
- What's being paid for: `entity_type` (`enquiry` | `workshop_registration` | future values added without schema change), `entity_id`
- **What governs this payment, if anything (added in the pre-staging architecture review):** `related_type`/`related_id` — a second, optional polymorphic reference distinct from `entity_type`/`entity_id`. `entity_type`/`entity_id` always answers "what is this settling"; `related_type`/`related_id` optionally answers "what scheduled or generated this specific payment" — a future subscription's billing cycle, an installment plan's scheduled charge, a payment link, a gift-card redemption. Nullable, unconstrained; every one of those future features reuses this pair without ever altering `payments` again.
- **Service-line reporting (added in the review):** `business_unit` — a lightweight, nullable classification (e.g. `photography`, `royce_model_management`) for future revenue-by-service reporting. Not a tenant boundary — the platform stays single-business.
- Currency/conversion fields: all 12 fields from §2, renamed `quoted_amount_usd` → **`reference_amount_usd`** (reads correctly once real Quotation/Invoice documents exist and this column is neither)
- **Reserved:** `tax_amount_usd` — nullable, not calculated or wired to any logic yet; promised in an earlier draft of this section and actually added to the schema now.
- Lifecycle: `payment_type` (`deposit` | `partial` | `balance` | `full` | `refund`), `payment_method` (`gateway` | `bank_transfer`), `status` (`pending` | `awaiting_verification` | `completed` | `failed` | `refunded` | `rejected`)
- Gateway linkage: `gateway_reference`, `idempotency_key` (unique — reuses `src/lib/shared/idempotency.ts` directly)
- **Safe payment metadata (added 2026-08-06):** `channel` (`mobile_money` | `card` | `bank` | `apple_pay` | `google_pay`, as reported by the gateway), `card_brand`, `card_last4` — masked/summary data only, straight off the gateway's own webhook payload, never a full card number or CVV (`PAYMENT_SECURITY_REVIEW.md` §3)
- Bank-transfer workflow: `proof_of_payment_asset_id`, `submitted_by`, `reviewed_by`, `reviewed_at`, `review_notes` — same shape as the existing Portfolio review workflow (`workflow_statuses`' `submitted_by`/`reviewed_by`/`review_notes`)
- **Reserved for a future accounting ledger (added in the review):** `posted_at` — nullable; null means "not yet posted to a general ledger." No `chart_of_accounts`/`ledger_entries` tables exist yet (deliberately, per your explicit "do not over-engineer" instruction) — this is the one attachment point a future ledger integration needs on this table. See the migration file's "Reserved for Future Accounting Ledger" section for the full documented design.
- Timestamps: `created_at`, `updated_at`

**Supporting tables:**
- `bank_accounts` — country, bank name, account name/number, IBAN/SWIFT where relevant, active flag. Displayed to the client based on selected country; Qatar row simply doesn't exist/isn't active until you create one, and the checkout UI degrades gracefully (Ghana available immediately, as you specified).
- `currencies` — code, name, symbol, active flag. Adding a currency later is a row insert.
- **`exchange_rates` (revised in the pre-staging architecture review) — append-only rate history**, not a single current-value row. Setting a new admin-controlled rate inserts a row (`currency_code`, `rate_to_usd`, `effective_from`, `updated_by`) rather than updating one in place, so past rates stay queryable for future reporting (e.g. valuing outstanding balances at day-end rates). A new `current_exchange_rates` view always returns the latest row per currency — application code (checkout, the Admin Platform) reads from the view and never needs to know history exists underneath. RLS enforces insert-only for staff (no update/delete policy) — a "correction" is a new row, never an edit to history.
- `payment_country_config` — country → default currency → provider mapping. Adding a country later is a row insert, not a schema change.
- **`payment_webhook_events` (added 2026-08-06)** — a full, append-only log of every webhook received from every provider, independent of `payments`' current-state view. This is the concrete mechanism behind "webhook events" and "reconciliation records" as safe metadata categories: `payments` holds current state, this table holds full history for reconciliation, replay-window checks (`PAYMENT_SECURITY_REVIEW.md` §6), and incident investigation.

**Reserved for future accounting (documentation only, no tables built):** per your explicit instruction, this migration does not build double-entry bookkeeping. It confirms the attachment point exists: a future `chart_of_accounts` + `ledger_entries` pair would use `source_type`/`source_id` — a third instance of the same polymorphic pattern used twice above — to reference whichever financial-event row (a `payments` row, a future `expenses` row, a future `payouts` row) produced each journal entry. `posted_at` (above) is the only thing `payments` needed for this; every other field a correct journal entry would need (`reference_amount_usd`, `converted_amount`, `settlement_currency`, `gateway_fee`, `net_amount_received`) is already there.

**Every payment status change writes to the existing `activity_log`** (Audit Identity Standard — actor resolves via `profiles.member_number`, not raw name), giving you the "permanent audit trail" requirement for free from infrastructure that's already proven platform-wide.

**How future features plug in without restructuring** (the actual mechanism behind "reserve space"):
- **Invoices, quotations, subscriptions, installment plans** — new `entity_type` values on the existing polymorphic `payments` table. No schema change to `payments` itself.
- **Discounts, promo codes, gift cards** — adjust `reference_amount_usd` before checkout via a future pricing-resolution step; the `payments` table already treats `reference_amount_usd` as a computed input, not a hardcoded list price.
- **Tax** — a nullable `tax_amount_usd` column, reserved now (cheap, low-risk to add today rather than migrate later), not wired to any tax-calculation logic yet.
- **Vendor payouts / affiliate commissions / client invoicing** — a future sibling `payouts` table (money flows out, not in) reusing the same `PaymentProvider` interface, since the research confirmed gateways treat charges and payouts as genuinely distinct capabilities anyway (MyFatoorah's Multi-Vendor supplier-payout feature is a separate mechanism from its charge API).

A draft migration file implementing this (`supabase/migrations/0024_payments_foundation.sql`) is included alongside this document — written, not applied. It follows this project's existing migration conventions exactly (RLS from creation, `business_id` default, comments explaining every non-obvious choice).

---

## 5. Ghana Provider: Paystack — confirmed plan

No change from the original recommendation; this research pass reconfirmed and refined it:

- **1.95% flat fee**, no domestic/international card split, **no fee cap** in Ghana (unlike Nigeria's ₦2,000 cap — matters for larger transactions)
- **$0 monthly/setup fee**
- Payout fees: GHS 1 (mobile money) / GHS 8 (bank), **T+1 settlement**
- Refund: free to issue, but **original transaction fee is not refunded** to you
- Chargebacks: $0 fee, Ghana disputes auto-accept if unanswered within 48 hours
- Official Node/TypeScript SDK exists and is actively maintained — Paystack is the only one of the three gateways researched with a real official SDK
- **Open item requiring your direct confirmation before go-live:** rolling-reserve policy (nothing published; a third-party review site flagged "held payouts" as a recurring complaint pattern — worth confirming directly with Paystack support before relying on same-day fund availability)

### 5.1 Ghana Phase 1 payment-method scope — clarified 2026-08-06

Phase 1 supports more than Mobile Money alone. All methods route through Paystack's own hosted checkout/popup/approved SDK — Ordift never builds its own card-entry form (`PAYMENT_SECURITY_REVIEW.md` §1).

| Method | Status |
|---|---|
| MTN Mobile Money | Enabled |
| Telecel Cash | Enabled |
| AirtelTigo Money | Enabled where currently supported by Paystack — read from what the hosted checkout actually offers, not hardcoded |
| Visa / Mastercard, Ghana-issued and international | Enabled, via Paystack-hosted checkout only |
| Apple Pay | **Enabled, gated** — shown only where Paystack has approved it for the Ordift Studios Ghana merchant account, on eligible devices/browsers/cards; requires domain registration/verification with Apple as a one-time Phase 2 prerequisite |
| Google Pay | **Kept in the config, not shown** — the `PaymentProvider`/method-list design already accommodates it (§3); it stays absent from the UI until Paystack officially confirms Ghana availability, at which point enabling it is a config change, not a rewrite of booking, workshop, or finance-module code |
| Bank Transfer | Enabled, Ordift-built flow (§10, Phase 3) — real Ghana banking details supplied by you before that phase goes live; not populated in Phase 1/2 |

**Settlement note, stated explicitly per your instruction:** Paystack does not settle directly in USD — this was already established in §2, restated here because it matters specifically for the Ghana plan: settlement currency and timing remain subject to the Ordift Studios Ghana merchant account and Paystack's own local arrangements, not something this architecture assumes or promises.

---

## 6. Qatar Provider Comparison — recommendation held provisional per your instruction

**Per your explicit instruction, no final selection is made.** Both MyFatoorah and Dibsy remain live candidates pending direct vendor contact. Summary of everything now known:

| | MyFatoorah | Dibsy |
|---|---|---|
| QCB license | Confirmed, April 2023 | Confirmed (via legal entity Paywise LLC), June 2023 |
| Track record | Founded 2015, ~90K merchants, Mastercard partnership | Founded 2020, $300K raised, younger |
| **Ghana-HQ eligibility** | ToS silent on foreign-HQ structures — genuinely unclear | **ToS explicitly requires Qatar Commercial Registration + Qatar ID of owners/partners** — a harder bar, strongly suggests a Qatar-registered subsidiary is required either way |
| Transaction fee (Qatar-specific) | **Not publicly confirmed** — all found figures are third-party estimates or from other MyFatoorah countries | **2.5% + QAR 1 flat**, confirmed directly from Dibsy's own ToS |
| USD settlement | Not confirmed | Not confirmed |
| Contract term | **1 year, auto-renewing, 30-day notice either way** | **No minimum term**, but Dibsy can terminate "at any time in its sole discretion" with no notice to you |
| Reserve policy | Bounded — "high-risk client transactions" | **Open-ended — "as long as it deems necessary," sole discretion** |
| Himyan (Qatar national card) | **No evidence anywhere** — confirmed absent, no roadmap found | **Confirmed live** — first provider in Qatar to enable Himyan on Apple Pay (2025/2026) |
| Marketplace/split-payment (future vendor payouts) | **Yes — genuine multi-vendor API**, but each sub-vendor requires its own KYC through MyFatoorah, and requires account-manager activation (not self-service) | None found |
| Standalone payout API (independent of marketplace) | Not found for either — the vendor-payout use case would require the full marketplace/sub-merchant relationship for whichever provider you choose | Not found |
| Webhooks | Documented signature (HMAC-SHA256, `MyFatoorah-Signature` header), configurable retries up to 5 | Documented 9-attempt exponential retry (1 min → 4h16m); **signing algorithm itself could not be confirmed** (site rate-limited during research) |
| Refunds | API-driven, partial refunds supported, fee-pass-through configurable | API-driven, but **Dibsy's own fee is never refunded to you** even on a refunded sale |
| Sandbox access | **Confirmed self-service**, no signed contract needed to start building | Plausibly self-service, not explicitly confirmed |
| Documentation | Deeper, more field-level, but fragmented across many pages | Cleaner presentation, real GitHub example repos (positive signal), but two competing doc domains (dibsy.one vs. dibsy.dev) and rate-limited during this research |
| Public review presence | Some 2025/2026 complaints about payment-hold delays (search-snippet evidence only) | **No review-platform presence found at all** — no independent user-sentiment signal exists |

**My reading, held as a lean not a decision, per your instruction:** MyFatoorah remains the stronger long-term foundation on contract terms, reserve-policy predictability, track record, and future marketplace capability. Dibsy's Himyan support is a real, specific advantage if that's a near-term requirement rather than nice-to-have. **The eligibility question is the one that actually matters most and is unresolved for both** — Dibsy's explicit Qatar CR + QID requirement suggests you'll need a Qatar-registered entity regardless of which provider you pick, which is worth confirming as a business-structure question independent of the gateway choice itself.

**Exact question list for your direct vendor conversations** (compiled from every unresolved item in the research):

*Both providers:*
1. Can a Ghana-headquartered company with a Qatar subsidiary/branch register as a merchant? What exact entity structure is required?
2. What is the actual Qatar-specific transaction fee schedule (domestic vs. international cards, mobile wallets)?
3. Does settlement support USD, or only QAR to a Qatar bank account?
4. What is the refund processing time back to the customer?
5. Is there a standalone payout-to-bank API separate from any marketplace feature, for future contractor/vendor payments?

*MyFatoorah specifically:* exact setup/monthly fee (conflicting "no fee" vs. "3,500 AED" signals found); Multi-Vendor feature's geographic/currency restrictions; any Himyan roadmap.

*Dibsy specifically:* exact webhook signing algorithm/header (couldn't be confirmed publicly); whether sandbox keys are available before KYB approval; Enterprise-tier pricing and volume threshold; whether Himyan will expand beyond Apple Pay.

---

## 7. Full Cost Register

**Moved to its own living document: [`PAYMENT_COST_REGISTER.md`](./PAYMENT_COST_REGISTER.md).** That document is now the source of truth for every gateway fee, infrastructure cost, the consolidated cost-summary table, three volume scenarios (low/medium/high, now including workshop registrations, refunds, and international-payment assumptions), and every account you need to create — kept separate from this architecture document because, per your instruction, it's meant to be updated every time any new third-party service is added to the project going forward, not just at payment-module launch.

Headline numbers from that document: at the modeled volumes, gateway fees run **~2.16%–2.37% of gross revenue** (dominated by the transaction-fee percentage, not infrastructure), and fixed mandatory infrastructure costs run **~$240–$864/year** depending on which tiers are active — a small, largely flat cost relative to gateway fees at every modeled scale. The Qatar-leg fee remains a placeholder (3.0% modeled) pending your direct vendor conversation.

---

## 8. Accounts You'll Need to Personally Create

Same division of labor as every other service this engagement — I write the code, you own the accounts:

1. **Paystack** (Ghana) — business account, KYC documents per §9
2. **MyFatoorah or Dibsy** (Qatar) — held until eligibility is confirmed via direct contact (§6)
3. **Sentry** — already requested for Workstream C, reusable here too for payment-webhook error monitoring
4. **Qatar bank account** — appears necessary for either Qatar gateway's settlement, independent of which one you choose

*(Open Exchange Rates, previously listed here, is no longer needed for Phase 1 — the exchange rate is admin-controlled, not API-fetched. See the correction in §2 above.)*

---

## 9. Documents Required for Onboarding

**Paystack (Ghana):** Registrar General's Department certificate, business information, bank/mobile-money details. No published onboarding fee.

**MyFatoorah:** Civil ID, Commercial License, Signature Authorization, Articles of Association, Commercial Register, Civil IDs of all owners, Civil ID of manager, Bank Account Letter, evidence of website/online presence.

**Dibsy** (fully confirmed list, direct source): Commercial Registration (CR), Trade License, Qatar ID (QID) of owners and partners, Computer Card (Establishment Card), Bank Confirmation Letter (IBAN, account holder name, stamp/signature), verified website or online presence.

---

## 10. Implementation Phases (Ghana-First — matches your Part 7 structure exactly)

**Prepared, not executed** — every phase below is design/sequencing only until you give explicit go-live authorization per phase, consistent with the standing "implement, test locally, validate thoroughly, review together, then deploy only after approval" workflow.

**Phase 1 — Payments foundation**
- `payments` / `bank_accounts` / `currencies` / `payment_country_config` / `exchange_rates` schema (draft migration `0024_payments_foundation.sql`, now including the `exchange_rates` table added for the admin-controlled rate — §2 above)
- Admin-configured exchange rates: an Admin Platform screen for staff to view/update the current USD→GHS (and later USD→QAR) rate, backing `exchange_rates`
- Payment ledger: the `payments` table itself, as the single source of truth for every attempt/transaction
- Payable-entity interface: the `entity_type`/`entity_id` polymorphic pattern, so bookings and workshop registrations (and future payable types) attach without a schema change
- Audit events: `activity_log` wiring for every payment-lifecycle transition, per the Audit Identity Standard
- Country-specific bank-account configuration: the `bank_accounts` table + its Admin Platform management screen

**Phase 2 — Paystack sandbox adapter**
- `PaymentProvider` interface implementation for Paystack
- Hosted checkout redirect flow
- Ghana cards and Mobile Money (via Paystack's unified hosted checkout, per `PAYMENT_UX_SPEC.md` §3)
- Webhook signature verification (`PAYMENT_SECURITY_REVIEW.md` §5)
- Idempotency (§7 of the same document)
- Payment-status synchronization (webhook → `payments.status` transitions)
- Receipts (generation + email delivery)

**Phase 3 — Ghana bank-transfer workflow**
- Private, capability-gated proof-of-payment upload
- Admin approve/reject UI in the existing Bookings module (`PAYMENT_UX_SPEC.md` §9)
- Customer notifications on approval/rejection
- Automatic continuation of the associated booking/workshop workflow after approval

**Phase 4 — Refunds, reconciliation, reporting basics, production-readiness review**
- Refund and partial-refund handling (new `payment_type = 'refund'` rows, never a mutation)
- Reconciliation: CSV export reusing the existing admin-report pattern
- Financial reporting basics (payment ledger views, not a full reporting suite — see §12's reserved items for anything beyond this)
- Full production-readiness review against `PAYMENT_TEST_PLAN.md` §20 / this document's §16, before any live-key go-live

**Phase 5 — Qatar adapter**
- Only after: the Qatar gateway is selected (§6, pending your direct vendor conversation), Qatar merchant eligibility is confirmed, the Qatar business bank account exists, written vendor pricing is in hand (no more "vendor quotation required" placeholders), and you give explicit authorization
- Everything in Phases 1–4 is architected so this phase is a new adapter + config rows, not a rebuild — the entire point of the gateway-agnostic interface (§3)

---

## 11. Security, Refund, Chargeback & Reconciliation Controls

- **Idempotency**: every webhook processed through the existing `src/lib/shared/idempotency.ts` — prevents double-charging on provider retry.
- **Webhook signature verification**: mandatory for every provider before any status update is trusted — no webhook payload acted on unverified.
- **Fail-closed on ambiguous webhook state**: matches this project's established philosophy throughout (staging gate, holding-page bypass, all fail closed).
- **Bank-transfer approval**: two-person-implicit control — client submits, staff (not the client) approves/rejects, `activity_log` records both the submission and the decision with actor identity.
- **Refund audit trail**: every refund a new `payment` row (`payment_type = 'refund'`), never a mutation of the original row — preserves full history.
- **PCI scope**: kept minimal by design — card data never touches Ordift's servers; all three gateways researched use hosted checkout/redirect flows.

---

## 12. Explicitly Reserved for Future Phases (not built now)

Invoices, quotations, discounts, promo codes, gift cards, subscriptions/memberships, installment plans (beyond basic deposit/balance), tax calculation, financial reporting dashboards, vendor payouts, affiliate commissions, client invoicing, dedicated accounting-software integration, currency-conversion rate shopping across multiple FX sources, multi-country provider expansion beyond Ghana/Qatar.

---

## 13. Open Decisions Before Implementation Can Fully Proceed

1. **Qatar gateway** — pending your direct vendor contact using the question list in §6.
2. **Qatar entity structure** — whether a Qatar subsidiary/branch is being formed, which affects both gateway eligibility and the bank-transfer account timeline.
3. **Himyan priority** — near-term requirement (favors Dibsy) or acceptable gap (favors MyFatoorah)?

Everything else in this document — the schema, the gateway-agnostic interface, the Ghana/Paystack integration, the bank-transfer workflow, the cost model structure — can proceed without waiting on the above, since the architecture was deliberately built not to hardwire the Qatar decision.

---

## 14. Migration Plan

Follows the exact discipline used for every migration on this project so far (0001 through 0023) — nothing here is new process, just applied to this specific migration.

1. **Review** — you review `supabase/migrations/0024_payments_foundation.sql` line by line (already written, not applied). Confirm the field list, RLS policies, and reserved-space comments match what you approved in §1–4.
2. **Apply to staging first** — run the migration against the staging Supabase project only (`omtmxvsjmlrnbtxiesqn`), the same project used for every other feature's pre-production verification this engagement.
3. **Read-only verification on staging** — confirm via a disposable read-only script (the same pattern used for every prior migration): all 6 tables (`currencies`, `bank_accounts`, `exchange_rates`, `payment_country_config`, `payments`, `payment_webhook_events`) plus the `current_exchange_rates` view exist with the expected columns, RLS is enabled on all 6 tables, the 3 seeded currencies, the seeded USD `exchange_rates` row, and the 1 seeded `payment_country_config` row (Ghana only) are present, no Qatar row was accidentally created, and the `payment-proofs` Storage bucket exists as private.
4. **Local build/typecheck/lint** against staging — confirms nothing in the existing app breaks by the schema simply existing (expected: nothing does, since no application code reads/writes these tables yet at this stage).
5. **Do not apply to production yet.** Production application only happens as part of the live-implementation phase you authorize after this review — not automatically once staging looks correct.
6. **When production application is authorized:** apply during a low-traffic window, immediately followed by the same read-only verification as step 3 run against production, before any Paystack integration code is deployed to reference these tables.
7. **Rollback plan:** since no application code depends on these tables until the Paystack integration phase begins, a clean rollback before that point is simply dropping the 6 new tables/view and the `payment-proofs` bucket — no data migration risk, no existing table is altered. This safety property goes away once real payment rows exist, which is why steps 2–4 happen well before any live gateway is connected.

**What this plan deliberately does not do yet:** add a Qatar row to `payment_country_config`, add a Qatar `bank_accounts` row, populate a real GHS/QAR `exchange_rates` row, or write any application code that reads/writes `payments` — all of that is downstream of the decisions still pending in §13 and the go-live authorization itself.

---

## 15. Merchant Onboarding Checklist

Consolidated view of what you need to do, in dependency order — full detail (documents, fees, confidence levels) lives in `PAYMENT_COST_REGISTER.md` §5–6.

**Mandatory for Ghana rollout (can start now):**
- [ ] Create Paystack business account (Registrar General's Department certificate, business info, bank/mobile-money details)
- [ ] Confirm Paystack's rolling-reserve policy directly with their support — the one open item flagged in §5, not published anywhere
- [ ] Create/confirm the Ghana `bank_accounts` row's real banking details (bank name, account name/number) for the manual bank-transfer channel
- [ ] Confirm who (which role) will maintain the admin-controlled exchange rate day-to-day, and how often it should be updated (§2's revised currency model — no FX API account needed)
- [ ] Create/activate Sentry account and provide the DSN (already blocking Workstream C independently of payments)

**Mandatory for Qatar rollout (held per your instruction — do not start until eligibility + commercial terms are confirmed):**
- [ ] Direct vendor conversation with MyFatoorah and Dibsy using the question list in §6
- [ ] Resolve the Qatar entity-structure question (whether a Qatar subsidiary/branch is required) — this is a business decision independent of which gateway is chosen
- [ ] Once resolved: create the selected gateway's merchant account (document checklist in `PAYMENT_COST_REGISTER.md` §6)
- [ ] Open a Qatar bank account for settlement + the manual bank-transfer channel

**Not needed at current scope (explicitly deferred, see `PAYMENT_COST_REGISTER.md` §2):**
- [ ] Dedicated fraud-detection service — not recommended at modeled volume
- [ ] PCI compliance-automation tooling — the underlying obligation is met at $0 cost via self-assessment, given the hosted-checkout architecture
- [ ] Dedicated accounting/reconciliation software — CSV export covers current scope

---

## 16. Staging Verification Results (2026-08-06) — COMPLETE

Migration `0024_payments_foundation.sql` applied to **staging only** (project `omtmxvsjmlrnbtxiesqn`) via `supabase db push` — the project's established CLI-based migration pipeline, confirmed by `supabase migration list` showing local/remote match for 0024 and every prior migration (0001–0023) applied the same way. **Production untouched.**

**Schema verification — ✅ all passed**
- [x] All 6 tables (`currencies`, `bank_accounts`, `exchange_rates`, `payment_country_config`, `payments`, `payment_webhook_events`) exist and are queryable
- [x] `current_exchange_rates` view returns the correct latest-per-currency row (confirmed: USD @ 1.0)
- [x] Seed data correct: 3 currencies, 1 USD exchange-rate row, 1 Ghana/Paystack `payment_country_config` row, **no Qatar row**
- [x] `bank_accounts` empty — no real banking details anywhere on staging
- [x] `payment-proofs` Storage bucket exists, **private** (`public: false`), correct 8MB limit and MIME allowlist
- [x] RLS genuinely enforced, not just present in the SQL — verified with the **anon** (unauthenticated) key, not just service-role: reference-data reads return empty without an authenticated session (by design — checkout only happens post-login), an `exchange_rates` INSERT attempt was rejected by its RLS policy, and a `payments` INSERT attempt was rejected (no `authenticated`-role grant exists at all)

**Smoke tests — results, stated exactly as tested**

| Test | Result | Detail |
|---|---|---|
| Currency / exchange-rate lock | ✅ Pass | `current_exchange_rates` read correctly; `exchange_rate`/`exchange_rate_source`/`exchange_rate_locked_at` populate correctly on a payment row |
| Bank-transfer workflow (enquiry entity) | ✅ Pass | pending → awaiting_verification → completed transitions correct; `enquiries.amount_paid`/`payment_status` synced correctly after approval |
| Bank-transfer workflow (workshop_registration entity) | ✅ Pass | Same lifecycle independently confirmed against the other entity type — `checkoutService`/sync logic's `entityType === "enquiry" ? ... : "workshop_registrations"` branch exercised, not assumed |
| Receipt generation | ✅ Pass | `sendPaymentReceiptEmail()` (the real function) ran against a real completed payment, resolved the correct email, and correctly logged instead of sending (staging, `FORMS_SENDING_ENABLED` unset) |
| Paystack webhook — signature verification | ✅ Pass | Real HTTP request to the real running route: invalid signature → 401; valid signature → 200 and processed |
| Paystack webhook — tampered/wrong-secret signatures | ✅ Pass | Both correctly rejected (pure-function test against `paystackProvider.verifyWebhookSignature`) |
| Paystack webhook — amount/channel/fee mapping | ✅ Pass | A synthetic `charge.success` payload correctly produced `status=completed`, `amount_collected=1875` (GHS), `channel=mobile_money`, `gateway_fee` populated |
| Paystack webhook — idempotency on replay | ✅ Pass | Second identical delivery → `processed:false`, **no** double status-update, **no** double entity-sync. (One correction made mid-test: `payment_webhook_events` correctly logs a **new row per delivery, including replays** — that's the intentional "full audit trail" design, not a bug; my first test assertion wrongly expected dedup at the logging layer instead of the processing layer, caught and fixed before reporting this result.) |
| Payment capability gating (`PAYMENT_CAPABILITIES`) | ✅ Pass | staff can approve/reject bank transfers but not issue refunds; admin can; client can do neither — matrix behaves exactly as designed |

**What was NOT tested this pass, and why — stated honestly, not glossed over:**
- **A genuine Paystack sandbox checkout** (a real `initCharge()` call returning a real hosted-checkout URL) — blocked on `PAYSTACK_SECRET_KEY`, which doesn't exist yet because no Paystack account has been created (still a pending "account to create" item, `PAYMENT_COST_REGISTER.md` §4). Everything *around* that call (amount resolution, rate lock, payment-row creation, webhook processing of the result) was tested; the actual outbound API call to Paystack itself was not.
- **The authenticated HTTP paths** for checkout initiation, bank-transfer proof upload, and admin approve/reject — tested via their equivalent direct database operations (same writes those code paths perform), not via a real logged-in browser session. This validates the data model and RLS correctly, but not the `getCurrentUser()`/cookie-session/capability-check wrapper code itself.
- **`activity_log` entries for bank-transfer decisions** — not directly confirmed in this pass (the smoke test exercised the underlying data operations, not the actual server actions that call `logActivity()`).
- **Refunds** — the schema and capability (`issue_refund`) exist; no refund server action was built in Phase 2 (bank-transfer approve/reject was the Phase 2 focus). Flagged as not yet implemented, not as untested.
- **Sentry catching a real payment-webhook error** — Sentry remains not yet activated (pending your DSN, independent of payments).
- **Reconciliation CSV export** — reserved for Phase 4 (§10), not built yet.

**How this was applied — following your explicit preference:** `supabase db push`, the project's standard CLI pipeline (dry-run previewed first), not manual SQL Editor pasting — confirmed as the actual historically-used mechanism for this project via `supabase migration list` before running it.

**Rollback:** not exercised, because the migration succeeded cleanly with no errors — per your own framing ("confirmation that rollback has been tested *if the migration fails*"), it didn't fail, so there was nothing to roll back. The documented plan (§14 step 7) remains accurate and unchanged: before any real (non-test) payment row exists, rollback is dropping the 6 tables/view/bucket, verified accurate against what was actually applied.

---

## 16a. Production Readiness Checklist (still a template — production untouched)

**Reconciliation (2026-08-10, Production Readiness Reconciliation) — read this before the checklist below, which is preserved exactly as originally written (2026-08-06) rather than edited in place.** Substantial work has happened since this checklist was drafted, per `PAYSTACK_PRODUCTION_HANDOVER.md` §6–§7 and `WORKSTREAM_I_SECURITY_REREVIEW.md`. Item-by-item update, citing evidence rather than asserting from memory:

- **Now satisfied, evidence-backed:** webhook signature verification against a **real** Paystack test-mode webhook (not just a synthetic payload) — `signature_valid: true` confirmed on a real event (handover §6). A deposit-accumulation lifecycle was exercised via a real sequence of Mobile Money transactions (`PAY-2026-000002` through `-000007`) reaching the enquiry's full `$200/$200` — not a single explicitly-labeled "deposit→balance→full" test run, but functionally equivalent coverage, confirmed via direct database queries, not just the UI. Mobile Money end-to-end is separately marked ✅ COMPLETE in the handover document.
- **Likely satisfied, not independently re-verified this pass:** the checkout UI showing both USD and local amounts — built and UX-verified per this project's task history, but this reconciliation didn't re-open the checkout page code to confirm directly; treat as probable, not certain.
- **Resolved 2026-08-10, real evidence, not just database-equivalent operations:** proof-of-payment upload and staff approve/reject were tested via a genuine authenticated HTTP session — a real `signInWithPassword` call against Supabase Auth (not the CAPTCHA-gated login form; Turnstile was never touched, per this project's standing rule against ever attempting to solve/bypass it) for both a disposable client and a disposable staff account, real `PUT`/`POST` requests to the actual `bank-transfer/proof` Route Handler, and real clicks on the actual `/admin/payments` admin UI for both the Approve and Reject paths. Both fully verified end-to-end: correct `payments.status` transitions (`awaiting_verification` → `completed` / `rejected`), correct `reviewed_by`/`reviewed_at`/`review_notes`, correct entity sync (`amount_paid`/`payment_status` updated on approval, left untouched on rejection), and a real authorization-boundary check (a client-tier session requesting `/admin/payments` directly gets a 307 to `/portal`, never reaching the page). One genuine gap found in the process: `activity_log` entries exist for the staff **decision** (`payment.bank_transfer_approved`/`_rejected`) but not for the client's own **submission** — logged as new tech debt, **TD-033**, low severity. A refund action — still not built (Phase 2 focus was bank-transfer approve/reject, not refunds). Reconciliation CSV export — still Phase 4, not built. Sentry **specifically catching a payment-webhook error** — Sentry itself now works on staging (verified via a generic test exception, not a payment-specific one), but the payment-specific Sentry tag/context this document's own §19 describes has not been separately confirmed live.
- **Cannot be marked from this session at all:** "you have reviewed a real (sandbox) transaction end-to-end and approved it" and "explicit go-live authorization received" are your own sign-offs, not engineering facts — neither has been given as of this reconciliation.

See `PRODUCTION_READINESS_RECONCILIATION.md` for how these feed into the platform-wide Production readiness verdict, not just the payments module in isolation.

---

This remains exactly what it was: the checklist for the **separate, future production-approval gate** you named — not started, not implied by the staging work above.

**Architecture & schema**
- [ ] Migration 0024 applied to production and read-only verified (§14)
- [ ] `payment_country_config` production row confirms Ghana/Paystack only — no premature Qatar row

**Gateway integration (Ghana)**
- [ ] Paystack webhook signature verification tested against **real** Paystack test-mode webhooks (staging confirmed the route's logic correctly against synthetic signed payloads; a real Paystack-originated webhook is the remaining confirmation once an account exists)
- [x] Idempotency confirmed on staging — carries forward, same code
- [ ] A full deposit → balance → full-payment lifecycle tested end-to-end on Paystack's real test/sandbox mode
- [ ] A refund action built and tested end-to-end (not yet implemented — see above)

**Currency model**
- [x] Rate lock tested on staging — carries forward, same code
- [ ] Checkout UI built and confirmed to show both USD and local amounts (Phase 2 UI was deliberately minimal; full UX Spec implementation is a follow-up)
- [x] `exchange_rate_source`/`conversion_performed_by` confirmed populating correctly on staging

**Bank transfer workflow**
- [ ] Proof-of-payment upload tested via a real authenticated HTTP request with real file bytes (staging tested the equivalent DB operations only)
- [ ] Staff approve/reject flow tested via a real authenticated session (staging tested the equivalent DB operations only)
- [ ] `activity_log` entries confirmed for both submission and decision via the real server actions

**Security**
- [x] No webhook payload acted on without signature verification — confirmed on staging
- [x] `payments` table has no direct `authenticated`-role write grant — confirmed on staging via anon-key denial test
- [x] Real banking details never committed to git — confirmed, `bank_accounts` empty on staging

**Operational**
- [ ] Sentry actively catching payment-webhook errors (Sentry not yet activated)
- [x] Receipt generation + delivery tested on staging — carries forward, same code
- [ ] Reconciliation CSV export (not yet built — Phase 4)

**Sign-off**
- [ ] You have reviewed a real (sandbox) transaction end-to-end and approved it before any production Paystack key is used
- [ ] Explicit go-live authorization received before switching from Paystack test-mode keys to live keys in production

---

## 17. Business and Currency Boundaries — Confirmed

Restated explicitly, as your instruction requested, so this document carries its own confirmation rather than relying on conversation history:

1. **This payment system belongs solely to Ordift Studios.** Confirmed — §1.
2. **Royce Model Management remains an internal Ordift Studios department/pathway, not a separate merchant or tenant.** Confirmed — §1; it joins `src/lib/enquiry/pathways.ts`'s existing lightweight service list, not the `businesses` table.
3. **Lavish and Cedar and Finds & Fits will use separate websites and are not payment tenants in this implementation.** Confirmed — §1, explicitly out of scope.
4. **USD remains the reference and quotation currency.** Confirmed — §2, `reference_amount_usd` on every payment row.
5. **Ghana customers are charged the recorded GHS equivalent.** Confirmed — §2, `converted_amount` in `payment_currency = 'GHS'`.
6. **Qatar customers will be charged the recorded QAR equivalent, once live.** Confirmed — same mechanism, `payment_currency = 'QAR'`, held until Phase 5.
7. **Every conversion records reference USD amount, local amount, exchange rate, rate source, timestamp, and any manual override.** Confirmed — §2's field table: `reference_amount_usd`, `converted_amount`, `exchange_rate`, `exchange_rate_source`, `exchange_rate_locked_at`; a manual override is simply staff inserting a new `exchange_rates` row before a given checkout locks onto it — no separate override field needed since the admin-controlled rate model makes every rate change already a recorded, attributed action (`exchange_rates.updated_by`/`effective_from`). **Updated in the pre-staging architecture review:** `exchange_rates` is now an append-only history (a new row per rate change, never an update-in-place) rather than a single current-value row, so past rates remain queryable for future financial reporting — see §4 below.
8. **Gateway settlement may occur in local currency even though the quote is referenced in USD.** Confirmed — §2's entire premise; `settlement_currency` is recorded separately from `payment_currency` for exactly this reason.
9. **Start with an admin-controlled exchange rate unless a justified automatic FX provider is approved later.** Confirmed and implemented in this revision — §2's 2026-08-06 correction, the new `exchange_rates` table (§4/migration file), and the removal of Open Exchange Rates as a Phase 1 dependency (`PAYMENT_COST_REGISTER.md` §2).
10. **Bank-transfer account details must be country-specific and configurable in the Admin Platform.** Confirmed — `bank_accounts` table, §4, with its own Admin Platform management screen in Phase 1 (§10).
11. **Ghana account details may be activated when approved.** Confirmed — Phase 1/3 sequencing (§10); no Ghana `bank_accounts` row is populated until you provide the real details.
12. **Qatar account details must remain unavailable until the Qatar business account exists and is explicitly approved.** Confirmed — the draft migration deliberately seeds zero Qatar rows (§4's comment in the migration file), and Phase 5 is explicitly gated on this.
13. **Never store real banking details in source code, migration files, or public CMS content.** Confirmed — `PAYMENT_SECURITY_REVIEW.md` §4 states this as an explicit rule; the draft migration seeds no real banking data anywhere, and `bank_accounts` is never exposed through any Sanity-fed public query.

---

## 18. Future Capability Reservations — Confirmed Clean Interfaces (Part 5)

Restating §12 with explicit confirmation that each reserved item has a real, already-designed attachment point — not just a name on a list:

| Reserved item | How it attaches later, without a foundational rewrite |
|---|---|
| Invoices, quotations | New `entity_type` values on the existing polymorphic `payments` table |
| Discounts, promotional codes | A future pricing-resolution step adjusts `reference_amount_usd` before checkout — the field is already treated as a computed input, not a hardcoded price |
| Gift cards | A future `payment_method` value (`gift_card`) alongside the existing `gateway`/`bank_transfer` values |
| Subscriptions and memberships | New `entity_type` value + a future recurring-schedule table referencing `payments` the same way `workflow_assignments` references `workflow_statuses` |
| Instalment plans (beyond deposit/balance) | An extension of the existing `payment_type` enum, not a new table |
| Tax and VAT | A reserved nullable `tax_amount_usd` column, cheap to add now, deliberately not wired to calculation logic yet |
| Financial reporting | Reuses the existing admin-report registry pattern (`src/lib/admin/reports` equivalent) already proven for operational reports |
| Vendor payouts, affiliate commissions | A future sibling `payouts` table reusing the same `PaymentProvider` interface — money flows out instead of in, confirmed as a genuinely distinct capability in the gateway research (MyFatoorah's Multi-Vendor feature is separate from its charge API) |
| Client statements, credit notes | A read-model over existing `payments` rows (statements) and a new `payment_type = 'credit_note'` value (credit notes) — no schema restructuring |
| Additional countries, currencies, gateways, payment methods | `payment_country_config`/`currencies` row inserts + a new `PaymentProvider` implementation — the entire point of §3's gateway-agnostic interface |

None of these are built now. This table exists so "the architecture can support it later" is a traceable claim, not an assertion.

---

## 19. Pre-Staging Architecture Review — Incorporated

Your 5-10 year Finance-module review (2026-08-06) approved all five schema recommendations plus one naming change and one new reservation. All incorporated into `supabase/migrations/0024_payments_foundation.sql` and every dependent application file, still not applied anywhere:

1. **`related_type`/`related_id`** — a second, optional polymorphic reference on `payments`, distinct from `entity_type`/`entity_id`. Future subscriptions, installment plans, payment links, and gift-card redemptions attach here without ever altering `payments` again.
2. **`business_unit`** — lightweight, nullable service-line classification for future revenue-by-service reporting. Not a tenant boundary.
3. **`tax_amount_usd`** — reserved, nullable, unwired. Closes a gap where an earlier draft of this document promised the field but it was never actually added to the SQL.
4. **`exchange_rates` converted to append-only history** — a new row per rate change instead of an update-in-place, with a `current_exchange_rates` view returning the latest row per currency. RLS enforces insert-only for staff. This was the one item genuinely more expensive to defer than to do now.
5. **`exchange_rate_source` CHECK constraint added** — it was missing one while `conversion_performed_by` (the same enum) had one; now consistent, and both columns' distinct purposes are documented in-line so a future reader doesn't collapse them into one.
6. **Renamed `quoted_amount_usd` → `reference_amount_usd`** — reads correctly once real Quotation/Invoice documents exist and this column is neither.
7. **Reserved for a future accounting ledger** — `payments.posted_at` (nullable — "not yet journaled") is the only schema change. No `chart_of_accounts` or `ledger_entries` table is built, per your explicit "do not over-engineer, documentation is sufficient" instruction. The migration file's bottom section documents the intended future design: a `ledger_entries` table with `source_type`/`source_id` — a third instance of the same polymorphic pattern used twice above — referencing whichever financial-event row (a `payments` row, a future `expenses` row, a future `payouts` row) produced each journal entry. Every other field a correct multi-currency journal entry would need is already on `payments` today.

**On keeping Finance bigger than Payments, restated:** every item above extends `payments`' own reach into what governs or classifies a transaction — it does not add invoice, subscription, or ledger *logic* to this table. Every one of those stays a future, separate table. The discipline that keeps Payments one component of Finance rather than Finance becoming an extension of Payments — narrow table, wide attachment points — held through this review and, per your approval, is now reflected in the schema itself.

---

## 20. Production Readiness Phase (2026-08-06) — live-service validation

Per your request, this phase focused on validation rather than architecture. Three items are genuinely blocked or need a decision from you — named here first, before the results, since they affect what "production readiness" can honestly mean right now.

### 20.1 Blockers and one decision — need your input

1. **~~No Paystack account exists yet.~~ PAYSTACK ACCOUNT CREATION — RESOLVED (2026-08-07).** The Ghana Paystack merchant account has been created and you can access the Merchant dashboard. `PAYSTACK_SECRET_KEY` still isn't set anywhere yet (confirmed empty in `.env.local`) — account creation is a separate milestone from merchant verification, test-credential retrieval, and sandbox integration, none of which are assumed complete here. This unblocks the Credential Onboarding + Real Sandbox Integration phase, tracked separately as it progresses.
   <details><summary>Original blocker text, for record</summary>No Paystack account exists yet. `PAYSTACK_SECRET_KEY` has never been set anywhere (confirmed empty in `.env.local` throughout this engagement). This blocks the one item on your list I cannot substitute for: real Mobile Money and card transactions through Paystack's actual sandbox. Everything *around* that call — amount resolution, currency lock, payment-row creation, webhook processing of the result, idempotency, entity sync — has been tested thoroughly (§20.2 below) using synthetic-but-correctly-signed payloads against the real running route. The one thing that cannot be tested without an account is Paystack's own hosted checkout page actually accepting a Mobile Money or card payment. Needed from you: create the Paystack account (Registrar General's certificate, business info — `PAYMENT_COST_REGISTER.md` §6), generate test-mode API keys, and share the test-mode secret key so I can run this specific test.</details>

2. **The client-facing checkout and bank-transfer UI was never built.** Phase 2 was deliberately scoped to backend + a minimal admin review page (`/admin/payments`) — the actual customer-facing "Pay Now" flow, method selection, and bank-transfer submission screens described in `PAYMENT_UX_SPEC.md` don't exist as real pages yet. This means **"mobile browser testing" of the payment experience isn't meaningful yet** — there's no customer-facing flow to test on a phone. **Decision needed:** do you want me to build that UI now, as part of this Production Readiness phase (a real scope addition — the full checkout/method-selection/bank-transfer-submission screens from the UX Spec), or should this phase's mobile-testing scope narrow to what actually exists today (the `/admin/payments` review page, which I can test on the iOS Simulator now), with the customer-facing UI built as a named follow-up before launch?

3. **Sentry is still not activated** (pending your DSN, tracked since Workstream C, independent of payments). This doesn't block anything in this phase, but it directly affects how meaningful a "launch-day monitoring checklist" can be — the checklist below documents what *should* be watched, but nothing is actually watching it yet.

### 20.2 What was fully tested this pass — real results

**End-to-end email:** the payment-receipt template and trigger logic (`sendPaymentReceiptEmail()`) were already confirmed correct in the staging pass (§16). Genuine inbox delivery wasn't re-proven here because `RESEND_API_KEY` isn't present locally either — it lives only in Vercel's deployed environment (the same "Sensitive" env var pattern that made `LAUNCH_HOLDING_PAGE` unreadable via `vercel env pull` earlier in this engagement). This isn't a new gap specific to payments: Resend's actual delivery pipeline was already hardened and proven in production during the email-infrastructure workstream, and payments reuses that exact pipeline unchanged. If you want one additional real send as extra reassurance, adding `RESEND_API_KEY`/`EMAIL_FROM_ADDRESS` to `.env.local` (same pattern as every other credential already there) would let me run it directly.

**Private payment-proof storage — ✅ fully tested, real bytes:**
- A real PNG file uploaded to the `payment-proofs` bucket
- A signed URL generated and used to retrieve it — bytes matched exactly
- Bucket confirmed still private (`public: false`)
- Unauthenticated (anon-key) download attempt: denied ("Object not found" — RLS hides existence, doesn't just reject access)
- Unauthenticated upload attempt: denied by RLS policy

**Light concurrency testing — ✅ fully tested against the real running route and real staging DB:**
- 10 identical webhook deliveries fired **simultaneously** at `/api/payments/webhook/paystack` → exactly 1 processed, 9 correctly identified as duplicates, final payment state correct (not corrupted by the race — `amount_collected` and entity `amount_paid` both landed on the single correct value, not summed or doubled)
- 5 concurrent database inserts sharing the same `idempotency_key` → exactly 1 succeeded, confirming the unique constraint holds under a genuine race, not just sequential calls
- All test data (including 10 webhook-event rows the concurrency test itself generated) cleaned up and independently re-verified empty afterward

**iOS mobile testing:** not yet run — waiting on your answer to the decision in §20.1 item 2, since testing the admin review page alone vs. testing a real checkout flow are different-sized tasks. Android: no emulator tool is available to me; that would need either your own device or a decision to rely on responsive-viewport testing in the Browser pane as a proxy.

### 20.3 Rollback — reviewed, not executed

Per your own framing last round ("confirmation that rollback has been tested *if the migration fails*") — it didn't fail, and staging now has no throwaway/disposable copy to safely drop-test against, so this is a careful line-by-line review against what was actually applied, not a live execution:

```sql
-- Correct order: dependents before what they depend on.
begin;
drop policy if exists "payment-proofs: owner or staff upload" on storage.objects;
drop policy if exists "payment-proofs: owner or staff read" on storage.objects;
delete from storage.objects where bucket_id = 'payment-proofs'; -- no-op today, empty
delete from storage.buckets where id = 'payment-proofs';

drop table if exists public.payment_webhook_events; -- references payments.id, must drop first
drop table if exists public.payments; -- references businesses/profiles/currencies

drop table if exists public.payment_country_config; -- references currencies
drop view if exists public.current_exchange_rates; -- depends on exchange_rates
drop table if exists public.exchange_rates; -- references currencies, profiles
drop table if exists public.bank_accounts; -- references businesses, currencies

drop table if exists public.currencies; -- referenced by all the above, must be last
commit;
```
Reviewed against the applied migration line by line: every `create table`/`create view`/`create policy`/storage insert in `0024_payments_foundation.sql` has a corresponding line above, in reverse dependency order. No production system depends on any of this yet, so this remains genuinely low-risk if it's ever needed.

### 20.4 Production Deployment Checklist

**Before deploying:**
- [ ] Blockers in §20.1 resolved (Paystack account decision made, UI-scope decision made)
- [ ] `git add`/commit/push only after your explicit review of the diff (nothing has been committed this entire payment-module effort — nine files of code plus six documents are still local-only)
- [ ] `PAYSTACK_SECRET_KEY` (live-mode, once Ghana go-live is authorized — test-mode key for a Preview/staging deploy first) added to Vercel as a **Production**-scoped, Sensitive environment variable — never in a `.env` file, never in a doc
- [ ] Confirm `LAUNCH_HOLDING_PAGE` behavior is unaffected — this payment work has never touched `proxy.ts` or that flag
- [ ] Migration 0024 applied to **production** Supabase, using the same `supabase db push` pipeline, only after this checklist and §16a are both fully green
- [ ] Post-migration production read-only verification (same checks as §16, run against production)

**Deploying:**
- [ ] Deploy via the normal `git push` → Vercel auto-deploy pipeline (same as every other feature this engagement)
- [ ] Confirm the new `/admin/payments` route and `/api/payments/*` routes are reachable in the production deployment
- [ ] Confirm no console/build errors introduced (same `tsc`/`lint`/`build`/`test` gate already clean locally)

**Immediately after:**
- [ ] One real Paystack test-mode transaction run against production infrastructure (test keys, real infra) before ever switching to live keys
- [ ] Confirm real banking details are entered directly in the Admin Platform (Settings), never via a migration or script
- [ ] Explicit go-live authorization from you before swapping test-mode Paystack keys for live-mode ones

### 20.5 Launch-Day Monitoring Checklist

**What to watch, and where (once Sentry is active — see §20.1 item 3):**
- [ ] Sentry: payment-webhook errors tagged distinctly from general application errors (`PAYMENT_SECURITY_REVIEW.md` §19's incident-response design)
- [ ] `/admin/payments` Pending Verification queue checked at least daily during the first launch week
- [ ] `payment_webhook_events` spot-checked for any `signature_valid: false` rows (a real invalid-signature attempt is worth investigating immediately, not just logging)
- [ ] Resend delivery — confirm receipt emails are actually landing (not just logged), since `FORMS_SENDING_ENABLED`/production-sending must be genuinely on for payments to notify anyone
- [ ] First few real `payments` rows manually cross-checked against the Paystack dashboard's own transaction log — the reconciliation habit starts from transaction one, not after Phase 4 tooling exists

**Thresholds worth deciding in advance, not improvising on launch day:**
- [ ] Who gets paged/notified if a webhook signature check starts failing repeatedly (possible key compromise or Paystack-side change)?
- [ ] Who reviews the Pending Verification queue if the usual staff member is unavailable?
- [ ] What's the maximum acceptable time between a bank-transfer submission and staff review, before a client should be proactively contacted?

This checklist stays a plan until Sentry is active and at least one real transaction has gone through — at that point it becomes something to actually execute against, not just read.
