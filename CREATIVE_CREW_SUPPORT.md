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
