# FINDINGS (read-only, 2026-11-08): why amount-due for QAR and GHS quotations is disabled, and a safe path

## Why it is disabled
Migration 0166 contains a **deliberate release safeguard** (Founder, 2026-10-19): `private.non_usd_amount_due_enabled()` returns `false`. An amount due may not be established from a non-USD quotation until "the payment-page wording fix (P1) is separately approved, deployed and verified". It is enforced in the application **and** in `establish_enquiry_amount_due()` (so no script or SQL editor can bypass it). The P1 release "flips it with one line" (`create or replace function ... returns true`). P1 is still unapproved. Production confirms the function returns false; there are 0 non-USD quotations.

## Second blocker found: the exchange rates are stale or about to be
The establishment function accepts only a rate that exists, is above zero, carries a source note, is **at most 30 days old**, still matches what the person previewed, and has not jumped more than 10% without acknowledgement. Production today: **GHS 11.0898 effective 14 Aug 2026 (86 days old: would be refused)**; **QAR 3.64 effective 11 Oct 2026 (28 days old: becomes stale on 10 Nov)**; USD 1. So even with the flag on, a GHS amount due could not be established, and QAR would soon fail.

## What works today without any change
A booking whose quotation has **no upfront payment** condition needs no amount due: the confirmation records the outstanding amount (when one is known) and never treats it as received. Deposit or full-payment conditions on QAR or GHS quotations stay blocked ("no amount due established") until both blockers are cleared. This is the correct fail-safe: nothing is bypassed and no artificial payment is possible.

## Safe path (nothing activated; each step needs its own approval)
1. **P1**: decide and approve the payment-page wording for non-USD amounts (what the client sees when asked to pay in QAR or GHS, the reference rate and the verified-credit rule).
2. **Rates**: record fresh, source-noted, append-only rates for GHS and QAR (existing Exchange Rate Management, with the Founder's reason) and agree a refresh routine so a rate never exceeds 30 days when a non-USD booking is confirmed.
3. **Switch**: a reviewed one-line migration (`non_usd_amount_due_enabled() -> true`) with the existing amount-due localdb suites re-run, a Production-shaped rehearsal, backup and rollback (`-> false`), under its own approval.
4. **Verified payments only**: unchanged. A bank transfer credits only what arrived (partial credits at the locked rate; excess never auto-credited); the booking gate compares the **verified paid** USD-equivalent with the required amount. No artificial payment is created at any step.
5. **Booking**: no change needed; once amount due exists for a non-USD quotation the deposit/full gate works through the same arithmetic.
