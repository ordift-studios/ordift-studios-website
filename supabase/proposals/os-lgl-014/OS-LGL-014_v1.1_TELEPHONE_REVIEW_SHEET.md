# OS-LGL-014 v1.1 - Telephone review sheet and recording method

For use by the Founder during a telephone consultation with counsel. The sheet is filled in by hand or on screen during the call; nothing in it is pre-filled with counsel's views or decisions.

## 1. Review record (header)
| Field | Entry |
|---|---|
| Review method | Telephone consultation |
| Reviewing counsel | Samuel Kwame Kumi, Esq. |
| Review date and time | *(to be recorded after the consultation)* |
| Agreement reviewed | OS-LGL-014 v1.1 DRAFT. SHA-256 of `OS-LGL-014_v1.1_DRAFT.md` as prepared on 2026-11-09: `faa4a68937ce0d1b9a9af11e9b576983587b102763bca6e725e56985488e63e5` |
| Recommendations and amendments | As communicated following the consultation (section 3) |
| Review outcome | Approved / Conditionally approved / Amendments requested / Pending - according to what counsel actually communicates |
| Review documented by | Founder |
Recompute the hash before the call: `shasum -a 256 supabase/proposals/os-lgl-014/OS-LGL-014_v1.1_DRAFT.md`. If it differs from the entry above, write the new value here and tell Claude before the call; the record must name the exact text counsel heard.

## 2. How to run the call (about 60-90 minutes)
Order: (1) read counsel the status box and "how v1.1 is built"; (2) the four **decision-critical** items first (A3 currency, A7 governing law, L6 minors, L2 licensed activities); (3) the remaining amendments A1-A9; (4) Part L L1-L11; (5) Schedule 1; (6) the items listed as "Keep" in the comparison where counsel is asked to confirm; (7) ask for the outcome last. For each item, tick one outcome and write counsel's words, not yours.

Outcome codes: **OK** = counsel is content with the wording as drafted; **AMEND** = counsel proposes different wording (write it); **QUESTION** = counsel needs a fact first (write the question); **DEFER** = counsel wants more time; **N/A**.

## 3. Clause-by-clause sheet
| # | Item | Question for counsel | Outcome | Counsel's wording / question / reason |
|---|---|---|---|---|
| A1 | cl. 3 order of precedence | Is the new order acceptable? Does the signed agreement properly rank above the accepted quotation? | | |
| A2 | cl. 8 quotation currency | Is "currency stated in the quotation" enough, and is "indicative only" right for website amounts? | | |
| A3 | cl. 12 currency (replace) | Does 12.1-12.5 honour the accepted quotation's currency and amount? Must a shortfall from a client's bank charge be made good by the client? Is agreement to pay in another currency valid when given through the portal? | | |
| A4 | cl. 11 payment | Is "counts only when verified as received" acceptable? | | |
| A5 | cl. 9 booking confirmation | Does the added paragraph correctly describe when a booking is confirmed? | | |
| A6 | cl. 10 deposits | Is the three-way statement (no payment / percentage deposit / full payment) sufficient? Are booking-fee and retainer terms still needed? | | |
| A7 | cl. 125/126/160 governing law | What law and courts apply for the Qatar entity? For the Ghana business? Any different treatment for individual consumers? Arbitration? | | |
| A8 | cl. 28 representative | Is the representative statement adequate for organisations? | | |
| A9 | cl. 6/139 e-signature | Is signature through the platform enforceable in Qatar and in Ghana? Any required wording? | | |
| L1 | Engagement Particulars | Does Schedule 1 properly form part of the agreement and rank as stated? | | |
| L2 | Contracting entity and licensed activities | Is the licensed-activity limit correctly stated? | | |
| L3 | Price and currency | Consistent with A3? | | |
| L4 | Payment before confirmation | Is "not obliged to reserve until payment is verified" acceptable? | | |
| L5 | Schedule and place | Weather and force-majeure rescheduling; client's duty to give access | | |
| L6 | Minors and vulnerable persons | Age and consent rules in Qatar and Ghana; storage and portfolio use of children's images | | |
| L7 | Restricted locations and permits | Drone, airspace and filming permits in each jurisdiction | | |
| L8 | Extended usage and exclusivity | Is clause 54's perpetual promotional right acceptable? How should it interact with a client's recorded permission? | | |
| L9 | Third-party material and releases | Default allocation to the client acceptable? | | |
| L10 | Changes after signature | Acceptable? | | |
| L11 | Execution and signatories | Capacity wording for each entity; client individual vs organisation | | |
| S1 | Schedule 1 | Any missing particular? | | |
| K1 | Part F cancellation and refunds (kept) | Does anything need to change for Option B (refund in the original currency)? | | |
| K2 | Liability and insurance (kept, cl. 83-100) | Confirm for corporate clients and unusual exposure | | |
| K3 | Data protection and confidentiality (kept, Part H) | Confirm Qatar and Ghana regimes | | |
| K4 | Warnings | Anything in v1.0 that should be removed or corrected for a signed agreement? | | |

## 4. Final outcome (ask last)
Outcome (circle one): **Approved as drafted / Approved subject to the amendments recorded above / Amendments requested before approval / Pending.** Any conditions: ________________ . Did counsel ask to see the final text again before it is used? Yes / No.

## 5. Method for recording counsel's recommendations
1. During the call, write counsel's words in the right-hand column against the item number. If counsel gives wording, write it exactly; if counsel gives a principle, write the principle and mark AMEND.
2. Straight after the call (same day), read the sheet back to counsel if possible, or at least re-read it yourself while memory is fresh, and add the date and time (start and end) and anything you could not capture.
3. Send Claude the filled sheet (typed text or photograph). Claude incorporates only what is recorded, shows a tracked comparison of v1.1 draft before and after, and gives the new SHA-256. Claude does not decide any legal question and does not fill any blank.
4. Repeat steps 1-3 for a second call if counsel wants to re-review the amended text.
5. The completed sheet, with the hash of the exact text counsel last reviewed, is the Founder-recorded account of the consultation and is stored with the version.

## 6. What this record is - and the existing legal controls (read before relying on the outcome)
**This sheet is a Founder-recorded account of a telephone consultation. It is not a written approval issued by counsel, and it must not be described as one.** If counsel later chooses to issue a written confirmation, that is a different and stronger record and is kept separately.

What the existing system requires before a version can be activated (inspected 2026-11-09 in `masterRegistry.ts`, `masterRegistryActions.ts`, `approvalAttestation.ts`):
1. **Lifecycle:** a version moves draft -> legal review -> approved -> active; steps cannot be skipped. Activation is an explicit, separate act by a Super Admin or holder of the contract-administer authority.
2. **An approval date must be on record** before activation: either the registry's own stamp (set when an authorised administrator performs the "approve" transition) or a verified **attestation** of counsel's approval. The attestation requires a **stored evidence file** whose fingerprint the system computes; the evidence must name OS-LGL-014; the evidence **kind** must be one of: signed letter, counsel email, counsel message, message transcript, signed register, other written record; and the administrator must record an **independent identity check** of counsel (call-back to an independently obtained number is an accepted method).
3. The controlled master files (document and PDF) must be stored and registered with fingerprints, with **no unresolved counsel-review markers**, and the version must be the master's current version.
**What this means for a telephone review:** the evidence kinds are all written records, and the attestation describes "counsel's own dated review and confirmation". A Founder-recorded phone account is **not one of the accepted evidence kinds today**, and I will not file it as "counsel email" or "signed letter". Options, each needing the Founder's decision (none is implemented):
- (a) After the call, counsel supplies any written record of the outcome (a one-line message is enough); it is then attested as that kind, with the telephone call-back as the identity check. The sheet is kept alongside it.
- (b) The Founder, as the authorised administrator, performs the registry "approve" transition personally after the call, recording the sheet as the basis. This is a Founder approval on advice, and the record should say so rather than say counsel approved.
- (c) Add a new, honestly named evidence kind (for example "Founder-recorded telephone consultation") to the control, with its own audit label and the sheet as the stored evidence. This changes a legal control and needs the Founder's explicit instruction and tests.
Until one of these is chosen and completed, **v1.0 stays active, v1.1 stays a draft, and no approval is recorded or implied.**

## 7. Defects found in the tooling that must be fixed before v1.1 can be activated
- `masterRegistryActions.ts` (registration and activation) and `agreementReadiness.ts` derive the content reference with the version hard-coded as "1.0", so a v1.1 would be registered as 1.0.
- Production shows two rows for OS-LGL-014 version "1.0" (one active, one approved); explain before adding v1.1.
