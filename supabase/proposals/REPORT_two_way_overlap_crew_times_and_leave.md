# Two-way booking / Crew Support overlap protection, Crew Support time precision, and approved leave (LOCAL; nothing applied or released)

Prepared 9 Nov 2026 on `local/two-way-overlap-crew-times`.

## 1. What was built
- **Reverse check (Crew Support now sees ordinary bookings).** A confirmed ordinary booking of a person is a FIRM conflict for Crew Support candidate lists, offers, rescheduling and the confirmation gate (`loadConflicts`, one shared definition). The database is the final judge: `PROPOSAL_crew_support_booking_overlap_guard.sql` refuses (a) confirming a Crew Support request, (b) rescheduling a confirmed one, and (c) assigning a person to a confirmed one, if that person has an overlapping CONFIRMED booking. It takes the SAME per-person advisory lock as `confirm_ordinary_booking`, so a booking and a Crew Support confirmation for one person are serialised: exactly one wins in either order.
- **No justification path.** A refusal is resolved by authorised reassignment or rescheduling. The documented-verification field no longer exists in the booking confirm screen, and the database ignores any resolution sent to it.
- **Approved leave is unavailable** for booking assignment (no override). Leave itself is never touched by booking: it changes only through the existing leave workflow, with its own audit. Crew Support already refused leave at confirmation.
- **Time precision reuses what Crew Support already has**: optional `call_time`, `finish_time` (free text) and `event_timezone` on the request (migration 0153), edited through the existing authorised reschedule workflow. **No new columns.** When both times are readable, finish is after call on the same day and a timezone is known, the assignment occupies that window on EACH date of its range; otherwise (date-only, unreadable text, overnight, no timezone, over 366 days) it is treated conservatively as whole dates. Nothing is inferred for historical rows. Windows are half-open: adjacent assignments do not conflict.

## 2. Behind the booking switch; Production unchanged while unreleased
- App: the booking read, the booking conflicts and the precise-time handling are all gated by `BOOKING_CONFIRMATION_ENABLED` (off). With it off, Crew Support conflicts are judged by whole dates exactly as before (tested).
- Database: the guard is INERT where the booking tables do not exist (Production today): rehearsed on a disposable Production-shaped copy, where confirmation, rescheduling and slot changes behave exactly as before and the rollback removes everything.

## 3. Compatibility findings for live Crew Support workflows
1. **No live behaviour changes while the switch is off and the booking tables are absent** (app gated; trigger inert).
2. **Once released**, Crew Support screens that call `loadConflicts` (candidate availability, offer warnings, offer acceptance by the professional, the commitment panel, rescheduling, the confirmation gate) will list a confirmed booking as "booking ENQ-… (confirmed)" and treat it as firm. A professional accepting an offer is told to contact Ordift if they hold a confirmed booking at that time.
3. **Rescheduling a confirmed Crew Support assignment into a booking is now refused** in the database (and pre-checked in the app with a plain message), as is assigning an overlapping person to a confirmed request. Existing historical confirmed requests are not re-checked; only a new confirmation, schedule change or assignment is.
4. **Crew-versus-crew conflicts become more precise when released** (two same-day assignments with non-overlapping readable hours no longer conflict), and stay conservative everywhere times are missing or unreadable. This is a deliberate loosening: Crew Support managers should be told before release.
5. **Error mapping:** the three Crew Support write paths (status change, reschedule, offer) turn the database refusal into a plain message; other errors are unchanged.
6. **Not changed:** Crew Support permissions, the leave workflow, historical records, audit logging, or any existing function. The migration adds one function and three triggers, and changes no row.

## 4. Release dependencies and order (each needs separate approval; none requested now)
1. Booking proposal (tables, helpers `private.parse_clock` and `private.crew_request_overlaps`, rules functions) — it now also carries the leave rule and the precise Crew Support overlap test.
2. Crew Support reverse-overlap guard (depends on 1; inert without it).
3. Booking switch on. Tell Crew Support management about items 2–4 above first.

## 5. Verification (disposable or rolled-back databases only)
Rolled-back lab rehearsal `rehearse_booking_on_lab.sh crew` (21 cases: same day non-overlapping, partial, adjacent, multi-day, date-only, unreadable, overnight, other person, reschedule into/out of a booking, reassignment, booking over a precise and a date-only assignment, nothing edited); `full` and `availability` rehearsals; the 25-round plus 12 new race rounds on a disposable copy (booking vs Crew Support in BOTH orders, and non-overlapping same-day both succeeding); the inert-and-rollback rehearsal on a Production-shaped disposable copy; 35 unit tests for the precise windows, the classifier and the reverse loader.
