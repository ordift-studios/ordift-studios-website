# Staging Acceptance Tests

Manual, human-run verification procedures for behavior that cannot be fully
covered by automated tests in this repo — typically because it requires real
session/cookie context (a logged-in browser) that the integration test
environment doesn't have (see INTEGRATION_TESTING_STRATEGY.md). Each entry
here stays open ("Not yet performed") until someone actually runs it on
Staging and records the result. These are **staging-only** procedures —
never run against Production data unless a test explicitly says otherwise.

## Format

Each test states: what it proves, exact steps (labeled by who performs
them), and the pass criteria to check afterward.

---

## Test 1 — Quotation Ready email: genuine transition, no manual-edit leak, no re-send on amendment

**Status:** Not yet performed.

**Why this needs a manual staging run:** `setAmountDueAction`
(`src/app/admin/enquiries/actions.ts`) requires a real authenticated
session — it cannot be called directly in the integration test environment
(same limitation already documented in
`setAmountDueDoubleSubmit.integration.test.ts`). Its guard logic and the
Quotation Ready email template are covered by automated tests; this
procedure proves the real end-to-end path, including role enforcement.

**Covers:** CRM Lifecycle Automation Phase 1, Batch 2
(`src/lib/enquiry/lifecycleEmails.ts`, `sendQuotationReadyEmail`) and
Batch 1's role gate (`src/lib/admin/crmPermissions.ts`).

### Steps

1. **(Admin/tester)** On Staging, submit a real test enquiry through the
   public `/book` form (a fresh reference number, not a reused one). Note
   the reference number and the CRM stage shown in the Admin Platform —
   expect **New Enquiry** (`new_lead`).
2. **(Staff account)** Log in as a **plain Staff** user (not Admin/Super
   Admin) and open this enquiry's detail page.
   - **Pass criteria:** the CRM Stage card shows the current stage as
     read-only text plus "Only Admin/Super Admin can change the CRM
     stage." — no editable dropdown is rendered.
3. **(Staff account)** Attempt to invoke `updateStageAction` directly
   (e.g. via a saved/replayed form submission bypassing the hidden UI, or
   browser dev tools) targeting this enquiry.
   - **Pass criteria:** the action returns "You are not authorized to
     change this." and the enquiry's `crm_stage` is unchanged in the
     database.
4. **(Admin or Super Admin account)** Open the same enquiry and use "Set
   Amount Due" to enter a test amount (e.g. $5.00).
   - **Pass criteria:** the form reports success; the enquiry's CRM Stage
     updates to **Quotation Sent** (`quotation_sent`); this is logged as
     exactly one `enquiry.amount_due_set` activity row with
     `stageAdvanced: true`.
5. **(Admin/tester)** Check the inbox for the enquiry's test email address
   (or, if `FORMS_SENDING_ENABLED` is off on this Staging environment,
   check the server/runtime logs for the `[enquiry] [test-mode] would send
   email to ...` line instead).
   - **Pass criteria:** exactly **one** Quotation Ready email (or one
     logged-would-send line), subject `Your Quotation is Ready —
     <reference>`, containing the correct amount and a portal link scoped
     to this enquiry's ID.
6. **(Admin/tester, read-only)** Query `activity_log` for this enquiry's
   `enquiry.quotation_email_sent` rows.
   - **Pass criteria:** exactly **one** row, `metadata.ok: true`.
7. **(Admin or Super Admin account)** Amend the same enquiry's amount due
   to a different value (e.g. $7.00) — the enquiry is already past
   `quotation_sent`, so this is a pure amendment, not a fresh transition.
   - **Pass criteria:** the amount updates; CRM stage is unchanged
     (already `quotation_sent`); **no** second Quotation Ready email is
     sent; `enquiry.quotation_email_sent` activity rows for this enquiry
     remain at exactly **one**.
8. **(Admin or Super Admin account)** Manually change this enquiry's CRM
   stage via the dropdown (e.g. to "Negotiation" and back to "Quotation
   Sent," or to any other stage).
   - **Pass criteria:** the manual stage change succeeds and is logged as
     `enquiry.stage_change` with the real admin's `actorUserId` — **no**
     Quotation Ready email is sent as a result of this manual edit, and
     `enquiry.quotation_email_sent` activity rows remain unchanged from
     step 6.
9. **(Admin/tester)** Clean up: archive/delete the test enquiry per the
   normal Staging test-data cleanup convention (see
   INTEGRATION_TESTING_STRATEGY.md §3 — `.invalid`/test-prefixed data only,
   never touch a real reference number).

### Overall pass criteria

All of steps 2–8 pass exactly as described: role enforcement holds
server-side and in the UI, the stage transitions exactly once, exactly one
email and one activity row result from the genuine transition, a later
amendment sends no second email, and a manual stage edit never triggers the
email at all.

---

## Test 2 — "Start Handling": Staff-eligible action stays isolated from the Admin/Super-Admin-only general stage editor

**Status:** PASSED — performed 2026-08-20 against `ENQ-2026-000173` using a
genuine Staff-only Staging test account (`myliannforever@gmail.com`, role
`staff` only). All steps confirmed live: the button was visible to Staff
with no general dropdown available; clicking it moved the enquiry from
"New Enquiry" to "Contacted" with no error; the button disappeared once the
stage changed; and a read-only database check afterward confirmed exactly
one `enquiry.stage_change` activity row, correctly attributed to the real
Staff account, with zero rows across all three notification-activity
actions. See `MILESTONES.md`'s "CRM Lifecycle Automation Phase 1 — Batches
1–4" entry for the full closure record.

**Why this needs a manual staging run:** `startHandlingAction`
(`src/app/admin/enquiries/actions.ts`) requires a real authenticated
session — it cannot be called directly in the integration test environment,
same limitation as Test 1. Its guard/idempotency logic and the "zero
notification" outcome are already covered by automated tests
(`startHandling.integration.test.ts`); this procedure proves the one thing
those can't: that a plain Staff account can genuinely use this one narrow
action while remaining blocked from the general CRM Stage dropdown.

**Covers:** CRM Lifecycle Automation Phase 1, Batch 4
(`src/app/admin/enquiries/[id]/StartHandlingButton.tsx`).

### Steps

1. **(Admin/tester)** On Staging, submit a real test enquiry through the
   public `/book` form (fresh reference number). Confirm the Admin Platform
   shows it at **New Enquiry** (`new_lead`).
2. **(Staff account)** Log in as a **plain Staff** user and open this
   enquiry's detail page.
   - **Pass criteria:** the CRM Stage card shows both a **"Start
     Handling"** button and, below it, the read-only "Only Admin/Super
     Admin can change the CRM stage." message with no editable dropdown —
     the two controls coexist without contradiction.
3. **(Staff account)** Click **Start Handling**.
   - **Pass criteria:** the button click succeeds; the page shows the
     enquiry now at **Contacted**; the "Start Handling" button itself is
     gone (the stage is no longer `new_lead`); the read-only
     Admin/Super-Admin-only message remains for the general editor.
4. **(Staff account, read-only)** Confirm exactly one `enquiry.stage_change`
   activity row exists for this enquiry, with `metadata.reason:
   "start_handling"` and the **real Staff member's own** `actorUserId` (not
   `null`, not `automated: true`).
5. **(Staff account)** Attempt to invoke `updateStageAction` directly against
   this same enquiry (bypassing the hidden UI).
   - **Pass criteria:** rejected with "You are not authorized to change
     this." — confirms Batch 1's general restriction is completely
     unaffected by Batch 4's narrower carve-out.
6. **(Admin/tester)** Confirm no email was sent to the enquiry's contact
   address as a result of steps 3–5 (check inbox or, on a
   `FORMS_SENDING_ENABLED=false` Staging environment, the
   `[test-mode] would send email` log lines) — there should be **none** at
   all from this test.
7. **(Admin/tester)** Clean up per the normal Staging test-data convention.

### Overall pass criteria

Staff can use Start Handling and only Start Handling; the general CRM Stage
dropdown remains fully Admin/Super-Admin-only exactly as Batch 1 left it;
the transition is logged with the real actor; no client email fires.

---

## Test 3 — Files Ready: end-to-end publish → notification → portal verification

**Status:** PASSED — performed 2026-08-20 against `ENQ-2026-000174` (a fresh
test enquiry, auto-linked at submission to an existing Client account for
the same email) and a genuine Staff-only Staging account.

**Why this needs a manual staging run:** `createDeliverableAction`
(`src/app/admin/deliverables/actions.ts`) requires a real authenticated
session, same limitation as Tests 1 and 2. Its guard/idempotency logic and
the email template are covered by automated tests
(`createDeliverable.integration.test.ts`, `lifecycleEmails.test.ts`); this
procedure proved the full real-world path: publish → notification content →
the client actually seeing the file in their own Portal.

**Covers:** CRM Lifecycle Automation Phase 1, Batch 5
(`src/components/admin/PublishDeliverableForm.tsx`,
`src/app/admin/deliverables/actions.ts`).

### Steps performed

1. Fresh test enquiry submitted via `/book` with a real, controlled email —
   found already auto-linked (`user_id` populated at submission) to an
   existing Client account for that email.
2. Logged into the Client Portal as that client — confirmed the Deliverables
   tab genuinely empty beforehand.
3. Logged in as a genuine Staff-only account, published a test deliverable
   against the enquiry — observed the "Publishing…" pending state, the form
   disabling, and a repeat click while disabled doing nothing.
4. Read-only verification: exactly one deliverable row, one
   `deliverable.published` activity row, one `deliverable.files_ready_email_sent`
   activity row (`ok: true`), `crm_stage` unchanged.
5. Since Staging never sends real email (test-mode logging, by design,
   regardless of any other setting), the notification's actual content was
   verified directly from the Staging runtime log — correct recipient,
   subject (`Your Files Are Ready — <reference>`), body, and portal link —
   rather than an inbox.
6. Logged back in as the client and confirmed the deliverable is genuinely
   visible via that exact portal link.
7. Final read-only re-check found nothing had drifted — same counts as
   step 4.

### Overall pass criteria

A genuine publish produces exactly one deliverable, one Files Ready
notification, correctly addressed and worded, with a portal link that
genuinely resolves to the right client's project; the CRM stage never
moves; the pending-state guard visibly prevents a same-session double
submission.

---
