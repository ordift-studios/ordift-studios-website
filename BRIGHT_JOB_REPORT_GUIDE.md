# Bright (CSR-2026-000002) — submitting the genuine job report

**For you to do, as the assigned professional. I will not submit it, prefill it or change any record.** Authorised by you on 12 Oct 2026: record **10 October 2026** as the actual service date through the genuine job-completion report.

## Where

Sign in to the Production portal as the assigned professional (member 0001) and open this path on your Production site:

`/portal/collaborator/engagement/0ddca6da-6b8a-4948-bdc4-ea73e5232518`

The page shows the **Job report** section. (The path comes from the application's own route; the engagement id was read from Production, read-only.) The report form only appears for the professional assigned to the job.

## What the form now does (small change on branch `bright-job-report-interface`, not deployed)

* The "Date the work was actually performed" field is **empty**. Until now it was pre-filled with the *scheduled* date, which for Bright would have been 12 October. It now shows the scheduled date as a hint only and requires you to type the real date.
* Corrections to a submitted report still show the previously reported date.

Until that branch is deployed the current live form pre-fills **2026-10-12**: if you submit before it is deployed, **change the date to 2026-10-10 yourself** and check it before pressing submit.

## What to enter (your facts only)

| Field | Enter |
|---|---|
| Date the work was actually performed | **2026-10-10** |
| Actual start / finish | The real times, or leave blank |
| Completion status | What really happened (completed, partly completed, or not performed) |
| Went smoothly, checklist answers | Your honest answers |
| Incidents, client requests, additional services, outstanding work | Only what applies |
| Remarks | For example: *"Service performed on 10 October 2026. The scheduled date shown in the system (12 October) was recorded in error."* — in your own words |

## What happens when you submit

* One report (version 1) is stored with an audit entry in your name. The management panel then shows scheduled **12 Oct** beside actual **10 Oct**.
* It does **not** complete the engagement or the client's project, close the booking, release files, mark the QAR 1,000.00 payable paid, change the verified payment (PAY-2026-000006), the accepted quotation or the 11 Oct correction history, or send anything to anyone.
* Bright is **not enrolled** in readiness tracking and receives **no** reminders: the work has started, so enrolment is refused and any reminder would be ineligible ("assignment has started").

## If you make a mistake

Use **Correct this report** on the same page. It saves a new version with a reason and keeps the original.

## After you submit

Tell me and I will check, read-only, that exactly one report exists with date 2026-10-10 and that nothing else changed. I will not touch any record.
