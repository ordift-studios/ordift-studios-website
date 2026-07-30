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

## Overall Legal Documentation Readiness Score: 55%

This reflects a structurally complete, professionally organized suite with zero fabricated legal claims — but a genuine majority of its substantive protection (releases, licensing structure, dispute resolution, international handling) is still marked "Business Decision Required" or "Requires qualified legal review," exactly as instructed. This score measures *documentation completeness*, not *legal soundness* — no score here should be read as "55% legally protected," since the unresolved 45% includes some of the highest-risk items (model releases, international data transfers).

---

*Companion document: `ORDIFT_STUDIOS_LEGAL_SUITE_v1.md`. Neither document should be treated as legal advice or a substitute for qualified legal review of the marked sections.*
