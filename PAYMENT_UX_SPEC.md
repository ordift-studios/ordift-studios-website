# Ordift Studios — Payment UX Specification

**Status:** Design specification, part of the Architecture Approval Gate. Describes intended screens, states, and flows — no UI code has been built yet. Uses this project's existing design system (Fraunces/Inter type system, `Button`, existing portal/admin layout patterns) rather than inventing a new visual language.
**Date:** 2026-08-06

**Standing rule, confirmed:** the enquiry form (`/book`) remains completely free — no payment step is ever inserted there. A payment only becomes possible once a payable entity exists: an accepted booking, a workshop registration, or a future payable item. This spec starts at that point, not before it.

---

## 1. Where payment enters the existing flow

```
Enquiry (/book, free, unchanged) → Staff review/booking creation (Admin Platform, unchanged)
  → Booking or workshop registration now exists as a payable entity
    → Client Portal: "Payment Due" appears on the relevant Project Workspace / workshop registration
      → Client initiates payment (this spec, from here on)
```

No existing free-flow screen (the enquiry form, workshop registration form itself) gains a payment field. Payment is always a distinct, later step, initiated from the Client Portal once staff has created the payable item — matching the existing Project Workspace pattern (`src/app/portal/.../project/...`) rather than bolting payment onto the enquiry.

---

## 2. Payment types and their entry points

| Payment type | Where it's initiated | Typical trigger |
|---|---|---|
| Deposit | Project Workspace, "Payment Due" widget | Staff marks a booking as requiring a deposit to confirm |
| Partial payment | Project Workspace | Client chooses to pay more than the deposit but less than the full balance |
| Balance payment | Project Workspace | Remaining amount after a deposit, typically before delivery |
| Full payment | Project Workspace or workshop registration | No deposit structure — pay the full quoted amount at once |
| Workshop registration payment | Workshop registration confirmation screen | Immediately after a workshop seat is confirmed by staff (or immediately, if a workshop is configured as self-serve — a future decision, not assumed here) |

Every payment type shares the same checkout component (§4) — only the amount, `payment_type`, and `entity_type`/`entity_id` differ, per the polymorphic schema design (architecture proposal §4).

---

## 3. Payment method selection screen

The first screen after "Pay Now" is clicked. Layout: a card-style method list, consistent with existing form-selection UI patterns already used in this codebase (e.g. the budget-range selector on `/book`).

**Ghana (customer's country resolved from their profile / selected at checkout if unknown) — clarified 2026-08-06:**
- MTN Mobile Money
- Telecel Cash
- AirtelTigo Money, where currently supported by Paystack — surfaced or hidden per what Paystack's hosted checkout actually offers at runtime, not hardcoded as always-present, since AirtelTigo Money's Paystack availability isn't independently confirmed
- Visa / Mastercard — eligible Ghana-issued and international cards, entered through Paystack's hosted checkout/popup/approved SDK only (never an Ordift-built card form — `PAYMENT_SECURITY_REVIEW.md` §1)
- **Apple Pay** — shown only where Paystack supports and has approved it for the Ordift Studios Ghana merchant account, on eligible devices/browsers/cards only; requires domain registration and verification with Apple before it can appear (a one-time setup step, tracked as a Phase 2 prerequisite, not assumed available on day one)
- **Google Pay** — kept in the payment-method configuration as a defined option (so no future rewrite is needed to add it), but **not shown or advertised** until Paystack officially confirms Ghana availability; the method-selection screen simply omits it entirely until that flag flips, the same "absent, not shown-and-disabled" pattern already used for Qatar Bank Transfer (§8)
- Bank Transfer (manual, §7)

**Qatar (once live — architecture-ready, not built yet):**
- Visa / Mastercard (card)
- Apple Pay (where supported by the device/browser)
- Google Pay (where supported by the device/browser)
- Himyan (only if the eventually-selected Qatar gateway confirms support — currently confirmed for Dibsy only, not MyFatoorah, per `PAYMENT_FINANCE_ARCHITECTURE_PROPOSAL.md` §6)
- Bank Transfer (manual, once a Qatar `bank_accounts` row exists)

**Design detail:** mobile money, cards, and (where enabled) Apple Pay are grouped under one "Pay with card or mobile money" option that routes to Paystack's hosted checkout — Ordift's UI doesn't build separate screens per method; the hosted checkout page itself presents whichever methods are actually live on the merchant account. This keeps the UI genuinely gateway-agnostic and means enabling Apple Pay or (later) Google Pay for Ghana is a Paystack-dashboard/merchant-account change, not a booking/workshop/finance-module code change — the architecture's method list is config-driven, not hardcoded into the checkout flow (`PAYMENT_FINANCE_ARCHITECTURE_PROPOSAL.md` §3). **Bank Transfer is the one method with its own distinct Ordift-built flow** (§7), since it's not something any gateway handles.

**USD + local amount shown here, before any method is even selected** (per the currency-model requirement, architecture proposal §2): "You're paying **$500.00 USD** (≈ **GH₵6,150.00** at today's rate) for [Deposit — Wedding Photography Package]." A small disclosure link: "Your bank or card provider may apply its own exchange rate or fee — this is outside Ordift's control."

---

## 4. Gateway checkout (Ghana card/mobile money, Qatar card/wallet)

1. Client selects "Pay with card or mobile money."
2. **New confirmation screen** (Ordift-built, before redirect): repeats the USD + local-currency amount, the locked exchange rate and its timestamp, and a "Continue to secure payment" button. This is the moment the exchange rate is locked server-side (architecture proposal §2) — not before, not after.
3. Redirect to the gateway's hosted checkout page (Paystack, or the future Qatar provider) — this page is entirely provider-controlled; Ordift's UI ends at the redirect.
4. On completion, the gateway redirects back to an Ordift-hosted **return page** (`/portal/.../payment/[id]/status` or similar) which shows a "Confirming your payment…" state while waiting for the webhook (§5 of the Security Review) to mark the payment `completed` — this is a polling/pending state, not an instant confirmation, since the webhook may arrive a few seconds after the redirect.
5. **Success state:** confirmation message, amount paid, updated balance-due (if partial), and a "Download Receipt" button (§13).
6. **Failure/cancellation state:** clear message ("Your payment wasn't completed — no charge was made" for a cancel, or "Your payment failed — [reason if the gateway provides one]" for a decline), with a "Try Again" button that returns to §3's confirmation screen (re-locking the rate, since the prior lock may have expired).

---

## 5. Failed or Cancelled Payment

- **Cancelled** (customer backs out of the gateway's hosted page): payment record status `failed`, no funds moved, customer returned to the method-selection screen (§3) with a neutral, non-alarming message — this is a normal, expected path, not an error state.
- **Declined** (card/mobile money rejected by the issuer): same UI treatment as cancelled from the customer's perspective (Ordift generally can't surface the issuer's specific decline reason reliably across providers) — "Your payment wasn't successful. You can try a different method or contact us." A "Contact Us" link routes to the existing `/book`-adjacent contact channel, not a new support system.
- Every failed attempt is still recorded as a `payments` row with `status = 'failed'` (not deleted, not hidden) — visible to staff in the Admin Platform for support purposes, and visible to the client in their own Payment History (§14) so they have a record of what was attempted.

---

## 6. Duplicate Payment

Two scenarios, both handled per the Security Review §8:

- **Client double-clicks "Pay Now" or opens two tabs:** the second attempt is routed to the existing pending payment rather than creating a new one — UI shows "You already have a payment in progress for this — continuing that one" rather than silently starting a second charge.
- **Client somehow completes payment twice for the same balance** (e.g. pays the balance via bank transfer, then also completes a gateway payment before staff processes the bank transfer): this is a legitimate edge case, not preventable purely client-side. **Design decision:** the system does not auto-refund — it flags the entity as "overpaid" in the Admin Platform (a computed state: sum of completed payments exceeds the quoted amount), and staff resolve it manually (typically issuing a refund via §11's flow). This keeps the automated system from making a refund decision it can't fully verify context for.

---

## 7. Ghana Bank Transfer

**Step 1 — Show account details.** Client selects "Bank Transfer." Screen shows the active Ghana `bank_accounts` row's details (bank name, account name, account number) formatted for easy copying, plus the USD + GHS amount due (same disclosure pattern as §3).

**Step 2 — Client marks payment as sent.** After transferring externally (outside Ordift's system, via their own banking app), the client returns and clicks "I've Sent This Payment" — this transitions the payment record to `awaiting_verification`, **not** `completed`. UI is explicit about this: "We'll confirm your payment once our team reviews it — this usually takes [X]. You'll be notified either way."

**Step 3 — Upload proof.** A required file-upload field (image or PDF, matching the Security Review §13 validation) for a transfer receipt/screenshot. Client can also add an optional note (e.g. a reference number they used).

**Step 4 — Notify staff.** Submitting the proof automatically creates a staff notification (reusing the existing admin-notification pattern from Enquiries/Workshop Registrations) — no separate manual "notify us" step for the client.

**Step 5 — Pending state, visible to the client.** The Project Workspace / payment status shows "Pending Verification" clearly, with the submitted date and a note that staff typically reviews within [X business days] — set expectations rather than leaving the client guessing.

---

## 8. Future Qatar Bank Transfer

Architecture-ready, not active: the exact same flow as §7, gated entirely by whether a Qatar `bank_accounts` row exists and is `is_active = true` (draft migration §4 of the architecture proposal). Until that row exists, "Bank Transfer" simply doesn't appear as an option for Qatar-resolved customers — no broken/placeholder UI state, the option is absent rather than shown-and-disabled.

---

## 9. Transfer Approval (staff-facing, Admin Platform)

New section in the existing Admin Platform Bookings module (`/admin/bookings`), following its established list/detail pattern:

- **Pending Verification queue** — a filtered list of `awaiting_verification` payments, showing client name/member number (Audit Identity Standard), amount, currency, submitted date, and a thumbnail/link to the uploaded proof (via the signed-URL mechanism, Security Review §14 — never a bare public link).
- **Detail view:** full proof image/PDF viewer, the payment's full context (which booking/workshop, amount, exchange rate used), and two actions: **Approve** / **Reject**.
- **Approve:** requires the staff member to hold the `approve_bank_transfer` capability (Security Review §15). Transitions the payment to `completed`, writes the `activity_log` entry, and **automatically continues the associated booking/workshop workflow** (e.g. moves a booking from "Awaiting Deposit" to "Confirmed") — this automatic continuation was an explicit requirement and is handled by the same entity-status-transition mechanism the workflow engine already provides for Portfolio, applied here to bookings/workshops.
- **Reject:** requires a reason (`review_notes`, matching the Security Review §16 requirement that every refund/rejection carries a recorded reason). Transitions the payment to `rejected` and notifies the client (§10).

---

## 10. Transfer Rejection and Resubmission

- Client sees the rejection reason clearly in their Payment History / Project Workspace — not just a status change with no explanation.
- A **"Resubmit"** action lets the client upload a new proof against the same payment attempt (e.g. they uploaded the wrong screenshot, or the transfer needs to be redone) rather than starting an entirely new payment record from scratch — keeps one coherent history for that payment attempt rather than fragmenting it across multiple rows for what's really one ongoing attempt.
- If the client instead wants to switch to a different payment method entirely after a rejection, they return to §3's method-selection screen, which is always available regardless of a prior attempt's state.

---

## 11. Refund and Partial Refund

**Staff-facing (Admin Platform):**
- A "Refund" action available on any `completed` payment, gated by the `issue_refund` capability (Security Review §15/§16).
- Staff enters the refund amount (defaulting to full, editable down for a partial refund) and a required reason.
- Confirmation step shows exactly what will happen: "This will create a refund record for $X and should be reflected in the customer's [gateway/bank] within [gateway's typical refund window, per the cost register's per-provider figures] — Ordift's own processing fee on the original charge is not refunded" (per the confirmed Paystack fee behavior, cost register §1.1) — the staff member sees the real cost implication before confirming, not after.

**Client-facing:**
- The refund appears as its own line in Payment History (§14) — not a mutation of the original payment's displayed amount, matching the schema design (a new `payment_type = 'refund'` row).
- A notification (reusing the existing Resend pipeline) confirms the refund was issued, the amount, and the expected timing.

**Bank-transfer refunds** are explicitly a manual-process note in this design: since a bank transfer was never processed through a gateway, "issuing a refund" for one means Ordift manually sending funds back via bank transfer — the system records this the same way (a `payment_type = 'refund'` row with `provider = 'bank_transfer'`), but doesn't (and can't) trigger the transfer itself; staff execute it externally and mark it recorded.

---

## 12. Successful Payment / Confirmation

Regardless of method, every successful payment shows the same confirmation pattern (consistency across gateway/bank-transfer/deposit/full):
- Amount paid, in both USD and local currency, with the exchange rate used.
- Updated balance (if this was a deposit or partial payment): "You've paid $X of $Y total — $Z remaining."
- "Download Receipt" (§13).
- A link back to the Project Workspace / workshop registration.

---

## 13. Downloadable Receipts

- Generated server-side (no new paid service — see `PAYMENT_COST_REGISTER.md` §2's "Receipt generation" line), available as a PDF download from both the immediate confirmation screen and, later, from Payment History (§14) at any time — not a one-time-only link.
- Receipt content: Ordift Studios branding (reusing existing brand assets), payment reference (Record ID standard), date, what was paid for (entity description), amount in local currency with the USD-equivalent and exchange rate noted, payment method, and — for a refund — a clearly-marked refund receipt rather than reusing the original charge's receipt template.
- Also emailed automatically on completion via the existing Resend pipeline, as an attachment or a link to the same downloadable PDF — client doesn't have to remember to download it in the moment.

---

## 14. Payment History

A new tab/section within the Client Portal, alongside the existing Project Workspace tabs (Dashboard, Deliverables, Requests):
- Chronological list of every payment attempt (including `failed` ones, per §5) tied to that client's account — not just successful ones, giving a complete record.
- Each row: date, description (what it was for), amount (local + USD), method, status, and a receipt-download link for completed payments.
- Filterable by status and by associated project/booking, matching the filter pattern already used in `/admin/bookings` and `/admin/reports`.

**Staff-facing equivalent:** an all-clients payment ledger view in the Admin Platform (extends `/admin/bookings` or becomes a new `/admin/payments` module — exact placement is an implementation detail for Phase 4, not decided here), supporting the reconciliation workflow (architecture proposal §10, Phase 4).

---

## 15. Mobile, Tablet, and Desktop Layouts

Follows this project's existing responsive conventions (the same breakpoints and patterns already used across the public site and portal — no new breakpoint system introduced):

- **Mobile:** single-column, full-width method cards (§3), the gateway's own hosted checkout is typically already mobile-optimized by the provider. The bank-transfer account-details block (§7) uses a tap-to-copy pattern for account numbers rather than requiring manual selection/copying of small text.
- **Tablet:** same single-column flow as mobile for the checkout steps themselves (payment flows are inherently linear/sequential, not a layout that benefits from a wider multi-column treatment) — but the Admin Platform's Pending Verification queue (§9) and Payment History (§14) use the existing two-column list+detail pattern already established for `/admin/bookings` and `/admin/enquiries` at tablet width.
- **Desktop:** the client-facing checkout flow stays centered and width-capped (matching the existing form-page convention, e.g. `/book`) rather than stretching full-width — payment flows benefit from a focused, non-distracting layout regardless of screen size. Admin views (Pending Verification, Payment History/ledger) use the full list+detail layout already standard for other Admin Platform modules.

---

## 16. What this spec deliberately does not include yet

Per Part 5 of the architecture approval gate: invoices, quotations, discount/promo-code entry at checkout, gift-card redemption, subscription/membership checkout, installment-plan selection UI, and any tax-line display — all explicitly reserved for later (`PAYMENT_FINANCE_ARCHITECTURE_PROPOSAL.md` §12), not designed here, so this spec doesn't gesture at UI for features that don't exist yet.
