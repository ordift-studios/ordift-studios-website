# Ordift Studios — Payment Module Cost Register

**Status:** Cost analysis for the Architecture Approval Gate. No accounts created, no live gateway credentials, nothing committed/pushed/deployed.
**Date created:** 2026-08-06
**Last updated:** 2026-08-06 (two passes) — first pass restructured with a plain-language owner-facing summary and corrected against `TECHNOLOGY_COST_REGISTER.md`'s confirmed figures; this pass adds fee-on-success-only clarification, chargeback/dispute detail, an explicit Sentry-is-observability-not-gateway-cost callout, storage/receipt-cost sourcing, and a Confidence + Source Date column on every figure, per your Ghana payment-method clarification request.

**Scope and authority — read this first:** `TECHNOLOGY_COST_REGISTER.md` is, and remains, **the single living register for every third-party service cost across the whole Ordift Studios platform** — it predates this document, already tracks Vercel/Supabase/Sanity/Resend/Upstash/Turnstile/Google Sheets/GitHub with confirmed current pricing, and already has its own "add a new row when a new service is scheduled" maintenance rule. An earlier version of this document introduced a second, competing "living register" concept — that was a mistake, now corrected. **This document does not duplicate that role.** It exists only because the payment module's own cost detail (per-gateway fee schedules, the Qatar-candidate comparison, transaction-volume scenario modeling) is too specialized to inline into `TECHNOLOGY_COST_REGISTER.md` without cluttering it — so it lives here, as a companion, and **every figure for a service that isn't the payment gateway itself is taken directly from `TECHNOLOGY_COST_REGISTER.md`, never re-derived independently.** `TECHNOLOGY_COST_REGISTER.md` §9 now carries the summary Paystack entry and points back here for detail.

**Confidence labeling used throughout:** High = confirmed via the provider's own current pricing/ToS page, or already confirmed in `TECHNOLOGY_COST_REGISTER.md`. Medium = official page via a secondary summary, or partially conflicting sources. Low = single third-party source or explicit estimate. **"Vendor quotation required"** = not published anywhere found; must come directly from the vendor, never guessed.

---

## Part 1 — Plain-Language Owner Summary

This section answers, in order: what do we need, what do we already have, what's genuinely new, and what will it actually cost at three different volumes.

### 1. Every service required to build and operate the payment system

Gateway: **Paystack** (Ghana, confirmed plan) and, later, **a Qatar gateway** (MyFatoorah or Dibsy, not yet selected). Supporting: Supabase (database/storage), Vercel (hosting), Resend (email receipts/notifications), Sentry (error monitoring), an exchange-rate mechanism (§9 below — now admin-controlled, not a paid service), and Ordift's own in-app receipt generation and webhook handling (no separate service for either).

### 2. Which services already exist in Ordift Studios' infrastructure

**Every one of these already runs the site today, independent of payments**, per `TECHNOLOGY_COST_REGISTER.md`: Vercel, Supabase, Sanity, Resend, Upstash Redis, Cloudflare Turnstile, Google Sheets, GitHub. Payments add *usage* to some of these (more database writes, more emails) — they don't introduce a new service.

### 3. Which are genuinely new expenses caused by the payment implementation

Only **the payment gateway itself** (Paystack now, a Qatar provider later) is a wholly new service. Everything else on the list above already exists and is already being paid for (or already free) regardless of whether payments launch. Where payment volume specifically risks pushing an *existing* service past its current free tier, that's called out explicitly in §8 below — but it's a usage-tier risk on an existing service, not a new subscription.

### 4–8. One-time / monthly / annual / transaction / transfer-settlement-refund-chargeback fees

Covered in full technical detail in §1 (gateways) and §2 (infrastructure) below. Headline: **$0 one-time cost, $0 mandatory new monthly subscription cost — the real, unavoidable new cost is Paystack's 1.95% per-transaction fee**, and (once selected) the Qatar gateway's equivalent, currently a placeholder pending vendor quotation.

### 9–14. Storage/bandwidth, email/receipts, error monitoring, FX, fraud, PCI

- **Storage/bandwidth:** proof-of-payment uploads are trivial in volume (§2) — no new cost.
- **Email/receipts:** built on the existing Resend account — no new service; at high volume this is the one place existing headroom could be tested (§8).
- **Error monitoring (Sentry):** already planned independent of payments (Workstream C); payment webhooks are simply the reason to actually activate it promptly rather than let it sit dormant.
- **FX/currency conversion:** **corrected from the earlier draft of this document.** Per your Part 6 instruction, Ordift starts with an **admin-controlled exchange rate** (staff enters/updates the rate in the Admin Platform) rather than an automatic FX-data API. This means **the FX mechanism costs nothing and requires no new account** for Phase 1 — Open Exchange Rates (or any automatic provider) becomes a possible *future* decision only, not a Phase 1 cost.
- **Fraud prevention:** not recommended at Ordift's modeled volume — a dedicated tool's minimum fees would exceed any realistic fraud loss avoided; gateways' built-in fraud tooling is already priced into the transaction fee.
- **PCI compliance:** the underlying obligation is real, but because every gateway uses hosted checkout, Ordift qualifies for self-assessment (SAQ A or equivalent) — **$0 cost**, not an audit.

### 15. Costs requiring a vendor quotation rather than confirmed public pricing

The entire Qatar gateway fee schedule (setup, monthly, and — for MyFatoorah specifically — even the transaction rate) is either unconfirmed or conflicting in public sources. Every such figure is labeled **"Vendor quotation required"** throughout this document, never estimated as if it were confirmed.

### 16. Mandatory / Recommended / Optional / Reserved-for-later, per cost

See the consolidated table in §3 and the account list in §5 — every line item is explicitly tagged.

---

## Part 1 — Three Budget Scenarios

**Reading key:** *Existing platform cost* = what Ordift already pays regardless of payments (source: `TECHNOLOGY_COST_REGISTER.md`, not re-derived). *Incremental payment-specific cost* = what launching/operating payments actually adds on top of that baseline. These two numbers are never added together and presented as one figure — that's the double-counting your instruction explicitly ruled out.

**On "break-even":** a percentage-of-transaction gateway fee doesn't have a break-even point in the usual sense — there's no fixed cost being recovered, since the fixed cost is $0 (§3). What follows instead is the **estimated monthly cost at each volume level**, which is the number that actually matters for budgeting: it tells you what payments will cost in a given month, not a threshold you need to cross before they become worthwhile.

### Scenario A — Minimum Ghana-first launch

*Assumptions:* Ghana only (no Qatar), Paystack live, bank transfer available, everything else stays on its current free tier. Illustrative low volume: 15 bookings/mo (avg $350) + 10 workshop registrations/mo (avg $80).

| | Amount |
|---|---|
| Existing platform fixed cost (Vercel — already required regardless of payments) | ~$20–24/mo, ~$240–288/yr (**unconfirmed assumption** — see `TECHNOLOGY_COST_REGISTER.md` §1; the actual active Vercel plan should be confirmed from your own dashboard) |
| New fixed monthly cost caused by payments | **$0** — Supabase, Sentry, Resend all stay on their current free tier at this volume |
| New fixed yearly cost caused by payments | **$0** |
| Variable transaction cost | Paystack 1.95% on ~$6,050/mo gross ≈ **$118/mo, ~$1,415/yr** |
| **Total incremental payment-specific cost** | **~$118/mo, ~$1,415/yr** — entirely the gateway fee |
| Assumptions & confidence | Gateway fee: High (confirmed Paystack rate). Volume: Low confidence — illustrative planning numbers, not a forecast. |

### Scenario B — Recommended professional launch

*Assumptions:* Ghana only (Qatar still architecture-ready, not live). Illustrative medium volume: 60 bookings/mo (avg $350) + 40 workshop registrations/mo (avg $80). Sentry proactively upgraded to Team the moment payments go live — a **recommendation**, not a strict technical requirement, because real customer money now flows through webhooks that deserve prompt error visibility rather than waiting for the free tier to run out mid-incident.

| | Amount |
|---|---|
| Existing platform fixed cost | Same as Scenario A: ~$20–24/mo, ~$240–288/yr (Vercel, unconfirmed assumption, unaffected by payments) |
| New fixed monthly cost caused/recommended by payments | Sentry Team: ~$27/mo, ~$324/yr (**recommended, not strictly forced** — Sentry was already independently planned for Workstream C; payments are the reason to activate it now rather than later, not the sole cause of the cost) |
| Variable transaction cost | Paystack 1.95% on ~$24,200/mo gross ≈ **$472/mo, ~$5,663/yr** |
| **Total incremental payment-specific cost** | **~$499/mo, ~$5,987/yr** |
| Assumptions & confidence | Gateway fee: High. Sentry Team pricing: High (confirmed tier). Volume: Low confidence — illustrative. |

### Scenario C — Expanded / high-volume operation (Ghana + Qatar both live)

*Assumptions:* Both gateways live. Illustrative high volume: 250 bookings/mo (avg $400) + 150 workshop registrations/mo (avg $90), 60/40 Ghana/Qatar split. At this volume, Resend's **100 emails/day cap** (not the 3,000/month total) becomes the more realistic constraint once payment receipts/notifications stack on top of existing form-confirmation email volume — flagged as a likely, not certain, trigger.

| | Amount |
|---|---|
| Existing platform fixed cost | Same baseline: ~$20–24/mo, ~$240–288/yr (Vercel) |
| New fixed monthly cost caused by payments | Sentry Team ~$27/mo (~$324/yr, same reasoning as Scenario B) + Resend Pro ~$20/mo (~$240/yr, **likely** triggered at this email volume specifically by payment receipts stacking on existing form emails) ≈ **~$47/mo, ~$564/yr** |
| Variable transaction cost | Ghana leg: $68,100/mo × 1.95% ≈ $1,328/mo. Qatar leg: $45,400/mo × 3.0% (**placeholder — vendor quotation required for the real rate**) ≈ $1,362/mo. **Total ≈ $2,690/mo, ~$32,279/yr** |
| **Total incremental payment-specific cost** | **~$2,737/mo, ~$32,843/yr** (excludes the Qatar gateway's own setup/monthly fee, which remains an unresolved vendor quotation, not included in this total) |
| Assumptions & confidence | Ghana gateway fee: High. Qatar gateway fee: **Low — placeholder only.** Resend trigger: Medium (depends on actual emails-per-transaction, not firmly modeled yet). Volume: Low confidence — illustrative, especially at this scale. |

**One number worth sitting with:** at every scenario, once the FX-API and Supabase-Pro costs were correctly attributed (see §8), **the only cost that's unambiguously, 100%-caused-by-payments is the gateway's own transaction fee.** Everything else is either $0, or an existing-infrastructure cost that would likely be needed on its own timeline regardless of payments.

---

## 1. Payment Gateways — Full Fee Detail

### 1.1 Paystack (Ghana) — confirmed plan

**When fees are charged, confirmed:** Paystack's 1.95% fee is charged **only on successful transactions** — a failed, cancelled, or declined attempt is never charged. This is standard card/mobile-money-network behavior (the fee is a percentage of money actually moved) and matches every other payment processor researched this session; not a Paystack-specific quirk worth separate sourcing.

| Fee category | Amount | Confidence | Source date |
|---|---|---|---|
| Setup / onboarding fee | None found | High–Medium | 2026-08-06 |
| Monthly / subscription fee | $0 | High | 2026-08-06 |
| Annual fee | $0 | High | 2026-08-06 |
| Card transaction fee | 1.95% flat, **successful transactions only**, no domestic/international split | High | 2026-08-06 |
| Mobile money transaction fee | 1.95% flat, **successful transactions only** (same rate, no separate schedule found) | High | 2026-08-06 |
| Apple Pay fee | Not separately published — presumed included in the 1.95% card rate since Apple Pay routes through card rails | Low | 2026-08-06 |
| Google Pay fee | Not separately published, not confirmed available in Ghana at all | Low | 2026-08-06 |
| Bank transfer support | Supported as a Paystack channel; fee not separately confirmed from the 1.95% card rate | Medium | 2026-08-06 |
| Refund fee | Free to issue; **original 1.95% transaction fee is NOT returned to Ordift** on a refund — confirmed | Medium | 2026-08-06 |
| Chargeback / dispute fee | $0 fee to Ordift; Ghana disputes auto-accept if unanswered within 48 hours (meaning an unresponded dispute becomes a loss, not an extra fee) | Medium | 2026-08-06 |
| FX / conversion fee | N/A — Paystack Ghana is GHS-in, GHS-out; conversion happens on Ordift's own side via the admin-controlled rate (§9), not Paystack's | High | 2026-08-06 |
| Payout fee | GHS 1 (mobile money) / GHS 8 (bank) | High | 2026-08-06 |
| Settlement timing | T+1 | High | 2026-08-06 |
| Hidden / optional fees | **Rolling-reserve policy not published** — a third-party review site flagged "held payouts" as a recurring complaint pattern. Confirm directly with Paystack support before go-live. | Low | 2026-08-06 |

**One-time / setup cost:** $0 confirmed. **Recurring mandatory cost:** $0 base — 100% usage-based, and that usage-based charge only fires on money that actually moved.

### 1.2 Qatar Gateway — placeholder, provider not yet selected

*All figures below sourced 2026-08-06. This entire section stays untouched until your direct vendor conversation — nothing here is re-estimated or updated speculatively.*

| Fee category | MyFatoorah | Dibsy |
|---|---|---|
| Setup / onboarding fee | Conflicting signals: "no fee" vs. "3,500 AED" found — **vendor quotation required** | Not published — **vendor quotation required** |
| Monthly / subscription fee | Vendor quotation required | Vendor quotation required |
| Card transaction fee | Vendor quotation required (Qatar-specific figure not publicly confirmed) | **2.5% + QAR 1 flat**, confirmed directly from Dibsy's ToS (High) |
| Apple Pay / Google Pay fee | Not published | Included in the flat 2.5% + QAR 1 (High) |
| Himyan fee | No Himyan support found | Included in the flat rate where Himyan is live (Apple Pay only, 2025/2026) |
| Bank transfer support | Not a gateway-native channel for either — Ordift's own manual bank-transfer workflow covers this regardless of gateway choice | — |
| Refund fee | Fee-passthrough configurable; amount unpublished | **Dibsy's own fee is never refunded**, even on a fully refunded sale (High) |
| Chargeback / dispute fee | Vendor quotation required | Vendor quotation required |
| FX / conversion fee | Not confirmed — neither gateway confirms USD settlement; assume conversion is via Ordift's admin-controlled rate (§9) | Medium |
| Payout fee | Vendor quotation required | Vendor quotation required |
| Settlement timing | "Usually 24hrs," generic across MyFatoorah's countries, not Qatar-confirmed (Medium) | Weekly minimum; **possible 7-day hold on first payout** (High, direct ToS) |
| Hidden / optional fees | Reserve policy bounded to "high-risk client transactions" (Medium) | Reserve policy **open-ended, sole discretion** (High) |

**Placeholder modeling figure used in Scenario C above:** 3.0% (midpoint of Dibsy's confirmed 2.5% and a typical regional range for the unconfirmed MyFatoorah figure). **This is an estimate for planning only, not a quote.**

---

## 2. Infrastructure — Payment-Relevant Detail

Every figure below for an *already-existing* service is taken directly from `TECHNOLOGY_COST_REGISTER.md` (source date 2026-08-06 for every figure in that register, including this cross-reference) — restated here only where payment-specific usage context matters, never re-priced independently.

**Sentry, called out explicitly per your instruction:** Sentry is **general application-observability infrastructure, not a payment-gateway cost** — it was already planned for Workstream C (production error monitoring across the entire site) before the payment module existed, and would be recommended regardless of whether payments ever launched. It appears in this register only because payment webhook failures are a strong practical reason to activate it *now* rather than later — not because payments create the need for it. Its cost (§3 below) is tracked separately from any Paystack/Qatar gateway line for exactly this reason.

| Service | Current state (per `TECHNOLOGY_COST_REGISTER.md`) | What payments change | Mandatory / Recommended / Optional | Confidence | Source date |
|---|---|---|---|---|---|
| Supabase | **$0/mo, Free plan, confirmed live today** | Adds proof-of-payment storage (~160MB/mo modeled — trivial) and payment-table write volume. **Important correction:** `DISASTER_RECOVERY.md` §9 names "the first real payment" as one of three Pro-upgrade triggers — but a second trigger (`FORMS_SENDING_ENABLED`) is **already true today**, independent of payments. So a Supabase Pro upgrade may already be warranted on its own timeline; it should not be presented as a payment-caused cost. | Mandatory (already in use); any upgrade is a pre-existing decision, not a payment-specific one | High | 2026-08-06 |
| Vercel | **~$20–24/mo, Pro — unconfirmed assumption**, already required regardless of payments (commercial-use site) | Webhook endpoints add negligible load | Mandatory (already in use, already required) | Medium (plan tier unconfirmed) | 2026-08-06 |
| Resend | **$0/mo, Free tier, confirmed** (3,000/mo, 100/day cap) | Receipt + notification emails add volume; the 100/day cap is the more realistic trigger than the monthly total at higher payment volume (Scenario C) | Mandatory (already in use); Pro upgrade is a real but not certain payment-driven risk at high volume | High | 2026-08-06 |
| Sentry — **observability infrastructure, not a gateway cost** (see callout above) | **$0/mo, not yet activated** (Free tier: 5,000 errors/mo) | Already independently planned (Workstream C); payment webhook errors are the practical reason to activate promptly | Recommended to activate now; Team tier recommended once payments are live, not strictly forced by a technical limit | High | 2026-08-06 |
| Sanity | $0, unaffected | No interaction — payments never touch Sanity | N/A | High | 2026-08-06 |
| Payment-proof storage | Uses Supabase Storage, no new service | ~160MB/mo modeled (assumption: ~80 uploads/mo × ~2MB avg image/PDF), trivial against any Supabase tier | Mandatory, $0 incremental | Medium (volume is modeled, not measured) | 2026-08-06 |
| **FX / currency conversion** | **Not a paid service — corrected from the earlier draft.** Per your Part 6 instruction, Phase 1 uses an **admin-controlled exchange rate** (a staff-entered value in the Admin Platform), not an automatic API. | No cost, no new account, no Phase 1 dependency on any FX data provider | N/A for Phase 1. **Future, optional:** if an automatic FX provider is ever justified and approved later, Open Exchange Rates was the one confirmed free-tier option supporting USD as a base currency — noted here only as a future reference point, not a current cost. | High | 2026-08-06 |
| Webhook infrastructure | Built on existing Next.js API routes + Vercel | No separate service | Mandatory, $0 incremental | High | 2026-08-06 |
| Receipt generation | Built in-app + existing Resend pipeline (Resend's cost is the Resend row above — receipt emails are not a separate line item) | No separate service | Mandatory, $0 incremental | High | 2026-08-06 |
| Fraud detection (3rd-party) | Not adopted | **Not recommended** at modeled volume — gateways' built-in tooling already covers this at this scale | Optional, not recommended now | Medium (judgment call, not a vendor quote) | 2026-08-06 |
| PCI compliance tooling | Self-assessment (SAQ A-equivalent), $0 | Hosted-checkout architecture keeps this at $0 | Mandatory obligation, $0 cost as designed; paid compliance-automation tooling is optional | High | 2026-08-06 |
| Accounting/reconciliation software | Not adopted — CSV export covers current scope | No change at modeled volume | Optional, deferred | High | 2026-08-06 |

---

## 3. Consolidated Cost Summary Table

| Service | Purpose | Mandatory / Recommended / Optional | One-time Cost | Monthly Cost | Annual Cost | Usage-based Charges | Free Tier | Upgrade Trigger | Est. First-Year Cost | Est. Ongoing Annual Cost | Confidence | Source date |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Paystack | Ghana payment gateway | Mandatory | $0 | $0 | $0 | 1.95% per transaction, **successful transactions only** | N/A (fee-based) | N/A | See Scenarios A–C | See Scenarios A–C | High | 2026-08-06 |
| Qatar gateway (TBD) | Qatar payment gateway | Mandatory once selected | Vendor quotation required | Vendor quotation required | Vendor quotation required | ~2.5–3.5% per transaction (placeholder) | N/A | N/A | See Scenario C | See Scenario C | Low (placeholder) | 2026-08-06 |
| Supabase | Database, auth, storage | Mandatory (already in use) | $0 | $0 today (Free, confirmed) | $0 today | Possible Pro upgrade — **pre-existing trigger, not payment-caused** | 500MB DB / 1GB storage | Already possibly due, independent of payments (`DISASTER_RECOVERY.md` §9) | $0 incremental from payments | $0 incremental from payments | High | 2026-08-06 |
| Vercel | Hosting + functions | Mandatory (already in use, already required) | $0 | ~$20–24 (unconfirmed assumption) | ~$240–288 | Bandwidth/function overage | N/A (commercial use requires Pro) | Already required | $0 incremental from payments | $0 incremental from payments | Medium (plan unconfirmed) | 2026-08-06 |
| Resend | Transactional email | Mandatory (already in use) | $0 | $0 today (Free) | $0 today | Above plan quota | 3,000/mo, 100/day | Daily send volume > 100 — realistic only at high payment volume (Scenario C) | $0–$240 (scenario-dependent) | $0–$240 | High | 2026-08-06 |
| Sentry (observability infra, not a gateway cost) | Error monitoring | Recommended (already independently planned) | $0 | $0 today → ~$27 recommended | $0 → ~$324 recommended | Above plan quota | 5,000 errors/mo | Recommended activation at payment go-live, not a hard technical forcing function | $0–$324 | $0–$324 | High | 2026-08-06 |
| Sanity | CMS | N/A to payments | $0 | Existing plan, unaffected | Existing plan, unaffected | N/A | N/A | N/A | $0 incremental | $0 incremental | High | 2026-08-06 |
| Payment-proof storage | Proof-of-payment uploads | Mandatory | $0 | $0 (within Supabase) | $0 | Negligible | Included | Covered by Supabase | $0 | $0 | Medium (modeled volume) | 2026-08-06 |
| FX / currency conversion | USD→local rate | Mandatory mechanism, **$0 cost** | $0 | $0 | $0 | N/A | N/A — admin-controlled, no API | Only if an automatic FX provider is later approved | $0 | $0 | High | 2026-08-06 |
| Webhook infrastructure | Gateway webhook receipt | Mandatory | $0 | $0 | $0 | N/A | N/A | N/A | $0 | $0 | High | 2026-08-06 |
| Receipt generation | Client receipts | Mandatory | $0 | $0 | $0 | N/A | N/A | N/A | $0 | $0 | High | 2026-08-06 |
| Fraud detection (3rd-party) | Dedicated fraud scoring | **Optional — not recommended now** | — | — | — | — | — | Measured chargeback/fraud problem | $0 | $0 | Medium (judgment call) | 2026-08-06 |
| PCI compliance tooling | Compliance automation | Optional (obligation itself is $0) | $0 | $0 | $0 | N/A | Always free (self-assessment) | Only if raw card handling changes (not planned) | $0 | $0 | High | 2026-08-06 |
| Accounting/reconciliation software | Settlement reconciliation | Optional, deferred | — | — | — | — | — | Manual CSV reconciliation becomes unmanageable | $0 | $0 | High | 2026-08-06 |

---

## 4. Accounts You Must Personally Create

| Account | Mandatory / Recommended / Optional | What's needed | Notes |
|---|---|---|---|
| Paystack (Ghana) | **Mandatory** for Ghana rollout | Registrar General's Department certificate, business info, bank/mobile-money details | No published onboarding fee |
| MyFatoorah **or** Dibsy (Qatar) | **Mandatory** for Qatar rollout, **held** until eligibility + commercial terms confirmed | See §6 below | Do not register until the direct vendor conversation resolves entity-structure eligibility |
| Qatar-registered entity / bank account | **Likely mandatory** regardless of gateway choice | Business registration in Qatar | Business-structure decision, not resolved here |
| Sentry | **Recommended**, already independently planned | Email signup, DSN generation | Not payment-specific in origin; payments are the reason to prioritize activating it now |
| Open Exchange Rates (or equivalent) | **Optional, deferred** — corrected from the earlier draft | Not needed while the exchange rate is admin-controlled | Revisit only if an automatic FX provider is later justified and approved |
| Accounting/reconciliation software | **Optional, deferred** | — | Not needed at current modeled volume |
| Fraud-detection service | **Optional, not recommended now** | — | Revisit only if a measured fraud/chargeback problem emerges |

---

## 5. Merchant/Vendor Onboarding Document Checklists

**Paystack (Ghana):** Registrar General's Department certificate, business information, bank/mobile-money account details.

**MyFatoorah (if selected):** Civil ID, Commercial License, Signature Authorization, Articles of Association, Commercial Register, Civil IDs of all owners, Civil ID of manager, Bank Account Letter, evidence of website/online presence.

**Dibsy (if selected):** Commercial Registration (CR), Trade License, Qatar ID (QID) of owners and partners, Computer Card (Establishment Card), Bank Confirmation Letter (IBAN, account holder name, stamp/signature), verified website or online presence.

---

## 6. What's Still Pending Before This Register Is Fully Firm

1. **Qatar gateway fees, setup cost, and monthly cost** — "vendor quotation required" throughout; firm numbers depend on your direct MyFatoorah/Dibsy conversations.
2. **Qatar entity/bank-account cost** — a business-formation cost outside this project's technical scope, to be sized once the entity-structure question is resolved.
3. **Actual booking/registration volume** — the three scenarios above are planning assumptions; replace with real figures once available.
4. **Your actual current Vercel billing plan** — `TECHNOLOGY_COST_REGISTER.md` itself flags this as an unconfirmed assumption, not independently verifiable from this session; worth a quick dashboard check so every scenario above rests on a confirmed number rather than an assumption.

---

## 7. Living-Register Note

Per the standing rule now correctly located in `TECHNOLOGY_COST_REGISTER.md` (not duplicated here): once Paystack actually goes live, that document's §9 entry should be updated from "architecture approved, not yet integrated" to "live" with the actual go-live date — that's the update this document's existence anticipates, and it belongs in the platform-wide register, not here.
