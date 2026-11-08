// CLIENT SERVICES AGREEMENT - DRAFT MASTER (v0.1-DRAFT). LOCAL ONLY, INACTIVE, NOT REGISTERED, NOT APPROVED.
//
// This file is a DRAFTING AID built from supabase/proposals/PROPOSAL_client_service_agreement.md. It states no legal requirement and is not legal advice.
// Every clause whose wording is a LEGAL question is a [[COUNSEL: ...]] slot that counsel must draft; the composer REFUSES to produce a document while any such slot remains,
// so an unreviewed master can never yield an issuable agreement. Only the OPERATIONAL clauses (who the parties are, what the quotation says, the price and the structured
// payment condition, the confirmed schedule) are filled from recorded facts, through {{TOKENS}}, exactly as recorded and never reworded.
//
// It is NOT the instructor, employment or vendor agreement and shares no clause text with them. The canonical document code is NOT allocated here (see
// supabase/proposals/PROPOSAL_client_service_agreement_master_registration.md): the composer takes the master's identity as input.
export const CLIENT_SERVICE_MASTER_VERSION = "0.1-DRAFT";
export const COUNSEL_SLOT = /\[\[COUNSEL:[^\]]*\]\]/g;
export const TOKEN = /\{\{([A-Z_]+)\}\}/g;

export const CLIENT_SERVICE_MASTER_DRAFT = `CLIENT SERVICES AGREEMENT

This Agreement is made between the contracting entity and the client named below, on the terms of the accepted quotation identified below. If these documents differ, the order of precedence is: this Agreement, the accepted quotation, the schedule. [[COUNSEL: confirm the order of precedence and the introduction.]]

1. PARTIES AND CONTRACTING ENTITY
Contracting entity: {{ENTITY_DESCRIPTION}}
Authorised signatory for the contracting entity: {{ENTITY_SIGNATORY}}
Client: {{CLIENT_DESCRIPTION}}
Accepted quotation: {{QUOTATION_REFERENCE}} (content fingerprint {{QUOTATION_FINGERPRINT}})
[[COUNSEL: parties clause wording, capacity of an individual client, authority of a client's representative.]]

2. SCOPE AND DELIVERABLES
The services are those listed in the accepted quotation:
{{SERVICE_LINES}}
Activities declared at issue: {{ACTIVITIES}}
[[COUNSEL: deliverable formats, quantity and delivery method and timing; exclusions; revisions included; limitation to activities the contracting entity is licensed for.]]

3. FEES AND PAYMENT TERMS
Price: {{CURRENCY}} {{TOTAL}} as stated in the accepted quotation.
Payment condition (as stated in the accepted quotation): {{PAYMENT_CONDITION_SENTENCE}}
A booking is confirmed only when the payment the condition requires has been verified.
[[COUNSEL: due dates, late payment, taxes, currency and exchange, refunds of verified payments.]]

4. BOOKING, SCHEDULE AND LOCATION
{{SCHEDULE}}
[[COUNSEL: the client's duty to provide access and information; weather and force-majeure rescheduling; online, multi-location and multi-day sessions.]]

5. CANCELLATION AND RESCHEDULING
[[COUNSEL: notice periods; what is refundable and what is retained; rebooking subject to availability and a fresh confirmation. Commercial values to be supplied by management.]]

6. USAGE RIGHTS AND LICENCE
[[COUNSEL: standard rights included; extended or non-standard usage as a separate priced grant (territory, duration, media); exclusivity and its price; the contracting entity's portfolio and marketing use only with the client's recorded permission; credit.]]

7. THIRD-PARTY RIGHTS, RELEASES, MINORS AND LOCATIONS
[[COUNSEL: who clears third-party IP, music and locations; releases for identifiable people; minors (guardian consent and safeguarding); child-image and data rules in Qatar and Ghana; restricted or sensitive locations and permits.]]

8. RESPONSIBILITIES
[[COUNSEL: responsibilities of the contracting entity (professional standard, safeguarding, equipment, crew) and of the client (accuracy of brief, access, approvals, safety).]]

9. LIABILITY AND INSURANCE
[[COUNSEL: limits, exclusions, indemnities, insurance. Unusual exposure is an agreement trigger in the booking rules.]]

10. INTELLECTUAL PROPERTY, ARCHIVE AND RETENTION
[[COUNSEL: ownership of raw material and edited deliverables; archive and retention aligned with the adopted retention schedule.]]

11. DATA PROTECTION AND CONFIDENTIALITY
[[COUNSEL: personal data in images and records; the regimes of the contracting entity's jurisdiction.]]

12. TERMINATION, NOTICES, ENTIRE AGREEMENT AND AMENDMENTS
[[COUNSEL: termination; notices; entire agreement; amendments only in writing and re-checked against the booking rules.]]

13. GOVERNING LAW, JURISDICTION AND DISPUTES
Governing jurisdiction recorded for the contracting entity: {{JURISDICTION}}
[[COUNSEL: governing law, venue and dispute resolution for this entity; consumer-protection rules for individual clients; enforceability of electronic signature.]]

14. SIGNATURES
For the contracting entity: {{ENTITY_SIGNATORY}}
For the client: {{CLIENT_SIGNATORY}}
`;
