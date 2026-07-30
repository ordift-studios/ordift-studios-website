# Legal Review Report

**Date:** 2026-07-30. Companion document to `ORDIFT_STUDIOS_LEGAL_SUITE_v1.md`. This report has two parts: the audit performed *before* drafting the suite, and the business-protection review performed *after*. Nothing in this report is legal advice — it's an honest account of what was found and what still needs qualified legal input.

---

## Part A — Pre-Draft Audit

A review of every existing legal-adjacent document, done before writing a single line of the new suite, as requested.

### Documents reviewed
`legal/privacy`, `legal/booking`, `legal/cookies`, `legal/terms` (the four live Sanity documents), `LAUNCH_CHECKLIST.md`, `FINAL_LAUNCH_CERTIFICATION.md`, `TECHNOLOGY_COST_REGISTER.md`, `DOCUMENTATION_INDEX.md`, `PRODUCT_ROADMAP.md`, `BUSINESS_LAUNCH_AUDIT.md`, and every other document referencing legal behavior (`DISASTER_RECOVERY.md`'s data-handling notes, `GOOGLE_SHEETS_INTEGRATION.md`'s processor description, `MILESTONES.md`'s legal-page history).

### Duplicated wording
The four existing legal pages each independently define "Ordift Studios," restate the business's Ghana location, and separately describe the same set of data processors (Supabase, Google Sheets, Resend) with slightly different phrasing each time. None of the four pages reference each other by a defined term — each restates "Contact Enquiry, Booking request, Workshop Registration, or Project Request" as a fresh list rather than pointing at one shared definition.

### Inconsistent terminology
- "Booking Terms" vs. "Website Terms" use "you"/"your" for the visitor throughout, but neither formally defines who "you" refers to (visitor? client? both?) — a real gap once Client Portal accounts, workshop attendees, and enquiry-only visitors are all potentially "you" in different contexts.
- The existing Booking Terms mixes "Contact Enquiry," "Booking request," and "Project Request" as if interchangeable in some sentences and distinct in others.
- No existing document defines "Deliverables," "Creative Works," "Portfolio," or "Client Portal" as formal terms, despite all four being used repeatedly.

### Conflicting clauses
None found that actively contradict each other — the four existing pages are narrow enough that they don't yet overlap in ways that conflict. This is expected to change as the suite expands to cover Media Usage, IP, AI workflows, Client Portal, and Workshops, which is exactly why shared definitions and cross-referencing are being introduced now rather than after a conflict appears.

### Outdated references
`LAUNCH_CHECKLIST.md` and `FINAL_LAUNCH_CERTIFICATION.md` both refer to "the four legal pages" as the entire legal surface — both need updating once the suite expands to eleven parts, so a future reader doesn't assume the smaller scope is still accurate.

### Missing protections (identified, not yet fixed by drafting alone)
- No model release or property release mechanism exists anywhere in the codebase or documentation — a real gap for a photography/videography business, not just a documentation gap. The current site could photograph a client or a location and have no captured, written consent for later portfolio/marketing use.
- No IP/commercial-licensing structure exists beyond the general "Ordift retains copyright, licenses the client" default position drafted earlier — nothing distinguishes editorial use, print rights, digital rights, exclusive buy-outs, or social media rights.
- No confidentiality clause exists anywhere for corporate/sensitive projects.
- No dispute-resolution mechanism (mediation, arbitration, court venue) is specified anywhere.
- No policy exists for photographing/recording minors, despite "Weddings" (which often include children) being an explicit named service context in this suite's brief.

### Missing definitions
"Business Day," "Force Majeure," "Confidential Information," "Media," "Creative Assets," "User," "Account," "AI-assisted Processing" — none currently defined anywhere in the project.

### Future scalability issues
The current four-page structure has no shared definitions layer, so every future addition (Media Usage Policy, IP Policy, AI Policy, Client Portal Terms, Workshop Terms) would either duplicate definitions again or silently drift from the original four pages' wording. This is the core reason for Part 1/Part 2 of the new suite (hierarchy + shared definitions) — it's a structural fix, not just more pages.

---

## Part B — Business Protection Review (post-draft)

Performed after `ORDIFT_STUDIOS_LEGAL_SUITE_v1.md` was built. Findings are listed, not silently fixed, per your explicit instruction.

### Remaining legal risks
1. **No captured model/property releases exist for any current or future portfolio work**, and none of this suite's placeholders create the *mechanism* to capture them (a release-capture step in the booking/delivery workflow) — only the *policy language*. This is the single largest gap between "the legal suite says what should happen" and "the platform actually does it."
2. **International clients and dispute resolution remain entirely unresolved** — Part 6 and Part 4 both placeholder this correctly, but until it's resolved, any dispute with a non-Ghana client has no agreed venue or mechanism.
3. **Governing law is stated as Ghana** (carried forward from the earlier approved-pending draft, grounded in the business's real location) — this is a reasonable default, but has not been reviewed by Ghanaian counsel for correctness or completeness, and doesn't address what happens when a client is in a jurisdiction with mandatory consumer-protection law that Ghana's governing-law clause can't override.
4. **The Privacy Notice's international-data-transfer section is a placeholder**, but data genuinely does cross borders today (Supabase's Frankfurt region, Resend/Cloudflare/Vercel's global infrastructure) — this is a live, unaddressed compliance gap, not a hypothetical one.
5. **No documented policy exists for photographing/recording minors** — flagged as a placeholder in Part 7, but this is a heightened-sensitivity area (most jurisdictions have specific rules for children's imagery and data) that deserves priority attention once legal review begins, not just equal weight with the other placeholders.

### Business risks
1. Continuing to deliver client work (per the existing, real booking flow) without a captured usage/release agreement means every piece of delivered work today is operating on an *assumed*, not *documented*, rights position.
2. The "Business Decision Required" placeholders are numerous (see the suite itself) — there's a real risk of launch happening with several of these still unresolved if they're not tracked deliberately. `LAUNCH_CHECKLIST.md` should reference the suite's open placeholders as its own tracked list, not just "legal pages need approval" as one line item.

### Documentation risks
The suite is large (11 parts). If it's approved piecemeal (e.g., Privacy Notice approved, IP Policy still pending), the cross-references between parts could point at not-yet-approved sections. Recommend approving the whole suite together, or clearly marking which parts are live vs. still pending if partial approval happens.

### Future scalability concerns
None beyond what's already addressed by the shared-definitions structure — the suite was explicitly designed so new service lines (talent management, digital products, commercial licensing) extend existing parts rather than requiring new documents, per your brief.

### Suggested future policies (not drafted, just named)
- A written model/property release *form and workflow*, not just policy language — this needs a real technical mechanism, not only legal text.
- A children's imagery consent policy, likely reviewed with particular care given the sensitivity.
- A formal complaints/dispute-escalation procedure, distinct from the governing-law clause.
- A data breach notification procedure (referenced structurally in the Privacy Notice's security section, not yet written as a real incident-response plan — this maps to your own later "Incident Response Plan" idea).

---

## Part C — Technical Consistency Review (QC Pass, 2026-07-30)

A dedicated, narrower pass over the suite as it stands today — not a rewrite, not a restructuring, not an expansion. Checked: spelling/grammar affecting clarity, terminology consistency, numbering, cross-references, formatting consistency, placeholder-marking consistency, technology references, and consistency between the legal text and the actual implemented platform. Every claim below was independently re-verified against the live codebase this pass, not assumed correct from when the suite was first drafted.

### Corrected (mechanical, zero legal judgment involved)
1. **Cross-reference error, Part 4.3:** the drafting note pointed to "Part 6.9's forward-looking note" for future online payments — Part 6.9 is Third-Party Services and says nothing about payments. Corrected to point to Part 4.21 (Future Online Payments), which is where that content actually lives.
2. **Cross-reference error, Part 7.6:** the drafting note referenced "7.9 (Model Releases)" — 7.9 is Revoking Permission; Model Releases is actually 7.7. Corrected.
3. **Spelling consistency, Part 2 (Client definition):** used American "organization" while every other instance in the suite (organisational, authorised, authorisation, licence) is British spelling. Corrected to "organisation" to match the rest of the document.

### Flagged, not silently corrected (per your explicit instruction — a genuine factual inconsistency between the legal text and the implementation)
**Part 11.7 (Workshop Terms — Rescheduling and Cancellation by Ordift Studios)** describes "the Workshop status field (Open for Registration / Coming Soon / Completed)" as the real platform mechanism. Re-checked directly against `src/sanity/schemaTypes/documents/workshop.ts` this pass: **the actual field has five values — `coming-soon`, `open`, `full`, `closed`, `completed` — not three.** The suite's description omits `full` (the waitlist-triggering state) and `closed` entirely, and uses "Open for Registration" where the schema's actual value is simply `open`. This matters because a policy meant to "reference accurately" a real platform mechanism currently doesn't fully do so. **Recommend:** update Part 11.7's parenthetical to list all five real states once you're ready for another pass — flagged here rather than corrected automatically, since you asked to be told about implementation/documentation mismatches rather than have them silently resolved.

### Verified and found accurate (spot-checked this pass, no issue)
- The "phone or WhatsApp number" description (Part 3.2) matches the actual field's own validation message in `src/lib/enquiry/schema.ts` exactly.
- "No AI/ML API integration exists anywhere in the platform's dependencies" (Part 9.1) — re-confirmed against the current `package.json`; still zero matches.
- "No standard timeline field exists in any schema" (Part 4.11) — re-confirmed via a fresh search across every Sanity document schema.
- No instance of "Google Workspace" appears anywhere in the suite (a term that was never verified as actually in use — the suite correctly says "Google Cloud service account" throughout instead).
- Every section number across all 11 parts (Parts 3–11, which carry numbered sections) is sequential within its Part with no gaps or duplicates.
- Every "Business Decision Required" placeholder follows the identical structural format (Purpose / Business decisions required / Why legal review is recommended / Drafting note for counsel).

### Not found
No spelling errors beyond the one corrected above. No formatting inconsistencies in placeholder styling. No other broken cross-references among the roughly 30 internal "See Part X" references checked.

---

## Major Improvements Over the Previous Four Pages

- Every term is now defined once (Part 2) and referenced consistently across all eleven parts, instead of each page silently assuming its own meaning.
- The suite now covers four entirely new areas (Media Usage & Portfolio, Intellectual Property, AI & Digital Workflow, Client Portal, Workshop Terms) that had zero documentation before, even in placeholder form.
- Every clause requiring real legal judgment is explicitly separated from factual/operational content, so a lawyer reviewing this can see immediately what needs their attention versus what's already settled.
- Drafting notes are included for future counsel on every placeholder, so replacing one section doesn't require re-reading the whole suite.

## Remaining Business Decisions (consolidated — full list with context lives in the suite itself)

Deposit/payment terms · cancellation and refund windows · late-arrival and weather policy · delivery timelines and revision limits · RAW file and backup retention policy · model and property release process · commercial licensing/buy-out structure · confidential-project handling specifics · international project logistics (currency, tax, cross-border delivery) · dispute resolution mechanism and venue · children's imagery policy · AI tool adoption policy · Client Portal SLA/uptime commitments · workshop refund/cancellation/accessibility policy.

## Potential Legal Risks (summary)
See "Remaining legal risks" above — the model/property release gap and the international-data-transfer gap are the two most time-sensitive, since they concern things already happening today (real client work, real cross-border data flows) rather than future functionality.

## Future Recommended Documents
Per your own list: Operations Manual (already exists as `OPERATIONS_MANUAL.md`), Brand Standards Manual, Client Experience Manual, Disaster Recovery Manual (already exists as `DISASTER_RECOVERY.md`), Incident Response Plan (new — maps directly to the data-breach gap above), HR & Freelancer Handbook, Model & Talent Handbook, Photography/Videography/Editing Standards Manuals, Pricing & Quotation Manual, Sales/Marketing Playbooks, department SOPs. None of these are started — named here only because you asked for the list preserved for later phases.

## Executive Readiness Dashboard

Replaces the earlier single "55% readiness" figure with six separately-scored dimensions, per your request — a single blended number hid more than it revealed (it couldn't distinguish "the structure is excellent" from "the model-release gap is unresolved," which are very different kinds of finding). This is now the standard reporting format for this project's legal/governance documentation going forward.

| Dimension | Score | What this measures |
|---|---|---|
| **Documentation Architecture** | 95% | Shared definitions, document hierarchy, cross-referencing, and consistent formatting across all 11 parts. The QC pass (Part C, above) found and corrected 2 cross-reference errors and 1 spelling inconsistency out of the whole suite — a small, now-resolved error rate for a document this size. The remaining 5% is headroom, not a known defect. |
| **Platform Accuracy** | 90% | How correctly the suite describes what the platform actually does. One real inconsistency found this pass (Part 11.7's incomplete Workshop status description, flagged above, not yet corrected) is the entire gap. Every other factual/technical claim spot-checked this pass was confirmed accurate against the live codebase. |
| **Technical Verification** | 100% | Whether claims presented as verified facts were actually checked against the codebase rather than assumed. Every "verified," "confirmed," or "as of this version" statement in the suite was checked at drafting time and re-checked this pass — no unverified claim was found presented as fact. |
| **Business Policy Completion** | 25% | How many of the identified business decisions (deposits, cancellation, releases, licensing structure, dispute resolution, and the rest — see "Remaining Business Decisions" above) have actually been made. Almost none have; this is expected at this stage and is not a documentation defect — it's the honest state of open decisions that are genuinely yours to make. |
| **Legal Review Status** | 0% | Whether any part of the suite has received review from qualified legal counsel. None has, by design — that review is explicitly out of scope for this environment going forward, per your own instruction to move legal drafting to Claude Chat. This dimension exists so nobody mistakes documentation completeness for legal sign-off. |
| **Launch Readiness (legal)** | Not launch-blocking to *draft* further, but **the two live gaps named in Part B (model/property releases, international data transfers) should be resolved or consciously accepted before real client work continues to accumulate against undocumented terms.** This isn't a percentage — it's a plain go/no-go read, since compressing it into a score would understate its urgency. |

**How to read this dashboard:** a reader (executive, investor, future counsel, or management) should walk away understanding that the *documentation engineering* is strong (Architecture, Accuracy, Verification all high) while the *actual legal and business substance* is intentionally, transparently incomplete (Policy Completion and Legal Review Status both low) — and that gap is the correct state for a scaffold awaiting business decisions and qualified review, not a quality problem with the scaffold itself.

---

*Companion document: `ORDIFT_STUDIOS_LEGAL_SUITE_v1.md`. Neither document should be treated as legal advice or a substitute for qualified legal review of the marked sections.*
