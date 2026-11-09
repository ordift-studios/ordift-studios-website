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
| Review documented by | Founder (Founder approval is based on counsel's advice from this consultation; it is not a written approval issued by counsel) |
| Call started / ended | *(to be recorded)* |
| How the Founder satisfied themself that they were speaking with counsel | *(for example: called counsel back on a number taken from an independent source; to be recorded)* |
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

## 4. Counsel's conclusion (ask last; write counsel's words)
Counsel's conclusion (circle what counsel actually said): **Content as drafted / Content subject to the amendments recorded above / Amendments needed before use / Wants more time.** Conditions: ________________ . Did counsel ask to see the final text again before it is used? Yes / No.

## 5. Founder's decision (made after the call, separately from counsel's advice)
Completed by the Founder only after the call, and only once the amendments (if any) have been incorporated and the final hash recorded.

| Field | Entry |
|---|---|
| Date of decision | |
| Hash (SHA-256) of the exact final text approved | |
| Is it identical to the text counsel heard? | Yes / No. If No: list every change and whether each was recommended by counsel |
| Decision | Approve / Do not approve / Review again |
| Statement recorded with the approval | "Approved by the Founder on the advice of counsel given in a telephone consultation on [date]. This is not a written approval issued by counsel." |

## 6. Method for recording counsel's recommendations
1. During the call, write counsel's words in the right-hand column against the item number. If counsel gives wording, write it exactly; if counsel gives a principle, write the principle and mark AMEND.
2. Straight after the call (same day), re-read the sheet while memory is fresh, add the start and end times and anything you could not capture.
3. Send Claude the filled sheet (typed text or a photograph). Claude incorporates only what is recorded, shows a before-and-after comparison of the draft, and gives the new SHA-256. Claude does not decide any legal question and does not fill any blank.
4. If counsel asked to see the amended text, or you want to confirm it, hold a second call and record it on a fresh copy of this sheet; each call is a separate record with its own date and hash.
5. When no further amendment is outstanding, the Founder completes section 5. The completed sheet or sheets, with the hash of the exact text approved, form the legal-review record and are stored with the version.
6. The record uses these words and no others for the review: "Founder-recorded telephone consultation" and "Founder approval on counsel's advice".

## 7. Existing legal controls and how the Founder approval fits them
The full inspection, the exact steps and the proposed adjustment are in `OS-LGL-014_registry_findings_and_founder_approval_procedure.md`. In short: the registry already has the right lifecycle and a registry-stamped approval date, but **no screen** lets anyone move a version to "approved", so the Founder approval cannot be recorded today without a small, separately approved change. Until then v1.0 stays active, v1.1 stays a draft, and no approval is recorded or implied.
