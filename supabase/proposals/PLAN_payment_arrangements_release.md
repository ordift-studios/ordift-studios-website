# PLAN (NOT approved; nothing applied, pushed or deployed): releasing the acquisition payment-arrangements extension

Local branch `local/finance-payment-arrangements` (on top of Production main `ad5e27f`, with the unreleased Phase 2 items merged: application-level duplicate check, funding labels, record-sheet tools). Review proposal: PROPOSAL_acquisition_payment_arrangements.md.

## What ships
| Part | Content | SHA-256 (rehearsed file) |
|---|---|---|
| Migration (number = next free after 0186, i.e. 0187, assigned at release) | PROPOSAL_acquisition_payment_arrangements.sql — 2 new tables (terms, payments), 3 audited functions, 2 guard triggers, RLS; widens ONE check list on the empty audit-events table | 9f4649667c81009fffa6817eff33fece65bb9f0aaaf53ccaca149fef3e7535fe |
| Rollback | ROLLBACK_acquisition_payment_arrangements.sql — refuses if any terms/payment/event row exists; restores the audit-event list | 0ae1747c385881a4b36446f6b366b313611010a56126ac83358ea5b3266943a6 |
| Code | arrangement/payment rules, generalised position + view-model, library + 3 new server actions, panel (How is it paid, Payments section, terms/void forms), expense-side overlap check also covers payment evidence | commit named at approval |
Also in the code release (already reviewed earlier, unreleased): duplicate-expense application check, funding wording, entity-page tweaks listed in the Phase 2 notes. Optional DB duplicate-expense triggers are NOT part of this release.

## Release sequence (each step needs your written approval; stop at the first failure)
1. **Prepare the numbered file**: at release, create `supabase/migrations/0187_acquisition_payment_arrangements.sql` = the proposal with only its two header lines changed (the 0186 precedent), re-run the rehearsals against THAT exact file, record its SHA-256.
2. **Backup (your Terminal; password typed only there)** with the r19-style script (new prefix), then the **restore check** (local, no password). The apply script refuses without both.
3. **Read-only Production checks**: ledger = 0186/178; none of the new tables/functions exist; the audit-events check constraint exists under the expected name with the 0186 list; existing finance tables empty.
4. **Apply exactly one migration** via the gated script (derived from apply-finance/apply.sh), then read-only verification (RLS on both tables, no client write grants, no service_role delete/truncate, three functions service_role-only, two triggers, constraint widened, new tables empty, existing finance fingerprint unchanged).
5. **Push the code** (fast-forward of main) after step 4 passes; Vercel builds. Code deployed BEFORE the migration is harmless to view (the loader treats missing tables as empty) but recording non-financed payments would fail with a plain message — so the order stays migration first.
6. Smoke checks (public pages 200; admin routes redirect when signed out) and a Super Admin walk-through by you on the iPad. Rollback target = the deployment current before the push.

## Rollback
Code: redeploy the previous deployment. Migration while the new tables are empty: run the rollback script (it also restores the original audit-event list). After rows exist: void rows (append-only), restore from the backup only as a last resort with your approval.

## Evidence so far (local, synthetic data)
- DB rehearsal on the lab database (migration 0186 + proposal, rolled back): apply PASS, rollback PASS, verifier fails as designed; covers every arrangement, refusals, Qatar/Ghana separation, append-only/void, privileges, audit events, no expense created.
- Two-session race test: A) two payments of 600 on a 1,000 purchase -> exactly one succeeds; B) three payments of 400 -> exactly two succeed; totals 600 / 800; negative control (row lock removed) FAILS as expected.
- Unit/UI: full suite 438 files / 6,685 tests pass; `tsc` clean; `next build` includes the routes; real-browser check of the real panel at 820 px (2x2 figures, no horizontal overflow), 375 px (one column, tables scroll inside their own box, no page overflow) and desktop (conditional payment fields).
- Not done: no signed-in Super Admin session test (you will do this on the iPad), no Production read-only compatibility check yet (done at release step 3).

## Residual risks
1. Recording a purchase with terms and a first payment is three audited calls, not one transaction: if a later step is refused the purchase exists with "arrangement to be confirmed" and the message says what is missing (never assumed paid).
2. Direct payments have no statement-verification link yet (by design): they stay "reported — awaiting statement" until the reconciliation feature exists.
3. The migration widens a check constraint on a live (empty) table; the rollback restores it. Rehearsed.
4. Database duplicate-expense triggers (optional, separate) do not yet reference payment evidence documents; the application check does.
5. Deposit paid to the supplier plus a financed balance is not supported (financed amount must equal the net price).
6. The existing "View →" document buttons (a pre-existing pattern) show a dev-only hydration warning about target="_blank".
