# User acceptance checklist — Ghana and Qatar, localhost lab (10 Nov 2026)

How to use: work top to bottom for ONE market, then repeat for the other. Tick each box only when the screen shows exactly what is written. Write the record reference next to anything that does not match and stop. The lab sends no real e-mail: "sent" means "recorded in test mode". Passwords are only in `/Users/myli/ordift-walkthrough-kit/logins.txt` (never paste them anywhere). Sign-in limit: about 5 per 10 minutes; if you see "Too many attempts", wait ten minutes. If Admin pages look empty, the lab keys have expired: `./renew_lab_keys.sh` then `./start.sh` (see `LAB_API_KEY_RENEWAL.md`).
Use the records: **Ghana:** `ENQ-JRN-GH` (yours, untouched), `ENQ-JRN-GHY` (paid, unscheduled), `ENQ-JRN-GHP` (paid, finally cancelled, refund recorded). **Qatar:** `ENQ-JRN-QA` (yours, untouched), `ENQ-JRN-QAP` (paid, unscheduled), `ENQ-JRN-QAN` (finally cancelled, no payment), `ENQ-JRN-QAS` (staff-recorded, no portal owner), `ENQ-BK-901` (the existing booking that conflicts on 14 Dec). Logins: `sa@local.test` (Super Admin), `ad@local.test` (Admin), `st@local.test` (staff), the two journey clients.
Market differences to check as you go: Ghana → payment market Ghana, GHS bank account, time zone Africa/Accra (GMT); Qatar → payment market Qatar, QAR bank account (bank transfer only), Asia/Qatar (GMT+3).

## A. Enquiry and client verification
- [ ] A1 Record a NEW staff enquiry at `/admin/enquiries/new` from WhatsApp for the market's journey client: it is created, tagged as recorded by staff, no e-mail is sent to the client.
- [ ] A2 The enquiry page "Client portal access" card: Create invitation (channel WhatsApp). The link and 6-digit code appear ONCE; reloading never shows them again.
- [ ] A3 As the client (journey client sign-in): open the link, type a WRONG code twice (tries-left shown, box emptied), then the right code: the project is yours; the Payments page opens. Staff see the claim in the audit.
- [ ] A4 Five wrong codes lock a link; the right code is then refused; staff issue a new one. A staff account opening the link is told only a client can claim and sees no code box.
- [ ] A5 A WEBSITE-form enquiry (submit one on the public enquiry form with a throwaway address): the ordinary acknowledgement is produced (logged); later, with no portal owner, booking notices are NOT e-mailed to the typed address (see F6).

## B. Quotation, acceptance, amount due
- [ ] B1 Quotation: tick the activity, "does not depend on a specific person or time", tick the confirmation, Issue. Record delivery (channel, recipient). Record acceptance with evidence. Nothing is e-mailed by issuing.
- [ ] B2 Set the payment market (Ghana or Qatar) and Establish the amount due. Nothing is payable before this.
- [ ] B3 The workflow panel reads: quotation accepted, amount due set, Payment "not yet", Booking "Not yet".

## C. Payment (before booking)
- [ ] C1 As the client: Payments → pay (custom amount or the full balance). Ghana offers card (fails cleanly in the lab: no provider) and bank transfer; Qatar bank transfer only. Press "I've sent this payment" twice fast: ONE instruction. Upload the synthetic receipt, submit.
- [ ] C2 Try a second instruction that would exceed what is still owed: refused in plain words. Cancel an unpaid instruction: it closes, stays in history.
- [ ] C3 As the Super Admin (a DIFFERENT person from the payer): `/admin/payments` → Review → enter the amount that "arrived" (Ghana GHS, Qatar QAR), the bank reference, the date (not later than today), tick the independent check, Confirm. The payer cannot verify their own payment.
- [ ] C4 After the LAST payment that makes the project fully paid: the enquiry page shows the amber "Paid — scheduling pending"; the project stage is STILL "Quotation Sent" (a payment never books); the client's dashboard and header say "Paid — scheduling pending", next milestone "Booking confirmation"; the receipt e-mail (View the message in the lab log, or the payment page) carries the "this does not by itself confirm a date" paragraph; no "Booking Confirmed" e-mail exists yet.
- [ ] C5 `/admin/enquiries?scheduling=pending` lists the project under "Paid — scheduling pending (n)"; the chip count matches the rows.
- [ ] C6 Failure paths: Reject a proof and Request more information: the client sees the outcome; a rejected one can be resubmitted. A payment record is never silently edited; an over-payment is flagged for review, not corrected.

## D. Booking (confirmation, conflict, reschedule)
- [ ] D1 As the Super Admin on the paid project: Booking card → Lab staff, a FREE day, place, "Check readiness and conflicts": no blockers. Type the exact sentence, Confirm. Stage becomes Booked; audit has `booking.confirmed`.
- [ ] D2 Press Confirm twice quickly: one booking. Check the Notifications box: Client "Booking Confirmed", Team, Assigned person: each ONCE, each "sent", each with "View the message".
- [ ] D3 CONFLICT: a second project, Lab staff, 14/12/2026 10:00–11:00 Asia/Qatar: a red overlap with `ENQ-BK-901`, "cannot be cleared by a reason". Change the time or the person and it clears. The conflict applies in both markets (the person is the same).
- [ ] D4 Payment-condition block: on a project that requires a deposit or full payment before booking and has not paid it, confirmation is blocked with the exact amount (Super Admin) or "payment pending" (Admin).
- [ ] D5 RESCHEDULE: "Change this booking" → new time. "Tell the client now" is selected by default. After the change: version +1, stage still Booked, ONE new set of notices: client message shows "Previously" (what they were last told) and "Now confirmed"; the assigned person gets Was/Now; a person taken off a booking gets a release notice.
- [ ] D6 Hold a notice back: on Change, choose "Hold the notice back" with a one-word reason: refused; with a sentence: accepted, "Outstanding action" appears in the Notifications box with your reason; the team and assigned person were still told. "Send now" sends it once, showing the booking AS IT IS NOW. A first confirmation has no hold-back option.

## E. Cancellation (two kinds) and money
- [ ] E1 Cancel with "A new date will be agreed": the stage returns to Quotation Sent; the staff page and the client's dashboard/header/Booking Details read "Booking Cancelled — Rescheduling Pending" and show NO confirmed date; every payment, the accepted quotation and the earlier booking version are untouched; the client notice says it is no longer confirmed and a new date will be agreed.
- [ ] E2 Rebook the same project on a free day: a NEW Booking Confirmed set goes out ("re-confirmed after an earlier cancellation" in the team notice).
- [ ] E3 Cancel with "Final": reads "Booking Cancelled" everywhere; the client notice says it will not be rescheduled and, only if they paid, that nothing was refunded or changed by the cancellation. The project is NOT closed and nothing is refunded automatically.
- [ ] E4 MONEY (final cancellation only): as an Admin, "Record a cancellation outcome": refund of a PAID project: amount above what was paid is refused; with a reason and an evidence reference (no e-mail address, phone or long number): recorded as "requested", waiting for a different Super Admin. The Admin sees no balances.
- [ ] E5 As the Super Admin (not the requester): the request shows Verified paid and offers Authorise / Decline with a written reason. A Super Admin who made the request themselves sees only "Waiting for a different Super Admin" and the database refuses if forced.
- [ ] E6 After Authorise: "Record that it was carried out" with the external reference (once only). `./journey_check.sh <ref>` and the payments page: amount paid, payment rows, quotation and payment status are EXACTLY as before; the activity log has requested / authorised / executed with who. A write-off is limited to the unpaid balance; "no adjustment needed" is itself recorded.

## F. Notifications, audit, failure recovery
- [ ] F1 Every notice in the Notifications box says what it was, to whom (client / team / assigned / person taken off), its status, tries, and offers "View the message". Test mode says "logged only, nothing was sent".
- [ ] F2 Team notice as Super Admin shows payment facts; as an ADMIN (ad@) the booking card shows only client notices, no internal or assigned notices, no balances, no Retry.
- [ ] F3 Assigned person (st@local.test): My Workspace → Notifications → "E-mails about bookings assigned to me" On by default; switch Off, then confirm/change a booking assigned to them: their notice is "skipped / not eligible". Switch On again.
- [ ] F4 FAILURE AND RETRY: make a failure record (database step in the report, "simulated provider outage") then, as Super Admin, press Retry: it sends once (tries 2). A sent notice has no button. Press Retry/Send now twice fast: one send.
- [ ] F5 OUT OF DATE: with a deferred client notice outstanding, change the booking again: the earlier notice becomes "skipped — superseded" and is never sent; the new one describes the current booking.
- [ ] F6 STAFF-RECORDED / UNVERIFIED (use `ENQ-JRN-QAS`): confirm or change its booking: the client notice is "skipped", with an Outstanding action ("tell the client yourself", the message shown). Nothing was e-mailed, even though the typed address matches an existing account. Record "I told the client" (WhatsApp / telephone, optional note without a phone or e-mail): an Admin or Super Admin can; it clears the action, shows who and how, and it cannot also be e-mailed afterwards.
- [ ] F7 Missing or unverified client contact: a project with no e-mail on file → "Not e-mailed: no e-mail address on file"; an owner whose account address is unconfirmed → "Not e-mailed: the client's portal account has no confirmed e-mail address". Team and assigned notices still go.
- [ ] F8 The audit trail (`./journey_check.sh <ref>` section 7, and the enquiry Activity): payment verified, payment completed, booking confirmed / changed / cancelled, stage change with reason, notification recorded / failed / deferred / manual, money requested / authorised / executed. Staff are named by member number first.
- [ ] F9 Read-only integrity: `./journey_check.sh GHP QAN QAP QAS GHY GH QA` print no FAIL line; every payment is "COUNTED" only if completed.

## G. Access control spot checks
- [ ] G1 Staff (st@) sees nothing about bookings except conflicts on their OWN assignment; Admin sees no amounts and no booking forms; only a Super Admin confirms, changes, cancels, authorises, executes.
- [ ] G2 A client sees only their own projects, never the assigned person's name, amounts of others, agreements or internal notes; a cancelled project never shows a date as if it stood.
- [ ] G3 FounderSelfReviewPanel behaviour is unchanged: nobody reviews or releases their own work; the only action that ignores that block is "Add to Portfolio Candidates" (internal, nothing published).

## Sign-off
Market: Ghana / Qatar   Tester: ________   Date: ________   Result: PASS / PASS WITH NOTES / FAIL   Notes and record references: ________________________________
