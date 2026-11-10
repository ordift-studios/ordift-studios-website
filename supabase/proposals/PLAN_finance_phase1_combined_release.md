# PLAN (NOT approved; nothing applied, pushed or deployed): combined migration + code release for Finance Phase 1

Final readiness version, 2026-11-10, branch `local/finance-phase1`. Supersedes the earlier draft of this file. Gates, backup and rollback of PLAN_finance_migration_backup_rollback.md still apply.

## What ships (all additions; the only edited existing file is the legal-entity page, +1 link line)
| Part | Fingerprint |
|---|---|
| Migration `supabase/migrations/0186_equipment_acquisitions_and_financing.sql` (4 tables, 2 write functions, audit; additive; body identical to the rehearsed proposal, 2 header lines differ) | sha256 `f945fe6ecc15e74270971fa40ae1b667c89944a3e5347b47b529522ec22d9a22` |
| Rollback `supabase/proposals/ROLLBACK_equipment_acquisitions_and_financing.sql` (refuses if any row exists) | sha256 `34e563369d66e0006d7613c919497c086c7bd5b4449489428536714a1b80de8b` |
| Code: Equipment & Financing panel (Super Admin), `equipmentFinancing*.ts`, `equipmentPanelView.ts`, `equipmentForms.ts`, `financePosition.ts`, `statementReconciliation.ts` (pure, not imported by any write path), `bankAccountIdentity.ts` (pure, no importer yet) | commit named in the approval |
| Tooling/docs: rehearsal scripts, design and plan documents | in the same commit |
| NOT shipped | optional duplicate-expense guard, statement tables, any vault upload, any record, FNAC posting, other migrations (the unapproved duration/territory proposal that also used the number 0186 must be renumbered if it is ever released) |

## Sequence (each step needs its own go; stop at the first failure and report, never retry)
1. **Approval** of the exact commit + the migration SHA-256 (+ rollback SHA-256).
2. **Backup (Founder's own Terminal; password typed only there):** `~/ordift-release/r19_backup_pre_finance.sh /Volumes/OrdiftRepoBackup` -> folder `r19-<stamp>` with STATUS COMPLETE (consistent read-only snapshot, archive listed and fully read, checksum).
3. **Recovery verification (no password, local):** `~/ordift-release/r19_restore_check.sh /Volumes/OrdiftRepoBackup/ordift-production-backups/r19-<stamp> write` restores the dump into a throwaway local database and requires the fingerprint and every table's row count to equal the backup's snapshot; writes `restore-check.txt` into the backup folder. The apply script refuses without it.
4. **Read-only check:** `~/ordift-release/apply-finance/apply.sh check` (ledger 0185/177, nothing of the new objects exists, dependencies present, CLI plan is exactly this one file). Changes nothing.
5. **Apply:** `APPLY=yes APPROVED_COMMIT=<40-char sha> APPROVED_SHA=f945fe6ecc15e74270971fa40ae1b667c89944a3e5347b47b529522ec22d9a22 ~/ordift-release/apply-finance/apply.sh apply` - re-checks everything, applies ONE migration, verifies read-only (RLS on, no client write grants, no service_role delete, functions service_role-only, 5 triggers, 3 unique indexes, new tables empty, existing finance fingerprint unchanged, site 200).
6. **Deploy:** `git push origin local/finance-phase1:main` (fast-forward of b354bce, non-forced). Vercel builds from main; record the deployment id. Post-deploy: `/` and `/portal/login` 200; the equipment route redirects a signed-out visitor; the empty panel renders in the Founder's Super Admin session.
7. Separate approvals afterwards: vault uploads, recording the acquisition, any reconciliation.

## Rollback
- **Code:** redeploy the previous Production deployment (currently `k51u6i52b`, commit b354bce) or revert; the panel disappears and the tables stay inert.
- **Migration, no rows yet:** run the ROLLBACK script (refuses if any row exists).
- **After rows exist:** void rows (append-only) rather than remove; last resort restore from the r19 backup with the Founder's approval.

## Evidence (local + read-only Production)
- Rehearsal of the exact migration file on the lab: apply PASS, rollback PASS, self-test fails as designed; two-session race test PASS (`rehearse_finance_concurrency.sh`); post-check SQL validated against a lab copy.
- Production read-only (ledger 0185/177): none of the new tables/functions/triggers exist; all dependencies present; no name clashes (incl. private helper functions); private vault bucket present.
- Full unit suite earlier: 433 files / 6,610 tests; after the last code change only the finance-related tests were re-run (67 tests) plus `tsc` and `eslint`.

## Residual risks
1. The optional duplicate-expense guard is NOT included: the same invoice could still be keyed into the existing expense form. Mitigation: nothing sums expenses with acquisitions; procedure rule until the guard is approved separately.
2. `service_role` can set a statement-evidence link once through direct SQL; no application code does (source-level test). A future reconciliation feature must use a confirming function.
3. One older vault document has no SHA-256; it cannot be linked as finance evidence (by design).
4. No browser walkthrough was run (by instruction); first real use will be the Founder's.
5. Production PITR is off: the r19 backup + passed restore check are the only recovery path for the migration step (the migration only adds objects and is reversible by the rollback script while tables are empty).
