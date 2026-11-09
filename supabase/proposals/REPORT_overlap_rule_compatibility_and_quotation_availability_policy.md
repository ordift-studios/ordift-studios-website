# Confirmed-booking overlap rule: compatibility findings, and the quotation availability policy (LOCAL; nothing applied or released)

Prepared 9 Nov 2026 on `local/booking-overlap-and-quote-policy`.

## 1. What depended on the old documented-verification override (found BEFORE changing behaviour)
The override ("availability verified WITH the assigned person: method, reference, date") existed only in the **unreleased booking confirmation feature**: the proposal SQL (`confirm_ordinary_booking`), `rules.ts`, `service.ts`, `panel.ts`, `form.ts`, `bookingActions.ts`, the confirm screen, my availability wording, their tests, the rehearsal bodies and the concurrency script, the walkthrough guide and earlier reports.
- **Production:** booking tables and functions are not applied and the switch is off, so **no live record or workflow depends on the override**. There is nothing to migrate.
- **Lab:** one confirmed booking (ENQ-BK-901) with no stored resolution. Its functions were re-created (CREATE OR REPLACE only); the old definitions are saved.
- **Crew Support (live):** its own confirmation gate already refuses firm conflicts with **no** override, so it was never affected.

## 2. Compatibility issues to decide (nothing in Crew Support was changed)
1. **One-way protection.** Booking confirmation now refuses overlap with a confirmed Crew Support slot, but Crew Support's confirmation gate only looks at other Crew Support slots and leave, **not at ordinary bookings**. A confirmed booking made first can still be overlapped by a later Crew Support confirmation. True two-way protection needs the Crew Support gate (a live workflow) to read confirmed bookings behind the booking switch. Proposed, not done.
2. **Crew Support slots are date-granular** (no times). Any same-day booking for a person on a confirmed multi-day slot is now a hard conflict. That is the strict reading of your instruction; a person on a multi-day job cannot take a two-hour evening booking the same day. Adding times to slots would fix it later.
3. **Approved leave is still clearable** by a documented direct check (leave is not an assignment). Say if you want it hard as well.
4. **Preview/confirm agreement** is preserved: the database marks each conflict `overridable`; an older database that does not send the flag is read the strict way by the application, and the database remains the final judge.
5. **Adjacent assignments** (one starting exactly when another ends) are not conflicts; verified in the rehearsal.

## 3. Quotation availability policy (inert while the booking switch is off)
- Before an ordinary quotation is issued the person says whether it **depends on a specific person and service time**.
- **Depends:** an availability assessment is required (none, or older than 7 days: refused). Latest check **Available** → issues as normal, no availability wording. **Tentative or Unverified** → issues only as a clearly labelled **conditional quotation**: the person ticks a box and the sentence "Scheduling is subject to confirmation. This quotation does not confirm that any particular date, time or team member is available. A booking is confirmed only when Ordift Studios confirms the schedule in writing." is added to the draft's terms (so it is covered by the issue fingerprint and shown to the client). **Conflicting** → refused, with no way to acknowledge past it.
- **Does not depend:** a short reason is required and recorded.
- The declaration is audited first (strict); nothing is issued on an unrecorded basis. An availability check is never a booking, reservation or hold, and booking confirmation re-checks regardless.
- The conditional sentence does not change how the payment terms are read (the classifier ignores it).
- Not changed: the database issue function and the issuance audit event (production-live migrations), the quotation PDF layout, Crew Support quotations.
