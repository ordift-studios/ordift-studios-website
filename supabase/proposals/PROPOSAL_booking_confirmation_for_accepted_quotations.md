# PROPOSAL (design only, not approved, nothing built): confirming a booking from an accepted ordinary quotation

Prepared 2026-11-08 from a read-only review of the code and of Production. No migration, no code, no data change. Reuses the existing enquiry -> quotation -> acceptance workflow and the Crew Support confirmation pattern; **it does not create a parallel booking system.**

## 1. What exists today (verified)
| Step | Mechanism | Notes |
|---|---|---|
| Enquiry intake and staff-recorded enquiries | `enquiries`, `crm_stage` (new_lead ... booked, in_progress, delivered, completed ...) | migration 0165 |
| Enquiry -> draft quotation | `enquiry_conversions` (one per enquiry), `client_quotations` (one live quotation per enquiry) | migrations 0166, 0168 |
| Contracting entity | explicit, append-only `booking_contracting_entities`; issuing refused until chosen | 0159, 0172, 0173 |
| Issue, deliver, record acceptance | `issue_ordinary_quotation()`, delivery evidence, `recordOrdinaryQuotationAcceptance()` | Batch 1 (live since 8 Nov); acceptance "is NOT a booking" by design |
| Amount due | `establishAmountDue` / override, audited | 0166 |
| **Crew Support** confirmation | `confirmationBlockers()` (accepted quotation + agreement basis + payment blocker + assigned, accepted crew with known pay + no firm double-booking); on Confirmed the enquiry moves to `booked` automatically (`enquirySync.ts`) | the pattern to reuse |
| Downstream | delivery is allowed for stages `booked` / `in_progress` (`deliverables/actions.ts`); stage `booked` for a non-crew enquiry is typed by hand | no confirmation record exists |
| The admin **Bookings** screen | lists **workshop registrations** only | not a service-booking record; the name is a source of confusion |

Production (read-only, 8 Nov): 1 completed and 1 delivered real enquiry, 2 in quotation_sent; 2 issued quotations, both Crew Support; **0 issued ordinary quotations**. So the ordinary path has not yet been used in anger.

## 2. Gap
An accepted ordinary quotation leads to a hand-typed `booked` stage: nothing records *what* was confirmed (date, place, scope), *who* confirmed it, *on what basis*, or checks double-booking and the payment condition. Crew Support has all of this; ordinary services have none.

## 3. Design (minimal and additive)
1. **One table, `enquiry_booking_confirmations`** (append-only, Super Admin/admin write through one server function, Super Admin read like the contracting-entity table): enquiry, the accepted quotation (and its content fingerprint), the contracting entity (as issued), the schedule snapshot (start/end, location, scope note), basis text, `confirmed_by`, `confirmed_at`; a later **cancellation** or **change** is a NEW row (no edits), as the contracting-entity table does.
2. **Pure rules, copied in shape from `confirmationBlockers`** (`src/lib/bookings/confirmationRules.ts`): accepted ordinary quotation recorded; contracting entity recorded and still eligible for the quoted activities (reuse `entity_issue_standing`); payment condition satisfied (reuse the amount-due / payment-condition blocker); schedule present; an agreement basis where the service family requires one; optional resource assignment and no firm double-booking (reuse `conflicts.ts`).
3. **One server action "Confirm booking"** that calls the rules, writes the row, then moves the enquiry to `booked` with the same guarded, idempotent stage update Crew Support uses. Typing `booked` by hand for an enquiry that has a quotation but no confirmation is then refused (as it already is for Crew Support).
4. **No change** to quotations, acceptance, amount due, payments, Crew Support, workshops or the existing delivery flow.
5. **Screen:** a "Booking" panel on the enquiry page showing blockers and, once confirmed, the confirmed particulars. Rename the workshop list label to "Workshop registrations" so "Bookings" cannot be mistaken for it (separate, tiny change).
6. **Feature flag**, off by default, like the other staged releases.

## 4. Not in scope
Crew assignment for ordinary services (use Crew Support when crew is the product), invoicing, client-facing booking pages, calendar sync, automatic emails.

## 5. Risks and dependencies
- Needs one migration (new table + function) with the usual backup, rehearsal and your written approval; it can only be rehearsed on the Production-shaped scratch database (`rehearse_production_shape.sh`, on the finance branch).
- The rules lean on the Qatar/Ghana eligibility function: confirmation must re-check it, because an entity's standing can change between acceptance and confirmation (the Qatar investment-approval pledge is advisory today and does not block).
- Existing hand-typed `booked` enquiries are left as they are (no back-filling).

## 6. Suggested order and approvals
Design review (this document) -> your decisions on section 7 -> pure rules + tests (local) -> migration proposal + rehearsal -> approval, backup, apply -> app release behind the flag -> first real confirmation verified read-only.

## 7. Decisions needed
1. Which service families need an agreement before confirmation (none / by family).
2. Must the payment condition be satisfied before confirmation, or only recorded?
3. Is a schedule (date and place) mandatory at confirmation?
4. May confirmation be done by an admin, or only by a Super Admin (as the contracting entity is)?
