# Release plan, impact assessment and authorization request: migrations 0168-0171 (NOT APPLIED)

Prepared 2026-10-25. Nothing here has been applied to Production, Staging or any shared database. The application code that depends on these migrations is already
deployed but switched OFF by two constants (see section 6), so the migrations can be applied without any user-visible change.

## 1. Verified starting point (read-only, 2026-10-24)
- Production ledger head **0167**, 160 versions applied. None of the proposed table or function names exist in Production (checked).
- `agreement_releases` 0 rows, `agreements` 5, live project files 22, enquiries 7, quotations 3: the new tables start empty and no existing row is touched.
- Dependencies present: `businesses`, `profiles`, `enquiries`, `employing_entities`, `user_roles`, `roles`, `authority_grants`, `project_files`, `engagements`, `crew_support_slots`,
  `crew_support_requests`, `agreements`, `agreement_releases`, `private.is_staff_or_admin()`, `public.ordift_studios_business_id()`.

## 2. Prerequisite P0: the 0167 file is not on `main`
Migration 0167 (Founder self-review exception) is applied in Production, but its SQL file exists only on the branch `founder-self-review-migration-0167`. `supabase db push`
refuses to run while the remote ledger contains a version the repository does not have. Before 0168 is pushed, the **file** `0167_founder_self_review_exception.sql` (byte-identical to
what was applied) must be added to `supabase/migrations/` on `main`. That adds a file only; it executes nothing. It is not part of this authorization and needs its own Founder yes.

## 3. Inventory and final numbering
| No. | Proposal file | Adds | Depends on |
|---|---|---|---|
| 0168 | `PROPOSED_0168_enquiry_pricing_followups.sql` | 4 tables, 5 functions, 7 triggers, 4 indexes, 4 policies: discount approvals, price communications, follow-ups, conversions | existing tables only |
| 0169 | `PROPOSED_0169_portfolio_library_foundation.sql` | 3 tables (candidates, collections, collection items), 5 functions (incl. `private.is_portfolio_authority`, `private.project_file_job`), 3 triggers | existing tables only |
| 0170 | `PROPOSED_0170_portfolio_marketing_permissions.sql` | 2 tables (permission requests, permission records), 5 functions (incl. `marketing_permission_state`), 4 triggers | 0169 |
| 0171 | `PROPOSED_0171_portfolio_internal_approval_and_use.sql` | 2 tables (internal reviews, use events), 4 functions (`portfolio_use_eligibility`, `portfolio_standing`), 4 triggers, 1 view | 0169, 0170 |

Why four files rather than one: 0168 (enquiries) is independent of the portfolio work and can be applied, verified or rolled back alone. The portfolio work is split by the two
approval stages so each can be reviewed and verified on its own: foundation, then rights-holder permission, then internal approval and use control.
The held **Vendor RLS** (0168/0169 in its branch) and **legal-representation** (0170) proposals are NOT applied to resolve numbering. When their turn comes they renumber to 0172 and later;
that is a file rename only, and their content is unaffected.

## 4. Impact assessment
- **Additive only.** 11 new tables, 1 view, 19 functions. No existing table, column, policy, grant or row is altered. No data is backfilled and **no existing client permission is inferred**:
  every existing photograph simply has no permission record, which the system reads as "not cleared", exactly as today.
- **Locks and size.** Only new objects are created; there are no table rewrites, so there is no lock on any existing table beyond catalog entries.
- **Access.** Row-level security is on for every new table: staff read; a client reads only the permission requests addressed to them and the permission records they gave. All writes go
  through the server (service role) after its own authority checks, and the database repeats the important checks itself (who may approve, evidence shape, both approval stages at the
  moment of use). Public/anon have no access. The two eligibility functions are callable by the server only.
- **History is permanent.** Communications, permission records, internal reviews, use events and conversions are append-only by trigger. This is intended: it is the audit trail.
- **Behaviour on apply: none.** Both application gates stay OFF, so no page reads or writes the new tables until a separate switch-on.
- **Cost.** None. No new service, subscription or storage.

## 5. Rehearsal and test evidence (local, disposable; synthetic rows)
- SQL rehearsal against a copy of the Production schema, each in a rolled-back transaction: **0168: 27 behaviours, 0169-0171: 60 behaviours, all pass**, and every deliberate rejection was
  confirmed to fail for its intended reason (not for an unrelated error).
- The four real files were applied in order to a scratch database, and the real TypeScript services were run against it through PostgREST: **13 end-to-end tests pass**
  (candidates, collections across two jobs, administrator-recorded permission, verification, internal approval, use control, withdrawal flagging, contract recognition, client portal request,
  answer and withdrawal by the right person only, communicated-price revisions, discount approval tied to the scope, follow-up reschedule and hand-over, one-quotation conversion under concurrent presses).
- Reproduce: `supabase/proposals/rehearse.sh all`, then `supabase/proposals/e2e_scratch.sh` and the two `*.localdb.e2e.ts` files (commands in their headers). `e2e_scratch.sh down` removes the scratch database.

## 6. Feature-gate sequencing (after the migrations are applied)
1. Apply 0168-0171 (this authorization). Gates stay OFF. Verify read-only (section 8).
2. **Enquiry pricing** (`ENQUIRY_PRICING_PERSISTENCE_ENABLED` in `src/lib/enquiry/pricingHistory.ts`): separate switch-on after a synthetic walk-through; never on a real client's enquiry for testing.
3. **Portfolio library** (`PORTFOLIO_LIBRARY_ENABLED` in `src/lib/portfolio/featureGate.ts`): staff candidate proposals, collections, administrator-recorded permission, internal approval and use control.
4. **Client permission requests** additionally need `PERMISSION_TEXT_APPROVED` (`src/lib/portfolio/permissionText.ts`): the wording is a DRAFT and no client can be asked until the Founder (and counsel, if wanted) approves it.
5. No automatic message is ever sent by any of these; a reminder or notification rule would need its own authorization.

## 7. Recovery
- Rollback for each file is written at its foot (drop in reverse order: 0171, 0170, 0169, 0168). It is safe only while the tables hold no genuine rows; after real use the tables are append-only by design, so
  recovery would be by a new corrective migration, not by deletion.
- Before applying: a fresh logical backup into the encrypted backup volume (the established R-series procedure), verified; read-only pre-counts of the tables listed in `scripts/production-fingerprint.sql`.
- Application rollback is a revert of the deploy; the gates being OFF means the old and new code behave identically.

## 8. Release sequence (every step stops for confirmation)
1. Founder confirms P0 (add the 0167 file to `main`) and gives the authorization in section 9.
2. Re-read the ledger head and confirm the proposed object names are still free (read-only).
3. Backup + verification; record the `production-fingerprint.sql` output.
4. `supabase link` (throwaway directory) -> `migration list --linked` (expect 0168-0171 as the only local-only entries) -> `db push` -> `unlink`; confirm the link directory is gone.
5. Read-only verification: ledger now at 0171; the 11 tables, 1 view and 19 functions exist; RLS enabled on all 11; grants as written; row counts all zero; fingerprint output identical to step 3.
6. Production site health check (public pages and an admin page respond); gates still OFF.
7. Report. Switch-ons (section 6) are separate decisions.

## 9. Authorization requested (the Founder's written confirmation, quoted back)
"I authorize applying migrations 0168, 0169, 0170 and 0171 (files `PROPOSED_0168`-`PROPOSED_0171` renumbered into `supabase/migrations`, content unchanged) to the Production database, in that order, as four
additive transactions, after the 0167 file has been added to `main`, followed by read-only verification only. Both feature gates stay OFF. This does not authorize switching any feature on,
recording any permission, asking any client for permission, sending any message, or touching the held Vendor RLS or legal-representation proposals."

Smaller alternatives, if preferred: apply 0168 alone (enquiry pricing); or 0169-0171 alone (portfolio). They are independent of each other.

## 10. Business decisions still open (they do not block the migrations)
1. **Is acceptance of Booking Terms clause 54 ("Portfolio & Promotional Rights") enough marketing permission?** Today the system recognises permission from a signed agreement only through a recorded
   release (`agreement_releases`: usage rights, territory, term). Clause 54 is a general reservation in the standard terms; whether acceptance of those terms is sufficient for photographs showing identifiable people
   (privacy / likeness) is a legal judgement, so it is NOT treated as permission automatically. If you decide it is, a clause-54 route can be added; until then a job relying on it is recorded as administrator-recorded permission with the acceptance as evidence.
2. **Client permission wording** (draft `mkt-permission-draft-1`) needs your approval before any client can be asked.
3. **People shown in photographs** (guests, minors): the internal review checks include "release rights for people shown"; whether a separate subject-release policy is wanted is yours to decide.
4. **Evidence files**: administrator-recorded permission records where the evidence is kept; uploading the evidence file itself to private storage needs a separate upload design (the platform's request size limit rules out sending large screenshots through a form).
5. **Publishing/sharing flows**: the database already refuses a use that fails either approval, and `checkUseEligibility()` is the single re-check, but the actual website/brochure/PDF/client-sample publishing flows are not built in this phase and must each call it.
