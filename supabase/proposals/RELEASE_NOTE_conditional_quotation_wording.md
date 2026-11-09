# Conditional quotation wording - release note (LOCAL; nothing released)

**Status: PENDING FINAL LEGAL REVIEW. Not for Production until that review is recorded.** (`CONDITIONAL_WORDING_STATUS = "pending_final_legal_review"`, version `2026-11-quotation-conditional-v1`.)

## Wording (verbatim, as supplied by the Founder on 9 Nov 2026)
"This quotation is subject to confirmation of personnel availability and scheduling. Acceptance or payment does not, by itself, constitute confirmation of a booking. A booking is confirmed only when ORDIFT STUDIOS issues an explicit booking confirmation."

## Where it appears
It is added to the quotation's own payment-and-booking terms, only when a quotation is issued as CONDITIONAL (availability tentative, unverified, or the quotation is not linked to an enquiry, and the issuer ticked the acknowledgement). Every output renders those terms, so it appears identically in: the admin quotation view, the printable page, the server-generated PDF (all characters are inside the PDF font set; tested) and the content fingerprint. Ordinary quotations (independent, or supported by a fresh Available check) do not carry it. An already-issued quotation is never changed.

## What it does not do
It changes no payment condition, deposit, amount or legal term. The payment-terms classifier ignores it, so it cannot alter how the payment terms read. An availability check is still not a reservation, and booking confirmation still re-checks availability.

## Earlier wording
The earlier local sentence is recognised only so that a DRAFT carrying it is brought to the current wording once; it is never written again.

## Audit
The availability-basis audit entry for a conditional quotation records `conditionalWording: { version, status }`, so an issued conditional quotation can later be traced to the wording version and its review status at the time.

## Before Production
1. Counsel's final review of the sentence (or approved amendment, which means changing the constant and its version label).
2. Flip `CONDITIONAL_WORDING_STATUS` only as part of that review, which also removes the internal "pending final legal review" note from the issue form.
3. Separate Founder release approval. No migration is involved.
