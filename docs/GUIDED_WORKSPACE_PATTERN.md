# Guided workspace pattern (standing design requirement, Founder, 2026-10-22)

One process = one primary workspace, from initiation to completion. Systems of record (HR, Legal, Finance, Operations) stay
authoritative; the workspace derives each step's state from their records and presents the authorised action (embedded form or
link) in place. Progress is never stored in the workspace, so the same URL always shows the true position.

## Building blocks (already in the repository)
- `src/lib/workspace/processWorkspace.ts` - the model: ordered numbered steps (owner, purpose, known, missing, state
  completed | pending | blocked | not_applicable, blocker, action) and `summarizeWorkspace` (x of y, percent, current step).
- `src/lib/organization/instructorWorkspace.ts` - the first builder (instructor onboarding). A pure function of facts read from
  existing records. Copy this shape for each module.
- `src/lib/legal/agreementReadiness.ts` - reusable legal-prerequisite assessment (what / why / source / who / how per item).
- `src/components/admin/OnboardingJourneyPanel.tsx` + `OnboardingJourneyForms.tsx` - the renderer and the embedded forms. Forms hold
  no authority: they submit to `journeyActions.ts`, which checks the caller and calls the existing authoritative function.

## Rules for every module
1. Every required stage is a step, even when another department owns it. No "go to another department" without a link or form.
2. Information already verified is shown, never asked again (profile, entity, jurisdiction, contract facts).
3. A blocker is explained in plain English with the exact next action; no disabled button without a reason.
4. Reuse existing server actions and permissions. A new action is a thin wrapper that re-checks authority and writes an audit record.
5. No step issues, signs, sends, pays or activates anything unless a person presses a clearly labelled button with the right authority.
6. Record decisions in the existing audit log keyed to the process record; do not create parallel tables.

## Next modules (suggested order, no rewrite)
1. Creative Crew Support request: enquiry -> quotation -> contracting entity -> crew offers -> agreements -> assignment -> delivery ->
   client acceptance -> closure. The panels already exist on the request page; the work is a numbered header that derives step state
   from them and links each blocker.
2. Staff recruitment/onboarding (employee pipeline) - same builder over `staff_onboarding`.
3. Vendor onboarding, workshop/session management, client bookings.
