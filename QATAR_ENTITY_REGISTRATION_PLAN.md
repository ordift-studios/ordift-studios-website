# Qatar legal entity — registration records, document vault, receipts

Status: built and tested locally on branch `qatar-entity-registration`. **Nothing is applied, merged or deployed.**
This repository is public, so **no registration number, tax ID, identity number or amount from the official documents is written in it.** The real values live only in private, git-ignored data steps (`.private/qatar-entity/`) that are applied to Production only after approval.

## What was built (reuses the Ghana architecture)
- Qatar is a **second row in `employing_entities`** (same table as Ghana), with its own `employing_entity_sensitive_details` row (registration number, tax ID — Super-Admin-only, as Ghana's), its own jurisdiction row, and `employer_capable = false`.
- Migration `0165_entity_registry_records.sql` (schema only; additive; rollback `down_0165.sql` refuses if anything is recorded):
  - `entity_registrations` — one row per CR / permit / tax registration / establishment card / name reservation / articles / chamber membership / investment-approval condition. Core facts immutable; only status can change; a replacement supersedes (history kept). One current record per kind per entity.
  - `employing_entity_documents` + file hash, filename, type, size, issue/expiry dates, authority, and a duplicate/overlap link.
  - `entity_signatories` — names and positions only (no identity numbers).
  - `entity_expenses` — one row per receipt line, linked to its receipt document. **Not** a bank transaction, payable, reimbursement or payment instruction. Amounts immutable; mistakes are voided with a reason.
- Admin page (existing Legal Entities → entity detail): Registrations & Renewals (expiry tracking, computed at read time), a clearly marked **Commercial Permit — Not yet issued** section with a record form for when the permit exists, signatories, a hash-checked document vault, receipts/expenses with a "who funded it" confirmation.
- Rules (pure, tested): the entity may be called *registered* only with a current registration; a **permit is stated only when one is recorded**; services are covered only by recorded registered activities (photography today; every other service family is "not covered" and is never activated automatically); official-document particulars never print an invented address or permit.
- Ghana: untouched (fingerprint test before/after). No Ghana transaction, balance or Bright record is read or written.

## Tests (isolated lab, synthetic data)
18 unit tests + 28 end-to-end tests (`entityRegistry.localdb.e2e.ts`) incl. database refusals with the app bypassed; full unit suite 3,885 pass; `tsc` and lint clean; `next build` compiles and type-checks (its page-data step needs Sanity env vars that local lacks — unrelated).
The private data steps were also rehearsed on a copy of the lab, twice (idempotent): 10 document rows, 8 registration records, 3 expense lines = 1,200, 1 signatory; Ghana entity byte-for-byte unchanged.

## Production steps (each needs separate approval; none is run)
1. **0165** schema (isolated procedure: link → confirm only 0165 pending → push → unlink). Note: the unapplied 0159–0164 on other branches sit below 0165; if 0165 goes first they need renumbering at deploy time (or `--include-all` for exactly those files).
2. **Step A** entity + jurisdiction + registration/tax numbers (private SQL).
3. **Upload** the 8 distinct documents to the private vault with hash verification (`upload.sh`), or by the Founder through the page.
4. **Step B** document rows (10: two byte-identical copies share the original's stored object).
5. **Step C** registrations (permit = *not issued*) and the signatory, each linked to its source document.
6. **Step D** the receipt as three expense lines (accounting entries — separate approval).
7. Deploy the code (fast-forward `main`), then the Founder presses **Verify** on the entity (verification is a recorded Super-Admin action).
