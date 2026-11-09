# OS-LGL-014 v1.0 (active) compared with the proposed Client Services Agreement and v1.1 (draft)

Prepared 2026-11-09. v1.0 = Master Booking Terms, Parts A-K, clauses 1-163 (source `src/lib/legal/documents/os-lgl-004-booking.ts`). "Proposed clause" = the 14-clause outline in `PROPOSAL_client_service_agreement.md`. Action key: KEEP = v1.0 already covers it; CLARIFY = covered but needs a precision; AMEND = v1.0 says something that conflicts or must change; ADD = not covered.

## 1. Clause-by-clause
| Proposed clause | Where v1.0 covers it | Gap | Action | v1.1 |
|---|---|---|---|---|
| 1 Parties and contracting entity; order of precedence | cl. 3 (precedence list), 4 (acceptance), 141, 158 | no Engagement Particulars; entity and signatory not stated; precedence omits them | AMEND + ADD | A1, L1, L2, Schedule 1 |
| 2 Scope and deliverables | cl. 8, 31, 37-43 (delivery, revisions, RAW files) | scope is "the quotation" but v1.0 does not bind the quotation's lines to the agreement; licensed-activity limit absent | CLARIFY + ADD | L1, L2 |
| 3 Fees and payment terms | cl. 10, 11, 12, 13, 17 | **cl. 8 and 12 say prices are USD and "the invoiced USD amount shall prevail" - conflicts with the approved principle (accepted quotation currency and amount prevail)**; payment condition is "specified in the quotation" with no recorded form; no verified-payment statement | AMEND | A2, A3, A4, A6, L3, L4 |
| 4 Booking, schedule and location | cl. 7, 9, 19, 23, 25, 29 | confirmation is a list of possible conditions, not the actual confirmation rule; no record of sessions; multi-day / online / multi-location not addressed | AMEND + ADD | A5, L5 |
| 5 Cancellation and rescheduling | Part F cl. 68-82; cl. 20 | none for the structure; refund currency not stated | KEEP (+ counsel check on refund currency) | D note |
| 6 Usage rights and licence | Part E cl. 49-67 (51 licence, 52 commercial, 53 exclusive, 54 portfolio) | extended usage / exclusivity not tied to the engagement's recorded particulars; cl. 54 perpetual promotional right is broad and the recorded-permission process is not reflected | CLARIFY | L8 |
| 7 Third-party IP, releases, minors, locations | cl. 23, 56, 57, 106, 117 | **no clause on minors or safeguarding consent**; no allocation of releases and clearances per engagement | ADD | L6, L7, L9 |
| 8 Responsibilities | cl. 32, 83, 28 | client representative only "for larger events" | AMEND (cl. 28) | A8 |
| 9 Liability and insurance | cl. 83-100, 94 | none on structure | KEEP (counsel to confirm for corporate / unusual exposure) | - |
| 10 IP, archive, retention | cl. 41, 42, 49, 50, 110 | none | KEEP | - |
| 11 Data protection and confidentiality | Part H cl. 101-119, 162 | none; counsel to confirm Qatar / Ghana regimes | KEEP | - |
| 12 Termination, notices, entire agreement, amendments | cl. 138-141, 150 | amendments after signature not tied to the booking rules | CLARIFY | L10 |
| 13 Governing law, jurisdiction, disputes | cl. 120-137, 126, 125, 160 | **law is "designated by Ordift Studios" per engagement - discretionary, not stated in a signed document** | AMEND | A7 |
| 14 Signature block, e-signature | cl. 6, 139 | no reference to the signature record or to entity signatory / client representative | AMEND + ADD | A9, L11 |

## 2. Provisions in v1.0 that conflict with an approved decision (must change before any activation)
1. **cl. 8 (bullets 2 and 3) and cl. 12:** USD as the standard currency; local amounts "for convenience"; "the invoiced USD amount shall prevail". Conflicts with Option B (the accepted quotation's currency and amount stay the obligation).
2. **cl. 126 / 125:** governing law chosen at Ordift's discretion - a signed agreement needs it stated.

## 3. Provisions to clarify but not rewrite
cl. 9 (how confirmation actually works), cl. 10 (structured payment condition), cl. 11 (invoice currency; verified payment), cl. 28 (representative for every engagement), cl. 54 (portfolio rights vs recorded permission), cl. 71 (refund currency).

## 4. Provisions to add
Part L (L1-L11) and Schedule 1.

## 5. Observations about the register, not the text (investigated 9 Nov; details in the registry findings document)
- Production lists TWO rows for OS-LGL-014 version "1.0". **Row B** (active, legacy-mapped) is the existing Master Booking Terms served at `/legal/booking`; **Row A** (approved, seeded 8 Sep for all 21 masters, label "Legal Counsel") holds no text, no approval date and no evidence. This comparison is against Row B. The registry holds no counsel-approved Official Master text for OS-LGL-014.
- Public-page content is served from code, separate from the agreement master; v1.1 does not change what `/legal/booking` shows unless that is decided and released separately.
- v1.0 cl. 140: confirmed bookings stay under the version in force at booking, so v1.1 would not retroactively change them.

## 6. Focus list for counsel (the six areas you asked to highlight)
| Area | v1.0 position | What v1.1 changes | Question for counsel |
|---|---|---|---|
| **Currency** | cl. 8 and 12: USD standard, local amounts for convenience, invoiced USD prevails | A2, A3 (replaces cl. 12), L3: the accepted quotation's currency and amount are the obligation; USD is a reference only; any cross-currency payment only by recorded informed agreement | Does 12.1-12.5 honour the accepted quotation? Who bears a client's bank charge or conversion cost? Is portal agreement to pay in another currency valid? Refund currency (cl. 71)? |
| **Minors and safeguarding** | nothing | L6 (new): age and consent rules, guardian consent, storage and portfolio use | What consent and age rules apply in Qatar and Ghana? May a child's images be used in the portfolio, and on what consent? |
| **Governing law** | cl. 125/126/160: chosen by Ordift per engagement | A7: stated in the agreement, tied to the contracting entity | Which law and courts for the Qatar entity and for the Ghana business? Consumers? Arbitration? |
| **Usage rights** | Part E cl. 49-67; cl. 54 perpetual promotional right | L8: extended usage and exclusivity recorded in the Engagement Particulars; recorded permission reflected | Is cl. 54 acceptable as drafted? How should it interact with a client's recorded permission? |
| **Cancellation** | Part F cl. 68-82 | unchanged except refund in the original currency (note D) | Anything else to change for the new payment-condition rule? |
| **Liability** | cl. 83-100, 94 | unchanged | Confirm for corporate clients and unusual exposure; confirm cap wording |
