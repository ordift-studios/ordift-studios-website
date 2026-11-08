# PROPOSAL (not applied, not a migration file): database guard on the lines of an issued quotation

Status: DESIGN FOR SEPARATE REVIEW. Nothing here has been run against any database. No migration file exists for it. It must not be numbered or applied without a written Founder approval.

## Purpose

Once a quotation is issued, its priced lines are part of what the client was shown and what the content fingerprint (printed on the PDF, stored as the audit event `client_quotation.content_fingerprint`) describes. Today only the application protects them. The database does not.

Evidence from the code and schema (read 2026-11-08):

- `client_quotation_items` (migration 0134) is writable by any signed-in admin through RLS (`for all ... to authenticated`) and by the service role. There is no trigger on it.
- `updateDraftQuotation` (`src/lib/commercial/clientQuotations.ts`, around line 520) first runs a conditional `update ... where status = 'draft'`, then, as a SEPARATE statement, deletes and re-inserts the lines. If the quotation is issued by `issue_ordinary_quotation()` between those two statements, the issued quotation's lines are deleted and rewritten. The in-code comment describes the check as preventing this, but the check and the delete are not one transaction, so a narrow race remains.
- The Crew Support path (`src/lib/crewSupport/quotation.ts`, around line 241) uses the same delete-then-reinsert pattern.
- Fingerprint drift detection (Batch 1) would catch such a change afterwards (the page warns, the PDF returns 409), but it detects; it does not prevent.

## Proposed guard

A statement-level and row-level trigger pair on `public.client_quotation_items`:

1. `before insert or update or delete` for each row: look up the parent quotation (`client_quotations.id = old/new.quotation_id`). If its `issued_at is not null`, or its `status` is anything other than `draft`, raise `ordift:issued_quotation_lines_protected` (errcode 42501).
2. Take the parent row with `for share` inside the trigger, so an issue that is committing concurrently either completes first (the write is then refused) or waits until the write commits (the issue then sees the final lines). This closes the race above.
3. Allow the write only when the parent is `draft`. Reuse the provenance pattern already used by 0172 (`activity_log_issuance_guard`) only if an approved exception path is needed (see compatibility).

Optionally a second trigger on `client_quotations` freezing `currency, subtotal, discount_total, tax_total, total, client_profile_id` once `issued_at is not null`, except for the status transitions the application legitimately performs (sent to accepted, declined, expired, withdrawn, superseded). That is a larger change and should be decided separately.

## Compatibility implications (to confirm in a local rehearsal before any approval)

- Ordinary draft editing is unaffected: the parent is a draft at write time.
- `ON DELETE CASCADE` from `client_quotations` deletes would fire the trigger for each line. Deleting a draft is unaffected. Deleting an issued quotation is already refused by the application and should stay refused; if a legitimate clean-up of test quotations exists (migrations 0137 and similar did this), it must be explicit, for example by running with `session_replication_role = replica` as those migrations do, or by an allow-listed provenance marker.
- Crew Support "return to draft" must set the parent to `draft` BEFORE it rewrites lines. The code path at `crewSupport/quotation.ts:225-250` already requires `status = 'draft'`, so it should be compatible; this must be proved by running `crewWorkflow.localdb.e2e.ts` after the guard is added.
- The rollback-restore step in that path (re-inserting `oldItems` after a failed insert) runs while the parent is still a draft, so it is compatible.
- Existing issued quotations in Production are unchanged by adding the guard; it affects only later writes. A pre-check query (read-only) should confirm no application path legitimately edits lines of a non-draft quotation. The only candidates found are the two above.
- Performance: one indexed lookup of the parent per line write (the primary key). Negligible at this scale.
- Rollback: `drop trigger` plus `drop function`; no data change.

## Required before anyone applies it

1. A migration file with the next free number, reviewed by the Founder.
2. A local rehearsal on the throwaway lab database: the guard tests (a direct admin session cannot insert, update or delete lines of an issued quotation; a draft is unaffected; a concurrent issue and edit cannot interleave), plus the full `crewWorkflow`, `quotationIssuance`, `walkthrough` and `amountDue` localdb suites.
3. A fresh backup checkpoint and a Founder-approved Production application window, following the existing migration release-plan format (`RELEASE_PLAN_*.md`).

## Residual risk if the guard is not added

Low in practice (a narrow race that needs an admin edit and an issue within the same moment, and any change is detectable through the fingerprint), but the property "an issued quotation's lines cannot change" is currently a convention, not an enforced rule.
