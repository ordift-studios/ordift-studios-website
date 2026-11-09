# OS-LGL-014 v1.1 - registration migration and controlled-master import (PROPOSAL, LOCAL; nothing applied, nothing stored in any real environment)

Prepared 9 Nov 2026 on `local/client-service-agreement`. It adds ONE bare draft row for version 1.1 under the existing OS-LGL-014 master. It changes no existing Production row, approves nothing, registers nothing under a content reference, activates nothing and issues nothing. The working draft keeps all its counsel-review markers; no clean or approved master has been made.

## What exists now
| Piece | File | Status |
|---|---|---|
| Offline planner and validator | `scripts/legal/planMasterRegistration.ts` + `src/lib/legal/masterRegistrationPlan.ts` (14 tests) | built, tested; no network, database or secret |
| Registration migration (generated, unnumbered) | `PROPOSAL_OS-LGL-014_v1.1_registration.sql` (written by the planner) | rehearsed on the lab, rolled back |
| Guarded rollback (generated) | `ROLLBACK_OS-LGL-014_v1.1_registration.sql` | rehearsed |
| Read-only verification (generated) | `VERIFY_OS-LGL-014_v1.1_registration.sql` | rehearsed |
| Read-only existing-rows query | `READONLY_existing_versions.sql` | not run (no Production access this session) |
| Rehearsal | `rehearse_registration.py` | passes; leaves the lab untouched |

The migration is GENERATED from the final master files because it must carry their real SHA-256 values and storage paths. Nothing is hard-coded now, and no synthetic hash is in any committed SQL.

## The release sequence (each step needs its own approval; none is requested now)
0. After the telephone consultation: counsel's decisions are incorporated and a final master (Word and PDF) is produced with every marker resolved.
1. **Plan (offline).** Run the planner with `--existing` (from the read-only query). It validates and writes the three SQL files, or REFUSES and writes nothing.
2. **Controlled import.** Store the two files in the private `legal-masters` bucket at the planned paths (`masters-docx/OS-LGL-014/<name>.docx`, `masters-pdf/OS-LGL-014/<name>.pdf`). This is a Production write and a separate authorised step; the files are never overwritten.
3. **Backup**, per the established practice, before any Production migration.
4. **Apply the migration.** It refuses unless both files are already in the bucket.
5. **Verify** with the read-only file: the "existing rows fingerprint" and the current-version pointer must be identical before and after.
6. **Founder screen:** Start the legal review, then Verify and register the stored master (the existing control re-downloads and re-hashes the files), then, after the call, record the Founder approval. Activation is a separate decision (see the activation-guard proposal).

## Validation covered
| Area | Where it is enforced |
|---|---|
| Version identifier: major.minor digits only; not already present; strictly higher than every existing version (numeric, so 1.10 > 1.9) | planner, and again inside the migration |
| Document hashes: 64 lower-case hex; Word and PDF differ; neither equals an existing stored master's hash; recomputed from the actual files | planner (files) and migration (no reuse) |
| Controlled-master references: path must be `masters-docx|pdf/OS-LGL-014/<safe name>`; no folders, no `..`, no quotes; never reuses another version's path; both files must exist in the bucket | planner and migration |
| Counsel-review markers: the Word text is scanned with the registry's own patterns; ANY marker refuses; nothing is stripped | planner (and again by the registry's register control) |
| Right document: the Word text must mention OS-LGL-014 | planner |
| Audit: one creation entry (fingerprints, baseline at creation, `changedExistingRows: false`, `approved: false`); rollback keeps it and appends a "rolled back" entry | migration, rollback, rehearsal |
| Injection: SQL is rendered only from a plan that passed the strict patterns; an invalid plan throws | planner tests |

## Rehearsal results (lab, one rolled-back transaction)
Refuses when the files are not in the bucket, refuses a version that is not higher, refuses a missing master; applies exactly one bare draft row (no approver, stamp, content reference, effective date or supersession); the two existing 1.0 rows are byte-identical by fingerprint; the current-version pointer is unchanged; exactly one creation audit entry; refuses to run twice and refuses reused hashes or paths; the rollback REFUSES when the row is past draft, carries an approver label, has later audit events, or is a master's current version; the rollback succeeds on the pristine draft, removes only that row, keeps the creation audit and appends the rolled-back entry; re-apply after rollback works. A deliberately altered migration that changed an existing row was caught. The walkthrough data was unchanged afterwards.
Not rehearsed: the rollback refusal for "an agreement references the version" (covered by the SQL text test only) and a run against Production-shaped storage (the lab has no real bucket; the rehearsal inserts bucket rows inside the rolled-back transaction).

## Migration and rollback readiness
Ready to review, not ready to release: it needs the final master, the read-only existing-rows file, a migration number at release (Production's ledger was 0185 at the last check; 0186 is proposed elsewhere), a backup and your separate authorization.
