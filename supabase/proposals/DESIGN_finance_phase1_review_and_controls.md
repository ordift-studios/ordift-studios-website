# Finance & accounting — Phase 1 review, reconciliation design and controls (LOCAL, 2026-11-10)

Scope: review of what exists at release b354bce (== Production `main`), the smallest set of additions, and how reconciliation and accounting controls should work.
Nothing here is applied anywhere. No real invoice, supplier, card or statement data is in this file (the repository is public).

## 1. What exists (reuse — do not rebuild)

| Area | Status | Where |
|---|---|---|
| Private financial document vault | **Functional.** Private bucket `legal-entity-documents`, Super Admin read/upload only, `employing_entity_documents` rows carry SHA-256, original filename, MIME, size, uploader, time; unique-hash duplicate check per entity; financial classes `purchase_receipt`, `supplier_invoice`, `government_receipt`, `other_financial_document` | 0105, 0159, 0174; `expenseEntry.ts` |
| Receipt-backed cost (expense) | **Functional.** `entity_expenses`: one row per receipt line, append-only (void with reason, never edit/delete), three separate columns — who paid (`funding_source_status`), what is intended about repayment (`reimbursement_intent`), how the books treat it (`accounting_treatment`, always `to_be_confirmed`); admin form in the legal-entity page | 0159, 0174; `EntityRegistryPanels.tsx` |
| Audit trail | **Functional but general.** `logActivity` platform log + per-module append-only event tables; audit identity standard (member number) | `activityLog`, memory: audit identity |
| Collections / client payments | **Functional.** Paystack payments, direct bank transfer with verification, payment evidence, refund review; admin payments pages | 0024, 0151 |
| Payables | **Functional (not entity-expense related).** payee profiles, engagements, payable items, payment evidence, obligations approval — "approving never moves money" | 0049, 0050, 0064; `/admin/payables`, `/admin/executive/finance` |
| Legal-entity registry | **Functional.** Qatar + Ghana entities, registrations, signatories, bank accounts (collection destinations) | 0105, 0159 |
| Company asset register | **Partial.** `company_assets` is the HR *issuance* register (identifier, assignment, incident); **no cost, supplier, invoice, date, classification** | 0094 |
| Bank accounts | **Partial.** `bank_accounts` = destinations shown to clients; no balances, no statements, **no credit-card/instrument concept** | 0024 |
| Reporting | **Partial.** CSV/XLSX report modules exist for enquiries/registrations only; finance modules are `reserved`; nothing audit-ready for entity finance | `admin/reports` |
| Permissions | **Partial.** Entity finance is Super Admin only (RLS + server checks) — safe, but there is no separate finance-reviewer role (see decision D5) | RLS policies |
| Equipment purchase + financing + instalments | **Built locally, rehearsed, NOT applied** (branch `local/finance-equipment-financing`, merged here) | `PROPOSAL_equipment_acquisitions_and_financing.sql` (+ROLLBACK, rehearsal) |
| Bank / card reconciliation | **Missing** | — |
| Financing liability + payment-verification position | **Missing** → added in this phase as pure code | `financePosition.ts` |
| Admin screen for equipment/financing | **Missing** (libraries only; no UI) | — |

## 2. Added in this phase (local, pure code, tested; no DB, no UI, no dependency)

* `src/lib/organization/financePosition.ts` — per-acquisition and per-currency position: purchase net, financed, paid, **verified by statement vs awaiting statement**, outstanding liability, `expenseRecognised` fixed at 0, and open-item flags (classification pending, funding unconfirmed, invoice not in entity name, schedule is expected not provider's, paid awaiting statement, paid without evidence, totals that do not add up). Totals are exact (whole minor units) and never mix currencies.
* `src/lib/organization/statementReconciliation.ts` — proposes matches between expected movements and statement lines: `proposed`, `proposed_with_hint`, `ambiguous`, `variance_review`, `not_found_in_covered_period` (an exception) and `awaiting_statement` (not an exception, not verified). A line satisfies only one expectation; a different amount is never auto-matched; only a person confirms.
* `scripts/finance_position_from_fixture.ts` — prints the position for a fixture file kept **outside** the repo.
* Tests: 26 new unit tests (+19 existing equipment/bank-identity tests) pass; `tsc` clean. Rehearsal of the existing finance migration proposal re-run on the lab database: apply PASS, rollback PASS, verifier (must fail) fails as designed.

## 3. Reconciliation design (no banking connection, nothing posted)

Principle: **a payment is "reported" until a statement line is confirmed against it.**

1. *Expectations* are derived from existing records, never typed twice: an instalment marked paid (reported date → window from that date to month end) or pending (expected month → whole month); an expense line with payment method card/bank transfer; a supplier payment. Each carries amount, currency, direction, window and hint words (provider, merchant).
2. *Statement documents* are filed in the same private vault (class `other_financial_document`, SHA-256 kept) with the **covered period** recorded by a person. Coverage is what separates `awaiting_statement` from `not_found_in_covered_period`.
3. *Statement lines* are entered or imported **only from a statement the Founder supplies**, later; each line keeps its source document and page. Nothing connects to a bank.
4. `proposeMatches()` returns proposals; a Super Admin confirms one at a time. Confirmation (a) links the statement document as bank evidence on the instalment/expense (the existing single link column), (b) writes an audit event `statement_verified` with the line reference, (c) changes nothing else. Variances and ambiguities need a written reason.
5. Four reconciliations, one engine: bank account, credit card, supplier/instalment payments, and liability roll-forward (opening liability − instalments verified = closing liability). A card statement is a *different instrument* from the bank account: card purchases appear when charged; the card repayment appears on the bank account and must not be counted a second time as an expense.
6. Month-end check list (read-only report): unmatched statement lines; reported-paid items with no statement; matches with variance; liability roll-forward difference = 0; documents with a missing/duplicate hash.

## 4. Simplest reliable structure (five layers, each with one job)

1. **Document** — original file in the private vault, hash recorded, never altered.
2. **Record** — what the document says: acquisition (purchase), financing obligation (who is owed), expense line (a cost). One record per supplier invoice; instalments are *settlements of the obligation*, never new purchases or costs.
3. **Movement** — a payment actually reported/made; needs evidence (document or written note) to be `paid`.
4. **Verification** — a confirmed statement line against the movement.
5. **Decision** — the accounting treatment (asset / expense / liability, depreciation) recorded by a Super Admin with a written basis, once, after professional advice. Until then every record reads `pending_professional_review`.

Controls: append-only + void-with-reason; Super Admin-only RLS; every state change in one transaction with its audit event; documents must belong to the same entity; amounts must add up (DB-enforced for instalments); duplicates refused (invoice number, financing reference, file hash).

Fixed assets: do **not** build a separate register yet. Link an acquisition to `company_assets` (column already in the proposal) once the classification policy exists; cost lives on the acquisition, custody on `company_assets`.

## 5. Proposed migrations (proposals only)

1. **Existing, rehearsed:** `PROPOSAL_equipment_acquisitions_and_financing.sql` (4 tables, 2 write functions, audit; additive; rollback refuses over data). Optional: `PROPOSAL_optional_duplicate_expense_guard.sql`. Release plan: `PLAN_finance_migration_backup_rollback.md` (Production PITR is **not** enabled — take the planned backup first).
2. **Design-only, not yet written as SQL on purpose:** statement periods/lines and a match table (append-only, one confirmed match per line, amounts equal or reasoned variance, audit event `statement_verified`). The column set depends on the real export format of the bank/card statements, which has not been seen; freezing it now would risk a redo. Write it when the first statement is supplied.
3. No change to released tables is needed for Phase 1.

## 6. Accounting points a Qatar accountant must confirm (none decided here)

* Capitalisation threshold, useful life and depreciation method (policy not invented).
* Treatment of buy-now-pay-later financing: liability measured at the financed amount; whether any fee/interest exists (none shown on the provider receipt); whether the supplier or the provider is the creditor in the books.
* Whether the asset belongs to the company when the supplier invoice names an individual as customer, and what evidence (company reimbursement, director's account, ownership transfer) is required.
* Whether a card paid personally vs by the corporate card is a company payment, a director's loan or a contribution (reimbursement intention is recorded but never an obligation).
* Tax position (including any VAT/withholding/corporate income tax relevance and deductibility) and statutory audit/record-keeping periods for a W.L.L.
* Foreign-currency items and the reporting currency/rate policy.

## 7. Decisions for the Founder

D1 supply the **original** supplier receipt file and the provider's confirmation email (card, instalment dates). D2 approve applying migration 1 (with backup) — or hold. D3 approve building the admin Equipment & Financing panel (record, overview, mark paid, position view) next. D4 provide the first company card/bank statement when ready (design item 2 above is then written). D5 whether a separate finance-reviewer role is wanted beyond Super Admin. D6 accountant engagement for section 6.

> Update 2026-11-10 (phase 2): Phase 1 is released (migration 0186 + panel). The detailed reconciliation design is in DESIGN_statement_reconciliation.md; the duplicate-expense guard is reviewed in DESIGN_duplicate_expense_guard.md.
