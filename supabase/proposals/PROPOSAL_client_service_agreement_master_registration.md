# PROPOSAL (local; nothing registered, approved, activated, issued or sent): Client Services Agreement master and composer

Prepared 2026-11-08. Branch `local/client-service-agreement` (based on `local/quotation-payment-condition-form` 2db3282, because the composer reuses that branch's payment-condition reading). Counsel review is required before activation; nothing here is legal advice.

## What exists in this branch
| File | Purpose |
|---|---|
| `src/lib/legal/clientServiceAgreementMaster.ts` | DRAFT master v0.1-DRAFT: the 14 clauses of the proposal. Operational clauses (parties, scope from the quotation lines, price and structured payment condition, schedule) use `{{TOKENS}}`. Every legal clause (5-12, and the legal parts of 1-4 and 13) is a `[[COUNSEL: ...]]` slot with no wording of its own. |
| `src/lib/legal/clientServiceAgreementDocument.ts` | Pure composer. Copies the master line for line, replaces only tokens, from recorded facts. REFUSES while any counsel slot remains, when a particular is missing, when a token is unknown, or when the quotation's structured payment condition and written terms disagree. Deterministic output and SHA-256. |
| `src/lib/legal/clientServiceAgreementIssuance.ts` | Issuance gate. Flag `CLIENT_SERVICE_AGREEMENT_ISSUANCE_ENABLED` default off. `assessClientAgreementIssuance` lists every blocker; `issueClientServiceAgreement` ALWAYS refuses (the sending step is not built). |
| `src/lib/legal/clientServiceAgreement.test.ts` | 18 tests, including: the draft master can never be composed; no legal wording in the counsel clauses; nothing imports these modules; no database, email, storage or signature-engine access; no sharing with the instructor, employment or vendor composers. |
Not built, on purpose: the master registration (database rows), the snapshot loader from live records, the preview/issue screens, signature-request creation, email.

## DECISION NEEDED (a discrepancy with the earlier proposal) - which document code?
The earlier proposal said the agreement system has no client-service template and that a new code would be allocated by management. A read-only check of Production on 2026-11-08 shows the Legal Suite catalogue ALREADY lists client-facing masters:
| Code | Title | Production versions (status as recorded) |
|---|---|---|
| OS-LGL-001 | Personal Portrait Agreement | 1.0 approved (not activated) |
| OS-LGL-002 | Wedding & Event Photography/Videography Agreement | 1.0 approved (not activated) |
| OS-LGL-003 | Commercial / Advertising Production Agreement | 1.0 approved (not activated) |
| OS-LGL-006 | RAW / Source Files Release & Licence Agreement | 1.0 approved (not activated) |
| OS-LGL-014 | Client Service Terms & General Booking Agreement | 1.0 active (the existing public Master Booking Terms) and a second 1.0 recorded as approved |
| OS-LGL-018 / 019 | Data Processing Agreement / Confidentiality-NDA | 1.0 approved (not activated) |
`approved_at` and `activated_at` are empty on all of these; the status text and the dates disagree, so I have NOT treated any of them as approved. I did not read document text. Options for the Founder:
- (a) register the Client Services Agreement as a new version under OS-LGL-014 (its catalogue title already describes it; but its active 1.0 is the PUBLIC booking terms, so a new version must not supersede that page by accident);
- (b) allocate a new code;
- (c) use the transaction-specific masters (001/002/003) for their service types and use this composer's clauses as the common core.
This composer takes the master's identity as an input and does not depend on the answer.

## Order of work after counsel
1. Founder chooses (a), (b) or (c). 2. Counsel drafts the slots (Qatar and Ghana). 3. Master registered as a draft version, counsel approval recorded in the existing approval fields, activation. 4. Snapshot loader + preview (read-only). 5. Issuance, Super Admin only, behind its own flag, with its own approval. 6. Booking gate already reads executed, uncancelled agreements linked by enquiry or quotation reference.
