# Release plan — expense entry form (migration 0174). LOCAL ONLY: nothing here has been pushed, deployed or applied.

Commit: `expense-recording-form` branch (on top of `e177958`). Not authorized for Production yet.

## What it changes
- Migration `0174_entity_expense_entry_fields.sql`: four columns on `entity_expenses` (`reimbursement_intent`, `payment_method`, `related_reference`, `notes`), one consistency constraint, and the guard trigger replaced so the new descriptive columns are fixed once recorded and the intention is set once. Rollback: `ROLLBACK_0174.sql`.
- App: `expenseEntry.ts` (pure rules), `recordEntityReceipt` (new optional fields + same-document and same-request duplicate checks), `recordExpenseAction`, an "Expense" form on the entity page. Super Admin only, as the existing expense table already is.

## Order for a separate, authorized Production release
1. Founder written authorization for the exact commit.
2. Read-only pre-checks (ledger 0173 / 166 versions; `entity_expenses` row count and fingerprint; Qatar and Ghana rows).
3. Apply 0174 to Production (additive; existing rows take defaults; verified byte-identical on legacy-shaped Qatar/Ghana rows locally).
4. Fast-forward `main` to the commit; confirm Vercel Ready and the deployed commit.
5. Read-only verification, then (only with separate authorization) record the QAR 500 receipt through the form.
Because the new app code needs the new columns, apply the migration BEFORE the push.

## QAR 500 entry (NOT recorded)
Receipt `7929943008946018004112` (already in the Qatar vault); date 2026-10-26; request SR3032128; category Government fee; related "Commercial License 345520"; line `PERMIT_ISSUANCE | Ordift Studios Commercial Permit issuance fee | 500` plus `ESTABLISHMENT_CARD_PRINT | Establishment card printing | 0` (not recorded); total 500; method Card; funded by the Founder personally (basis: Founder's written statement of 27 Oct 2026); reimbursement "Not required — non-reimbursable contribution (not a loan)". Accounting treatment stays "to be confirmed".
