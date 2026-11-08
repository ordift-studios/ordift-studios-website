# PROPOSAL (design + DRAFT template; not approved, not issued, not sent): a dedicated ORDIFT STUDIOS client-service agreement

Prepared 2026-11-08. **All proposed legal language below is a drafting aid that REQUIRES COUNSEL REVIEW before activation.** It is not legal advice and asserts no legal requirement. Nothing is created in the agreement system, issued or sent.

## 1. Why a separate agreement
The booking confirmation rules require an executed agreement for videography, production, talent management and drone work, for value at or above the configured threshold, and for the configured circumstances (extended usage rights, exclusivity, minors, third-party IP or licensing, sensitive or restricted locations, complex deliverables, multi-day assignments, unusual liability). Today the agreement system has no client-service template: the available masters are employment, independent-instructor and vendor agreements, which **must not be reused** for clients.

## 2. Reuse of the existing infrastructure (nothing parallel)
| Need | Existing piece | Change needed |
|---|---|---|
| Versioned legal masters, review and activation | `legal_document_masters` / `legal_document_versions` (approval, activation, hash) | one new master: "Client Services Agreement" (proposed canonical code to be allocated by management), version 0.1 DRAFT, inactive until counsel approves |
| Composer (clauses + schedule + signature block, refusing incomplete input) | the pattern of `instructorAgreementDocument.ts` / `instructorAgreementIssuance.ts` | a new, separate composer `clientServiceAgreement*.ts` |
| Issuance, signing links, evidence, audit | `agreementEngine`, `signatureEngine`, `agreementIssuance` | context type `enquiry` (the booking gate already accepts context `enquiry` or `client_quotation` plus a matching reference) |
| Which legal entity signs | `booking_contracting_entities` + the registry (signatory with legal capacity) | none |
| Gate in booking | `confirm_ordinary_booking` requires an executed, uncancelled agreement linked to the enquiry or quotation | none (already built) |
**Two-step order:** the master is approved and activated first (counsel); only then can an administrator issue one, always from an accepted quotation. Issuing remains a separate, explicit, Super Admin action. Nothing is sent automatically.

## 3. What the agreement draws from the booking (so nothing is retyped)
Parties (client from the directory; contracting entity as issued, with its jurisdiction, registration number and signatory), the accepted quotation reference and fingerprint, the scope and deliverables from the quotation lines, the price, currency and the quotation's structured payment condition, and the confirmed schedule when a booking exists.

## 4. DRAFT clause outline (for counsel; headings are proposals, wording to be drafted and reviewed by counsel)
1. **Parties and contracting entity**: the legal entity named on the accepted quotation; governing documents order (agreement, accepted quotation, schedule).
2. **Scope and deliverables**: services as listed in the quotation (photography, videography, graphic design, production, talent management, drone operations: only those the entity is licensed for); deliverable list, formats, quantity, delivery method and timing; what is excluded; revisions included.
3. **Fees and payment terms**: the quotation's price and currency; the structured condition (no upfront payment / percentage deposit / full payment before confirmation) restated verbatim; due dates; verified-payment rule (a booking is confirmed only when the required payment has been verified); late payment and taxes: **[counsel]**.
4. **Booking, schedule and location**: confirmed date, time, location (on-site, studio, online; multi-day and multi-location); client's duty to provide access and information; weather or force-majeure rescheduling: **[counsel]**.
5. **Cancellation and rescheduling**: notice periods, what is refundable, what is retained, rebooking subject to availability and a fresh confirmation: **[counsel to set; commercial values from management]**.
6. **Usage rights and licence**: standard rights included; extended or non-standard usage as a separate, priced grant (territory, duration, media); exclusivity and its price; Ordift's portfolio and marketing use only with the client's recorded permission (consistent with the permission workflow already built); moral/credit: **[counsel]**.
7. **Third-party IP, music, locations and releases**: who clears what; releases for identifiable people; **minors** (guardian consent; safeguarding conditions; Qatar and Ghana data and child-image rules to be confirmed by counsel); restricted or sensitive locations and permits: **[counsel]**.
8. **Responsibilities**: of Ordift (professional standard, safeguarding, equipment, crew) and of the client (accuracy of brief, access, approvals, safety).
9. **Liability and insurance**: limits, exclusions, indemnities, insurance: **[counsel; unusual exposure is an agreement trigger]**.
10. **Intellectual property**: ownership of raw material and edited deliverables; archive and retention (aligned with the retention schedule already adopted).
11. **Data protection and confidentiality**: personal data in images and records; Ghana and Qatar regimes: **[counsel]**.
12. **Termination, notices, entire agreement, amendments** (amendments only in writing and re-checked against booking rules).
13. **Governing law, jurisdiction and dispute resolution**: **the contracting entity's jurisdiction, to be set per entity (Qatar W.L.L. or the Ghana business); [counsel]**.
14. **Signature block** for the entity's recorded signatory and the client (individual or authorised representative), using the existing electronic-signature engine.

## 5. Legal-review requirements before activation
Counsel in each of Qatar and Ghana to review: clauses 3, 5, 6, 7, 9, 11 and 13 at minimum; governing law and venue per entity; consumer-protection rules for individual clients; enforceability of electronic signature in both places; child-image and data rules. The master stays **draft and inactive** until counsel's written approval is recorded in the existing approval fields. No agreement can be issued from a draft master.

## 6. Build order (all local until separately approved)
(1) counsel brief and clause drafting -> (2) master + composer + tests (no activation) -> (3) issuance from an accepted quotation, Super Admin only, behind its own flag -> (4) booking gate already reads executed agreements. No Production step is requested here.
