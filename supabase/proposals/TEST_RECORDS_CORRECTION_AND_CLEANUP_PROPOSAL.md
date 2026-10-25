# Test records: correction and cleanup proposal (NOT EXECUTED) — prepared 2026-10-25

Nothing in this document has been run against Production. Inventory below is from a read-only query of Production on 2026-10-25.

## 1. Correction: ORD-QUO-2026-000006 `is_test`
- **File:** `PROPOSED_correct_test_flag_ORD-QUO-2026-000006.sql`. **Affected records: 1 row** in `client_quotations` (id `900f800c-51b5-4e4b-841b-0c9fe94bd950`), plus 1 audit row.
- **Change:** `is_test` false -> true. Nothing else: price, status, version, items, discount, communications and the conversion link are untouched. `updated_at` moves (existing trigger).
- **Dependency checks (all clear):** draft, never issued or accepted; not a Crew Support quotation; no `amount_due_quotation_id` pointing at it; no amount event; no agreement context; no payment. The only triggers on the table are the directory-link guard (applies to signed-in sessions, not this change) and `updated_at`.
- **Built-in safeguards:** the script refuses unless the quotation and enquiry are in exactly the inventoried state, expects exactly 1 updated row, and is one transaction.
- **Audit:** one `activity_log` entry `client_quotation.test_flag_corrected` with before/after, reason and approver. No existing audit row is altered.
- **Rehearsed** on synthetic records (including the refusal case).

## 2. Inventory of records created by the test (all tied to enquiry `ENQ-TEST-PERSIST-001`, id `a0cbcb39-…`)
| Table | Rows | Notes |
|---|---|---|
| enquiries | 1 | `is_test`, emails suppressed, `.invalid` address, no client link |
| enquiry_price_communications | 3 | revisions 1 ($225), 2 ($390), 3 ($351, discounted) — append-only |
| enquiry_discount_approvals | 1 | 10%, approved — "TEST ONLY — verifying discount" |
| enquiry_followups | 0 | none were created |
| enquiry_conversions | 1 | links revision 3 to the quotation |
| client_quotations | 1 | ORD-QUO-2026-000006, draft v1, USD 351 |
| client_quotation_items | 1 | |
| activity_log | 7 | created, 3 prices, discount proposed, quotation created, converted — **audit; keep** |
| payments / amount events / notes / agreements | 0 | nothing financial or legal was created |

Not part of this test and **not touched** (listed so nothing is mistaken for it): real enquiries ENQ-2026-000006 to 000009; Bright's CSR-2026-000002 and its quotation ORD-QUO-2026-000005; and the earlier Crew Support QA records CSR-2026-000001 and CSR-2026-000003 with ORD-QUO-2026-000003/000004 (already flagged `is_test`). Say if you want those in a separate proposal.

## 3. Cleanup options
**Option A (recommended): classify, don't delete.** Apply the correction in section 1 and keep everything. All rows are clearly labelled test, the enquiry is `is_test`, and the history stays intact. No guard is ever bypassed. Cost: 1 enquiry, 1 quotation and a handful of rows remain forever, flagged as test.

**Option B: remove the test records** (`PROPOSED_cleanup_test_enquiry_ENQ-TEST-PERSIST-001.sql`). Needed because the communication, discount, follow-up and conversion tables are append-only by trigger, and their foreign keys block deleting the enquiry. The script:
1. refuses unless every precondition matches the inventory above (counts, labelled test enquiry, draft quotation, nothing financial or legal attached);
2. first writes a **complete JSON snapshot of every row it is about to remove into `activity_log`** (the evidence outlives the records);
3. disables only four guard triggers, deletes children first, then the draft quotation (items cascade) and the enquiry, and re-enables the guards;
4. verifies zero records remain and all four guards are enabled again; any error rolls back everything, including the trigger changes.
- **Never touched:** the audit log (its 7 rows stay, plus the snapshot entry), the quotation sequence (ORD-QUO-2026-000006 stays a documented numbering gap; the next quotation is 000007), real clients and every other record.
- **Before running:** a fresh verified backup (R8) taken immediately before, and your written approval. No migration is needed.
- **Rehearsed** on a disposable database: refuses with an attached record (nothing changes, guards stay on); then removes exactly the synthetic records, keeps the snapshot, re-enables the guards, and append-only protection still works afterwards.
- **Trade-off:** Option B is irreversible for the live tables (recoverable only from the snapshot in the audit log or the backup). If a regulator or auditor could ask what was tested, Option A keeps more.
