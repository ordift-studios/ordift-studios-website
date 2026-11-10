# PLAN (NOT approved; nothing applied, pushed or deployed): release of migration 0187 + payment-arrangements code

Final local preparation, 11 Nov 2026. Branch `local/finance-payment-arrangements`, based on Production `main` (ad5e27f). Review proposal: PROPOSAL_acquisition_payment_arrangements.md.

## Exact release scope
| Part | Fingerprint / content |
|---|---|
| Migration `supabase/migrations/0187_acquisition_payment_arrangements.sql` (body identical to the rehearsed proposal; 2 header lines differ) | sha256 `01dff67ec9e1b4b92c075a09c462d66f6c7638d91c77ae9b125e583a0a53e9bc` |
| Rollback `supabase/proposals/ROLLBACK_acquisition_payment_arrangements.sql` | sha256 `322bd633c008b2e6719b2ec5b2cc49e30e31a8ab7f9c45bacbf7880036a5862a` |
| What the migration adds | 2 tables (terms, payments), 4 functions (set terms, record payment, void payment, **record_acquisition_bundle — one atomic call**), 2 guard triggers, RLS (Super Admin read only), no client write grants; widens ONE check list on the empty audit-events table |
| Code | arrangement/payment rules, generalised position + view-model, library + server actions + panel ("How is it paid?", Payments section, terms/void forms), atomic bundle call; the acquisition side refuses an invoice or document already recorded as an expense (read-only check) |
| Funding wording | the panel shows "stated by the Founder; statement verification pending" (presentation only; a stated source is never shown as verified) |
| NOT in this release | the duplicate check on the EXISTING expense form (prepared and tested, held back to keep this release strictly to payment arrangements) and the optional database duplicate-expense triggers; any asset-link function; statement tables; any record, upload or classification; Audit & Compliance / document-first / job-costing work (design only) |

## Three-step recording workflow — resolved by making it atomic
Before: purchase, terms and first payment were three audited calls (a later refusal left a purchase "to be confirmed"). Now a non-financed purchase with terms and/or a payment is **ONE database call** (`record_acquisition_bundle`): all or nothing. A financed purchase keeps its own atomic path (purchase + agreement + instalments + first payment); a plain purchase with no terms/payment uses the original call.
Recovery and duplicate prevention (each rehearsed in SQL and covered by unit tests):
| Situation | Result |
|---|---|
| A rule refuses any part (over-payment, document of another entity, missing due date, payment on an "unpaid" arrangement, financing key) | NOTHING is recorded; fix the entry and submit again |
| The response is lost after a successful save and the form is submitted again | refused by the unique invoice index ("already recorded"); nothing is duplicated; open the panel to see the record |
| A purchase exists with no terms (recorded earlier, or "to be confirmed") | open "Set how it is paid" on the purchase, then "Record a payment" |
| A payment was entered twice | an identical payment (amount, date, method, reference) is refused; a genuinely different duplicate is voided with a written reason |
| A concurrent second payment would exceed the net price | refused under the row lock (race test: one of two, two of three) |

## Distinctness and double counting (verified)
Cost = acquisition net; owed = supplier balance (non-financed) OR financing liability (financed) — never both; payments = instalments (financed) OR direct payments (non-financed) — never both (financed purchases refuse direct payments in the database); expense = 0 everywhere (rehearsals assert no `entity_expenses` row; source-level tests forbid any expense write); a document backing a purchase, a financing agreement, an instalment or a payment cannot back an expense (application check; DB triggers optional). The original PayLater/instalment workflow is unchanged: the original 0186 rehearsal passes with 0187 applied on top (`rehearse_payment_arrangements.sh both`). No payment can be bank-verified: the new tables have no verification/statement column, events record `bankVerified: false`, and the panel only ever shows "awaiting statement".

## Release scripts (prepared in ~/ordift-release; none run except the read-only check)
`r20_backup_pre_payment_arrangements.sh` (your Terminal, password typed only there) -> `r20_restore_check.sh <backup folder> write` (local, no password) -> `apply-payment-arrangements/preflight.sh` (read-only) -> `apply-payment-arrangements/apply.sh check` (read-only; passes) -> `APPLY=yes APPROVED_COMMIT=<40-char sha> APPROVED_SHA=01dff67ec9e1b4b92c075a09c462d66f6c7638d91c77ae9b125e583a0a53e9bc apply.sh apply` (refuses without a COMPLETE r20 backup under 6 hours old AND a PASSED restore check; applies ONE migration; verifies read-only; compares the existing finance fingerprint) -> then the fast-forward push.

## Sequence and rollback
Backup -> restore check -> preflight -> apply 0187 -> verify -> push code (fast-forward) -> smoke checks -> your iPad check. Rollback: redeploy the previous deployment; the migration while the new tables are empty (the script refuses if any row exists, and restores the original audit-event list); afterwards void rows, restore from the backup only with your approval.

## Evidence (local; synthetic data)
SQL rehearsal of the exact 0187 file on the lab: apply PASS, rollback PASS, verifier fails as designed, `both` (0186 + 0187 + the original 0186 checks) PASS; atomicity, retry and refusal checks PASS; two-session race test PASS (negative control fails); 0186's own rehearsal and race test still PASS. Full unit suite 438 files / 6,689 tests, `tsc`, `next build` clean; read-only Production pre-check and gated `check` pass (ledger 0186/178, none of the new objects, audit-event list is the 0186 list, finance tables empty, FNAC documents intact).

## Residual risks
1. Direct payments stay "awaiting statement" until the reconciliation feature exists.
2. The migration changes a check list on a live (empty) table; rehearsed rollback restores it.
3. **The existing expense form is NOT changed by this release**: it can still record an expense for an invoice that is also an acquisition (an old, known gap). Mitigation until the held-back check ships: procedure rule — record equipment only through Equipment & Financing. The acquisition side does refuse an invoice/document already recorded as an expense.
4. Deposit to a supplier plus a financed balance is not supported.
5. The Assets & Equipment register has no legal-entity column (see the asset reconciliation note): linking an acquisition to an asset needs a small separate change and must not be assumed.
6. No signed-in session test by me; your iPad check follows the release.
