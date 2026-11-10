# Proposal (REVIEW ONLY, 2026-11-10 — nothing implemented, nothing applied): purchase types beyond instalment financing

## 1. What the live Equipment & Financing implementation supports today (verified in code and on the lab database)
| Purchase type | Supported? | Detail |
|---|---|---|
| Instalment financing (PayLater-style) | **Yes, fully** | acquisition + financing agreement + instalment schedule + payment evidence |
| Outright purchase / full payment | **Record only — payment not modelled** | The financing box is optional (unticked = no agreement is required; proven on the lab: an acquisition records with 0 obligations and 0 instalments). But the acquisition has **no payment fields at all** (no paid date, amount, method, evidence or status), so "paid in full on 8 Nov by card" cannot be recorded, and the panel shows *Reported paid 0.00* for a purchase that was in fact paid. |
| Deposit + balance | **No** | There is no part-payment concept. Using "instalments" for it would be a misuse (they need a financing provider, a reference and a confirmation document, at least 2 instalments, and the financed amount must equal the whole net price). |
| Supplier credit (pay by a due date) | **No** | No due date, no supplier-payable view; financing cannot represent one later payment. |
| Other (cash, cheque, bank transfer, trade-in, not yet paid) | **No** | Funding source is a free-text statement only. |
So: no change is needed for instalment purchases, **but outright and the other arrangements need a minimal extension.** The acquisition register itself already works without an instalment agreement.

## 2. Minimal extension (additive; no existing table, function or trigger is changed)
**Principle:** keep the three things apart exactly as today — *cost* (acquisition), *what is owed* (supplier payable OR financing liability, never both), *payments made* — and add only what is missing: how it is to be paid, and the payments themselves.
**Database (one additive migration, proposed number = next free after 0186):**
1. `entity_acquisition_terms` (1 row per acquisition, append-only; absent row = "arrangement to confirm", the safe default): `arrangement` ∈ paid_in_full / deposit_and_balance / supplier_credit / financed (set by the system when a financing agreement exists) / not_yet_paid; `balance_due_on` (date, required for supplier_credit; a due date stated on the supplier's document, never invented); `supplier_terms` (text as printed).
2. `entity_acquisition_payments` (append-only): acquisition, `kind` ∈ full / deposit / balance / part, amount, currency (= acquisition's), paid_on (a real past/present date), `method` ∈ card / bank_transfer / cash / cheque / other, **evidence = a stored document in the same entity's vault OR a written note ≥ 10 chars** (same rule as instalments), a statement-evidence link slot written only by a future confirming function, recorded_by, created_at.
3. Two write functions (service_role only, Super Admin checked, row-locked, audit event in the same transaction): `set_acquisition_terms(...)`, `record_acquisition_payment(...)`.
4. Audit: extend the allowed `event_type` list of `entity_finance_events` (one constraint swap on a tiny table; or a separate events table if you prefer zero change to a live table).
**DB-enforced controls:** total of payments can never exceed the net price (checked under the acquisition row lock, so two simultaneous payments cannot both pass); a **financed** acquisition refuses direct payments (its payments are instalments) — no double counting; supplier credit needs a due date; payments cannot be edited or deleted (void with reason); documents must belong to the same entity; nothing creates an expense or a classification; RLS Super Admin only; no client write grants.
**Not in this minimum (later):** deposit paid directly to the supplier plus the balance financed (today's rule *financed = net* would need relaxing), refunds/returns, multi-currency payments, supplier-payable ledger.

## 3. Form and panel
- Replace the single "financed in instalments" tick with **"How is it paid?"**: Paid in full · Deposit now, balance later · Supplier credit (pay by a due date) · Financed in instalments (as today) · Not yet paid · To be confirmed (default).
- Non-financed purchases get a **Payments** section (date, amount, method, evidence document or note, the existing "reported — not bank-reconciled" confirmation). Financed purchases keep the instalment table unchanged.
- The four figures stay: **Cost · Owed (supplier balance, or financing liability) · Payments (reported / verified by statement / awaiting statement) · Expense 0.00**. The misleading "paid 0.00" disappears: an unpaid outright purchase shows *owed = net*; an arrangement "to confirm" is flagged as an open item, never assumed to be paid.
- Open items added: *arrangement to confirm*, *supplier credit overdue* (due date passed, balance unpaid), *payment without evidence*, *payments exceed net (refused)*.

## 4. Payment evidence and accounting controls
Same evidence ladder as instalments: reported (document or note) → statement-verified only when a statement line is confirmed by a Super Admin (the reconciliation design already treats a non-financed payment as a `supplier_payment` expectation). Classification, capitalisation, depreciation, supplier-payable ledger treatment and tax stay **accountant decisions**; this extension records facts only.

## 5. Tests (focused; no manual walkthrough)
Pure: rules (arrangement/due-date/amount validation), generalised position (owed vs financing vs paid; never double counted), form parsing per arrangement. DB rehearsal on the lab: apply/rollback/verifier; overpayment refused; financed acquisition refuses a direct payment; evidence required; append-only; grants/RLS; **two-session race** on simultaneous payments (total never exceeds net). Panel render for each arrangement; source-level isolation (no expense table, no statement-evidence writes, only the two functions). Then the usual gate: backup + restore check + gated apply + verification, with your written approval.

## 6. Size and decision needed
Roughly one migration (2 tables, 2 functions), one rules/position generalisation, one form+panel change. Decision: approve this scope (or trim it, e.g. start with "paid in full" + "supplier credit" only). FNAC (financed) is unaffected and stays pending.
