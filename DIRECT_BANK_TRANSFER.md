# Direct Bank Transfer (Qatar first)

Branch `direct-bank-transfer` (from `origin/main` ca65a35). **Not deployed. Migration 0151 not applied anywhere.** Per the Founder's directive (2026-10-11) this feature goes to **Production only — Staging is not used**; see `PRODUCTION_RELEASE_DIRECT_BANK_TRANSFER.md` for the release runbook. Built by extending the existing payments foundation — no new ledger, receivable system or Finance module.

## 1. Audit: what already existed (reused)
| Area | Existing | Gap found |
|---|---|---|
| Payments ledger | `payments` (USD reference + local currency, locked rate and source, amount collected, settlement currency, proof path, submitted/reviewed by), `payment_method='bank_transfer'`, status `awaiting_verification`/`rejected` | no "additional info" state; no receiving-account record |
| Receivable | `enquiries.amount_due/amount_paid` derived by `syncEntityPaymentStatus` (USD) | — reused unchanged |
| Completion machinery | claim table, claim-and-log activity RPC, receipt outbox, CRM sync (Paystack path) | bank-transfer approval bypassed all of it |
| Finance UI | Admin → Finance → Payments (queue + ledger + detail page), Exchange Rates (GHS only), Payables, Quotations; Super Admin sees all via `isAdmin` nav flag and holds every capability | no Bank Accounts screen; no proof viewer; **one-click "Approve" credited the *requested* amount**; rates page GHS-only |
| Client Pay Now | card/Momo + bank transfer step + proof upload route (`/api/payments/bank-transfer/proof`), private `payment-proofs` bucket (8MB, MIME-sniffed) | Ghana hard-coded; instructions created only after "I've sent it"; client-supplied country trusted; no IBAN/beneficiary/reference shown |
| Bank accounts | `bank_accounts` table (country, currency, bank, name, number, IBAN, SWIFT, active) | default active, no classification/default/audit; **readable by every logged-in user**; any admin could write via the API |
| Evidence storage | private bucket + owner-or-**any staff** read policy | staff-wide read |
| Paystack Ghana | unchanged | — |

Super Admin already had every Finance capability and the Payments nav entry; nothing was missing from navigation. What was missing was Qatar plumbing and a safe verification step.

## 2. What was added
- **Migration 0151** (additive; rollback `supabase/rollbacks/down_0151.sql`, tested; refuses to run over real data): bank-account governance columns + DB constraints (an account cannot be active without a recorded activation confirmation; one default per market/currency; personal accounts need a written basis); payment columns (receiving-account link + immutable snapshot, client bank reference/date, client-visible note) and status `additional_info_required`; append-only `bank_transfer_verifications`; atomic `verify_bank_transfer_payment()`; `enquiries.payment_country`; **inactive** Qatar row in `payment_country_config` (`bank_transfer` only); proof-read policy narrowed to owner/admin; bank accounts server-side-only.
- **Bank Accounts** (Admin → Finance → Payments → Bank Accounts, Super Admin only): add (inactive), edit while inactive, activate with recorded basis (+ explicit personal-account eligibility confirmation), make default, deactivate with reason, enable/disable market. All audited; live accounts not editable in place.
- **Pending Verification** (same Payments page): queue → review page showing client, quotation, receivable (due/paid/outstanding), amount and rate the client was given, receiving account as issued, secure proof link (signed, audited), history, and the decision form. The verifier must enter what actually arrived (amount, currency, bank reference, date) and tick that they independently checked the bank account. Live preview of what approving will post. Approve / Request information / Reject.
- **Posting** reuses the existing completion machinery (`finalizeVerifiedBankTransfer`): receivable update, one activity entry, one receipt via the outbox, idempotent, with a "Finish posting" retry.
- **Client**: Qatar Pay Now → exact QAR amount, unique reference (`PAY-…`), beneficiary/bank/IBAN with copy buttons, instructions, proof upload with bank reference and transfer date, resumable status page with the Founder's status vocabulary. Ghana flow untouched.
- **Market control**: Super Admin sets "Client payment market" on the enquiry's Financial card (default unchanged = Ghana).
- Exchange-rate page now manages GHS and QAR.

## 3. Safeguards (all tested)
Receipt ≠ payment (upload only reaches `awaiting_verification`); independent-bank-check confirmation required; verifier cannot be the payer/submitter; currency mismatch blocked; partial credits only what arrived at the locked rate; excess needs acknowledgement and is never auto-credited; cannot post beyond the receivable; one approved decision per payment and one approved credit per bank reference per account; row-locked so concurrent approvals post once; append-only history; no crew payable/engagement/Crew Support status change from a payment; Qatar blocked from the Paystack path server-side; market and receiving account resolved server-side; bank accounts Super Admin only in UI, action and library; clients/staff cannot read accounts; proof reachable only by admins via signed, audited links.

## 4. Currency method (recommended)
Quotations stay in USD. The Qatar rate is an admin-set, append-only entry (Exchange Rates → USD→QAR) with a recorded reason. **Recommended rate: 3.64 QAR per USD**, the Qatar Central Bank's official peg ([Gulf Times, QCB Financial Stability Review](https://www.gulf-times.com/story/597745)); the Founder should confirm it with CBQ/QCB before entering it. At payment initiation the server computes `QAR = USD × rate` (2 dp), locks rate/source/time on the payment, shows it to the client, and refuses a stale quote (`rate_changed`). Bright: USD 274.73 × 3.64 = **QAR 1,000.02**. The client's bank may add fees or convert differently — if less arrives the shortfall stays outstanding (partial handling); nothing is rounded up silently.

## 5. Bright (CSR-2026-000002) — read-only Production state on 2026-10-11
Quotation ORD-QUO-2026-000005 **accepted** (USD 274.73, payment condition none); amount due 274.73, paid none; request In production; enquiry now linked to a client account (he can sign in). Production has no Qatar config, no bank account, no QAR rate and only Ghana Paystack payments, so the existing flow could not take this payment. Because the payment condition is *none*, a payment will update the receivable and status but **does not gate** any workflow step.

## 6. Steps for the Founder (after approval and deployment)
1. Confirm with CBQ, in writing, that the account may receive business payments; keep that evidence.
2. Finance → Payments → **Exchange Rate Management → USD→QAR**: add 3.64, reason "QCB official peg".
3. Payments → **Bank Accounts → Add**: enter bank, beneficiary, IBAN yourself (never share passwords, PINs or OTPs); saved inactive.
4. **Activate**: record the basis; for a personal account tick the eligibility confirmation; keep "make default".
5. Enable the **Qatar market**.
6. Open Bright's enquiry → Financial → set **Client payment market = Qatar**.
7. When a corporate account exists later: add it, activate, make default, deactivate the personal one — history keeps the details each payment was issued with.

## 7. Bright's live test (only after QA and explicit approval)
Staging dry-run with fake data first. Then live: Bright opens Payments → Pay Now → sees CBQ details and QAR 1,000.02 and his `PAY-` reference → transfers → uploads proof → appears in Pending Verification → Founder checks CBQ online banking, opens the item, enters the real amount/reference/date, ticks the confirmation, approves → receivable shows USD 274.73 paid, receipt sent. If the amount differs, the preview and safeguards handle partial/excess/mismatch. Nothing is marked paid without the bank credit.

## 8. Evidence
Unit/assertion tests — full suite 3,623 passing; isolated-DB E2E **27 scenarios** (+ the existing 26 Crew Support scenarios, each file run on its own freshly rebuilt database) (governance, instructions, evidence, every verification outcome, concurrency, authorization, history preservation, rollback guard); migration applied, rolled back and re-applied on a throwaway database; `tsc` and ESLint clean.

## 9. Not done / open
- **No Staging QA** by Founder directive. Visual/UI verification therefore happens on Production after an authorised deployment, using read-only checks and the Founder's own sign-in. A full `next build` can't complete locally (needs the Sanity read token); the compile and type phases pass, and Vercel runs the full build with its real secrets.
- **Regulatory/banking**: whether CBQ and Qatari rules permit a personal account for business receipts is the Founder's to confirm; the system enforces that it is recorded, not that it is right. Invoicing/tax treatment of receipts is out of scope.
- **Numbering**: the unreleased payment-policy branch uses 0150; applying 0151 first is fine (`db push --include-all` handles order).
- **Verification is restricted (Founder directive 2026-10-11):** Super Admin, or a named person holding the explicit grant `finance.bank_transfer.verify` (Authority page). A general `admin` or `staff` role confers nothing. Enforced in the server actions, the proof-file route, the review screen, the database function itself (`private.can_verify_bank_transfers`) and the read policies. Bank-account management is Super Admin only.
- Bank fees/FX differences are not modelled beyond partial/excess handling.
