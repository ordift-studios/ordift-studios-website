# Bank / credit-card statement reconciliation — design (LOCAL, 2026-11-10; no SQL written on purpose, nothing applied)

Builds on `statementReconciliation.ts` (pure matching engine, shipped, unused by any write path) and migration 0186 (acquisitions, financing, instalments, audit events — live).
No real statement has been opened, imported or stored. SQL waits for the first company statement (its real columns and page layout decide the line table), then goes through the usual rehearse -> backup -> approval path.

## 1. Principles
1. A payment is **reported** until a statement line is **confirmed** against it by a Super Admin. Nothing matches or verifies automatically.
2. Company and personal money never mix. A personal account may be recorded only to be **refused**; a statement of a personal account can never be attached to a company entity.
3. Statements are evidence: original file in the private vault (SHA-256, unaltered); extracted lines keep their source document and page; everything append-only (void with reason).
4. Transfers between the company's own instruments (card repayment from the bank account) are **not expenses** and are matched to each other, never to a cost.

## 2. Data model (proposed; four new tables, one confirming function)
| Table | Purpose | Key rules |
|---|---|---|
| `entity_finance_accounts` | the entity's own instruments: kind `bank_account` / `credit_card`, bank, currency, holder kind `company` / `personal`, a label, identity as printed on its statements (masked card / full IBAN reference, never a bare last-four) | one row per instrument; `personal` rows cannot own statements; the existing last-four collision warning (`bankAccountIdentity.ts`) applies (the Founder's two Qatar accounts share a last-four) |
| `entity_statements` | one vault document = one statement for one instrument | period from/to; no overlapping periods per instrument; file hash unique; opening and closing balance as printed |
| `entity_statement_lines` | each printed line | date, amount, direction, description as printed, page; **opening + credits − debits = closing**, checked when the statement is saved (catches typing errors); append-only |
| `entity_statement_matches` | proposal -> confirmation | one confirmed match per line; target kind `instalment` / `expense` / `supplier_payment` / `card_repayment` / `bank_fee` / `other`; amount equal, or a written variance reason; status proposed / confirmed / rejected |
| function `confirm_statement_match(line, target, actor)` | the ONLY writer of statement evidence | Super Admin; same currency; line not already confirmed; sets the instalment's / acquisition's statement-evidence link (today a direct column nobody writes) and appends the audit event `statement_verified`; nothing else changes |

## 3. Flow
1. Founder supplies a statement file (company card or company account only) -> hash and describe it, **ask before storing**.
2. With approval: store in the vault; enter the header (instrument, period, balances) and the lines (typed or pasted from the statement; the arithmetic check must pass).
3. `proposeMatches()` builds expectations from existing records (reported-paid instalments with their reported date window, pending instalments by expected month, expense lines paid by card/transfer) and returns proposals: exact / with-hint / ambiguous / variance / **not found in a covered period (exception)** / **awaiting statement (not an exception)**.
4. The Super Admin confirms or rejects each; ambiguous and variance items need a reason. Unmatched lines are listed, never ignored.
5. Month-end read-only report: unmatched lines; reported-paid items without a statement; variances; roll-forward difference = 0; liability roll-forward (opening liability − verified instalments = closing).

## 4. Credit-card specifics (the FNAC case)
- The purchase / first instalment appears on the **card statement**; later PayLater instalments may be charged to the same card by the provider -> each is a card line matched to an instalment.
- The card's repayment appears on the **bank account statement** as a payment to the card -> matched to the card statement's payment line as `card_repayment` (an internal transfer). It must not be counted again as an expense or as an instalment payment.
- Which liability the books carry (the provider's financing, or the card issuer) once instalments are charged to a card is an **accountant decision**; the design keeps both visible and double-counts neither.

## 5. Controls and open decisions
- Access: Super Admin only (RLS + server + function); every write has an audit event in the same transaction; no deletes; no grants to client roles; `service_role` cannot delete.
- Not built: no bank connection, no automatic import, no automatic classification or expense recognition.
- Decisions: (a) first statement and its format; (b) one reviewer or a second-person review for confirmations; (c) whether image-only PDFs are keyed by hand (yes by default); (d) retention period for statements (accountant).
