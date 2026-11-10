# PLAN (NOT approved; nothing applied, pushed or deployed): combined migration + code release for Finance Phase 1

Prepared 2026-11-10 on `local/finance-phase1`. Supersedes the "code ships later" note in PLAN_finance_migration_backup_rollback.md (that plan's gates, backup and rollback still apply).

## What ships
| Part | Content | Fingerprint |
|---|---|---|
| Migration (number assigned at release; next free after Production's 0185) | `PROPOSAL_equipment_acquisitions_and_financing.sql` — 4 tables, 2 write functions, audit; additive | sha256 42398ae882428656b89ddf183078412770498eec033eeb18d0a03d152ec4aa59 |
| Rollback | `ROLLBACK_equipment_acquisitions_and_financing.sql` (refuses if any row exists) | sha256 34e563369d66e0006d7613c919497c086c7bd5b4449489428536714a1b80de8b |
| Code | `/admin/organization/legal-entities/[entityId]/equipment` panel + actions, `equipmentFinancing*.ts`, `equipmentPanelView.ts`, `equipmentForms.ts`, `financePosition.ts`, `statementReconciliation.ts` (pure), link on the entity page | commit hash to be recorded at approval |
| Not shipped | optional duplicate-expense guard (own proposal), statement tables (not written), any record/document/posting |

## Order (migration first, code second, because the code is inert without its tables and the tables are inert without code)
1. Founder approves the exact code commit and both SQL hashes in writing. If the code is on a branch that includes the 0185 file, nothing else is needed; main already holds it (bdb03c9).
2. Fresh encrypted backup (PITR is NOT enabled in Production): derive from the r17/r18 scripts; read-only; password typed only in the Founder's own Terminal; verified archive; within 6 h of the apply.
3. Read-only pre-checks: ledger = 0185 / 177; none of the four tables or two functions exist; `entity_expenses` row count + fingerprint recorded.
4. Apply exactly one migration. Post-checks: tables present, RLS on, anon/authenticated have no write grants, service_role cannot delete, functions executable by service_role only, tables empty, finance fingerprint unchanged.
5. Push the code (`main` auto-deploys: a Vercel deployment follows; rollback target = the current Production deployment). Post-deploy: `/` and `/portal/login` 200; the equipment route redirects signed-out visitors; the entity page link shows only to Super Admin; the empty panel renders for a Super Admin (Founder's session; the agent cannot sign in).
6. Only then, as SEPARATE approvals: upload the FNAC receipt and PayLater PDF to the vault; record the acquisition through the panel; later, statement reconciliation.

## Rollback
- Code: redeploy the previous Production deployment (or revert the commit); the panel disappears, tables stay inert.
- Migration with no rows: run the rollback script (refuses if rows exist). With rows: void rows (append-only) rather than remove; last resort restore from the backup with the Founder's approval.

## Evidence already in hand (local only)
- Unit: full suite 433 files / 6,610 tests pass (8 skipped); new/changed finance tests 61 in the entity + organization equipment area; eslint and `tsc` clean; `next build` succeeds with the new route.
- Lab (rolled-back transactions): proposal apply PASS, rollback PASS, verifier fails as designed; the panel's exact column lists run against the proposal schema; the instalment→obligation relation used by the ownership check exists.
- Not done: no browser walkthrough (by instruction), no concurrency test of two Super Admins marking one instalment paid (the DB function locks the row with `for update`; a Vitest test cannot prove it), no Production read-only check.

## Gates the Founder should expect to decide
Approve commit + hashes; approve backup run; approve the apply; approve the push; each later data step separately. Standing holds (legal review, refund execution, Production e-mail, real payments, Plan B) are untouched.
