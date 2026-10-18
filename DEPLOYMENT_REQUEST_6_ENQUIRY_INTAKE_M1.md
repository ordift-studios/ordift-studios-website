# Deployment Request 6 — Enquiry-to-Booking M1: staff-recorded enquiries and recorded acceptance (for review; nothing deployed)

Branch `enquiry-intake-m1`, based on `main` = `ab04bab`. One additive migration (`0165`), **not applied anywhere**. Local development and testing only.

## 1. What M1 adds

1. **Record an enquiry** (`/admin/enquiries/new`, link on the Enquiries list; staff or admin). For WhatsApp, telephone, email, in-person, referral or other channels. Creates the ordinary enquiry at `new_lead`. **Nothing is sent** (no acknowledgement, no admin notification, no spreadsheet row) and **nothing financial is created** (no quotation, amount due, payment, obligation or booking). An optional email: with none, the reserved placeholder `<reference>@no-email.invalid` is stored. A phone number or an email is required. Super Admins can link an existing contact/organisation at creation; everyone else leaves linking to the Client record panel on the enquiry.
2. **Automatic client emails off by default** for staff-recorded enquiries (`email_notifications_suppressed`). The three existing client lifecycle emails (quotation ready, booking confirmed, files ready) check it before sending. Unticking the box at recording time (“Allow automatic status emails”) is the only way to leave them on. Existing enquiries have the flag false, so they behave exactly as before.
3. **Workflow summary** (read-only panel on every enquiry): enquiry received (channel, date), quotation issued, **client acceptance recorded**, amount due (and its source), payment, booking, contracting entity (Super Admin only). A recorded acceptance is labelled as not a booking. “Booked” keeps its existing meaning (the `booked`-or-later stage).
4. **Recorded acceptance for ordinary quotations.** “Mark Accepted” is replaced by “Record acceptance (with evidence)”: how it was received, who accepted, when, and a reference. It uses the existing columns and the existing database rule for a staff-recorded acceptance. It records acceptance only: no amount due, payment, stage change or email. Crew Support quotations are untouched (managed from their request).
5. **Contracting legal entity for ordinary enquiries and quotations** (Super Admin): reuses `chooseContractingEntity` and `booking_contracting_entities`. No entity is preselected or inferred from currency, nationality or location; a reason is required; the choice is append-only; it is refused once a quotation is accepted or money received (historical), and for Crew Support records.

## 2. Interactions with existing workflows (read from the code and tested structurally)

* **Public enquiry form / its emails / the spreadsheet row:** unchanged.
* **Amount due (`setAmountDueAction`):** unchanged. It still moves a pre-quotation enquiry to `quotation_sent`; its client email is now skipped for a suppressed (staff-recorded) enquiry.
* **Full payment → booked:** unchanged (`advanceStageOnFullPayment`). The booking-confirmed client email is skipped for a suppressed enquiry; the internal new-booking notification still goes to staff.
* **Manual stage change to `booked`:** unchanged (M2 adds the guard and override reason).
* **Client portal and online payments:** need a portal account that owns the enquiry. A staff-recorded enquiry with no account cannot be paid online; offline payment recording is a later milestone (M3). A placeholder address can never match an account, so nothing is claimed by accident.
* **Reports:** the enquiries report shows an empty Email for a placeholder.
* **Directory:** a placeholder address is ignored by matching and never copied into a contact.
* **Crew Support:** excluded everywhere (own workflow).

## 3. Exact database change (`0165_staff_recorded_enquiries.sql`)

`enquiries` gains four columns: `source_channel` (nullable, constrained list), `received_at`, `created_by`, `email_notifications_suppressed` (not null, default false), plus a shape check (`created_by` requires a channel and a received time). A guard trigger lets only a Super Admin or server code set or change them through a session. No data is read, written or backfilled; every existing row is unchanged; `email` stays NOT NULL. Rollback `down_0165.sql` refuses once any enquiry carries intake information.

## 4. Code changes outside the new modules (small, tested)

`lifecycleEmails.ts` (suppression check in three senders), `shared/email/dispatch.ts` (never send to a placeholder), `clientQuotations.updateQuotationStatus` (refuses a bare `accepted`), `entityRegistrations.ts` (`ordinarySubjectGate`), quotation status UI, enquiry/quotation/list pages (panels and the entry link), the enquiries report and the directory's email normaliser.

## 5. Verification run (no database, no Production access)

`tsc` clean · ESLint clean on changed files · full unit suite 240 files / 4,074 tests pass (41 new: validation, summary logic, placeholder behaviour, the dispatcher refusing a placeholder, and structural checks that intake/acceptance send nothing and create nothing financial, write only their own fields, authorise first, and that existing payment/booking/public-form code is unchanged) · SQL parses (syntax only) · local `next build` passes with `/admin/enquiries/new` listed.

## 6. Not done / limitations

Migration not applied; nothing pushed or deployed; no records created; no database-level test (none authorised), so the guard trigger and constraint are verified by reading, parsing and later read-only catalogue checks; screens not exercised in a browser. The suppression lookup fails open (a read error leaves the pre-existing behaviour). Acceptance does not yet require a chosen contracting entity (that, and the amount-due and booking-confirmation rules, belong to M2).

## 7. Runbook once authorised (separate approvals)

1. Backup + apply 0165 (as for 0163/0164); verify the four columns, constraint, trigger, defaults (false), and that all existing enquiries and the 12 table fingerprints are unchanged.
2. Fast-forward push to `main`; monitor Vercel; verify public pages, and that `/admin/enquiries/new` redirects when signed out. (Must precede any repository-visibility change, or a Vercel route be decided.)
3. First use: record one genuine WhatsApp/phone enquiry; verify read-only that nothing was emailed and no quotation, amount, payment or booking exists.
