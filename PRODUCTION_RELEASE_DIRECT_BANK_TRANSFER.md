# Direct Bank Transfer — Production release runbook and readiness

Prepared 2026-10-11 from branch `direct-bank-transfer` (based on `origin/main` ca65a35). **Nothing in this document has been executed against Production except read-only inspection.** Staging is not used anywhere in this workflow (Founder directive).

## 1. Readiness checks
| Check | Result |
|---|---|
| Branch content | 1 migration, its rollback, the feature code, tests and docs; no unrelated change. The Bright scratch SQL is excluded from the branch |
| Production migration history | applied through **0149**; local-only = **0151**; remote-only = none; `db push --dry-run` lists exactly `0151_direct_bank_transfer.sql` |
| Dependency on 0150 | **None.** 0151 references no 0150 object. 0150 (payment exceptions) exists only on the unreleased `crew-support-payment-policy` branch, so nothing is skipped. When that branch ships it should be renumbered **0152** (it is unreleased, so this is free) to keep strict order |
| Schema compatibility | no pre-existing columns/functions/tables with the new names; `payments_status_check` present (replaced with a superset); `bank_accounts` has 0 rows; existing payment statuses all fit; all policies 0151 drops exist under the expected names |
| Unit/assertion/security tests | **3,623 / 3,623 passing** (210 files) |
| Isolated-DB E2E | **27 / 27** bank transfer + **26 / 26** Crew Support, each on a freshly rebuilt DB with the final migration chain |
| Type check / lint | clean |
| Application build | **compile + type phases pass in a clean, env-free copy; all new routes present.** The page-data phase needs the Sanity read token (a secret not retrieved here), so it runs on Vercel; a failed Vercel build leaves the current Production deployment serving |
| Migration review | additive; no data change; no existing row rewritten (asserted by test); the only `delete`/`drop` are in the rollback. Privileges reviewed: verification function and gate function not executable by `anon`/`authenticated` (service role only / nobody); both `security definer` with `search_path = ''`; verification history is append-only even for the service role; `anon` and `authenticated` hold no write rights on the new/changed tables; clients and general admins cannot read bank accounts or the history through the API; proof files readable only by the owner and Super Admin. One hardening gap found in review (default `anon` rights on `bank_accounts`) and fixed |
| Ghana Paystack | `git diff` against `origin/main` touches only `checkoutService.ts` (a 7-line guard that blocks a Qatar-market record from the Ghana gateway; Ghana records pass through unchanged) and `gatewaySync.ts` (**35 lines appended, 0 changed or deleted**). Provider, webhook route, reconciliation and the Ghana checkout form are unchanged; the existing Paystack tests pass |
| Backup | latest daily physical backup **2026-10-11 00:08 UTC** (COMPLETED); PITR is off. The migration is additive and the rollback is tested and refuses to run over real data. The CLI cannot trigger an on-demand backup; if a fresher backup is wanted, take one from the Supabase dashboard before approval |
| Integrity baseline | `scripts/production-fingerprint.sql` recorded before; must be identical after the migration and again after the deploy (a difference must be explained by genuine Founder-driven activity) |

## 2. Super Admin access (Production, read-only)
Two accounts hold `super_admin` (member 0001 — the Founder — and one other, active). Four hold `admin`. No `finance.*` grants exist. After this release: Super Admin sees Payments → Pending Verification, Bank Accounts, Exchange Rates; general admins can still view the payments list but **cannot** open evidence, bank details or verify; a named Finance person gets verification only through an explicit grant (`finance.bank_transfer.verify`, Authority page).

## 3. Bright's pending payment attempt (read-only findings)
- One unfinished attempt: **PAY-2026-000004**, Paystack **card/Mobile Money in GHS 3,046.70** (USD 274.73 at the Ghana rate 11.0898), created 2026-10-11 12:20:32 UTC, still `pending`, gateway reference present. It was created because his record uses the default (Ghana/Paystack) market.
- **No webhook events, no completion claim, no activity, `amount_collected` empty, receivable unchanged (due 274.73, paid none).** The database shows no money collected. It cannot prove Paystack hasn't charged him (a webhook can be missed) — check **PAY-2026-000004 in the Paystack dashboard**.
- Why he saw "A payment attempt is already in progress": the Ghana checkout blocks a second attempt for the same record and payment type while one is pending and younger than 5 minutes, then asks Paystack whether it is over; Paystack keeps a hosted session "pending" until it is completed or abandoned, so he stays blocked until Paystack reports it abandoned or he completes it.
- **Will it stop Direct Bank Transfer?** No. The Qatar flow doesn't consult gateway attempts. Once his payment market is Qatar the Ghana gateway is also refused for him. To switch the market the Super Admin ticks an acknowledgement; the attempt is left untouched and its reference is written to the audit entry.
- **Risk to know:** that card session could still be completed later. If bank transfer is verified first and the card then completes, the existing gateway path records what Paystack really collected without an overpayment check (pre-existing behaviour); the bank-transfer side is protected (it refuses to credit beyond what is owed). Recommend resolving PAY-2026-000004 before his live transfer.
- **Locking mechanism:** works as designed (it prevents duplicate live card sessions and self-heals once Paystack reports a terminal state). The only correction needed was the market-switch interaction above, now handled. No change to the lock itself.
- **Not touched:** nothing was cancelled, expired, deleted or modified. The existing admin "Reconcile Now" on that payment (it only reports what Paystack says, never forces a status) would need your separate authorisation.

## 4. Currency policy (for your confirmation)
Quotations stay in USD (Bright: USD 274.73, unchanged). Recommended rate **3.64 QAR per USD** — the Qatar Central Bank's official peg ([Gulf Times](https://www.gulf-times.com/story/597745)) — entered by you under Exchange Rates → USD→QAR with a reason, append-only and visible in history. At checkout the server computes the QAR amount (**274.73 × 3.64 = QAR 1,000.02**), locks the rate and time on the payment, and shows the client "Transfer exactly QAR 1,000.02 = USD 274.73 at 1 USD = 3.6400 QAR". A stale quote is refused. If you adopt a different rate, the displayed amount follows it. Nothing is silently rounded or re-priced.

## 5. Production steps and the exact commands that need your approval
Nothing below runs until you approve **each** numbered command at the time.
1. **(read-only)** `supabase link` to the Production project, fingerprint baseline, `supabase backups list`.
2. **Migration (needs approval):** `supabase db push --yes` — applies only `0151_direct_bank_transfer.sql`. Then the fingerprint must match the baseline.
3. **Deploy (needs approval):** `git push origin direct-bank-transfer:main` — a fast-forward of `main`, which Vercel deploys to Production. (Order matters: the code reads columns added by 0151, so the migration must come first.)
4. **Smoke tests (read-only / rolled-back):** see §6. Then fingerprint again.
5. **(housekeeping)** `supabase unlink` so no project stays linked (Staging is not to be used).

**Rollback:** code first — promote the previous Production deployment in Vercel (or revert the merge); only then, if needed, run `supabase/rollbacks/down_0151.sql` in one transaction and `supabase migration repair --status reverted 0151`. The rollback refuses to run if any bank-transfer data exists. Rolling the database back while the new code is live would break the payment pages, hence the order.

## 6. Production smoke tests (no money, no fabricated receipts)
- Read-only: new tables/columns/policies/grants exist as designed; Qatar market row exists and is **inactive**; no bank account exists; Ghana config and Paystack rows unchanged; existing payments, receivables, crew records and audit rows unchanged (fingerprint).
- Rolled-back transaction (a `BEGIN … ROLLBACK` script; nothing persists): the database function refuses a non-Super-Admin verifier; refuses a payment that doesn't exist; an account can't be activated without a confirmation; the append-only history rejects UPDATE/DELETE.
- Founder-run (your own sign-in): Payments shows Bank Accounts, Exchange Rates, Pending Verification (empty); Bank Accounts opens and shows nothing active. Nothing is added until you configure the account.
- Not possible without real money or real Paystack: a live Ghana card charge. Ghana is protected by the unchanged code, the passing Paystack tests, and the read-only checks above; a live Ghana test remains a Founder action if wanted.
- Qatar checkout appears for Bright only after: Qatar market enabled + an **activated default** account + a QAR rate + his market set to Qatar. Until then he sees "Bank transfer isn't available yet".

## 7. Bright's live test (after the above and your configuration)
1. You add the CBQ account (details entered by you; inactive). **Do not activate the personal account until its eligibility is confirmed** — activation requires a recorded basis and an explicit confirmation.
2. You add the QAR rate (confirm 3.64 or your rate).
3. Enable the Qatar market; activate the account as default; set Bright's payment market to Qatar (tick the acknowledgement for PAY-2026-000004, or resolve it first).
4. Bright opens Payments → Pay Now → sees CBQ details, **QAR 1,000.02**, his `PAY-…` reference → transfers → uploads proof.
5. It appears in Pending Verification. You check CBQ online banking, open it, enter what actually arrived, tick the independent-check box, approve. The receivable updates through the existing governed workflow; a receipt is sent; the history is kept.

## 8. Outstanding
- Your decision on the USD→QAR rate and your written CBQ eligibility confirmation (blocking for activation, not for deployment).
- Resolve PAY-2026-000004 (your authorisation needed).
- Full Vercel build runs only on deploy (cannot be pre-run locally without the Sanity token).
- Renumber the payment-policy migration to 0152 before it ships.

## 9. Second-round findings (2026-10-11, read-only)
- **PAY-2026-000004:** still `pending`, no webhook events, no amount collected, receivable unchanged. The authoritative Paystack status cannot be read from here: the only supported call (`verifyTransaction`) needs the Production Paystack key held in Vercel, which is not retrieved. A **read-only "Check Paystack status"** action was therefore added to the payment page (committed, not deployed): it asks Paystack through the existing integration, writes nothing to payments/receivables (audit entry only), and explains what Reconcile Now would do. Until it is deployed, the authoritative check is the Paystack dashboard (search PAY-2026-000004). Reconcile Now by status: *success + matching GHS 3,046.70* → completed, USD 274.73 credited, receipt emailed; *success + mismatch* → marked failed, not credited, manual handling; *failed / abandoned / not found* → marked failed (history kept), lock released; *ongoing* → no change. A late payment on a row already marked failed is logged as a completion conflict, **not** credited automatically. Paystack has no documented cancel call that was found; to confirm whether an abandoned session can still be paid, ask Paystack support.
- **Rate:** 3.64 QAR/USD proposed (not entered); Bright USD 274.73 → **QAR 1,000.02** (274.73 × 3.64 = 1,000.0172, rounded to 2 dp). The payment row records the rate, its source ("ordift"), the lock time and the exact QAR amount; the quotation stays USD 274.73.
- **Second Super Admin:** the Founder's own secondary (backup) Super Admin account. The Founder confirmed on 2026-10-11 that it is intentional and keeps full Super Admin privileges, including bank-account management and payment verification. Not modified.
- **Backups:** daily physical backups retained for 8 days; latest **2026-10-11 00:08 UTC** (~13 h old at 13:23 UTC); PITR off. A restore (Supabase dashboard) replaces the whole database and loses everything since the backup — a last resort, not a rollback tool for this migration. The CLI cannot create an on-demand physical backup. Options for a fresher recovery point: (a) a logical dump of the tables 0151 alters, restored into a throwaway database to prove it; (b) enabling the PITR add-on (a billing/config decision). 0151 is additive and its rollback is tested, so neither is required.
