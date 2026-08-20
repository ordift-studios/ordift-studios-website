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
