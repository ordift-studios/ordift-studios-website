# Creative Crew Support

Added 2026-10-04 (TDR-020). Public entry: `/crew-support` (linked from `/book`). Admin: `/admin/crew-support` (admin and super_admin only, same tier as Enquiries).

## What it is

A pathway for a professional or company that **owns and leads** its project and needs Ordift to supply additional creative personnel (a second photographer, a camera operator, production assistants, designers…). Ordift is the **supporting** party. This is not the same as a client hiring Ordift as the principal provider.

Three commercial intents are recorded on the anchor enquiry (`enquiries.commercial_intent`): `ordift_led` (default, all historical rows), `creative_crew_support` (this pathway), and `creative_post_support` (reserved for post-production support; not built). Reporting, quotations and agreements must branch on this field and never treat a crew-support job as an Ordift-led engagement.

## Lifecycle

`received → under_review → availability_review → quoted → agreement_pending → payment_pending → confirmed` (with `declined`/`cancelled` available from any open state). Transitions are validated in `src/lib/crewSupport/rules.ts`, attributed and written to the activity log.

- **A submission is an enquiry, not a booking, and guarantees no availability.** The only requester-facing wording is `SUBMITTED_MESSAGE`; no email or screen says "booked" or "confirmed".
- `confirmed` requires at least one assigned person and no open (unfilled/proposed) slots.
- No calendar events are created: no booking calendar exists yet (the existing calendar is the HR working-day calendar). Dates are stored on the request for a future calendar.

## Reuse (no parallel systems)

- **Enquiry** (`enquiries`) is the commercial anchor: CRM stage, quotation, `amount_due` and payments all work on it. The request page links to it.
- **Roles** come from `operational_titles`; service areas from `PATHWAYS` (`src/lib/crewSupport/config.ts`).
- **Assignment**: each requested person is a `crew_support_slots` row, assigned only by explicit staff action to an existing `profiles` row (staff, contractor, freelancer, or the Founder). Nothing is auto-assigned.
- **Notifications**: existing `sendEmail` (requester acknowledgement + internal notification).
- **Identity**: an existing account is reused by email (`find_user_id_by_email`); no duplicate customer record.

## Pricing and legal — open items

- **No Crew Support rates exist.** Do not reuse consumer Photography/Film rates for crew. Quote through the existing quotation flow on the anchor enquiry until governed rates are configured.
- **No Crew Support agreement is approved.** The standard end-client photography agreement does not govern supporting-crew work. A new template needs Counsel review and must cover: parties/roles, scope, date/time/location, fees, equipment responsibility, file/media handoff, IP/usage, confidentiality, client-relationship boundaries, cancellation/rescheduling, and jurisdiction. Nothing here is marked Counsel Approved.

## Action-feedback standard (platform-wide)

Form-driven mutations return `ActionState` and render through `ActionForm` + `SubmitButton`: pending label, duplicate-submit blocked, success only after the action returns ok, a visible error on failure. See TDR-020 and `src/lib/shared/actionState.test.ts`.

## Phase 1 (2026-10-07): capabilities, role-aware matching, Quote Preparation, QA flag

- **Capabilities** (`person_capabilities`, migration 0141): who can do what, independent of job title — `operational_titles` is the vocabulary; each row has proficiency (primary/secondary/supporting) and verification (self-declared/verified/revoked, revoked kept for history). Managed at Crew Support → Capabilities (admin/super_admin; every change attributed). Seeded only from unambiguous craft staff titles; the Founder and everyone else are set by admins, never hard-coded.
- **Matching** (`matching.ts`, pure): candidates for a role are people with a matching, non-revoked capability and an active relationship (access active, vendor active if a vendor, payee not suspended). Ranking: relevance, verified, then internal preference; known leave/crew conflicts are flagged and ranked lower but listed; unknown availability never disqualifies. **Attendance is never read.** A person or account with no capability (e.g. the backup Super Admin account) never appears. Assignment is also enforced server-side.
- **Capability is not willingness.** Availability offers (Available/Willing, Unavailable, Available-but-unwilling) arrive in a later phase; today nothing says a person has agreed.
- **Status**: `quote_preparation` sits between Availability Review and Quote Issued. Quote Issued is guarded and cannot be set until a quotation can be linked and issued.
- **QA flag**: `is_test` on requests and enquiries (set only by migration, never from the UI). Test records are excluded from reports and dashboard counts, labelled TEST in lists, and are the only records any future QA-only tooling may act on. CSR-2026-000001 is the designated QA request; live requests (CSR-2026-000002 onward) must always use the real workflow.
- `crew-support` is a display/filter/report label ("Creative Crew Support") but deliberately not a `/book` pathway.

## Approved design for later phases (not built yet)

- **Commercial confirmation ("Booking Secured") and crew assignment are separate states.** Payment never implies a named crew member. Far-future work may be secured while crew is pending when a viable internal/external fulfilment path exists; urgent work requires actual crew confirmation first. The urgency/time-to-job rule is configurable (no fixed SLA numbers).
- **Confirmation policy is configurable** (executed agreement plus required deposit/payment per service, urgency or client) — no hard-coded percentage.
- **Pricing**: governed Crew Support selling rates (a Rate Card family, USD reference) feeding system-generated quotations; manual lines remain an authorized fallback. No rates are populated until separately researched and approved. The FX rate is snapshotted when a quotation is issued. The accepted quotation establishes the receivable through the canonical enquiry/payments path (no second receivable); client price and crew compensation stay strictly separate.
- **Crew cost** lives in `engagements` (created at assignment, no payable until the existing explicit step); bookings stay workshop-specific.
- **Client lifecycle emails** for client-facing statuses only (never internal notes, shortlist changes, declines while sourcing, costs or margins): templates central, idempotent, activity-logged, delivery/failure recorded with authorized retry, and a failed email never corrupts a status change. "Booking secured" must never imply crew is assigned.
- **Payments guard**: the existing auto-"booked"/"booking confirmed" on full payment must become intent-aware for crew-support enquiries.
- **QA payment boundary**: a controlled, audit-logged QA-only transition for `is_test` records may bypass the payment prerequisite without ever creating a payment, touching reporting, receivables or gateway records, or applying to live requests.

## Phase 2 (2026-10-07): quotation workflow, governed rates, client acceptance, notifications

Built locally; migrations 0142/0143 prepared but NOT applied or deployed until authorized.

- **One quotation architecture.** A Crew Support quotation is a normal `client_quotations` row linked to its request (`crew_support_request_id`) and its existing enquiry (`enquiry_id`) — no duplicate enquiry or CRM record. Generic quotation tools refuse crew-managed quotes so the workflows can't drift. Selling price only: no cost/margin/crew-pay column exists on the quotation tables.
- **Lifecycle:** Draft → Ready (reviewed) → Issued (`sent`) → Accepted. "Prepare quotation" creates the draft (and moves the request to Quote preparation); issuing sets the quote to Issued, the request to Quote issued, the enquiry to Quotation sent, and notifies the client — all automatically. Status dropdowns cannot manufacture these events: Quote preparation needs a linked quotation, Quote issued an issued one, Agreement/Payment pending an accepted one.
- **Pricing:** governed rates (`crew_support_rates`, `crew_support_rate_modifiers`, Pricing → Creative Crew Support, versioned/append-only, **empty** until rates are configured). Without a governed rate a line is a manual fallback marked "no governed rate". Overriding a governed price keeps the governed price and requires a reason. Every line records its source; USD is canonical, with an optional local-currency equivalent whose rate is snapshotted when the quote is issued.
- **Receivable:** `amount_due` is set only when the quotation is **accepted**, from its USD total — a single authoritative writer (`completeAcceptance`). The legacy manual "Set Amount Due" action refuses Creative Crew Support enquiries and is unchanged for every other enquiry. Quotation acceptance never advances an enquiry to "booked" (reserved for genuine confirmation, Phase 3).
- **Acceptance:** directly by the client in the portal (Quotation tab on their project), or recorded by an authorized admin from another channel (channel, accepting person, received time and an evidence note are mandatory; audited as "recorded by staff on behalf of the client"). The audit trail distinguishes the two.
- **Notifications:** `STATUS_NOTIFICATIONS` + templates in `notificationConfig.ts` are the single mapping of client-facing events (under review, availability review, quotation issued, acceptance recorded, declined, cancelled). Each (request, event) is claimed once in `crew_support_notification_events` before sending (idempotent), results are logged and visible on the request with an authorized retry, a failed email never affects the status change, and **TEST/QA records are recorded as "suppressed" and never delivered** (a real test email needs explicit authorization).
- **Not in Phase 2 (Phase 3):** confirmation policy (agreement + configurable deposit), agreement/payment gating, and the payments guard so full payment can't auto-"book" a Crew Support enquiry or imply crew assignment.
