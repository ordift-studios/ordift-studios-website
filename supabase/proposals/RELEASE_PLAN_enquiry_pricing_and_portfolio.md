# Release plan and authorization request — Enquiry pricing/follow-ups and Portfolio library (NOT APPLIED)

Status 2026-10-24. Production head when written: 14b064d. Nothing below has been applied to Production, Staging or any shared database.
Both migrations were rehearsed only on a disposable local database inside rolled-back transactions with synthetic rows.

## 1. Files and numbering

| Proposal | Rehearsal | Proposed number |
|---|---|---|
| `PROPOSED_enquiry_pricing_followups.sql` | `REHEARSE_enquiry_pricing_followups.sql` (20 behaviours pass) | next free number at release |
| `PROPOSED_portfolio_library.sql` | `REHEARSE_portfolio_library.sql` (17 behaviours pass) | the number after that |

Ledger head per earlier verification is 0167 (its file is not in this repository's `supabase/migrations`, so it must be re-read from the ledger at release time).
Held and independent: Vendor RLS (0168/0169) and legal representation (0170). Neither proposal touches their objects, so order between them does not matter;
only the numbers shift. Renumber the file at release time; do not edit its contents.

## 2. Dependencies (all already in Production)
`businesses`, `profiles`, `enquiries`, `employing_entities`, `user_roles`, `roles` (slug `super_admin`), `project_files`, `engagements`,
`private.is_staff_or_admin()`, `public.ordift_studios_business_id()`, and the existing unique index `client_quotations_one_live_per_enquiry`.
Neither proposal assumes a generic task/reminder table; follow-ups are their own table.

## 3. What each migration does
**Enquiry pricing:** `enquiry_discount_approvals`, `enquiry_price_communications`, `enquiry_followups`, `enquiry_conversions` plus triggers/guards and
`reschedule_enquiry_followup()`. Additive; existing enquiries simply have none. Communications are append-only with advisory-lock revision numbering.
A communication that uses a discount must reference an approved discount for the SAME enquiry with the SAME scope hash and total. Only a Super Admin may
approve (checked in the trigger, not only the app); staff can only propose. Follow-ups: one open per enquiry, reschedules recorded in history. Conversion:
one record per enquiry via a deterministic idempotency key, so concurrent double-clicks cannot create two quotations. RLS: staff read; writes only
through the service role after application authority checks. Amounts keep their communicated currency (USD today).

**Portfolio library:** `portfolio_candidates` (points at `project_files`, never copies), append-only `portfolio_marketing_clearances` (evidence, authorised
uses, restrictions, expiry, reviewer/time, withdrawal as a new row, ordered by identity `seq`), a current-clearance view, and destination selections that a
database trigger refuses unless the image is currently cleared for that destination. Delivery, Final Approved status, retention and client galleries are
untouched. Unknown-rights images are never auto-cleared: no clearance row means not cleared.

## 4. Risks
- Low data risk: additive, no backfill, no existing row altered.
- Lock risk negligible (new tables only; no table rewrite).
- Behavioural risk is nil until the application flags are switched on; the feature stays OFF and unadvertised after apply.
- Residual: the ledger number must be re-read at release; the rehearsal was local, so the first Production run is verified read-only afterwards.
- Rollback: documented at the foot of each file (drop the new objects in reverse order). Safe only while no real rows exist; after real use, rollback
  needs a separate decision because the tables are append-only by design.

## 5. Release sequence (each step stops for approval)
1. Founder gives the written authorization below (per migration).
2. Re-read the ledger head; renumber the file; confirm no collision with held proposals.
3. Take the standard pre-change verification (object-absence check) — read-only.
4. Apply the single migration to Production in one transaction; record in the ledger.
5. Read-only post-checks: objects present, RLS on, grants, triggers, row counts zero.
6. Build and test the persistence services against the applied schema (local rehearsal DB first), keep the flag OFF.
7. Separate approval to switch the flag on; test on a synthetic enquiry only (never CSR-2026-000002, never a real client).

## 6. Authorization requested (two independent decisions)
**A. Enquiry pricing & follow-ups.** "I authorize applying `PROPOSED_enquiry_pricing_followups.sql`, renumbered to the next free migration number, to the
Production database as a single additive transaction, followed by read-only verification only. The feature stays disabled."
**B. Portfolio library.** "I authorize applying `PROPOSED_portfolio_library.sql`, renumbered after A (or first if A is not approved), to the Production
database as a single additive transaction, followed by read-only verification only. No image is cleared, shared or published by this step."

Neither authorization covers enabling the features, recording any clearance, sending anything to a client, or touching Vendor RLS, legal representation,
Bright's CSR-2026-000002 or the Stage C-B work.
