# Plan B: migration sequence, dependencies, backups, rollback risks, schema-cache reloads, record compatibility (10 Nov 2026) — REVIEW ONLY; nothing applied, nothing approved

Plan B = switch booking confirmation on (`BOOKING_CONFIRMATION_ENABLED=true`). A payment then never books a project, a confirmation does (with availability, conflicts, agreement, payment condition), and the booking notices, cancellation outcomes and money records exist. It is selected for planning, NOT approved for deployment.

## 1. The sequence (one proposal per run, in this order; each needs your separate written approval; none is requested)
| # | File (proposal → rollback) | Adds | Touches an EXISTING table? | Depends on |
|---|---|---|---|---|
| 0 | `PREFLIGHT_plan_b.sql` (read-only) | nothing | no | nothing |
| 1 | `PROPOSAL_booking_confirmation.sql` → `ROLLBACK_booking_confirmation.sql` | rules settings, confirmations, segments (append-only), conflict + confirm + preview functions, first rules version seeded from an active Super Admin | no (reads enquiries, quotations, agreements, leave, Crew Support, profiles) | Production ledger incl. quotation issuance (0172/0173) and entity standing |
| 2 | `PROPOSAL_crew_support_booking_overlap_guard.sql` → `ROLLBACK_crew_support_booking_overlap_guard.sql` | one function, THREE triggers on `crew_support_requests` and `crew_support_slots` | **yes: triggers (brief lock while created)** | 1 |
| 3 | `PROPOSAL_booking_cancel_reverts_stage.sql` → `ROLLBACK_booking_cancel_reverts_stage.sql` | replaces `cancel_ordinary_booking` (booked → quotation sent, audited) | no | 1 |
| 4 | `PROPOSAL_booking_notifications.sql` → `ROLLBACK_booking_notifications.sql` | delivery-record table, guard, trigger on confirmations, claim / finish functions | no | 1 |
| 5 | `PROPOSAL_booking_notices_v2.sql` → `ROLLBACK_booking_notices_v2.sql` | cancellation outcome column + constraint, widened job values, defer function, replaces cancel / trigger / claim | no | 1, 3, 4 |
| 6 | `PROPOSAL_cancellation_financial_decisions.sql` → `ROLLBACK_cancellation_financial_decisions.sql` | money-decision records table, guard, helper + three functions | no | 5 |
Then the application release (it tolerates every one of these being absent), then the switch. The proposals become numbered migrations only at release (the lab ledger stood at 0185; assign the next free numbers then).
**Verified locally:** `rehearse_plan_b_sequence.sh` copies the lab, takes the copy back to the pre-Plan-B state with the rollback files, checks the preflight is clean, applies the six proposals one per run, runs every rehearsal against the copy (all pass), rolls all six back in reverse order, and confirms (a) the schema fingerprint equals the pre-state (no remnant) and (b) hashes of every enquiry, payment, quotation and Crew Support row are identical before, after applying and after rolling back. PASSED.

## 2. Compatibility with existing Production records
- Plan B creates tables and functions; it edits NO existing row, and the only existing-table change is the three Crew Support triggers (step 2). They are inert until a confirmed ordinary booking exists for the same person, so current Crew Support behaviour is unchanged.
- Projects the OLD behaviour booked by payment keep their stage; they have no booking record and read "Booked (no booking record)" to staff only. Run `DIAGNOSTIC_payment_auto_booking_cutover.sql` and `DIAGNOSTIC_booked_without_booking_record.sql` first (they list them). Do not retro-confirm them blindly (a confirmation e-mails the client).
- Website-form enquiries with no portal owner and every staff-recorded enquiry receive no booking e-mail (staff deliver and record); clients with a verified portal account are e-mailed at the confirmed account address. Acknowledgement and quotation e-mails are untouched.
- The rules table starts with a PROVISIONAL settings version (agreement thresholds QAR 3,000 / GHS 10,000 / USD 800): you must review and approve the real values in the booking-rules screen before relying on them.

## 3. Backups (none taken by me; needs your authorisation)
Plan B adds objects and three triggers; it rewrites no data, so a data backup is not what protects you: the rollback files are. Still, before step 1 confirm that the platform's point-in-time recovery covers the window (or authorise a fresh logical backup of the two Crew Support tables, the only existing tables touched). The earlier R5 backup set is frozen history and must not be repeated or relied on as "current". Export before any rollback that would discard records (section 4).

## 4. Rollback risks (read before approving)
- Rollbacks are rehearsed and exact while no booking data exists. **Once real bookings exist the rollback becomes a one-way decision:** the base rollback REFUSES to run while confirmation records exist (a deliberate safety); the v2 rollback drops cancellation outcomes and deferral reasons; the notifications rollback drops the delivery history; the money-decisions rollback drops the evidence record. Export first, then decide.
- Switching the environment variable off is the fast, data-free retreat (booking card disappears, payments book again as today); the migrations can stay.
- The rollback of step 2 removes the Crew Support triggers: after it, a Crew Support request and a booking can overlap again.

## 5. Schema-cache reloads
Supabase's API caches function and table lists. After EACH proposal (and each rollback) reload it (`notify pgrst, 'reload schema'`, or the platform's reload) before the application is used. Evidence: in the lab the first confirmation after step 4 left its notices pending because the cache was stale (recoverable with "Send now", but avoidable). Verify after each step with the read-only preflight (it should now report that step's objects as present and nothing missing).

## 6. Timing and verification
Do it in a quiet hour with no payment awaiting verification (preflight reports the count). Each step is one transaction. After step 6, before the switch: run the preflight (all Plan B objects present, no dependency missing), then the scoped canary only if separately authorised. Stop conditions: any MISSING dependency, any ALREADY PRESENT object before its step, any error: stop and report; do not improvise.

## 7. What is NOT in Plan B and still needs its own approval
The website-form contact verification link (proposal only), any refund execution tooling (decisions are recorded; money moves through finance), a real mail provider setting (live e-mail), and the application release itself.
