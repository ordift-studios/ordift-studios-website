# PLAN (not approved, nothing applied): releasing the equipment-acquisition / financing migration

Prepared 2026-11-08. Covers `PROPOSAL_equipment_acquisitions_and_financing.sql` (+ `ROLLBACK_...sql`). No migration number is assigned: Production's ledger is **0185** (177 versions) and `local/release-0185-0186` already proposes 0186, so this would be the next free number after whatever is applied first.

## 1. Where things stand
| Item | State |
|---|---|
| Proposal, rollback, rehearsal body, rules + module + 19 unit tests | committed on `local/finance-equipment-financing` |
| Rehearsal on a **Production-shaped** scratch database (`rehearse_production_shape.sh`: lab schema + 0168-0173 + 0174, 0175, 0177-0184 from `origin/main` + 0185 from the recorded release file, hash-checked) | `apply` and `rollback` pass; the "everything is gone" check was repaired and proven able to fail (`verifier`) |
| Production | finance tables absent (read-only check 2026-11-08, after the Batch 1 release); nothing applied, no document uploaded, nothing posted |
| Repository drift | **`main` has no 0185 migration file** (it is on the release branches only), so a clean checkout of `main` cannot rebuild Production's schema. Resolve before the finance release (see section 5). |

## 2. Gates (same shape as the earlier releases, e.g. `~/ordift-release/apply-0184`)
1. **Founder's written approval** of the exact commit, the migration's SHA-256 and the rollback's SHA-256.
2. **Fresh encrypted backup** with a script derived from `r17`/`r18` (`~/ordift-release/r18_backup_pre0186.sh`): read-only, database password typed only in your own Terminal, consistent snapshot, verified archive, free-space gate, completed within 6 hours of the apply.
3. **Read-only pre-checks** (`pre_*.sql` style): ledger exactly as expected; none of the new objects exist; `entity_expenses` row count and fingerprint recorded (the optional duplicate-expense trigger touches that table).
4. **Apply exactly one migration** (`supabase db push`-style plan must equal exactly that one file).
5. **Read-only post-checks:** four tables present, RLS on, `anon`/`authenticated` hold no write grants, `service_role` cannot delete, the two functions callable by `service_role` only, tables empty, fingerprint of existing finance tables unchanged, site `/` and `/portal/login` 200.
6. **Application code** (`equipmentFinancing*.ts`) ships later and separately; with no caller it is inert.

## 3. Rollback
- **Before any row exists:** run `ROLLBACK_equipment_acquisitions_and_financing.sql`. It refuses to run if any of the four tables has a row (rows are financial evidence). Rehearsed: removes the tables, six guard functions, both write functions and the optional trigger, and leaves `entity_expenses` untouched.
- **After rows exist:** export the rows first, then the rollback is a deliberate decision; the safer path is a corrective new row (the tables are append-only: void with a reason), not removal.
- **Last resort:** restore from the encrypted backup (requires the full restore procedure and your approval).

## 4. What is NOT part of this release
Posting the FNAC purchase, uploading the receipt or the PayLater PDF to the private vault, confirming card funding, or deciding the accounting classification. Each is a separate approval after the migration and the application code are live, and the **original FNAC receipt file** (only a chat copy exists) is needed first. The prepared record stays in `OS Purchases Receipts/` (outside the repository).

## 5. Dependencies and risks
- **Banking identity:** `src/lib/payments/bankAccountIdentity.ts` (pure, tested) identifies an account by its FULL IBAN, names the holder first ("PERSONAL account of ..." / "CORPORATE account of ...") and reports last-four collisions as a warning only. The two Qatar accounts are unchanged; reconciliation must use it.
- **Numbering/drift:** decide whether the 0185 file is committed to `main` first (recommended, its own approved step), and whether 0186 (duration/territory wording) ships before finance.
- **Optional duplicate-expense guard is now a SEPARATE proposal** (`PROPOSAL_optional_duplicate_expense_guard.sql`, own rollback, own rehearsal `rehearse_optional_expense_guard.sh`). The main finance proposal no longer touches `entity_expenses` at all; approve the guard independently, or never.
- **Funding source** stays `to_confirm` until a card/bank statement line is seen; the invoice names an individual, not the company.
- **Accounting classification** stays `pending_professional_review`; no capitalisation policy exists in the system.
