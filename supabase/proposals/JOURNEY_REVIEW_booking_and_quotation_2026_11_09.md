# Customer journey review: enquiry to confirmed booking (REVIEW ONLY; no code changed by this document)

Prepared 9 Nov 2026 against the actual local branches (booking `b4fe240`, quotation form `436dfcc`, agreement `c72937f`+, combined review copy). Nothing was pushed, merged or released.

## 1. The intended journey against what exists
| Stage | What exists today | Gap or note |
|---|---|---|
| Enquiry by WhatsApp, telephone, in person (staff) or optional online self-service | **Staff-recorded enquiry (M1, live):** `/admin/enquiries/new`, channels WhatsApp/message, telephone, email, in person, referral, other; creates the ordinary enquiry at stage new_lead; sends no email and creates no quotation, amount or booking. **Public form** `/book` (verified: no account is needed; a signed-in user is only used to prefill). | None needed for the channels. No new customer registration is required anywhere in this path. |
| Client lookup | Client Directory (live). On the staff-enquiry page the directory link and contact list load **only for a Super Admin** (the directory's authority is `organisationRegistryAdminister`, Super Admin override). | **Gap:** a staff member or admin taking a WhatsApp enquiry cannot look up an existing client. Options: a read-only lookup (name/phone/email match, no detail) for staff and admins, with the link still Super Admin only. Decision needed. |
| Availability verification | **At confirmation only** (booking panel: assigned person, conflict preview, firm conflicts cleared only by "verified with the assigned person": how, when, where recorded). | **Gap:** nothing before quoting. A quotation can be issued and accepted for a time the person cannot do. Recommend a read-only "check availability" on the enquiry (reuse the same conflict preview; creates no hold and no record). |
| Approved quotation | Draft -> issue (Super Admin chooses the contracting entity; licensed-activity check) -> sent; structured payment condition (none / percentage deposit / full) with generated written terms (local branch, not released). | Quotation screens do not tell the seller that an agreement will probably be required. Recommend a read-only hint from the same rules (value thresholds, categories). |
| Genuine client acceptance | **Staff-recorded acceptance with evidence** (channel, who accepted, when received, who recorded; the system never sends the quotation and never accepts on its own). | Consistent with "genuine acceptance" and with avoiding client registration. A no-login, single-use acceptance link (like the signing links) is a possible later option; not recommended now. |
| Agreement and payment requirements | Booking rules (versioned thresholds, always-categories, circumstances), payment condition checked against verified payments, executed agreement required where the rules say so. Client Services Agreement: draft master and Founder-approval screen built locally; issuance gate always refuses. | Agreement issuance and its signing screens are not built (by design, waiting on counsel and approvals). |
| Confirmed booking | Booking panel: Super Admin confirms, changes, cancels with typed sentences; append-only history; admin and staff see restricted views. Flag off in Production, migration not applied. | Not released. |

Three steps are Super Admin only by design: linking a client, choosing the contracting entity, confirming the booking. In practice the Founder is the bottleneck for every enquiry; that is a policy choice to revisit, not a defect.

## 2. Preserved local work (verified 9 Nov)
`local/enquiry-booking-design` b4fe240 (clean), `local/quotation-payment-condition-form` 436dfcc (clean), `local/client-service-agreement` (clean; Founder approval screen, planner and proposals), `local/p1-payment-wording-proposal` 3ef19d6 (clean), `local/walkthrough-combined` (throwaway review copy, merges of the three), `local/walkthrough-tooling` 6ab07e1. No branch was removed or rewritten. The walkthrough lab database was not reset; the v1.1 synthetic row is in legal review and registered, with no Founder approval recorded.

## 3. Outstanding UI issues
1. **Form fields clear after a refused submission** (React 19 resets uncontrolled fields after any form action). The platform helper already exists (`ActionForm` + `restoreSubmittedValues`). 79 of the 86 files that use `useActionState` render a bare `<form action={...}>` without it (61 in admin, 9 in portal, 8 in shared components, 1 legal); 61 of those have three or more fields. The largest: vendor detail (79 fields), legal-entity registry panels (73), onboarding journey forms (61), portfolio job forms and subject evidence (35 each), separation workspace (27), employment terms (23), workshop dashboard (22), leave (20), onboarding workspace (19), quotation status actions (18), workshop form (17). Already protected: the quotation form (local), the booking forms, the Founder approval form, 3 older forms.
2. **Quotation refusal is not announced to screen readers:** the red refusal text on the quotation form is a plain paragraph, not `role="alert"` (observed in the browser). One-attribute fix; not made.
3. **Client lookup and availability gaps** above.
4. **Booking screens are behind a flag and unreleased**, so none of the above reaches users yet.

## 4. Recommended narrow fix for the form-restoration problem (NOT implemented)
Do not change 79 files at once. Stage it:
1. **A generic hook, not a codemod.** Add `useRestoreOnRefusal(state, isRefusal)` beside `ActionForm`, reusing `restoreSubmittedValues`, for forms whose state is not the shared `ActionState` shape (journey forms use their own state type). Unit-test it together with `ActionForm`.
2. **Convert only the high-value forms first**, chosen by size and refusal likelihood: onboarding journey forms, legal-entity registry panels, vendor detail, portfolio job forms. Verify each in the browser through its refusal path (the same method used on the quotation form).
3. **Stop it growing:** an exact-list static test (the pattern already used in this repository) that fails when a NEW file adds a bare `<form action>` with more than a few fields, naming the helper to use. Existing files stay on an explicit allow-list that shrinks as they are converted.
4. Leave short, one-or-two-field forms alone.
Risks: controlled inputs (state wins over DOM), file and password inputs (never restored), and forms that deliberately want to clear on refusal (none known). Decision needed: approve stage 1 and 3, or the whole plan.

## 5. Recommended next development task
Staged in this order, each local and separately approvable: (a) read-only staff client lookup and pre-quotation availability check (small, removes the two real journey gaps); (b) form-restoration stage 1 and 3; (c) the agreement issuance and signing screens once counsel's final text exists.
