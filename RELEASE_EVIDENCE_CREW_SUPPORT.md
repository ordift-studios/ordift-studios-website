# Creative Crew Support — release evidence (migrations 0146–0149 + repair branch)

Branch `crew-support-workflow-repair`. Staging: deployment `92ee722`, database at 0149.
Production: migrations at 0145, code at `9186f2a`. **Nothing in this release has been applied to Production.**
Last updated 2026-10-08.

## 1. Manual Staging QA — CSR-2026-000001 (Founder, 2026-10-08, client `aj.gyam25@gmail.com`)

| # | Check | Result | Independent corroboration (Staging database, read-only) |
|---|---|---|---|
| 1 | Client accepted ORD-QUO-2026-000001 through the Staging portal | PASS | `accepted_via = client_portal`, accepted by the aj account, 2026-10-08 19:46 UTC |
| 2 | Quotation status → Accepted | PASS | `status = accepted`, usd_total 1000.00 |
| 3 | Request advanced to Payment pending | PASS | `crew_support_requests.status = payment_pending` |
| 4 | Enquiry amount due became USD 1,000 automatically | PASS | `amount_due = 1000` |
| 5 | Amount due references the accepted quotation | PASS | `amount_due_source = accepted_quotation`, link → ORD-QUO-2026-000001 |
| 6 | Amount paid remains USD 0 | PASS | `amount_paid` empty (nothing received) |
| 7 | CRM stage remains Quotation Sent | PASS | `crm_stage = quotation_sent` |
| 8 | No payment record created | PASS | 0 payments on the enquiry |
| 9 | No crew payable created | PASS | 0 crew engagements, 0 crew payables, 0 slots touched |

Also corroborated: the acceptance notification was recorded `suppressed_test` (TEST designation active); no email can leave Staging (no provider key outside Production).

## 2. Automated evidence
- Unit suite: 3,591 tests, 209 files — pass (`npx vitest run`).
- Isolated end-to-end suite — **26 scenarios pass** (`npx vitest run --config vitest.localdb.config.ts`; see `scripts/crew-support-e2e.md`): real server code on a throwaway Postgres built from the full migration chain, email captured, localhost-only.
- 38 SQL constraint/index checks pass on the migration chain; rollback tested (below).
- `tsc` clean, lint 0 errors, build compiles.

### Coverage by area
| Area | Evidence | Gap |
|---|---|---|
| External acceptance timezone | DOM test of the real field under Qatar / New York / Auckland / London / UTC; E2E R2 (naive refused, future refused, pre-issue refused, valid past accepted, audited); live in Production since `fe396cc` | No real-browser external acceptance has been run yet (Staging or Production) |
| Failed-submit values kept | jsdom restore test; ActionForm in Production since `fe396cc` | Not observed in a real browser |
| Governed pricing | E2E G1–G4: honest manual line with no rate; rate saved via the existing code path, append-only, market-scoped, authority-gated; priced line shows source; override needs reason; urgent uplift | No real rate exists (Founder decision) |
| Crew capability matching | `phase1.test.ts` (IT contractor, vendor-without-capability, duplicate/backup identities, Founder, attendance never read); Production human QA 2026-10-07 (dropdown showed only the two capable people) | Staging has no capability data |
| Offer workflow | E2E T6, R3, R4, R8, D1–D4: offer, decline, re-offer, stranger/administrator cannot answer, accept creates engagement (agreed pay) quietly, withdraw/release cancels draft, no payable until confirmation | Crew portal pages never viewed by a person |
| Double-booking | E2E D1–D3: firm conflict (confirmed job, approved leave) refuses acceptance; unconfirmed clash is a soft warning | — |
| Agreement handling | E2E T3 + `agreementWorkflow.test.ts`: "Agreement required" refused with explanation (no template designated, no issuance flow); legacy-flagged request blocked at ready/issue/confirm | Unavailable by design until Counsel designates a template |
| Notification safeguards | E2E T2/T6/T7, Staging manual: suppressed for TEST, idempotent per event key, crew emails carry no pay/venue | Real inbox delivery untestable on test records |
| Payments / receivables | E2E R4 + Staging manual: acceptance never creates a payment; deposit gate; payment alone never books; amount_paid = completed − refunds | No Paystack sandbox charge was run |
| Variations / cancellation | E2E R5, R7, R8, R9 | — |

## 3. Skipped Staging seed migrations — Production risk: none
Staging was 113 migrations behind. 0107, 0109, 0113 (data-only) and 0130's seed row were skipped on Staging because the people/entities they reference don't exist there. All four are **already applied in Production's history**. Migrations 0146–0149 reference only `client_quotations`, `crew_support_requests`, `crew_support_slots`, `profiles` — none of the HR/legal tables — and applied cleanly in the isolated chain where those four also fail. Consequence: Staging is not a data mirror of Production; it validates schema and code, not HR/legal data.

## 4. Production preflight (read-only, 2026-10-08)
- Remote at 0145; dry-run lists exactly 0146–0149. None of the new columns/indexes exist.
- The status check and unique index being replaced match the definitions the migrations were written against.
- Live data is compatible: 0 requests with two live quotations; all statuses within the current check; no variations, offers or crew engagements exist.
- Backups: daily physical backups, latest `COMPLETED` 2026-10-08 00:06 UTC (7 days kept). Point-in-time recovery is **off**.
- Fingerprint of existing records captured (`scripts/production-fingerprint.sql`), to be re-run after each step and compared line by line.
- Bright (CSR-2026-000002): `received`, untouched since 2026-10-07 14:20 UTC; 0 quotations, 0 slots touched, 0 notifications, 0 payments, 0 activity rows.

## 5. Production plan
**Preconditions:** explicit Founder authorization; low-activity window; Founder has decided whether Bright is processed before or after the release.
1. `supabase link --project-ref goxuyooxrekzstssjgly`; confirm target; `supabase migration list` (0145 last) and `supabase db push --dry-run` (exactly 0146–0149).
2. Run `scripts/production-fingerprint.sql`; save output. Confirm latest backup is `COMPLETED`.
3. `supabase db push` (0146 → 0149, each in its own transaction). Verify: migration list shows 0149; catalog checks (new columns, constraints, both unique indexes); rerun fingerprint — **must be identical**.
4. `git checkout main && git merge --ff-only crew-support-workflow-repair && git push origin main` → Vercel Production deploys. Monitor to Ready; confirm the deployed SHA.
5. Read-only smoke: `/` 200, admin/portal routes 307, `/portal/crew-offers` present; Bright unchanged; fingerprint identical; CSR list/detail render; Pricing → Crew Support tab; printable quotation for ORD-QUO-2026-000003.
6. `supabase link --project-ref omtmxvsjmlrnbtxiesqn` (restore the safe default).

**Rollback**
- *Code problem:* promote the previous Production deployment (`9186f2a`) in Vercel — instant. The old code works against the new schema (new columns are nullable/defaulted; the status check is only wider).
- *Schema problem:* run `supabase/rollbacks/down_0146_to_0149.sql` in one transaction (guards refuse if it would orphan rows), then `supabase migration repair --status reverted 0146 0147 0148 0149`. This touches **only** 0146–0149; 0144/0145 data stays (tested: provenance, crew acceptance and agreement-required rows survive; re-apply succeeds). **Do not use `down_0144_to_0149.sql` on Production.**
- *Data problem:* last daily backup (no PITR).

## 6. Behaviour changes to expect after release (not data changes)
- Crew assignment becomes **offer → crew accepts in the portal**; the staff "record acceptance" path is removed. Slots already accepted that way stay valid for confirmation.
- Quotations can't be marked ready without terms, a future valid-until date, event details and (for photography/video) the equipment answer. CSR-2026-000003's draft ORD-QUO-2026-000004 will need its equipment answer set before it can be issued.
- ORD-QUO-2026-000003 (CSR-2026-000001) has no terms: accepting it would route to "Agreement pending" (contract basis incomplete) — it is a TEST record and is not changed by the release.
- "Agreement required" is unavailable; confirmation of a request never needs a manufactured agreement.
