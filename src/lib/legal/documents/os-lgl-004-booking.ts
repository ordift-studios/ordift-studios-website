import type { LegalDocument, LegalContentNode } from "../types";

// OS-LGL-004 — Master Booking Terms & Conditions, Ordift Studios
// Enterprise Legal Series. STATUS: APPROVED (2026-08-04), Version 1.0,
// registered in registry.ts and live at /legal/booking. Was staged as
// a Production Draft (control.status = "draft", not in the live
// registry) through a full editorial consolidation pass and a
// publication-readiness audit before approval — see the changeLog
// below for the complete history of what changed at each stage.
//
// The 121 base clauses are transcribed verbatim. The ~50 "Strategic
// Enhancement" items (originally descriptions, e.g. "Clarify that...")
// were drafted into full clauses per explicit 2026-08-04 authorization
// ("Master Approval Instruction"): conservative language, no invented
// certifications/registrations/operational procedures, high-level
// commitments where facts are unknown. Part K (International Clients)
// and the Contact Information section were both drafted new per the
// same instruction — neither existed in the source body (only in its
// top-of-document outline, which didn't match the body actually
// delivered). The "Deposit Percentages" recommendation under old
// clause 12 (Booking Fees, Deposits & Retainers) was intentionally not
// turned into a new clause — the source itself said not to hard-code
// percentages into the legal text, and clause 10 (renumbered) already
// defers the applicable amounts to the quotation/proposal.
//
// EDITORIAL CONSOLIDATION PASS (2026-08-04): a follow-up instruction
// asked for a full legal editorial review of every duplicated clause,
// not just the three originally flagged — consolidate genuine
// duplicates, preserve every unique protection, and leave headings
// unique unless the repetition is intentional by legal design. Applied:
//   - "No Waiver" (old Part A cl.6) removed; "Waiver" (Part J, now
//     cl.143) kept as the single comprehensive clause, its wording
//     broadened to explicitly cover "on any occasion... in the future"
//     so nothing from the removed clause was lost.
//   - "Assignment" (old Part A cl.7, Client-side restriction only)
//     removed; "Assignment" (Part J, now cl.144) kept as the single
//     comprehensive clause — its existing Client-restriction sentence
//     was reworded to fold in the removed clause's "prevents bookings
//     from being passed to unrelated parties without approval"
//     rationale, alongside the Ordift-Studios-side assignment right
//     that only ever existed in the Part J version.
//   - "International Clients" (old Part I cl.129, dispute-resolution
//     context) was NOT removed, since it also contains a legal
//     protection specific to disputes (cooperating in good faith to
//     minimise cross-border legal costs) that Part K doesn't state.
//     Instead: renamed to "Cross-Border Dispute Cooperation" (cl.127)
//     so it no longer duplicates Part K's heading, its redundant
//     bullets (the generic "cross-border issues may arise"
//     acknowledgment, and "governing law shall prevail" — already
//     stated by the Governing Law clause immediately above it) were
//     removed, and it now explicitly cross-references Part K
//     (International Clients, the authoritative section for the
//     general framework) instead of repeating it.
//   - A full audit surfaced two more genuine duplications beyond the
//     three originally flagged: "Acceptance of Terms" appeared twice
//     (old Part A cl.4 and old Part J cl.121, with heavily overlapping
//     trigger lists) — merged into a single clause at Part A cl.4
//     (the natural, idiomatic placement for acceptance mechanics near
//     the start of the Agreement), combining every trigger from both
//     versions (including each side's unique ones: Ordift Studios'
//     own written confirmation, and the Client's "commencing the
//     Services" / general catch-all), and the Part J duplicate was
//     removed entirely. "Rescheduling" also appeared twice (old Part C
//     cl.22, operational mechanics; old Part F cl.66, financial/refund
//     treatment) — both had genuinely distinct unique protections
//     (Part C: the "not guaranteed" disclaimer, the excessive-request-
//     as-cancellation right, accommodation for circumstances beyond
//     the Client's control; Part F: pricing/quotation implications,
//     the one-complimentary-reschedule allowance), so rather than
//     picking one, all of it was merged into a single comprehensive
//     clause in Part F (cl.70 — the natural authoritative home, since
//     Part F's own title names "Rescheduling"), and Part C's slot
//     (cl.20) was replaced with a short cross-reference rather than
//     removed, matching the same stub pattern used for International
//     Clients/Part K.
// Two heading repeats remain, both left in place as intentional by
// design rather than errors: "Rescheduling" (cl.20 stub → cl.70
// authoritative — the same cross-reference pattern as International
// Clients/Part K) and "Accessibility Commitment" (cl.155, about
// accommodating clients' accessibility needs during service delivery,
// vs. the shared Appendix B, about providing legal *documents* in
// accessible formats — a different legal subject, consistent with how
// the same pair was left unmerged in OS-LGL-003, see TD-022).
// Removing 3 duplicate clauses total shifted every subsequent clause
// number down; every clause was renumbered sequentially by position
// (verified programmatically — no gaps, no duplicate numbers, no
// duplicate section ids) and the internal numeric cross-references in
// the body (Cross-Border Dispute Cooperation citing Governing Law;
// International Data Handling citing Cross-Border Data Transfers) were
// re-verified against the final numbering. See
// TECHNICAL_DEBT_REGISTER.md TD-023 for the full before/after record.
//
// Numbering: the source's 121 base clauses run as one continuous
// sequence across Parts A-J (not reset per Part); new clauses continue
// that same sequence so the whole document reads as one numbering
// scheme, through Part K and Contact Information (clauses 1-163 after
// the consolidation above). Each Part is a level-1 heading ("Part A",
// "Part B", ...); each numbered clause is level-2, nested under its
// Part — the same wrapper/child pattern already used for the shared
// Appendices in ../boilerplate.ts. The website's sticky TOC sidebar
// only lists level-1 entries (see TableOfContents.tsx), so it will
// show the 11 Part headings plus Contact Information; the PDF/HTML/MD
// generators list every level, so their tables of contents show every
// clause.

const p = (text: string): LegalContentNode => ({ type: "paragraph", text });
const list = (items: string[], ordered = false): LegalContentNode => ({ type: "list", ordered, items });

export const bookingTerms: LegalDocument = {
  slug: "booking",
  control: {
    documentTitle: "Master Booking Terms & Conditions",
    documentCode: "OS-LGL-004",
    publicationSeries: "Ordift Studios Enterprise Legal Series (OSELS)",
    version: "1.0",
    status: "approved",
    classification: "public",
    effectiveDate: "2026-08-05",
    lastUpdated: "2026-08-04",
    reviewCycle: "Every 12 Months or Earlier if Required",
    documentOwner: "Ordift Studios",
    preparedBy: "Ordift Studios",
    approvedBy: "Management",
    relatedDocuments: [
      { code: "OS-LGL-000", title: "Master Definitions Register" },
      { code: "OS-LGL-001", title: "Privacy Policy" },
      { code: "OS-LGL-002", title: "Cookie Policy" },
      { code: "OS-LGL-003", title: "Website Terms of Use" },
    ],
    controlledDocumentNotice:
      "This document forms part of the Ordift Studios Enterprise Legal Series. Only the latest approved version published by Ordift Studios shall be regarded as the official version. Printed or downloaded copies are considered uncontrolled copies unless otherwise marked.",
    changeLog: [
      {
        version: "1.0",
        date: "2026-08-05",
        description:
          "Production Draft. 121 base clauses transcribed verbatim from the supplied source; ~50 Strategic Enhancement items drafted into full clauses using conservative language per explicit authorization; Part K (International Clients) and Contact Information drafted new to fill gaps between the source's outline and its body. Not yet approved for release.",
        author: "Ordift Studios",
      },
      {
        version: "1.0",
        date: "2026-08-04",
        description:
          "Editorial consolidation pass, still Production Draft, not yet approved. Full clause-by-clause duplication review performed. Removed 3 duplicate clauses total: Part A's \"No Waiver\" and \"Assignment\" (merged into Part J's Waiver and Assignment clauses, preserving every unique protection from each side), and Part J's duplicate \"Acceptance of Terms\" (merged into Part A's clause 4, the natural placement for acceptance mechanics). Renamed Part I's \"International Clients\" clause to \"Cross-Border Dispute Cooperation\", trimmed its redundant bullets, and replaced its overlap with Part K with an internal cross-reference — Part K remains the authoritative International Clients section. Merged Part C's and Part F's duplicate \"Rescheduling\" clauses into a single comprehensive clause in Part F (preserving every unique protection from both), with Part C's slot replaced by a short cross-reference. Two intentional heading repeats remain and were left as-is: the Rescheduling cross-reference stub/authoritative pair, and \"Accessibility Commitment\" (this document's own clause covers service accommodation; the shared series-wide Appendix B covers document formats — different legal subjects). All 162 clauses renumbered sequentially by position; every internal numeric cross-reference re-verified against the final numbering. No substantive legal changes beyond removing duplication and improving internal consistency.",
        author: "Ordift Studios",
      },
      {
        version: "1.0",
        date: "2026-08-04",
        description:
          "Publication-readiness QA pass, still Production Draft, not yet approved. Fixed 7 internal spelling/capitalisation inconsistencies for consistency with the rest of the document: 3 instances of \"unauthorized\" corrected to \"unauthorised\" (clauses 16, 62, 102), 1 instance of \"client authorization\" corrected to \"client authorisation\" (clause 44), and 3 lowercase \"client portal\" references corrected to \"Client Portal\" to match the term's own defined usage elsewhere (clauses 40, 138, 139). No wording, obligations, or legal meaning changed. Cross-document terminology review performed against Privacy Policy, Cookie Policy, and Website Terms of Use; findings recorded in TECHNICAL_DEBT_REGISTER.md TD-024. Full structural audit re-run and clean: no duplicate clauses, no duplicate ids, sequential numbering 1-162, all cross-references verified, PDF/DOCX/HTML all re-verified.",
        author: "Ordift Studios",
      },
      {
        version: "1.0",
        date: "2026-08-04",
        description:
          "Approved for release. Per approval decision, replaced all 6 informal \"the company\" references with \"Ordift Studios\" (clauses 8, 31, 48, 66, 94, 96) for consistent legal entity naming throughout. Cross-document definition wording (Client/Services/Creative Works) left unchanged pending completion of the Master Definitions Register (OS-LGL-000); see TECHNICAL_DEBT_REGISTER.md TD-024 for the deferred harmonization plan. Final verification confirmed: no legal meaning changed, no cross-references affected, numbering unchanged (162 clauses, sequential, no gaps or duplicates), all publication formats regenerated successfully. Status changed from Draft to Approved; registered in registry.ts and published to the live site.",
        author: "Ordift Studios",
      },
    ],
  },
  definitions: [
    {
      id: "ordift-studios",
      term: "Ordift Studios",
      definition:
        "(also “we”, “our”, or “us”) refers to Ordift Studios, its owners, employees, authorised representatives, contractors, subcontractors, and approved creative partners acting within the scope of an engagement.",
    },
    {
      id: "client",
      term: "Client",
      definition: "refers to any individual, business, organisation, institution, or authorised representative requesting, booking, or receiving services from Ordift Studios.",
    },
    {
      id: "booking",
      term: "Booking",
      definition:
        "means any confirmed reservation for services, whether arranged through the website, email, telephone, WhatsApp, social media, the Client Portal, or a signed agreement.",
    },
    {
      id: "services",
      term: "Services",
      definition:
        "includes all current and future offerings of Ordift Studios, including photography, videography, creative direction, commercial productions, editing, workshops, consultancy, talent management, digital products, and any related professional services.",
    },
    {
      id: "creative-works",
      term: "Creative Works",
      definition: "means all photographs, videos, audio recordings, graphics, designs, documents, marketing materials, concepts, and other original works produced by or on behalf of Ordift Studios.",
    },
    {
      id: "deliverables",
      term: "Deliverables",
      definition: "means the final materials agreed to be provided to the Client under the relevant booking.",
    },
    {
      id: "business-day",
      term: "Business Day",
      definition:
        "means any day on which Ordift Studios is ordinarily open for business, excluding officially observed public holidays in the applicable operating jurisdiction unless otherwise stated.",
    },
  ],
  sections: [
    // ============================= PART A =============================
    { id: "part-a-introduction", number: "Part A", heading: "Introduction", level: 1, content: [] },
    {
      id: "purpose",
      number: "1",
      heading: "Purpose",
      level: 2,
      content: [
        p(
          "These Booking Terms & Conditions (“Agreement”) govern every booking, quotation, reservation, commission, consultation, workshop, production, and creative engagement entered into with Ordift Studios."
        ),
        p(
          "This Agreement establishes the rights, responsibilities, and expectations of both Ordift Studios and its clients, ensuring that projects are delivered professionally, transparently, and fairly."
        ),
        p("These Terms apply unless a separate written agreement expressly overrides specific provisions."),
      ],
    },
    {
      id: "definitions",
      number: "2",
      heading: "Definitions",
      level: 2,
      content: [
        p("For the purposes of this Agreement, the terms below have the meanings set out in the Definitions panel accompanying this document."),
        p(
          "Terms defined below are specific to this document. Ordift Studios maintains a Master Definitions Register (OS-LGL-000) across the Enterprise Legal Series; where a term used in this Agreement is not defined below, its meaning in the Master Definitions Register applies."
        ),
      ],
    },
    {
      id: "scope-of-application",
      number: "3",
      heading: "Scope of Application",
      level: 2,
      content: [
        p("These Terms apply to every service offered by Ordift Studios, including future services unless a separate service-specific agreement expressly replaces or supplements these Terms."),
        p(
          "Where a project includes additional documentation—such as a proposal, quotation, statement of work, event schedule, or licensing agreement—those documents form part of the overall agreement and should be read together."
        ),
        p("If there is any inconsistency, the order of precedence shall be:"),
        list(
          [
            "Signed Service Agreement or Contract",
            "Approved Quotation or Proposal",
            "Project-Specific Addendum",
            "Licensing Agreement (where applicable)",
            "These Booking Terms & Conditions",
            "Website Terms of Use",
            "Privacy Policy",
            "Cookie Policy",
          ],
          true
        ),
      ],
    },
    {
      id: "acceptance-of-terms-part-a",
      number: "4",
      heading: "Acceptance of Terms",
      level: 2,
      content: [
        p("A booking is considered accepted when any one of the following occurs:"),
        list([
          "the Client signs a service agreement;",
          "the Client accepts or approves a quotation in writing;",
          "a required booking fee, deposit, retainer, or invoice is paid;",
          "the Client confirms acceptance electronically (including via email or the Client Portal);",
          "the Client commences receipt of the Services;",
          "the Client otherwise indicates acceptance; or",
          "Ordift Studios otherwise confirms the booking in writing.",
        ]),
        p(
          "By accepting a booking, the Client confirms that they have read, understood, and agreed to be bound by these Booking Terms & Conditions together with all incorporated policies."
        ),
      ],
    },
    {
      id: "language-of-the-agreement",
      number: "5",
      heading: "Language of the Agreement",
      level: 2,
      content: [
        p("The English version of this Agreement is the governing version. Where translations are provided for convenience, the English text prevails in the event of any inconsistency."),
      ],
    },
    {
      id: "electronic-execution",
      number: "6",
      heading: "Electronic Execution",
      level: 2,
      content: [
        p(
          "Electronic signatures, electronic acceptances, payments, and confirmations made through the website, Client Portal, or email are valid and have the same legal effect as handwritten signatures, where permitted by applicable law."
        ),
      ],
    },

    // ============================= PART B =============================
    { id: "part-b-booking-process", number: "Part B", heading: "Booking Process", level: 1, content: [] },
    {
      id: "booking-requests",
      number: "7",
      heading: "Booking Requests",
      level: 2,
      content: [
        p(
          "Ordift Studios welcomes booking enquiries from individuals, businesses, organisations, educational institutions, government agencies, non-profit organisations, and other lawful entities seeking our creative services."
        ),
        p("A booking request may be submitted through:"),
        list([
          "The Ordift Studios website;",
          "The Client Portal;",
          "Email;",
          "Telephone;",
          "WhatsApp;",
          "Official social media accounts;",
          "Referral partners;",
          "In-person consultations; or",
          "Any other communication channel officially recognised by Ordift Studios.",
        ]),
        p("Submitting a booking request does not guarantee availability or create a contractual relationship."),
        p("Each request is subject to review based on factors including:"),
        list([
          "Availability;",
          "Project scope;",
          "Required expertise;",
          "Scheduling feasibility;",
          "Resource availability;",
          "Compliance with applicable laws; and",
          "Alignment with Ordift Studios' professional standards and values.",
        ]),
        p("Ordift Studios reserves the right to decline any booking request where, in its reasonable judgment:"),
        list([
          "the requested services fall outside our expertise;",
          "the project presents legal, ethical, or safety concerns;",
          "the client provides misleading or incomplete information;",
          "the requested timeline is not reasonably achievable;",
          "the engagement could adversely affect the reputation, integrity, or operations of Ordift Studios; or",
          "accepting the booking would otherwise be inappropriate.",
        ]),
        p("Where a booking request is declined, Ordift Studios is under no obligation to provide detailed reasons, though we may do so at our discretion."),
      ],
    },
    {
      id: "quotations-and-estimates",
      number: "8",
      heading: "Quotations & Estimates",
      level: 2,
      content: [
        p("All quotations issued by Ordift Studios are prepared based on the information available at the time of issue."),
        p("Unless expressly stated otherwise:"),
        list([
          "quotations are estimates for the requested scope of work;",
          "prices are quoted in United States Dollars (USD) as Ordift Studios' standard pricing currency;",
          "local currency conversions displayed on the website or quotations are provided for convenience and may vary due to exchange rate fluctuations;",
          "quotations are valid for 30 calendar days from the date of issue unless a different validity period is specified;",
          "quotations may be revised if the scope of work changes before acceptance.",
        ]),
        p("A quotation does not reserve a date, time, team, equipment, or other resources unless confirmed in accordance with these Terms."),
        p("If the Client requests changes to the scope, timeline, deliverables, or project requirements after a quotation has been issued, Ordift Studios reserves the right to revise the quotation accordingly."),
        p("Additional services requested after the commencement of a project may be charged separately."),
      ],
    },
    {
      id: "booking-confirmation",
      number: "9",
      heading: "Booking Confirmation",
      level: 2,
      content: [
        p("A booking is confirmed only when all required conditions specified by Ordift Studios have been satisfied."),
        p("These conditions may include, where applicable:"),
        list([
          "acceptance of the quotation or proposal;",
          "execution of any required agreements;",
          "receipt of the required booking fee, retainer, or deposit;",
          "submission of requested project information;",
          "completion of onboarding requirements; and",
          "written confirmation issued by Ordift Studios.",
        ]),
        p("Until confirmation is issued, Ordift Studios may continue accepting other enquiries for the requested dates."),
        p("Ordift Studios is not responsible for losses arising from assumptions that a booking has been confirmed before the required confirmation process has been completed."),
      ],
    },
    {
      id: "booking-fees-deposits-and-retainers",
      number: "10",
      heading: "Booking Fees, Deposits & Retainers",
      level: 2,
      content: [
        p("To secure a booking, Ordift Studios may require a booking fee, deposit, or retainer, depending on the nature of the engagement."),
        p("For clarity:"),
        list([
          "A Booking Fee reserves the agreed date and resources.",
          "A Deposit is an advance payment credited toward the total project cost.",
          "A Retainer compensates Ordift Studios for reserving availability and may be non-refundable except where expressly stated otherwise.",
        ]),
        p("The applicable payment structure, including the specific amounts or percentages required, will be specified in the quotation, proposal, or service agreement rather than fixed in this Agreement, so that requirements can reasonably vary by project type."),
        p("Unless otherwise agreed in writing:"),
        list([
          "no booking is secured until the required initial payment has been received and acknowledged;",
          "receipt of a deposit does not automatically transfer ownership of any Creative Works;",
          "deposits and retainers may be applied only to the booking for which they were paid.",
        ]),
      ],
    },
    {
      id: "payment-terms",
      number: "11",
      heading: "Payment Terms",
      level: 2,
      content: [
        p("The Client agrees to pay all fees in accordance with the approved quotation, invoice, or written agreement."),
        p("Unless otherwise stated:"),
        list([
          "invoices must be paid by the due date shown on the invoice;",
          "late payments may result in suspension of work or delivery;",
          "Ordift Studios may withhold deliverables until all outstanding amounts have been paid, where permitted by law and contract;",
          "recurring services must remain current to avoid interruption.",
        ]),
        p("Ordift Studios reserves the right to charge reasonable late payment interest or recovery costs where permitted by applicable law. Any such charges will be disclosed in advance or specified in the relevant agreement."),
      ],
    },
    {
      id: "currency-and-exchange-rates",
      number: "12",
      heading: "Currency & Exchange Rates",
      level: 2,
      content: [
        p("Ordift Studios maintains United States Dollars (USD) as its primary pricing currency."),
        p("Where prices are displayed in Ghanaian Cedi (GHS), Qatari Riyal (QAR), or any other currency, those amounts are converted for convenience using exchange rate information available at the relevant time."),
        p("Because exchange rates fluctuate:"),
        list([
          "converted prices may differ slightly from the final amount charged;",
          "payment processors or financial institutions may apply their own exchange rates or fees;",
          "Ordift Studios is not responsible for additional charges imposed by third-party payment providers.",
        ]),
        p("The invoiced USD amount shall prevail unless otherwise agreed in writing."),
      ],
    },
    {
      id: "taxes-duties-and-government-charges",
      number: "13",
      heading: "Taxes, Duties & Government Charges",
      level: 2,
      content: [
        p("Unless expressly stated otherwise, quotations will indicate whether applicable taxes are included or excluded."),
        p(
          "The Client is responsible for any taxes, duties, permits, customs charges, withholding taxes, or government-imposed fees applicable to the project in the relevant jurisdiction, except where the law requires Ordift Studios to collect or remit such amounts."
        ),
        p("For international assignments, the Client is also responsible for assisting with any documentation reasonably required to facilitate lawful performance of the services, including permits or approvals where applicable."),
      ],
    },
    {
      id: "promotional-pricing",
      number: "14",
      heading: "Promotional Pricing",
      level: 2,
      content: [p("Promotional offers, seasonal discounts, referral rewards, and campaign pricing cannot be combined unless expressly stated.")],
    },
    {
      id: "abandoned-quotations",
      number: "15",
      heading: "Abandoned Quotations",
      level: 2,
      content: [p("If a quotation expires without acceptance, Ordift Studios may issue a revised quotation reflecting updated pricing, availability, or scope.")],
    },
    {
      id: "fraud-prevention",
      number: "16",
      heading: "Fraud Prevention",
      level: 2,
      content: [p("Ordift Studios reserves the right to verify identities, payment methods, or booking information where reasonably necessary to protect against fraud or unauthorised transactions.")],
    },
    {
      id: "installment-payment-default",
      number: "17",
      heading: "Installment Payment Default",
      level: 2,
      content: [
        p(
          "Where an instalment payment plan has been agreed, failure to pay an instalment may result in suspension of work, cancellation of remaining services, or acceleration of the outstanding balance, subject to the terms of the applicable agreement."
        ),
      ],
    },
    {
      id: "price-review",
      number: "18",
      heading: "Price Review",
      level: 2,
      content: [
        p(
          "Ordift Studios may periodically review and update its pricing. Confirmed bookings remain subject to the pricing agreed at the time of confirmation unless the Client requests changes to the agreed scope."
        ),
      ],
    },

    // ============================= PART C =============================
    {
      id: "part-c-scheduling-and-logistics",
      number: "Part C",
      heading: "Scheduling & Logistics",
      level: 1,
      content: [
        p(
          "This Part addresses the realities of creative work: changing schedules, weather, travel, venue restrictions, and unforeseen delays. It establishes clear expectations before any assigned personnel arrive on location."
        ),
      ],
    },
    {
      id: "scheduling",
      number: "19",
      heading: "Scheduling",
      level: 2,
      content: [
        p("Ordift Studios will make reasonable efforts to provide the Services on the agreed date(s), time(s), and location(s) confirmed in the booking."),
        p(
          "Scheduling is based on the information supplied by the Client at the time of booking. Any subsequent changes to dates, locations, timelines, or project requirements may require approval by Ordift Studios and may result in additional charges or revised delivery timelines."
        ),
        p("The Client is responsible for ensuring that all event details, addresses, schedules, and contact information provided to Ordift Studios are accurate and communicated in a timely manner."),
        p(
          "Ordift Studios reserves the right to adjust internal staffing, equipment allocation, or production schedules where reasonably necessary to deliver the Services effectively, provided such adjustments do not materially reduce the agreed scope of work."
        ),
      ],
    },
    {
      id: "rescheduling-part-c",
      number: "20",
      heading: "Rescheduling",
      level: 2,
      content: [
        p(
          "The procedure, approval factors, and financial treatment applicable to rescheduling a confirmed booking are set out in Part F (Cancellations, Rescheduling & Refunds)."
        ),
      ],
    },
    {
      id: "travel",
      number: "21",
      heading: "Travel",
      level: 2,
      content: [
        p("Where Services require travel, the Client shall provide accurate information regarding:"),
        list(["venue location;", "access procedures;", "parking arrangements;", "accommodation (where applicable);", "local transportation requirements; and", "any known travel restrictions."]),
        p("Travel fees, accommodation, visas, permits, tolls, parking, baggage charges, ferry costs, or other travel-related expenses shall be specified in the quotation or agreement where applicable."),
        p(
          "Ordift Studios will make reasonable travel arrangements but is not responsible for delays caused by airlines, transportation providers, immigration authorities, customs, road closures, strikes, or similar circumstances beyond its reasonable control."
        ),
      ],
    },
    {
      id: "accommodation",
      number: "22",
      heading: "Accommodation",
      level: 2,
      content: [
        p(
          "For assignments requiring overnight travel or extended production periods, the Client may be responsible for providing or reimbursing reasonable accommodation for the assigned team, as specified in the quotation or agreement."
        ),
        p("Accommodation should be safe, hygienic, and reasonably located in relation to the project venue."),
        p(
          "Where accommodation arranged by the Client does not meet reasonable health or safety standards, Ordift Studios reserves the right to secure alternative accommodation, with the reasonable additional cost becoming payable by the Client."
        ),
      ],
    },
    {
      id: "permits-and-venue-access",
      number: "23",
      heading: "Permits & Venue Access",
      level: 2,
      content: [
        p("The Client is responsible for obtaining all permissions, licences, permits, or authorisations necessary for Ordift Studios to lawfully perform the Services at the chosen location unless otherwise agreed in writing."),
        p("This includes, where applicable:"),
        list([
          "venue permissions;",
          "photography permits;",
          "filming permits;",
          "drone permissions;",
          "government approvals;",
          "access credentials;",
          "security clearances; and",
          "permissions from property owners.",
        ]),
        p("Ordift Studios is not responsible for delays or restrictions resulting from the Client's failure to obtain the necessary approvals."),
      ],
    },
    {
      id: "delays",
      number: "24",
      heading: "Delays",
      level: 2,
      content: [
        p("Creative productions frequently involve multiple participants and external factors."),
        p("If delays occur due to circumstances attributable to the Client or third parties engaged by the Client, including but not limited to:"),
        list(["late arrivals;", "incomplete preparation;", "venue delays;", "supplier delays;", "schedule overruns; or", "failure to provide agreed access,"]),
        p("Ordift Studios will make reasonable efforts to continue providing the Services within operational limits."),
        p("Where delays substantially extend the agreed coverage period, additional time may be billed at the applicable hourly or daily extension rates specified in the quotation or agreement."),
        p("Ordift Studios is not obligated to extend coverage where doing so would conflict with another confirmed engagement or create unreasonable operational hardship."),
      ],
    },
    {
      id: "weather",
      number: "25",
      heading: "Weather",
      level: 2,
      content: [
        p("Some services, particularly outdoor photography, videography, and aerial productions, are dependent upon suitable weather conditions."),
        p("Ordift Studios will work collaboratively with the Client to determine whether weather conditions make it appropriate to:"),
        list(["proceed as planned;", "modify the production;", "relocate the session;", "temporarily pause work; or", "reschedule the affected portion of the project."]),
        p("Safety shall always take precedence over production objectives."),
        p("Ordift Studios reserves the right to suspend or postpone activities where weather conditions present a genuine risk to personnel, equipment, participants, or the public."),
        p("Such decisions will be made reasonably and in good faith."),
      ],
    },
    {
      id: "vendor-coordination",
      number: "26",
      heading: "Vendor Coordination",
      level: 2,
      content: [p("While Ordift Studios will cooperate with planners, DJs, decorators, MCs, caterers, and other vendors, it cannot be held responsible for delays or disruptions caused by them.")],
    },
    {
      id: "exclusive-access",
      number: "27",
      heading: "Exclusive Access",
      level: 2,
      content: [
        p("The Client should ensure Ordift Studios has reasonable access to key moments, locations, and subjects necessary to perform the agreed Services. Persistent obstruction by guests or other vendors may affect the final deliverables."),
      ],
    },
    {
      id: "client-representative",
      number: "28",
      heading: "Client Representative",
      level: 2,
      content: [p("For larger events, the Client shall designate one authorised representative who can make binding decisions on-site. This avoids conflicting instructions from multiple people during a production.")],
    },
    {
      id: "drone-and-restricted-airspace",
      number: "29",
      heading: "Drone & Restricted Airspace",
      level: 2,
      content: [
        p(
          "For projects involving drones, operations remain subject to applicable aviation regulations, weather conditions, safety assessments, and regulatory approvals. If drone flights cannot legally or safely proceed, Ordift Studios will not be considered in breach of the agreement."
        ),
      ],
    },
    {
      id: "meals-and-rest-breaks",
      number: "30",
      heading: "Meals & Rest Breaks",
      level: 2,
      content: [
        p(
          "For productions exceeding a specified duration (for example, 6–8 continuous hours), the Client should provide reasonable meal breaks and refreshments for the production team, or alternatively reimburse agreed meal costs."
        ),
      ],
    },

    // ============================= PART D =============================
    {
      id: "part-d-service-delivery",
      number: "Part D",
      heading: "Service Delivery",
      level: 1,
      content: [
        p(
          "This Part governs how Ordift Studios performs its work, what clients should expect from the creative process, and how professional judgment is exercised."
        ),
      ],
    },
    {
      id: "creative-process",
      number: "31",
      heading: "Creative Process",
      level: 2,
      content: [
        p("Ordift Studios approaches every project as a collaborative creative partnership."),
        p(
          "While clients are encouraged to share ideas, inspiration, references, mood boards, objectives, and preferences, the methods, techniques, equipment selection, lighting approach, composition, editing workflow, and overall artistic execution remain the professional responsibility of Ordift Studios."
        ),
        p("Every project is unique. As such, no two projects will produce identical results, even where similar concepts, locations, or styles are requested."),
        p("Ordift Studios reserves the right to determine the most appropriate creative approach required to achieve the agreed objectives while maintaining Ordift Studios' artistic standards and professional reputation."),
      ],
    },
    {
      id: "client-responsibilities-during-service-delivery",
      number: "32",
      heading: "Client Responsibilities During Service Delivery",
      level: 2,
      content: [
        p("To facilitate successful delivery of the Services, the Client agrees to:"),
        list([
          "provide accurate and timely information;",
          "communicate any changes promptly;",
          "ensure all required permissions have been obtained;",
          "ensure participants arrive at agreed times;",
          "coordinate access to venues and locations;",
          "provide a safe working environment;",
          "appoint a decision-maker for larger productions where requested;",
          "notify Ordift Studios of any accessibility, cultural, religious, or special requirements that may affect the production.",
        ]),
        p("The Client acknowledges that delays, incomplete information, lack of preparation, or failure to meet these responsibilities may affect the final outcome."),
      ],
    },
    {
      id: "artistic-discretion",
      number: "33",
      heading: "Artistic Discretion",
      level: 2,
      content: [
        p("One of the principal reasons clients engage Ordift Studios is for its creative expertise and artistic judgment."),
        p("Accordingly, Ordift Studios retains sole discretion regarding:"),
        list([
          "posing direction;",
          "framing and composition;",
          "camera placement;",
          "lighting;",
          "colour grading;",
          "retouching techniques;",
          "editing style;",
          "storytelling approach;",
          "music selection (for audiovisual productions, where applicable);",
          "sequencing of images or videos;",
          "album layouts;",
          "graphic presentation; and",
          "final creative decisions.",
        ]),
        p("While reasonable client preferences will always be considered, Ordift Studios is not obligated to replicate another photographer's, videographer's, designer's, or studio's style exactly."),
        p("References supplied by clients are treated as inspiration rather than guaranteed replication."),
      ],
    },
    {
      id: "equipment-and-technical-standards",
      number: "34",
      heading: "Equipment & Technical Standards",
      level: 2,
      content: [
        p("Ordift Studios maintains professional equipment suitable for the agreed Services."),
        p("Equipment selection remains solely at the discretion of Ordift Studios and may include:"),
        list(["cameras;", "lenses;", "lighting systems;", "audio equipment;", "drones (where permitted);", "stabilisation systems;", "computers;", "software;", "cloud infrastructure; and", "other professional production tools."]),
        p("Ordift Studios reserves the right to substitute equivalent or superior equipment where operationally necessary."),
        p("Clients may not require the use of specific equipment unless expressly agreed in writing before the engagement."),
      ],
    },
    {
      id: "backup-equipment-and-contingency-planning",
      number: "35",
      heading: "Backup Equipment & Contingency Planning",
      level: 2,
      content: [
        p("Ordift Studios recognises the importance of reliability."),
        p("Where reasonably practicable, backup equipment, storage media, batteries, memory cards, and other essential resources will be maintained to minimise disruption arising from technical failures."),
        p("Despite reasonable precautions, unforeseen equipment failures may occur."),
        p("Where such failures materially affect the Services, Ordift Studios will make reasonable efforts to repair, replace, or otherwise mitigate the impact."),
        p("No creative service can guarantee absolute immunity from technical failures."),
      ],
    },
    {
      id: "personnel-assistants-and-contractors",
      number: "36",
      heading: "Personnel, Assistants & Contractors",
      level: 2,
      content: [
        p("Ordift Studios may engage employees, assistants, second photographers, second videographers, editors, retouchers, designers, drone operators, production assistants, or independent contractors to assist with delivering the Services."),
        p("All such personnel operate under the direction or quality standards established by Ordift Studios."),
        p("The assignment of personnel remains at the discretion of Ordift Studios unless specific individuals have been expressly guaranteed within a written agreement."),
      ],
    },
    {
      id: "editing-and-post-production",
      number: "37",
      heading: "Editing & Post-Production",
      level: 2,
      content: [
        p("Editing forms an essential part of the creative service provided by Ordift Studios."),
        p("Unless otherwise agreed:"),
        list(["colour correction;", "exposure balancing;", "cropping;", "composition refinement;", "standard retouching;", "audio enhancement;", "colour grading;", "rendering;", "export optimisation; and", "quality control"]),
        p("are performed according to Ordift Studios' artistic style and technical standards."),
        p(
          "Advanced retouching, object removal, body modifications, extensive compositing, CGI, AI-assisted enhancements, restoration, or additional revisions beyond the agreed scope may incur additional charges."
        ),
      ],
    },
    {
      id: "turnaround-times",
      number: "38",
      heading: "Turnaround Times",
      level: 2,
      content: [
        p("Estimated delivery times provided by Ordift Studios are good-faith estimates based on the agreed project scope and current production schedule."),
        p("While every reasonable effort will be made to meet estimated delivery dates, they do not constitute guaranteed deadlines unless expressly agreed in writing."),
        p("Delivery timelines may reasonably be extended due to:"),
        list([
          "unusually large projects;",
          "extensive revisions;",
          "client delays;",
          "force majeure events;",
          "technical failures;",
          "additional services requested after production; or",
          "other circumstances beyond Ordift Studios' reasonable control.",
        ]),
        p("Clients will be informed where significant delays are anticipated."),
      ],
    },
    {
      id: "preview-galleries-and-proofs",
      number: "39",
      heading: "Preview Galleries & Proofs",
      level: 2,
      content: [
        p("Where preview galleries, contact sheets, or proofing systems are provided, they are intended solely for review and selection purposes."),
        p("Unless expressly authorised:"),
        list(["previews may not be downloaded for commercial use;", "screenshots should not be publicly distributed;", "watermarks must not be removed;", "previews remain protected by copyright."]),
        p("Ordift Studios may limit the duration for which preview galleries remain accessible."),
      ],
    },
    {
      id: "final-delivery",
      number: "40",
      heading: "Final Delivery",
      level: 2,
      content: [
        p("Final deliverables will be supplied in the formats specified within the quotation, proposal, or agreement."),
        p("Delivery methods may include:"),
        list(["secure online galleries;", "Client Portal downloads;", "encrypted cloud storage;", "physical media (where agreed); or", "other suitable delivery mechanisms."]),
        p("Delivery is considered complete once the agreed deliverables have been made available using the agreed method."),
      ],
    },
    {
      id: "raw-files-and-working-files",
      number: "41",
      heading: "RAW Files & Working Files",
      level: 2,
      content: [
        p("Unless expressly included within a written agreement:"),
        list([
          "RAW image files;",
          "unedited footage;",
          "project files;",
          "editing timelines;",
          "layered design files;",
          "production notes;",
          "LUTs;",
          "presets;",
          "proprietary workflows; and",
          "internal production assets",
        ]),
        p("remain the exclusive property of Ordift Studios and are not included within standard service packages."),
        p("Release of such materials is entirely at the discretion of Ordift Studios and may require a separate written licensing agreement and additional fee."),
      ],
    },
    {
      id: "archive-and-storage-policy",
      number: "42",
      heading: "Archive & Storage Policy",
      level: 2,
      content: [
        p("Ordift Studios will make reasonable efforts to retain completed project files for a limited archival period as determined by its internal retention policy."),
        p("Unless otherwise agreed:"),
        list([
          "archival storage is provided as a courtesy and not as a permanent storage service;",
          "clients are responsible for maintaining their own backups immediately upon delivery;",
          "Ordift Studios does not guarantee indefinite retention of any project.",
        ]),
        p("Requests for replacement copies after the archival period cannot be guaranteed."),
      ],
    },
    {
      id: "revisions",
      number: "43",
      heading: "Revisions",
      level: 2,
      content: [
        p("Unless otherwise specified, the quoted project fee includes a reasonable number of revisions appropriate to the agreed scope."),
        p("Additional revisions requested after approval of deliverables or beyond the included revision allowance may incur additional fees."),
        p("Ordift Studios reserves the right to determine whether requested changes constitute revisions or a new scope of work."),
      ],
    },
    {
      id: "creative-authenticity-and-ethical-editing",
      number: "44",
      heading: "Creative Authenticity & Ethical Editing",
      level: 2,
      content: [
        p(
          "Ordift Studios will not knowingly produce or edit content that is deceptive, defamatory, unlawfully manipulative, or likely to misrepresent material facts without appropriate disclosure or client authorisation where required."
        ),
      ],
    },
    {
      id: "quality-assurance",
      number: "45",
      heading: "Quality Assurance",
      level: 2,
      content: [p("Every project will undergo an internal quality review before final delivery to ensure it meets Ordift Studios' technical and creative standards.")],
    },
    {
      id: "client-approval-and-acceptance",
      number: "46",
      heading: "Client Approval & Acceptance",
      level: 2,
      content: [
        p(
          "Once the Client has approved final deliverables—or after a reasonable review period specified in the agreement with no requested revisions—the deliverables will be deemed accepted. Subsequent changes may be treated as new work and billed accordingly."
        ),
      ],
    },
    {
      id: "accessibility-and-inclusion",
      number: "47",
      heading: "Accessibility & Inclusion",
      level: 2,
      content: [
        p(
          "Where reasonably practicable and communicated in advance, Ordift Studios will make reasonable efforts to accommodate accessibility needs, cultural practices, language preferences, or religious considerations during service delivery, provided these do not compromise safety, legality, or the agreed scope of work."
        ),
      ],
    },
    {
      id: "sustainability-and-responsible-production",
      number: "48",
      heading: "Sustainability & Responsible Production",
      level: 2,
      content: [
        p(
          "Where practical, Ordift Studios seeks to minimize waste, promote responsible production practices, and use resources efficiently without compromising the quality of its services. This reflects Ordift Studios' operational values rather than a legal obligation."
        ),
      ],
    },

    // ============================= PART E =============================
    { id: "part-e-ownership-and-licensing", number: "Part E", heading: "Ownership & Licensing", level: 1, content: [] },
    {
      id: "copyright-ownership",
      number: "49",
      heading: "Copyright Ownership",
      level: 2,
      content: [
        p(
          "Unless expressly transferred through a separate written Copyright Assignment Agreement signed by both parties, all intellectual property rights, copyright, neighbouring rights, design rights, database rights, and other proprietary interests in every Creative Work produced by or on behalf of Ordift Studios shall remain the exclusive property of Ordift Studios."
        ),
        p("This includes, without limitation:"),
        list([
          "Photographs;",
          "Video recordings;",
          "Cinematic productions;",
          "Audio recordings;",
          "Drone footage;",
          "Graphic designs;",
          "Illustrations;",
          "Digital artwork;",
          "Brand assets;",
          "Logos created under commissioned work until assigned;",
          "Layouts;",
          "Marketing collateral;",
          "Albums;",
          "Storyboards;",
          "Production notes;",
          "Lighting diagrams;",
          "Editing decisions;",
          "Colour grading profiles;",
          "Motion graphics;",
          "Visual effects;",
          "Educational materials;",
          "Training resources;",
          "Workshop content;",
          "AI-assisted creative outputs developed under Ordift Studios' direction; and",
          "Any derivative works created during the course of a project.",
        ]),
        p("Payment for services does not, by itself, transfer copyright ownership."),
      ],
    },
    {
      id: "intellectual-property-rights",
      number: "50",
      heading: "Intellectual Property Rights",
      level: 2,
      content: [
        p("Ordift Studios retains ownership of:"),
        list([
          "creative concepts;",
          "production methodologies;",
          "workflows;",
          "editing techniques;",
          "presets;",
          "LUTs;",
          "templates;",
          "automation systems;",
          "proprietary business processes;",
          "educational frameworks;",
          "documentation;",
          "software customisations;",
          "project structures;",
          "internal operating procedures; and",
          "any intellectual property developed independently of a specific client engagement.",
        ]),
        p("Nothing contained in a booking, quotation, invoice, proposal, or project shall be interpreted as assigning ownership of these assets unless expressly stated in a written agreement."),
      ],
    },
    {
      id: "client-licence",
      number: "51",
      heading: "Client Licence",
      level: 2,
      content: [
        p("Upon:"),
        list(["completion of the agreed Services;", "full payment of all outstanding fees; and", "compliance with all contractual obligations,"]),
        p("Ordift Studios grants the Client a licence to use the final approved Deliverables."),
        p("Unless otherwise specified, this licence is:"),
        list(["non-exclusive;", "non-transferable;", "revocable in limited circumstances permitted by law or contract;", "limited to the agreed purpose;", "subject to these Booking Terms and any applicable licensing agreement."]),
        p("The Client may not sublicense, assign, or transfer this licence without prior written approval from Ordift Studios."),
      ],
    },
    {
      id: "commercial-usage",
      number: "52",
      heading: "Commercial Usage",
      level: 2,
      content: [
        p(
          "Where Deliverables are intended for commercial use, advertising, marketing campaigns, resale, merchandising, broadcasting, publication, sponsorship, licensing, or similar commercial purposes, the scope of permitted usage shall be defined in writing before delivery."
        ),
        p("Commercial usage rights may include limitations relating to:"),
        list(["territory;", "duration;", "media channels;", "exclusivity;", "audience;", "product category;", "campaign period; or", "distribution method."]),
        p("Additional licensing fees may apply where usage exceeds the agreed scope."),
      ],
    },
    {
      id: "exclusive-licences-and-buy-out-rights",
      number: "53",
      heading: "Exclusive Licences & Buy-Out Rights",
      level: 2,
      content: [
        p("Ordift Studios may, at its sole discretion, offer:"),
        list(["Exclusive licences;", "Expanded commercial licences;", "Industry exclusivity;", "Territorial exclusivity;", "Time-limited exclusivity;", "Copyright assignments; or", "Buy-out arrangements."]),
        p("Such rights are not included within standard service pricing and must be negotiated separately."),
        p("Unless expressly stated in a signed written agreement, no exclusive rights are granted."),
      ],
    },
    {
      id: "portfolio-and-promotional-rights",
      number: "54",
      heading: "Portfolio & Promotional Rights",
      level: 2,
      content: [
        p("Ordift Studios reserves the perpetual right to display, reproduce, publish, exhibit, and otherwise use commissioned Creative Works for legitimate business purposes, including:"),
        list([
          "portfolios;",
          "website galleries;",
          "exhibitions;",
          "competitions;",
          "awards;",
          "educational presentations;",
          "workshops;",
          "social media;",
          "advertising;",
          "promotional campaigns;",
          "investor presentations;",
          "press releases;",
          "printed marketing materials; and",
          "internal training.",
        ]),
        p("This right exists regardless of whether the Client has purchased an extended licence, unless:"),
        list(["a written confidentiality agreement;", "a signed non-disclosure agreement;", "a specific written promotional restriction; or", "an express contractual provision"]),
        p("states otherwise."),
        p("Where confidentiality has been agreed, Ordift Studios shall honour those restrictions in accordance with the applicable agreement."),
      ],
    },
    {
      id: "social-media-and-attribution",
      number: "55",
      heading: "Social Media & Attribution",
      level: 2,
      content: [
        p("Clients are encouraged to share delivered Creative Works."),
        p("However, unless otherwise agreed:"),
        list([
          "watermarks may not be removed where intentionally applied;",
          "substantial editing or manipulation should not misrepresent the work as that of another creator;",
          "appropriate credit to Ordift Studios is appreciated, particularly where platform conventions permit;",
          "the Client shall not falsely represent authorship of the Creative Works.",
        ]),
        p("Ordift Studios reserves the right to repost or reference publicly shared commissioned work for legitimate promotional purposes, subject to any confidentiality obligations."),
      ],
    },
    {
      id: "client-supplied-materials",
      number: "56",
      heading: "Client-Supplied Materials",
      level: 2,
      content: [
        p("Where the Client provides photographs, logos, graphics, music, trademarks, documents, or other materials for inclusion in a project, the Client warrants that they possess all necessary rights and permissions to authorise such use."),
        p("The Client agrees to indemnify Ordift Studios against claims arising from the unauthorised use of Client-supplied materials."),
        p("Ordift Studios reserves the right to refuse the use of materials where ownership or licensing appears uncertain or unlawful."),
      ],
    },
    {
      id: "third-party-intellectual-property",
      number: "57",
      heading: "Third-Party Intellectual Property",
      level: 2,
      content: [
        p("Ordift Studios respects the intellectual property rights of others."),
        p(
          "Unless specifically licensed or otherwise authorised, Ordift Studios will not knowingly incorporate third-party copyrighted materials into Deliverables where doing so would infringe applicable laws or contractual rights."
        ),
        p("Where third-party assets are lawfully licensed, their use remains subject to the terms of those licences."),
      ],
    },
    {
      id: "moral-rights",
      number: "58",
      heading: "Moral Rights",
      level: 2,
      content: [
        p(
          "Where applicable under relevant laws, Ordift Studios and its creators reserve their moral rights, including the right to be identified as the author of Creative Works and the right to object to derogatory treatment of those works, except to the extent lawfully waived in writing."
        ),
      ],
    },
    {
      id: "ai-assisted-creative-works",
      number: "59",
      heading: "AI-Assisted Creative Works",
      level: 2,
      content: [
        p("Ordift Studios may utilise artificial intelligence and advanced digital tools as part of its creative workflow."),
        p("Where AI-assisted technologies contribute to a Deliverable:"),
        list(["human creative direction remains central to the work;", "Ordift Studios retains ownership of its original contributions;", "the use of AI does not diminish the intellectual property protections applicable to the final Deliverable."]),
        p("The use of AI shall not be interpreted as transferring ownership of underlying models, software, or third-party technologies."),
      ],
    },
    {
      id: "licensing-marketplace-and-future-rights",
      number: "60",
      heading: "Licensing Marketplace & Future Rights",
      level: 2,
      content: [
        p(
          "Ordift Studios reserves the right to license selected Creative Works in the future through stock libraries, educational platforms, exhibitions, books, documentaries, galleries, digital products, or other lawful distribution channels, provided doing so does not breach confidentiality agreements or any exclusive rights granted to the Client."
        ),
      ],
    },
    {
      id: "copyright-registration",
      number: "61",
      heading: "Copyright Registration",
      level: 2,
      content: [p("Ordift Studios may register copyright or other intellectual property rights in Creative Works where registration is available and considered appropriate.")],
    },
    {
      id: "infringement-enforcement",
      number: "62",
      heading: "Infringement Enforcement",
      level: 2,
      content: [
        p("Ordift Studios reserves the right to investigate, pursue, or enforce claims relating to unauthorised use, reproduction, or exploitation of its Creative Works, including seeking injunctive relief and damages where permitted by law."),
      ],
    },
    {
      id: "orphan-works-and-archival-use",
      number: "63",
      heading: "Orphan Works & Archival Use",
      level: 2,
      content: [
        p("Historical or archived projects may continue to be retained and, where permitted by law and contract, used for archival, educational, or historical purposes, while still respecting confidentiality obligations."),
      ],
    },
    {
      id: "derivative-works",
      number: "64",
      heading: "Derivative Works",
      level: 2,
      content: [
        p("Adaptations, edits, translations, composites, remixes, or other derivative works based on Ordift Studios' Creative Works remain subject to the original intellectual property rights unless expressly agreed otherwise."),
      ],
    },
    {
      id: "metadata-protection",
      number: "65",
      heading: "Metadata Protection",
      level: 2,
      content: [
        p(
          "Intentional removal, alteration, or falsification of embedded metadata, copyright notices, authorship information, or digital rights management information from Deliverables is prohibited where such information has been included."
        ),
      ],
    },
    {
      id: "right-to-decline-misleading-attribution",
      number: "66",
      heading: "Right to Decline Misleading Attribution",
      level: 2,
      content: [
        p(
          "Ordift Studios may decline requests that would require it to be credited for work materially altered by third parties in a way that could damage Ordift Studios' reputation or misrepresent its creative standards."
        ),
      ],
    },
    {
      id: "legacy-and-historical-archive",
      number: "67",
      heading: "Legacy & Historical Archive",
      level: 2,
      content: [
        p(
          "Ordift Studios reserves the right to maintain an internal archive documenting the evolution of its work for historical, educational, quality assurance, business continuity, and heritage purposes, subject always to applicable confidentiality agreements and data protection obligations."
        ),
      ],
    },

    // ============================= PART F =============================
    {
      id: "part-f-cancellations-rescheduling-and-refunds",
      number: "Part F",
      heading: "Cancellations, Rescheduling & Refunds",
      level: 1,
      content: [
        p(
          "Ordift Studios allocates time, personnel, equipment, production resources, and scheduling commitments specifically for each confirmed booking. When a booking is confirmed, those resources may no longer be available to other prospective clients. Accordingly, cancellation, postponement, or material changes to a confirmed booking may result in financial loss, scheduling disruption, or missed business opportunities. This Part is intended to allocate those risks fairly between the Client and Ordift Studios while maintaining flexibility wherever reasonably practicable."
        ),
      ],
    },
    {
      id: "client-cancellation",
      number: "68",
      heading: "Client Cancellation",
      level: 2,
      content: [
        p("The Client may cancel a confirmed booking at any time by providing written notice through an approved communication channel."),
        p("The effective date of cancellation shall be the date on which Ordift Studios receives the written notice."),
        p("Cancellation does not automatically entitle the Client to a full refund. Refund eligibility will depend on factors including:"),
        list([
          "the stage of the project;",
          "work already completed;",
          "third-party costs already incurred;",
          "travel arrangements;",
          "reserved production time;",
          "custom purchases made specifically for the project; and",
          "the applicable refund schedule.",
        ]),
        p("Where practical, Ordift Studios will provide a summary of non-recoverable costs upon request."),
      ],
    },
    {
      id: "cancellation-by-ordift-studios",
      number: "69",
      heading: "Cancellation by Ordift Studios",
      level: 2,
      content: [
        p("Ordift Studios reserves the right to cancel or withdraw from a booking where circumstances make performance impossible, unsafe, unlawful, or commercially unreasonable."),
        p("Examples include:"),
        list([
          "serious illness or injury of key personnel;",
          "death or family emergency;",
          "government restrictions;",
          "natural disasters;",
          "venue closure;",
          "civil unrest;",
          "legal restrictions;",
          "security threats;",
          "non-payment;",
          "fraud;",
          "abusive behaviour;",
          "material breach of the agreement.",
        ]),
        p("Where cancellation is initiated by Ordift Studios for reasons not caused by the Client, we will make reasonable efforts to:"),
        list(["offer alternative dates;", "recommend a suitably qualified replacement provider where appropriate; or", "refund any payments for services not yet provided."]),
        p("Ordift Studios shall not be liable for indirect or consequential losses arising from such cancellation."),
      ],
    },
    {
      id: "rescheduling-part-f",
      number: "70",
      heading: "Rescheduling",
      level: 2,
      content: [
        p("Ordift Studios recognises that genuine circumstances may require changes to confirmed bookings."),
        p("Clients may request to reschedule a confirmed booking by submitting a written request through an approved communication channel."),
        p("Rescheduling requests will be considered in good faith and approval is subject to:"),
        list([
          "availability of Ordift Studios and assigned personnel;",
          "venue availability (where applicable);",
          "third-party supplier arrangements; and",
          "any additional costs arising from the requested change.",
        ]),
        p("Rescheduling is not guaranteed. Unless otherwise stated in a signed agreement:"),
        list([
          "approved booking fees or deposits may be transferred to the new date;",
          "revised pricing may apply if the project scope changes;",
          "seasonal pricing changes may apply where appropriate;",
          "new quotations may be issued where the requested changes materially alter the project;",
          "Ordift Studios reserves the right to treat excessive or unreasonable rescheduling requests as cancellations.",
        ]),
        p(
          "Where a rescheduling request is caused by circumstances beyond the Client's reasonable control, Ordift Studios will endeavour to accommodate the request where practicable. Where reasonably possible, Ordift Studios will also endeavour to accommodate one complimentary reschedule per booking, with subsequent requests subject to administrative charges and availability."
        ),
      ],
    },
    {
      id: "refund-policy",
      number: "71",
      heading: "Refund Policy",
      level: 2,
      content: [
        p("Refunds, where applicable, will be assessed individually based on:"),
        list(["the services already delivered;", "time reserved;", "work completed;", "expenses incurred;", "third-party costs;", "contractual commitments; and", "the circumstances giving rise to the request."]),
        p("Unless otherwise required by law or agreed in writing:"),
        list([
          "booking fees intended solely to reserve availability may be non-refundable;",
          "retainers remain earned once availability has been reserved;",
          "deposits credited toward project costs will be treated in accordance with the quotation or service agreement.",
        ]),
        p("Where a refund is approved, it will ordinarily be processed using the original payment method unless otherwise agreed."),
      ],
    },
    {
      id: "non-refundable-costs",
      number: "72",
      heading: "Non-Refundable Costs",
      level: 2,
      content: [
        p("The following costs may remain payable even if a project is cancelled:"),
        list([
          "travel already booked;",
          "accommodation;",
          "visa costs;",
          "permit fees;",
          "venue deposits paid by Ordift Studios;",
          "outsourced services;",
          "specialised equipment rentals;",
          "custom props;",
          "printing;",
          "production purchases;",
          "courier expenses;",
          "licensing fees; and",
          "other documented project expenses incurred before cancellation.",
        ]),
      ],
    },
    {
      id: "force-majeure-part-f",
      number: "73",
      heading: "Force Majeure",
      level: 2,
      content: [
        p("Neither party shall be liable for delays or failure to perform obligations where such failure results from events beyond reasonable control."),
        p("These events may include:"),
        list([
          "natural disasters;",
          "pandemics;",
          "epidemics;",
          "war;",
          "terrorism;",
          "riots;",
          "government restrictions;",
          "internet outages affecting essential systems;",
          "utility failures;",
          "transportation disruption;",
          "labour disputes;",
          "cyber incidents;",
          "severe weather; or",
          "any other event that could not reasonably have been anticipated or avoided.",
        ]),
        p("Where a Force Majeure event occurs, the affected party shall notify the other party as soon as reasonably practicable, and both parties will cooperate in good faith to determine whether the project should be postponed, modified, or terminated."),
      ],
    },
    {
      id: "illness-injury-and-emergencies",
      number: "74",
      heading: "Illness, Injury & Emergencies",
      level: 2,
      content: [
        p("Ordift Studios prioritises the health and safety of its team and clients."),
        p("Where key personnel become unable to perform due to illness, injury, or another genuine emergency, Ordift Studios may:"),
        list(["assign another suitably qualified team member;", "reschedule the engagement;", "reduce the scope with the Client's agreement; or", "cancel the affected portion of the project where no reasonable alternative exists."]),
        p("Reasonable efforts will always be made to minimise disruption."),
      ],
    },
    {
      id: "client-no-show",
      number: "75",
      heading: "Client No-Show",
      level: 2,
      content: [
        p("If the Client, key participants, or authorised representatives fail to attend a scheduled session without reasonable prior notice, the booking may be treated as completed for the reserved time period."),
        p("Ordift Studios is not obligated to extend or repeat the session without additional charges."),
        p("Where practical, and at our discretion, we may offer a replacement session subject to availability and any applicable fees."),
      ],
    },
    {
      id: "abandonment-of-project",
      number: "76",
      heading: "Abandonment of Project",
      level: 2,
      content: [
        p(
          "If the Client becomes unresponsive or fails to provide information, approvals, selections, or materials necessary to continue the project for an extended period (for example, 90 consecutive days) without reasonable explanation, Ordift Studios may treat the project as abandoned."
        ),
        p("In such circumstances, Ordift Studios may:"),
        list(["archive the project;", "release reserved production resources;", "invoice completed work;", "close the project administratively; and", "delete working files after the applicable archival period, subject to our retention policy."]),
      ],
    },
    {
      id: "cooling-off-period",
      number: "77",
      heading: "Cooling-Off Period",
      level: 2,
      content: [
        p(
          "Where required by applicable consumer protection laws, clients retain any statutory cancellation rights available to them. Where no such rights apply, bookings become subject to this Agreement once confirmed in accordance with these Terms."
        ),
      ],
    },
    {
      id: "insurance-recommendation",
      number: "78",
      heading: "Insurance Recommendation",
      level: 2,
      content: [
        p(
          "Clients are encouraged, particularly for weddings, commercial productions, destination events, and other high-value projects, to obtain appropriate event or production insurance. This recommendation does not shift responsibility for the Services away from Ordift Studios or create an obligation on Ordift Studios to obtain such cover on the Client's behalf."
        ),
      ],
    },
    {
      id: "refund-processing-time",
      number: "79",
      heading: "Refund Processing Time",
      level: 2,
      content: [
        p(
          "Approved refunds will normally be processed within a reasonable timeframe, generally within 20–30 business days, subject to banking systems, payment processors, anti-fraud reviews, currency conversion procedures, and other factors beyond the reasonable control of Ordift Studios."
        ),
      ],
    },
    {
      id: "chargebacks-and-payment-disputes",
      number: "80",
      heading: "Chargebacks & Payment Disputes",
      level: 2,
      content: [
        p("Clients are asked to contact Ordift Studios to attempt to resolve billing concerns before initiating a chargeback with their payment provider."),
        p("Ordift Studios reserves the right to contest fraudulent or unjustified chargebacks."),
      ],
    },
    {
      id: "goodwill-discretion",
      number: "81",
      heading: "Goodwill Discretion",
      level: 2,
      content: [
        p(
          "Ordift Studios may, at its sole discretion, offer credits, partial refunds, alternative services, or other goodwill solutions beyond the strict contractual requirements where doing so supports long-term client relationships. Any such gesture is offered at Ordift Studios' discretion on a case-by-case basis and does not create a precedent or obligation in future cases."
        ),
      ],
    },
    {
      id: "bereavement-and-compassion-policy",
      number: "82",
      heading: "Bereavement & Compassion Policy",
      level: 2,
      content: [
        p(
          "Ordift Studios may, entirely at its discretion, provide additional flexibility regarding scheduling, cancellation, or payment terms in cases involving bereavement, serious medical emergencies, or comparable compassionate circumstances. This is offered as a discretionary accommodation and does not create an automatic entitlement or contractual obligation."
        ),
      ],
    },

    // ============================= PART G =============================
    { id: "part-g-warranties-liability-and-risk-allocation", number: "Part G", heading: "Warranties, Liability & Risk Allocation", level: 1, content: [] },
    {
      id: "professional-standard-of-care",
      number: "83",
      heading: "Professional Standard of Care",
      level: 2,
      content: [
        p("Ordift Studios warrants that all Services will be performed with reasonable skill, care, diligence, and professionalism consistent with recognised industry standards applicable to the type of Services being provided."),
        p(
          "Ordift Studios does not warrant that every project will achieve a particular commercial outcome, artistic preference, financial result, social media performance, or personal expectation, as such outcomes depend on numerous factors beyond its reasonable control."
        ),
        p("Creative services are inherently subjective, and reasonable differences in artistic taste shall not, by themselves, constitute defective performance."),
      ],
    },
    {
      id: "limited-warranty",
      number: "84",
      heading: "Limited Warranty",
      level: 2,
      content: [
        p("Except as expressly stated in these Terms or required by applicable law, all Services and Deliverables are provided on an “as available” and “as delivered” basis."),
        p("Ordift Studios expressly disclaims all implied warranties to the fullest extent permitted by law, including but not limited to warranties relating to:"),
        list(["merchantability;", "fitness for a particular purpose;", "uninterrupted availability;", "compatibility with third-party systems;", "error-free performance; and", "specific commercial results."]),
        p("Nothing in this Agreement excludes any statutory rights that cannot lawfully be excluded."),
      ],
    },
    {
      id: "limitation-of-liability",
      number: "85",
      heading: "Limitation of Liability",
      level: 2,
      content: [
        p(
          "To the fullest extent permitted by applicable law, Ordift Studios' total aggregate liability arising from or relating to any booking, project, or agreement shall not exceed the total amount actually paid by the Client for the specific Services giving rise to the claim."
        ),
        p("This limitation applies regardless of the legal basis of the claim, including contract, negligence, statutory duty, or otherwise, except where liability cannot lawfully be limited or excluded."),
      ],
    },
    {
      id: "exclusion-of-indirect-and-consequential-loss",
      number: "86",
      heading: "Exclusion of Indirect & Consequential Loss",
      level: 2,
      content: [
        p("Ordift Studios shall not be liable for indirect, incidental, special, exemplary, punitive, or consequential losses, including but not limited to:"),
        list([
          "loss of profits;",
          "loss of business opportunities;",
          "reputational damage;",
          "emotional distress;",
          "anticipated savings;",
          "future contracts;",
          "goodwill;",
          "marketing opportunities;",
          "publicity value; or",
          "similar indirect losses,",
        ]),
        p("except where prohibited by applicable law."),
      ],
    },
    {
      id: "equipment-failure-and-data-loss",
      number: "87",
      heading: "Equipment Failure & Data Loss",
      level: 2,
      content: [
        p("Ordift Studios employs professional backup procedures, redundant equipment, secure storage practices, and reasonable disaster recovery measures."),
        p("Despite these precautions, no electronic system can guarantee absolute protection against:"),
        list(["hardware failure;", "software corruption;", "cyber incidents;", "accidental deletion;", "media degradation;", "theft;", "fire;", "flooding;", "power failure; or", "other unforeseen events."]),
        p("Where such events occur despite reasonable safeguards, Ordift Studios' liability shall be governed by this Agreement."),
      ],
    },
    {
      id: "third-party-providers",
      number: "88",
      heading: "Third-Party Providers",
      level: 2,
      content: [
        p("Ordift Studios may work alongside independent suppliers including:"),
        list([
          "venues;",
          "decorators;",
          "florists;",
          "printers;",
          "DJs;",
          "musicians;",
          "caterers;",
          "transport providers;",
          "cloud storage providers;",
          "payment processors;",
          "software vendors; and",
          "other service providers.",
        ]),
        p("Ordift Studios is not responsible for the acts, omissions, delays, failures, insolvency, or misconduct of independent third parties beyond its reasonable control."),
      ],
    },
    {
      id: "client-indemnity",
      number: "89",
      heading: "Client Indemnity",
      level: 2,
      content: [
        p("The Client agrees to indemnify, defend, and hold harmless Ordift Studios, its directors, employees, contractors, affiliates, and authorised representatives from claims, liabilities, damages, losses, costs, and reasonable legal expenses arising from:"),
        list([
          "breach of this Agreement by the Client;",
          "unlawful instructions;",
          "infringement resulting from Client-supplied materials;",
          "unsafe venues;",
          "negligent acts or omissions of the Client;",
          "unauthorised use of Deliverables;",
          "violation of applicable laws by the Client.",
        ]),
        p("This indemnity shall apply to the fullest extent permitted by law."),
      ],
    },
    {
      id: "safety-and-right-to-refuse-unsafe-work",
      number: "90",
      heading: "Safety & Right to Refuse Unsafe Work",
      level: 2,
      content: [
        p("Ordift Studios is committed to maintaining a safe working environment for its personnel, clients, guests, and collaborators."),
        p("Accordingly, Ordift Studios reserves the right to suspend, postpone, relocate, or refuse any portion of the Services where, in its reasonable judgment:"),
        list([
          "the environment presents a genuine risk to health or safety;",
          "there is violence, threats, harassment, discrimination, or abusive conduct;",
          "illegal activities are occurring;",
          "equipment may reasonably be damaged;",
          "weather or environmental conditions make work unsafe;",
          "required permits or approvals are absent; or",
          "continued performance would expose personnel to unreasonable danger.",
        ]),
        p("Such decisions shall not constitute a breach of contract where made reasonably and in good faith."),
      ],
    },
    {
      id: "client-property",
      number: "91",
      heading: "Client Property",
      level: 2,
      content: [
        p(
          "Any personal property, equipment, wardrobe, vehicles, jewellery, documents, props, or other belongings supplied or made available by the Client remain the Client's responsibility unless expressly accepted into Ordift Studios' custody under a separate written arrangement."
        ),
        p("Ordift Studios shall exercise reasonable care when handling Client property but shall not be liable for pre-existing defects, ordinary wear and tear, or losses beyond its reasonable control."),
      ],
    },
    {
      id: "time-limitation-for-claims",
      number: "92",
      heading: "Time Limitation for Claims",
      level: 2,
      content: [
        p("To promote timely resolution of disputes, the Client agrees to notify Ordift Studios in writing of any claim relating to the Services within a reasonable period after becoming aware of the issue."),
        p("No legal proceedings may be commenced after the expiration of the applicable statutory limitation period under the governing law."),
        p("The parties are encouraged to attempt informal resolution before commencing formal legal action."),
      ],
    },
    {
      id: "cybersecurity-and-digital-security",
      number: "93",
      heading: "Cybersecurity & Digital Security",
      level: 2,
      content: [
        p("Ordift Studios maintains reasonable digital security practices but cannot guarantee absolute protection against cyberattacks, ransomware, phishing, or other malicious activities affecting third-party infrastructure.")
      ],
    },
    {
      id: "insurance",
      number: "94",
      heading: "Insurance",
      level: 2,
      content: [
        p(
          "Ordift Studios may maintain appropriate business insurance—including public liability, professional indemnity, equipment insurance, and cyber coverage—as determined by Ordift Studios' operational needs. Such insurance does not expand contractual liability or create rights in favour of third parties."
        ),
      ],
    },
    {
      id: "health-and-wellbeing-of-personnel",
      number: "95",
      heading: "Health & Wellbeing of Personnel",
      level: 2,
      content: [p("Ordift Studios reserves the right to suspend or modify services where continuing would pose a material risk to the physical or mental wellbeing of its team members.")],
    },
    {
      id: "reputation-protection",
      number: "96",
      heading: "Reputation Protection",
      level: 2,
      content: [
        p("Ordift Studios may refuse instructions, content, or projects that are unlawful, defamatory, discriminatory, misleading, fraudulent, or reasonably likely to cause significant reputational harm to Ordift Studios or its personnel."),
      ],
    },
    {
      id: "duty-to-mitigate-loss",
      number: "97",
      heading: "Duty to Mitigate Loss",
      level: 2,
      content: [p("Both parties shall take reasonable steps to minimise losses arising from any issue or dispute under this Agreement.")],
    },
    {
      id: "survival-of-protective-clauses",
      number: "98",
      heading: "Survival of Protective Clauses",
      level: 2,
      content: [
        p(
          "Provisions relating to intellectual property, confidentiality, payment obligations, indemnities, limitations of liability, dispute resolution, and other clauses intended by their nature to continue shall survive the termination or completion of this Agreement."
        ),
      ],
    },
    {
      id: "no-professional-advice",
      number: "99",
      heading: "No Professional Advice",
      level: 2,
      content: [
        p(
          "Unless expressly agreed in writing, Ordift Studios does not provide legal, financial, tax, engineering, medical, architectural, or other regulated professional advice. Any discussions touching on such matters are incidental to the creative services provided."
        ),
      ],
    },
    {
      id: "business-continuity-and-successor-rights",
      number: "100",
      heading: "Business Continuity & Successor Rights",
      level: 2,
      content: [
        p(
          "If Ordift Studios undergoes a merger, acquisition, restructuring, rebranding, conversion to another legal entity, or transfers all or substantially all of its business assets, the rights and obligations under this Agreement may be assigned to the successor entity, provided that the successor assumes the relevant obligations."
        ),
      ],
    },

    // ============================= PART H =============================
    { id: "part-h-confidentiality-privacy-and-data-handling", number: "Part H", heading: "Confidentiality, Privacy & Data Handling", level: 1, content: [] },
    {
      id: "confidential-information",
      number: "101",
      heading: "Confidential Information",
      level: 2,
      content: [
        p(
          "For the purposes of this Agreement, Confidential Information includes any non-public information disclosed by either party, whether orally, visually, electronically, or in writing, including but not limited to:"
        ),
        list([
          "business plans;",
          "marketing strategies;",
          "financial information;",
          "customer lists;",
          "trade secrets;",
          "creative concepts;",
          "unpublished campaigns;",
          "product launches;",
          "internal documentation;",
          "pricing structures;",
          "security procedures;",
          "proprietary software or systems;",
          "contractual terms;",
          "and any information that a reasonable person would understand to be confidential.",
        ]),
        p("Information shall not be considered confidential where it:"),
        list([
          "is already publicly available through lawful means;",
          "was lawfully known before disclosure;",
          "is independently developed without reference to the confidential information; or",
          "must be disclosed by law or court order.",
        ]),
      ],
    },
    {
      id: "confidentiality-obligations",
      number: "102",
      heading: "Confidentiality Obligations",
      level: 2,
      content: [
        p("Each party agrees to:"),
        list([
          "keep Confidential Information secure;",
          "use it solely for the purposes of performing the Agreement;",
          "restrict access to those who have a legitimate business need to know;",
          "implement reasonable safeguards against unauthorised disclosure; and",
          "not disclose Confidential Information to third parties without prior written consent unless required by law.",
        ]),
        p("These obligations survive the completion, cancellation, or termination of the Agreement."),
      ],
    },
    {
      id: "non-disclosure-agreements",
      number: "103",
      heading: "Non-Disclosure Agreements (NDAs)",
      level: 2,
      content: [
        p("Where a project requires heightened confidentiality, the parties may execute a separate Non-Disclosure Agreement."),
        p("Where an NDA conflicts with these Booking Terms regarding confidentiality, the NDA shall prevail to the extent of the conflict."),
        p("Nothing in these Terms prevents the parties from agreeing to stricter confidentiality obligations for specific projects."),
      ],
    },
    {
      id: "embargoed-projects",
      number: "104",
      heading: "Embargoed Projects",
      level: 2,
      content: [
        p("Certain projects may require that images, videos, campaigns, announcements, or other Deliverables remain unpublished until an agreed date or triggering event."),
        p("Where an embargo has been agreed in writing:"),
        list([
          "Ordift Studios shall not publish or disclose embargoed Deliverables before the agreed release date;",
          "internal access will be limited to personnel reasonably required for production;",
          "marketing, portfolio use, or promotional publication shall be deferred until the embargo expires unless otherwise agreed.",
        ]),
      ],
    },
    {
      id: "privacy-and-personal-information",
      number: "105",
      heading: "Privacy & Personal Information",
      level: 2,
      content: [
        p("Ordift Studios shall collect, use, store, disclose, and otherwise process personal information in accordance with:"),
        list(["the applicable Privacy Policy;", "applicable data protection laws; and", "any project-specific confidentiality obligations."]),
        p("Where this Agreement addresses operational confidentiality and the Privacy Policy addresses personal data processing, both documents shall be read together."),
      ],
    },
    {
      id: "sensitive-projects",
      number: "106",
      heading: "Sensitive Projects",
      level: 2,
      content: [
        p("Ordift Studios recognises that certain assignments involve elevated privacy expectations."),
        p("Examples include:"),
        list([
          "medical procedures;",
          "counselling sessions;",
          "legal proceedings;",
          "domestic violence support;",
          "shelters;",
          "child protection matters;",
          "confidential corporate projects;",
          "product launches;",
          "government engagements;",
          "private family events;",
          "crisis communications; and",
          "investigative or journalistic collaborations.",
        ]),
        p("For such projects, Ordift Studios will implement additional reasonable confidentiality measures appropriate to the nature of the assignment."),
      ],
    },
    {
      id: "secure-handling-of-deliverables",
      number: "107",
      heading: "Secure Handling of Deliverables",
      level: 2,
      content: [
        p("Ordift Studios will use reasonable technical and organisational measures to protect Deliverables during production, editing, storage, and transmission."),
        p("These measures may include:"),
        list([
          "encrypted storage;",
          "password-protected galleries;",
          "secure cloud platforms;",
          "controlled access permissions;",
          "backup systems;",
          "multi-factor authentication where appropriate; and",
          "secure file transfer methods.",
        ]),
        p("While every reasonable effort is made to safeguard digital assets, no electronic transmission or storage system can be guaranteed to be completely secure."),
      ],
    },
    {
      id: "access-by-personnel-and-contractors",
      number: "108",
      heading: "Access by Personnel & Contractors",
      level: 2,
      content: [
        p("Employees, contractors, assistants, editors, retouchers, designers, production staff, and approved service providers may access Confidential Information only to the extent reasonably necessary to perform their assigned duties."),
        p("Ordift Studios shall take reasonable steps to ensure that such personnel are subject to appropriate confidentiality obligations."),
      ],
    },
    {
      id: "public-statements-and-media-enquiries",
      number: "109",
      heading: "Public Statements & Media Enquiries",
      level: 2,
      content: [
        p("Unless expressly authorised in writing, neither party shall issue public statements, press releases, interviews, or media comments that disclose confidential aspects of the project or imply endorsement by the other party."),
        p("Media enquiries relating to a confidential engagement shall be referred to the appropriate authorised representative."),
      ],
    },
    {
      id: "data-retention-and-secure-disposal",
      number: "110",
      heading: "Data Retention & Secure Disposal",
      level: 2,
      content: [
        p("Confidential Information and project-related records shall be retained only for as long as reasonably necessary to fulfil contractual, legal, operational, archival, or regulatory requirements."),
        p("When retention is no longer required, Ordift Studios may securely delete, anonymise, or destroy such information using reasonable methods consistent with its data retention policies and applicable law."),
      ],
    },
    {
      id: "legal-disclosure",
      number: "111",
      heading: "Legal Disclosure",
      level: 2,
      content: [
        p("Nothing in this Agreement prevents Ordift Studios from disclosing Confidential Information where required by:"),
        list(["applicable law;", "court order;", "lawful regulatory request;", "governmental authority;", "insurance requirements;", "legal advisers;", "auditors; or", "professional obligations."]),
        p("Where legally permissible, Ordift Studios will make reasonable efforts to notify the affected party before such disclosure."),
      ],
    },
    {
      id: "cross-border-data-transfers",
      number: "112",
      heading: "Cross-Border Data Transfers",
      level: 2,
      content: [
        p(
          "As Ordift Studios operates internationally, project information and personal data may be transferred between jurisdictions, including Ghana, Qatar, and other countries where authorised service providers operate, while applying appropriate safeguards and complying with applicable data protection laws."
        ),
      ],
    },
    {
      id: "artificial-intelligence-and-confidentiality",
      number: "113",
      heading: "Artificial Intelligence & Confidentiality",
      level: 2,
      content: [
        p(
          "Any AI tools used in production will be selected and configured with reasonable regard for confidentiality. Confidential client information will not knowingly be submitted to public AI systems in a manner that would compromise agreed confidentiality obligations."
        ),
      ],
    },
    {
      id: "government-and-corporate-security-protocols",
      number: "114",
      heading: "Government & Corporate Security Protocols",
      level: 2,
      content: [
        p(
          "For engagements with government agencies, regulated industries, or corporate clients with specific security requirements, Ordift Studios will make reasonable efforts to comply with documented security protocols that are communicated in advance and are lawful and operationally feasible."
        ),
      ],
    },
    {
      id: "return-of-confidential-materials",
      number: "115",
      heading: "Return of Confidential Materials",
      level: 2,
      content: [
        p(
          "Upon completion or termination of the engagement, and subject to legal, archival, accounting, or regulatory retention requirements, either party may request the return or secure destruction of confidential materials belonging to that party."
        ),
      ],
    },
    {
      id: "data-breach-notification",
      number: "116",
      heading: "Data Breach Notification",
      level: 2,
      content: [
        p(
          "If Ordift Studios becomes aware of a confirmed personal data breach affecting Client information under its control, it will respond in accordance with applicable law and, where legally required, notify affected parties or relevant authorities within the applicable legal timeframes."
        ),
      ],
    },
    {
      id: "biometric-and-sensitive-data",
      number: "117",
      heading: "Biometric & Sensitive Data",
      level: 2,
      content: [
        p(
          "Where projects involve biometric information (such as facial recognition systems), health information, or other categories of sensitive personal data, such information will only be processed where there is an appropriate legal basis, the processing is necessary for the agreed services, and suitable safeguards are applied."
        ),
      ],
    },
    {
      id: "confidentiality-after-employment",
      number: "118",
      heading: "Confidentiality After Employment",
      level: 2,
      content: [
        p("Confidentiality obligations continue to apply to employees, contractors, and collaborators even after their engagement with Ordift Studios ends, to the extent required by their agreements and applicable law."),
      ],
    },
    {
      id: "high-profile-and-vip-client-protection",
      number: "119",
      heading: "High-Profile & VIP Client Protection",
      level: 2,
      content: [
        p(
          "Where the Client is a public figure, executive, diplomat, government official, celebrity, religious leader, or other individual requiring enhanced privacy, Ordift Studios may implement additional protective measures, including restricted personnel access, controlled file distribution, enhanced authentication for gallery access, and bespoke confidentiality procedures agreed with the Client."
        ),
      ],
    },

    // ============================= PART I =============================
    {
      id: "part-i-dispute-resolution-and-governing-law",
      number: "Part I",
      heading: "Dispute Resolution & Governing Law",
      level: 1,
      content: [p("The approach set out in this Part is to resolve disputes fairly, privately where possible, efficiently where necessary, and through litigation only as a last resort.")],
    },
    {
      id: "good-faith-cooperation",
      number: "120",
      heading: "Good Faith Cooperation",
      level: 2,
      content: [
        p("The parties agree to act in good faith throughout the performance of this Agreement."),
        p("If a disagreement arises, both parties shall first make reasonable efforts to resolve the matter through open communication before escalating it to formal proceedings."),
        p("Nothing in this clause prevents either party from seeking urgent legal remedies where immediate action is reasonably necessary to protect legal rights or prevent irreparable harm."),
      ],
    },
    {
      id: "notice-of-dispute",
      number: "121",
      heading: "Notice of Dispute",
      level: 2,
      content: [
        p("A party wishing to raise a dispute shall provide written notice describing:"),
        list(["the nature of the dispute;", "the relevant facts;", "the contractual provisions involved (where known);", "the remedy sought; and", "any supporting documentation reasonably available."]),
        p("The receiving party shall acknowledge receipt within a reasonable period and use reasonable efforts to engage in discussions toward resolution."),
      ],
    },
    {
      id: "informal-resolution",
      number: "122",
      heading: "Informal Resolution",
      level: 2,
      content: [
        p("Before commencing formal legal proceedings, the parties shall endeavour to resolve disputes through direct discussions between authorised representatives."),
        p("Unless circumstances require urgent action, the parties should allow a reasonable period for meaningful negotiations before escalating the matter."),
      ],
    },
    {
      id: "mediation",
      number: "123",
      heading: "Mediation",
      level: 2,
      content: [
        p("If informal discussions do not resolve the dispute, either party may propose mediation conducted by an independent mediator acceptable to both parties."),
        p("Unless otherwise agreed:"),
        list(["mediation costs shall be shared equally;", "each party shall bear its own legal and professional costs;", "participation in mediation does not prevent later legal proceedings if the dispute remains unresolved."]),
        p("Any settlement reached through mediation shall be recorded in writing and signed by the parties."),
      ],
    },
    {
      id: "arbitration",
      number: "124",
      heading: "Arbitration (Optional by Written Agreement)",
      level: 2,
      content: [
        p("Where the parties expressly agree in writing, disputes may be referred to binding arbitration instead of court proceedings."),
        p("Unless otherwise agreed, the arbitration agreement shall specify:"),
        list(["the governing arbitration rules;", "the seat of arbitration;", "the language of the proceedings;", "the number of arbitrators; and", "the method of appointment."]),
        p("In the absence of such a written agreement, this clause does not require arbitration."),
      ],
    },
    {
      id: "court-jurisdiction",
      number: "125",
      heading: "Court Jurisdiction",
      level: 2,
      content: [
        p("Subject to any mandatory legal requirements or a separate arbitration agreement, disputes shall be submitted to the courts having jurisdiction under the governing law specified in this Agreement."),
        p("Nothing prevents Ordift Studios from seeking interim or protective relief from any court of competent jurisdiction where necessary to protect intellectual property, confidential information, or other legal rights."),
      ],
    },
    {
      id: "governing-law",
      number: "126",
      heading: "Governing Law",
      level: 2,
      content: [
        p("Unless expressly agreed otherwise in writing for a particular engagement, this Agreement shall be governed by the laws designated by Ordift Studios in the applicable quotation, proposal, or service agreement."),
        p("For operational flexibility, Ordift Studios may designate different governing laws for engagements based on the location of the project, the contracting entity, or the principal place of business."),
        p("Examples may include:"),
        list(["Ghana (for engagements contracted through the Ghana entity);", "Qatar (for engagements contracted through the Qatar entity); or", "another jurisdiction expressly identified in the relevant agreement."]),
      ],
    },
    {
      id: "cross-border-dispute-cooperation",
      number: "127",
      heading: "Cross-Border Dispute Cooperation",
      level: 2,
      content: [
        p(
          "Where a dispute involves a Client located in a different country from the contracting Ordift Studios entity, the parties agree to cooperate in good faith to minimise unnecessary legal costs and procedural complexity, in addition to the governing law and jurisdiction provisions set out in clause 126 (Governing Law) above."
        ),
        p("General provisions applicable to international clients and cross-border engagements are set out in Part K (International Clients)."),
      ],
    },
    {
      id: "recovery-of-costs",
      number: "128",
      heading: "Recovery of Costs",
      level: 2,
      content: [
        p("Unless prohibited by applicable law or otherwise ordered by a court or tribunal, the prevailing party in any formal legal proceedings may seek recovery of reasonable legal costs, court fees, and other recoverable litigation expenses."),
        p("Nothing in this clause guarantees such recovery, as it remains subject to the applicable law and the decision of the relevant court or tribunal."),
      ],
    },
    {
      id: "continued-performance-during-dispute",
      number: "129",
      heading: "Continued Performance During Dispute",
      level: 2,
      content: [
        p(
          "To the extent reasonably practicable, and unless continuing performance would be unlawful, unsafe, or commercially unreasonable, the parties shall continue to perform their respective obligations during the resolution of any dispute."
        ),
      ],
    },
    {
      id: "multi-tier-dispute-resolution",
      number: "130",
      heading: "Multi-Tier Dispute Resolution",
      level: 2,
      content: [
        p("Disputes under this Agreement are intended to be addressed through the following escalation path:"),
        list(["Good Faith Discussion", "Executive Review (where applicable)", "Mediation", "Arbitration (if agreed)", "Court Proceedings"], true),
      ],
    },
    {
      id: "emergency-injunctive-relief",
      number: "131",
      heading: "Emergency Injunctive Relief",
      level: 2,
      content: [
        p("Either party may immediately seek court orders to protect confidential information, intellectual property, or safety, or to prevent irreparable harm, without first completing mediation or arbitration.")
      ],
    },
    {
      id: "electronic-evidence",
      number: "132",
      heading: "Electronic Evidence",
      level: 2,
      content: [
        p("Emails, authenticated messages through the Client Portal, electronic signatures, and approved digital communications are recognised as admissible evidence of communications and agreements, subject to applicable law.")
      ],
    },
    {
      id: "limitation-period-for-contractual-claims",
      number: "133",
      heading: "Limitation Period for Contractual Claims",
      level: 2,
      content: [p("Contractual claims should be brought within the applicable statutory limitation period under the governing law, unless a shorter period is expressly permitted and agreed by law.")],
    },
    {
      id: "language-of-proceedings",
      number: "134",
      heading: "Language of Proceedings",
      level: 2,
      content: [p("Unless otherwise agreed in writing, the governing language of contractual communications, dispute resolution, mediation, arbitration, and legal proceedings under this Agreement shall be English.")],
    },
    {
      id: "preservation-of-business-relationships",
      number: "135",
      heading: "Preservation of Business Relationships",
      level: 2,
      content: [
        p("Both parties are encouraged, where reasonably practicable, to resolve disputes in a manner that preserves professional relationships, protects confidential information, and avoids unnecessary public controversy.")
      ],
    },
    {
      id: "alternative-settlement-authority",
      number: "136",
      heading: "Alternative Settlement Authority",
      level: 2,
      content: [
        p("Ordift Studios may resolve disputes through commercial settlements, service credits, replacement services, negotiated licences, or other mutually agreed solutions where appropriate, without admitting liability.")
      ],
    },
    {
      id: "cross-border-enforcement-and-recognition",
      number: "137",
      heading: "Cross-Border Enforcement & Recognition",
      level: 2,
      content: [
        p(
          "Where a judgment, arbitral award, or mediated settlement is obtained in one jurisdiction, the parties acknowledge that enforcement may need to occur in another jurisdiction. Both parties agree to cooperate in executing any documents or taking reasonable steps necessary to facilitate lawful recognition or enforcement, subject to applicable laws and international treaties."
        ),
      ],
    },

    // ============================= PART J =============================
    { id: "part-j-general-provisions-administration-and-final-clauses", number: "Part J", heading: "General Provisions, Administration & Final Clauses", level: 1, content: [] },
    {
      id: "notices",
      number: "138",
      heading: "Notices",
      level: 2,
      content: [
        p("Any notice required or permitted under this Agreement shall be provided in writing."),
        p("Accepted methods of communication may include:"),
        list(["email;", "the Ordift Studios Client Portal;", "recognised electronic signature platforms;", "registered or courier mail;", "hand delivery; or", "any other communication method expressly agreed in writing."]),
        p("A notice is deemed received:"),
        list(["when acknowledged by the receiving party;", "upon confirmed electronic delivery where applicable;", "or within a reasonable period after dispatch, subject to the communication method used."]),
        p("Each party is responsible for maintaining accurate contact details throughout the engagement."),
      ],
    },
    {
      id: "electronic-communications-and-signatures",
      number: "139",
      heading: "Electronic Communications & Signatures",
      level: 2,
      content: [
        p("The parties acknowledge that modern business is frequently conducted electronically."),
        p("Accordingly:"),
        list([
          "electronic signatures;",
          "digital approvals;",
          "authenticated Client Portal confirmations;",
          "approved email acceptances;",
          "secure electronic payment confirmations; and",
          "other reliable electronic methods",
        ]),
        p("may constitute valid evidence of acceptance or agreement, subject to applicable law."),
        p("The parties agree not to deny the legal effect of a document solely because it exists in electronic form."),
      ],
    },
    {
      id: "amendments",
      number: "140",
      heading: "Amendments",
      level: 2,
      content: [
        p("No amendment, variation, modification, or waiver of this Agreement shall be effective unless made in writing or recorded through an authorised electronic process approved by Ordift Studios."),
        p("Updated Booking Terms published on the website shall apply prospectively unless a different effective date is expressly stated."),
        p("Projects already confirmed shall generally continue under the version applicable at the time of booking unless both parties agree otherwise."),
      ],
    },
    {
      id: "entire-agreement",
      number: "141",
      heading: "Entire Agreement",
      level: 2,
      content: [
        p("This Agreement, together with any:"),
        list([
          "quotation;",
          "proposal;",
          "statement of work;",
          "signed contract;",
          "service agreement;",
          "approved addendum;",
          "licensing agreement;",
          "Privacy Policy;",
          "Cookie Policy; and",
          "Website Terms of Use,",
        ]),
        p("constitutes the complete agreement between the parties concerning the relevant engagement."),
        p("It supersedes prior discussions, negotiations, proposals, and understandings relating to that engagement."),
      ],
    },
    {
      id: "severability",
      number: "142",
      heading: "Severability",
      level: 2,
      content: [
        p("If any provision of this Agreement is found by a court or competent authority to be invalid, unlawful, or unenforceable, the remaining provisions shall continue in full force and effect."),
        p("Where possible, the invalid provision shall be interpreted or modified to achieve its original commercial purpose while remaining legally enforceable."),
      ],
    },
    {
      id: "waiver",
      number: "143",
      heading: "Waiver",
      level: 2,
      content: [
        p(
          "A delay or failure by either party to enforce any right or provision under this Agreement on any occasion shall not constitute a waiver of that right, or of any other provision, in the future."
        ),
        p("A waiver is effective only if expressly made in writing by the party granting it."),
        p("Any waiver applies only to the specific matter identified and shall not constitute a continuing or general waiver."),
      ],
    },
    {
      id: "assignment-general",
      number: "144",
      heading: "Assignment",
      level: 2,
      content: [
        p(
          "Ordift Studios may assign, transfer, subcontract, delegate, or otherwise restructure its rights or obligations under this Agreement where reasonably necessary for business operations, provided that such arrangements do not materially reduce the level of service promised to the Client."
        ),
        p(
          "The Client may not transfer or assign this Agreement, or any rights or obligations under it, to another person or organisation without Ordift Studios' prior written consent, except where required by law. This prevents bookings from being passed to unrelated parties without approval."
        ),
      ],
    },
    {
      id: "relationship-of-the-parties",
      number: "145",
      heading: "Relationship of the Parties",
      level: 2,
      content: [
        p("Nothing in this Agreement creates:"),
        list(["a partnership;", "joint venture;", "employment relationship;", "agency;", "fiduciary relationship; or", "franchise arrangement"]),
        p("between the parties."),
        p("Each party acts as an independent contracting party."),
      ],
    },
    {
      id: "no-third-party-rights",
      number: "146",
      heading: "No Third-Party Rights",
      level: 2,
      content: [
        p("Except where expressly stated or required by law, no person or entity that is not a party to this Agreement shall have any right to enforce any provision of it."),
        p("This does not affect the rights of authorised successors or permitted assigns where applicable."),
      ],
    },
    {
      id: "interpretation",
      number: "147",
      heading: "Interpretation",
      level: 2,
      content: [
        p("Unless the context requires otherwise:"),
        list([
          "headings are for convenience only;",
          "singular includes plural and vice versa;",
          "references to legislation include amendments and successor legislation;",
          "“including” means “including without limitation”;",
          "references to one gender include all genders; and",
          "references to persons include natural persons, companies, partnerships, trusts, governments, and other legal entities.",
        ]),
      ],
    },
    {
      id: "compliance-with-laws",
      number: "148",
      heading: "Compliance with Laws",
      level: 2,
      content: [
        p("Each party shall comply with all applicable laws, regulations, licensing requirements, sanctions, export controls, tax obligations, health and safety requirements, and professional standards relevant to the Services."),
        p("Ordift Studios reserves the right to decline or terminate engagements that would require unlawful conduct."),
      ],
    },
    {
      id: "records-and-audit-trail",
      number: "149",
      heading: "Records & Audit Trail",
      level: 2,
      content: [
        p("Ordift Studios may maintain records relating to bookings, communications, approvals, revisions, invoices, payments, project files, and other operational documentation for quality assurance, legal compliance, accounting, dispute resolution, and business continuity purposes."),
        p("Such records shall be managed in accordance with applicable privacy and confidentiality obligations."),
      ],
    },
    {
      id: "survival",
      number: "150",
      heading: "Survival",
      level: 2,
      content: [
        p("The following provisions, together with any other provisions that by their nature are intended to survive, shall remain effective after completion, cancellation, expiration, or termination of the Agreement:"),
        list([
          "payment obligations;",
          "intellectual property rights;",
          "confidentiality obligations;",
          "indemnities;",
          "limitations of liability;",
          "dispute resolution provisions;",
          "governing law;",
          "record retention;",
          "licensing rights;",
          "and any accrued rights or remedies.",
        ]),
      ],
    },
    {
      id: "effective-date",
      number: "151",
      heading: "Effective Date",
      level: 2,
      content: [
        p("These Booking Terms & Conditions become effective on the date specified by Ordift Studios and remain in force until amended, replaced, or withdrawn."),
        p("The version in effect at the time a booking is confirmed shall ordinarily govern that engagement unless otherwise agreed in writing."),
      ],
    },
    {
      id: "version-control-and-change-log",
      number: "152",
      heading: "Version Control & Change Log",
      level: 2,
      content: [
        p("Ordift Studios maintains a formal version number, effective date, and revision history for each release of these Booking Terms, summarising material changes between versions.")
      ],
    },
    {
      id: "digital-record-authenticity",
      number: "153",
      heading: "Digital Record Authenticity",
      level: 2,
      content: [
        p("Electronic logs, timestamps, payment records, portal activity, audit logs, and authenticated system records maintained by Ordift Studios are presumed accurate unless proven otherwise, subject to applicable law.")
      ],
    },
    {
      id: "business-ethics-and-anti-bribery",
      number: "154",
      heading: "Business Ethics & Anti-Bribery",
      level: 2,
      content: [
        p("Ordift Studios will not knowingly engage in bribery, corruption, fraud, money laundering, sanctions evasion, or other unlawful business practices, and reserves the right to terminate engagements involving such conduct.")
      ],
    },
    {
      id: "accessibility-commitment-booking",
      number: "155",
      heading: "Accessibility Commitment",
      level: 2,
      content: [
        p("Ordift Studios will make reasonable efforts to provide accessible communications and accommodate clients with disabilities where reasonably practicable and where notified in advance.")
      ],
    },
    {
      id: "environmental-and-social-responsibility",
      number: "156",
      heading: "Environmental & Social Responsibility",
      level: 2,
      content: [
        p("Ordift Studios strives to operate responsibly by reducing unnecessary waste, promoting ethical production practices, respecting local communities, and encouraging sustainable business operations where feasible.")
      ],
    },
    {
      id: "feedback-and-continuous-improvement",
      number: "157",
      heading: "Feedback & Continuous Improvement",
      level: 2,
      content: [
        p("Client feedback, testimonials, complaints, and suggestions may be used internally to improve services. Public use of testimonials or identifiable feedback will only occur with appropriate permission or another lawful basis.")
      ],
    },
    {
      id: "contract-hierarchy-confirmation",
      number: "158",
      heading: "Contract Hierarchy Confirmation",
      level: 2,
      content: [
        p("The order of precedence established in Part A applies throughout this Agreement. In the event of inconsistency, the more specific project document prevails over these general Booking Terms to the extent of the conflict.")
      ],
    },
    {
      id: "statement-of-professional-commitment",
      number: "",
      heading: "Statement of Professional Commitment",
      level: 2,
      content: [
        p(
          "Ordift Studios believes that exceptional creative work is built on trust, professionalism, integrity, innovation, respect, and collaboration. We are committed to delivering services with excellence while fostering lasting relationships with our clients, partners, and communities. These Booking Terms & Conditions exist not merely to allocate rights and responsibilities, but to provide a transparent framework that supports successful creative partnerships across every project we undertake."
        ),
        p("This statement reflects Ordift Studios' values and does not itself create a binding legal obligation beyond the numbered clauses of this Agreement."),
      ],
    },

    // ============================= PART K =============================
    {
      id: "part-k-international-clients",
      number: "Part K",
      heading: "International Clients",
      level: 1,
      content: [
        p(
          "Ordift Studios operates from Ghana and Qatar and serves clients internationally. This Part sets out general provisions applicable to engagements involving clients, projects, or service delivery outside Ordift Studios' home jurisdictions, in addition to (not instead of) the other provisions of this Agreement."
        ),
      ],
    },
    {
      id: "international-clients-and-cross-border-engagements",
      number: "159",
      heading: "International Clients & Cross-Border Engagements",
      level: 2,
      content: [
        p(
          "Ordift Studios accepts bookings from clients located outside Ghana and Qatar, and may perform Services in jurisdictions other than the jurisdiction of the contracting Ordift Studios entity."
        ),
        p("Where an engagement is cross-border in nature, the specific contracting entity, governing law, and any jurisdiction-specific requirements will be identified in the applicable quotation, proposal, or service agreement."),
      ],
    },
    {
      id: "applicable-law-and-local-compliance-for-international-engagements",
      number: "160",
      heading: "Applicable Law & Local Compliance for International Engagements",
      level: 2,
      content: [
        p(
          "Ordift Studios will make reasonable efforts to comply with local laws and regulations applicable to the performance of Services in a given jurisdiction, including, where relevant, local permitting, filming, and business-conduct requirements."
        ),
        p(
          "This Agreement does not represent a certification, registration, or licence to operate in any specific jurisdiction. Whether, and to what extent, local law imposes additional requirements on a particular engagement depends on the nature of the project and is assessed on a case-by-case basis."
        ),
      ],
    },
    {
      id: "cross-border-service-delivery",
      number: "161",
      heading: "Cross-Border Service Delivery",
      level: 2,
      content: [
        p(
          "Where Services are delivered across borders—including remote editing, digital delivery, or coordination between team members located in different countries—the Client acknowledges that elements of the Services may be performed outside the country in which the Client is located."
        ),
        p("The provisions of Part C (Scheduling & Logistics) regarding travel, permits, and venue access apply equally to international engagements, together with any additional requirements identified in the applicable agreement."),
      ],
    },
    {
      id: "international-data-handling",
      number: "162",
      heading: "International Data Handling",
      level: 2,
      content: [
        p(
          "Personal information and project data relating to international engagements will be handled in accordance with the applicable Privacy Policy and clause 112 (Cross-Border Data Transfers) of this Agreement, including where applicable safeguards for transfers between jurisdictions."
        ),
      ],
    },

    // ============================= CONTACT =============================
    {
      id: "contact-information",
      number: "163",
      heading: "Contact Information",
      level: 1,
      content: [
        p("Ordift Studios"),
        p("Head Office: Accra, Ghana"),
        p("Regional Office: Doha, Qatar"),
        p("Email: info@ordiftstudios.com"),
        p("General Enquiries: enquiry@ordiftstudios.com"),
        p("Website: ordiftstudios.com"),
      ],
    },
  ],
};
