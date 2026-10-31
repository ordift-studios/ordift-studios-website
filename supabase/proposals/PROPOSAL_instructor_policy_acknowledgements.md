# PROPOSAL (NOT APPROVED, NOT IMPLEMENTED) — instructor-specific policies and acknowledgements

Prepared 31 October 2026 in answer to Founder decisions 7 and 8: (7) Ghana employment HR policies are NOT applied automatically to independent instructors; (8) a separate proposal for instructor-specific policies, with the applicable acknowledgements required BEFORE THE FIRST WORKSHOP ASSIGNMENT. No policy record, requirement or gate has been altered.

## 1. Findings (read-only)
| Fact | Evidence |
|---|---|
| Six controlled policies are active: OS-HR-GH-000 (register), 002 (employment, working time, leave), 003 (compensation, benefits, performance), 004 (conduct, wellbeing, discipline), 005 (information security, privacy, AI, IP, assets, travel, safeguarding), 006 (separation, final settlement). | Production read-only query; sources in `src/lib/legal/documents/os-hr-gh-*.ts` |
| They are written for "Employees" (employment agreement, salary, long-service, leave, separation). None says it applies to independent instructors. | Policy texts |
| OS-LGL-020 (Data / Security Incident & Breach Response Standard) is approved but not active, so it is not currently acknowledgeable. | Production query |
| The acknowledgement list is "every active controlled policy" (no applicability filter). | `listControlledPolicyDocuments()` |
| The EMPLOYEE onboarding catalog requires `policies_acknowledged`; the INSTRUCTOR catalog has no policy requirement. The instructor workspace shows a "Policies" step that counts all six (so the first instructor would read 0 of 6) and blocks nothing. | `onboardingRequirements.ts`, `instructorWorkspace.ts` |
| Issuing the instructor agreement does not check policies; the assignment gate (`instructorAssignmentRefusal`, used by `createInstructorEngagement`) checks only for a fully executed OS-LGL-010. | `instructorEligibility.ts` |
| The agreement itself incorporates no named policy; clauses 14 (safeguarding), 15 (participant data), 18 (recording) and 23.1 (authority) are inside it. Clause 29.6: agreement + Session Schedule + "expressly incorporated documents". | OS-LGL-010 master |
| Non-employees already acknowledge policies in their own portal (vendor portal precedent). Evidence is stored in `policy_acknowledgements` with relationship and jurisdiction; `instructor` already maps to the INSTRUCTOR relationship. | `vendor/actions.ts`, `workforceMappings.ts` |
| No instructor has acknowledged any of them (none applies to instructors). | Production query |

## 2. Principle
A policy binds a person only through the document that incorporates it or through a recorded, versioned acknowledgement. Employment policies must not be shown to, or demanded from, an independent contractor. The agreement is the contract; acknowledged standards are operating rules for the work.

## 3. Proposed design
1. **Applicability, explicit and fail-closed.** Record, per controlled policy, which relationships it applies to (EMPLOYEE, INSTRUCTOR, VENDOR, …). Existing six policies are set to EMPLOYEE only. A policy with no applicability applies to nobody (never to everyone). *Needs a small migration (a table or column) — Founder approval.*
2. **Instructor standards (new controlled documents — text to be written and counsel-reviewed, not drafted here):**
   - Instructor & Facilitator Standards — participant safeguarding, conduct and welfare (basis: OS-LGL-010 clauses 14.x; Session Schedule E controls);
   - Participant Data, Recording and Confidentiality Standard for contributors (basis: clauses 15 and 18; Privacy Notice OS-LGL-016);
   - Data / Security Incident Standard OS-LGL-020 (already approved; needs activation) if the Founder wants contributors to know the incident route.
   Which of these exist, and their wording, is a legal decision; this proposal does not assume them.
3. **Acknowledgement.** The instructor acknowledges each applicable, active policy version in his own portal (same self-acknowledgement rule and evidence as the vendor portal). A new version requires a new acknowledgement. Staff cannot acknowledge for him.
4. **Gate — before the FIRST WORKSHOP ASSIGNMENT**, not before the agreement. Extend the existing assignment eligibility check (`instructorAssignmentRefusal`) to also require current acknowledgements of every INSTRUCTOR-applicable active policy, with a clear message listing what is outstanding. A genuinely executed agreement remains required as today. A waiver is not offered (same discipline as the agreement requirement); a Super Admin override, if wanted at all, would be explicit and audited.
5. **Workspace.** The instructor workspace "Policies" step is filtered to applicable policies and relabelled "Instructor standards"; it stays informational for the agreement and shows "required before first assignment".
6. **Agreement unaffected.** The signed OS-LGL-010 text is not changed. If counsel wants the standards incorporated into the contract, that is a master change (a new version), separate from this proposal.

## 4. Why not before the agreement
Today there is no instructor policy to acknowledge; requiring acknowledgement before issue would either deadlock issuance or force the six employment policies on a contractor. Gating at first assignment protects the platform where the work actually starts and does not delay the first instructor's contract.

## 5. Approvals required (each separate)
1. Counsel / Founder: the instructor standards documents (content, version, jurisdiction) and whether OS-LGL-020 is activated.
2. Founder: the applicability marker (migration) and the six employment policies' EMPLOYEE-only setting.
3. Founder: the first-assignment gate and whether any override exists.
4. Founder: instructor-portal acknowledgement screen and the workspace relabel.

## 6. Implementation outline (after approval, local first)
Migration + rollback rehearsed locally; filter in `listControlledPolicyDocuments`; portal acknowledgement action reusing `recordPolicyAcknowledgement`; extension of `instructorAssignmentRefusal`; tests: employment policies never listed for instructors; version bump forces re-acknowledgement; assignment refused with outstanding items and allowed when complete; self-acknowledgement only; employee flow unchanged; existing 12 acknowledgements untouched.

## 7. Risks
Policy content not yet written (the gate is empty until it exists); existing instructors (none executed yet) would need to acknowledge before their next assignment; scope creep into employee policies (kept out by the explicit applicability table).
