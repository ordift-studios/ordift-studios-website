# Payment controls: compatibility checks and decisions that are yours (9 Nov 2026) — LOCAL; nothing applied to Production

This note covers every financial-schema or policy question raised by the payment integrity work. Where a choice is a business policy it is written as options with a recommendation, not decided. Files referred to are in `supabase/proposals`.

## 0. What was checked before changing anything financial
- **Existing records:** every proposal is additive (one column, one table, two triggers, one replaced function, two partial unique indexes). None edits, deletes, merges or back-fills a payment row. The two unique indexes run a read-only preflight first and stop in plain words if duplicates exist. Two diagnostic files (`DIAGNOSTIC_bank_transfer_open_instructions.sql`, `DIAGNOSTIC_card_gateway_reference.sql`) are for a person to run against the target database BEFORE any migration; I have not run them against Production.
- **Payment providers:** only Paystack (card) exists. Its webhook, status check, refund reconciliation and completion claims are unchanged. The webhook's payment lookup is now restricted to card rows; the provider's references are still stored in `gateway_reference`.
- **Instalments and partial payments:** nothing assumes one payment per record. The one-open-instruction index is per client, record and payment type, and only while the instruction is still unpaid and without proof. The verification lock serialises decisions on one record but lets different records proceed in parallel. Rehearsed: 400 + 300 + 300, 600 + 400 together, a refund freeing the balance, mixed card and bank.
- **Accounting workflows:** `enquiries.amount_paid` and `payment_status` keep the same meaning and the same single calculation (completed payments only, refunds subtract), now in `entityPaymentTotals.ts`. The bank's reference moves to a new column for NEW verifications; historical rows keep it in `gateway_reference` and every reader falls back to it. Anything outside this repository that reads `payments.gateway_reference` for bank-transfer rows (a spreadsheet export, an accountant's report) would see an empty value for newly verified bank transfers: I found no such reader in the code, but I cannot see external tooling. See decision C.

## A. Several open instructions of different types on one record (decision needed)
**Fact now:** each start is bounded by the outstanding balance on its own; open instructions are not added together. A deposit and a full-balance instruction can both exist. **What is already safe:** a bank approval is checked against what is still owed under the new record lock (a later one that no longer fits is refused); a card payment cannot be refused once the provider has collected it, so an over-collection is flagged for review (it opens a case) and never silent. The verifier now sees a note when open instructions together exceed what is owed.
**Options for the start itself:**
1. *Leave as is (current).* No client is ever blocked; risk is a possible card over-collection that needs a refund.
2. *Block at start:* a new instruction may not exceed outstanding minus the other open instructions. Closes the gap for new starts. Cost: an abandoned instruction (no expiry exists today) blocks the client from paying a different way until a person clears it.
3. *Block at start plus expiry:* as 2, and an unpaid, evidence-free instruction expires after N days (marked failed, kept in history). Needs a number N and a decision whether card attempts count against bank instructions and the reverse.
4. *Warn, don't block:* the client sees "you already have an open instruction PAY-… for $X" and chooses.
**Recommendation:** 4 now (no policy risk), 3 once you set N. Not implemented: it changes what a client can do.

## B. A card payment that takes the total above what is owed
Handled as a review case (reason `over_collection`), created by a database trigger so every path is covered. **Decision:** who resolves these and how: refund the excess (recorded as a refund row), adjust the amount due (the record's own audited override), or record as a credit. The resolution list in the screen offers all three plus "confirmed not charged" and "other", each with a written note.

## C. The bank's reference and `gateway_reference`
Chosen: a new column `bank_transaction_reference` for new verifications; no back-fill. Alternatives: (a) keep one column and make the card lookup never match bank rows (done as well, in the webhook), cheaper but leaves two meanings in one column; (b) back-fill history into the new column (changes existing financial rows: not done). **Decision:** whether you want the history back-filled later (a one-off, reviewed script) and whether any outside report reads `gateway_reference`.

## D. Card reference uniqueness
`PROPOSAL_card_gateway_reference_unique.sql`: one card row per (provider, reference). Risk is only a historical duplicate in the target database; the diagnostic query answers that before anything runs.

## E. A new payment status for "needs review" (not chosen)
Adding a status such as `needs_review` would change the check constraint and every place that branches on `payments.status` (portal, receipts, claims, sync, queues). The review-case table gives the same manual-review state without touching any of that: payment statuses are unchanged and a case is simply open or resolved. If you prefer a visible status, it is a later, larger change.

## F. Release order and rollback (each step needs your separate approval; none is requested now)
1. Run both diagnostics (read-only) against the target database.
2. `PROPOSAL_payment_integrity_controls.sql` (fixes the verification race; adds review cases and the bank reference column). **Apply BEFORE the application release**: the receipt page and review screens read the new column/table tolerantly, but the verification function needs the lock and the new column together. Rollback: `ROLLBACK_payment_integrity_controls.sql` (restores the original function; copies new bank references back into `gateway_reference`; discards review cases, so export them first if any are open).
3. `PROPOSAL_bank_transfer_one_open_instruction.sql` (rollback file alongside).
4. `PROPOSAL_card_gateway_reference_unique.sql` (rollback file alongside).
5. Application release. If it ships before step 2 nothing breaks: opening a review case, reading the queue and reading the new column all fail soft, but the race remains open until step 2.

## G. Remaining financial risks after this work
- **Card over-collection from two simultaneous starts of different types** is detected and flagged, not prevented (decision A).
- **Provider-side facts the application cannot see:** a charge at the provider with no matching webhook (for example a lost event) stays `pending` until the status check or a person reconciles it; unmatched webhook events are logged in `payment_webhook_events` but do not open a case (there is no payment to attach one to).
- **The review queue depends on people:** an open case does not expire or escalate.
- **The staff-recorded enquiry has no path to a client's portal login** (observed in the journey lab): a client can pay online only if the record is already owned by their portal account. For records staff create (phone, WhatsApp), there is no screen that links them, so such clients would have to be given payment instructions outside the system, or the link set by a developer. Decision needed before real clients use checkout.
- **Card initiation is not audited** (only completions are): a failed or abandoned start leaves a payment row but no activity entry.
