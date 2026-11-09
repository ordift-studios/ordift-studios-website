# Client portal linking, cross-payment over-collection, and reference integrity (10 Nov 2026) — LOCAL; nothing applied to Production

## 1. Client portal linking

### What existed, and why it was not safe for staff-recorded enquiries
`linkGuestRecordsToAccount()` (called at sign-in and sign-up) attached EVERY unowned enquiry whose email matched the account's email. For a staff-recorded enquiry (WhatsApp, telephone, email, in person) that meant: a shared mailbox, a typo, someone else's address, or a sign-up with email confirmation switched off could hand the project (quotation, payment instructions, receipts) to whoever signed up with that address. Changed: staff-recorded enquiries (`created_by` set) are excluded from that sweep, and a database trigger now refuses any other change of owner (below). Website-form enquiries, which the client submitted themselves, still link on a confirmed sign-in as before.

### The process (verification by what only the real client has been given)
1. Staff (staff, admin or Super Admin) press **Create invitation** on the enquiry's "Client portal access" card, choosing how they will deliver it (WhatsApp, telephone, email, in person, other; it defaults to the channel the enquiry came from), an optional note, and a lifetime (default 3 days, at most 14).
2. The server makes a 256-bit random link token and a 6-digit code. **Only SHA-256 hashes are stored** (the code's hash is bound to the token), so nobody, staff included, can read them back. They are shown once, with a copyable message that holds the link but never the code, and delivery advice that says to give the code separately (by voice where possible).
3. The client opens the link. Signed out, the proxy sends them to sign in or sign up and back (the sign-up link now keeps the return path). They type the code.
4. The database function attaches the enquiry to the signed-in account, atomically, only if: the link is open and unexpired; fewer than 5 wrong codes; the account is active; the account is **not** staff, admin or Super Admin and not the person who created the invitation; the enquiry still has no owner; the code matches.
5. Single use. Five wrong codes lock it. Staff can revoke. A locked, revoked or expired invitation does not block a fresh one.

### How the requirements are met
| Requirement | How |
|---|---|
| Clients need not register to enquire or receive a quotation | Nothing changed there; registration is only needed to own the project online. |
| Identity and ownership verified before access | Link + code, from the client's own signed-in account; never an email or phone match. |
| Shared emails, duplicate records, wrong matches | The card tells staff to take extra care (and why) when the email is marked shared in the directory, is a placeholder, is used by other records, or already belongs to an account; the link and code decide, not the email. A wrong person with only the emailed link cannot claim. A wrong claim can be released by a Super Admin. |
| Staff cannot impersonate or grant access | Staff never set an owner: the only write path is the claim function, which refuses staff accounts and the creator, and the trigger `enquiries_owner_guard` refuses every other change of owner on a staff-recorded enquiry. Release is Super Admin only, needs a written reason, and is refused while any payment is made or awaiting verification. |
| All linking audited | Activity log: invitation created (who, channel, expiry, risk level), each failed attempt (outcome, tries left), success, revoke, release; plus the permanent `enquiry_ownership_events` table. A creation that cannot be audited is cancelled and nothing is issued. |
| Ghana and Qatar | One process for both; nothing in it depends on the market. The journey lab walks one of each. |
| Existing infrastructure | Existing authentication and sign-in redirect, `profiles`, roles, `activity_log`, rate limiting, `ActionForm` restoration. No new authentication system. |

### Options considered
- *Email magic link to the address on file:* rejected as the only proof (shared mailbox, wrong address). It remains one possible delivery channel for the link, never the proof.
- *Staff set the owner after a phone check:* rejected: that is exactly the staff-impersonation path.
- *SMS/WhatsApp one-time code sent by the system:* possible later; there is no messaging integration to reuse today, and the process deliberately relies on a person giving the code.
- *A fixed-length code with a rate limit only:* the per-invitation 5-try lock plus a per-person limit (5 tries in 10 minutes) are both used.

### Residual risks
- A client who is given the link AND the code but is not the intended person (for example a message forwarded together) can claim: the process proves possession, not identity. Hence the advice to give the code separately, and the Super Admin release.
- The code is 6 digits: protected by the 5-try lock, the per-person limit, and the 256-bit token (a guesser needs the link first).
- Staff are trusted to confirm they are speaking to the right person before giving the code. The card shows risk notes but cannot enforce a voice check.
- If the claims migration is not applied, the card says so and the rest of the application is unchanged; before it is applied, the old email sweep restriction (a code change) already applies.

## 2. Open payment instructions may not exceed what is owed (decision A, now authorised)
`PROPOSAL_payment_open_commitments_guard.sql`: a trigger refuses a NEW instruction, or a RAISED amount on an open one, that exceeds `amount due − completed payments (refunds subtract) − the other instructions that hold balance`, under the same per-record lock as verification. An instruction holds balance while awaiting verification or needing information (money may have moved) and while pending (unpaid) for under 24 hours (`private.open_instruction_hold_hours()`). Never blocked: proof submission, resubmission after a rejection, and every completion (a card payment the provider has collected is never refused: a total above what is owed is flagged for review by the earlier over-collection trigger and kept as evidence). Legitimate instalments, partial payments and sequential methods pass because verified money reduces what is owed. Clients see "Your open payment instructions" and can cancel an unpaid bank instruction at once (kept as closed history, audited). Rehearsed: four simultaneous 400 starts of different types and methods on 1,000 create exactly two; 500 + 500 both pass; races with raises and with verification stay within what is owed; a 30-hour-old pending instruction holds nothing.
**Decision left to you:** the 24-hour hold (a number in one function) and whether a card attempt should hold for a shorter time; and a refund-style or "extend the hold" process is not built.

## 3. Reference integrity (verified, not applied)
`rehearse_payment_references.sh` on a disposable copy: the diagnostics find nothing on clean data and find synthetic duplicates; each preflight refuses in plain words; both indexes apply once a person has resolved duplicates (no row deleted); all FOUR payment proposals applied together run a full flow (bank and card instalments, a refused duplicate card reference) and roll back in reverse order with no remnant and the bank reference preserved.

## 4. Proposed migration order for Production (each needs your separate approval; none is requested now)
1. Read-only diagnostics (`DIAGNOSTIC_bank_transfer_open_instructions.sql`, `DIAGNOSTIC_card_gateway_reference.sql`) against the target database.
2. `PROPOSAL_payment_integrity_controls.sql` (verification lock, review cases, bank reference column).
3. `PROPOSAL_bank_transfer_one_open_instruction.sql`.
4. `PROPOSAL_card_gateway_reference_unique.sql`.
5. `PROPOSAL_payment_open_commitments_guard.sql` (after 2, since it shares the lock key; rehearsed in that order).
6. `PROPOSAL_portal_claims.sql` (independent of 2 to 5).
7. Application release (it tolerates every one of these being absent, except that the claim card then says invitations are unavailable).
Rollbacks sit beside each proposal.

## 5. New finding for your decision: payment can mark a project "booked" with no booking
`syncEntityPaymentStatus` calls `advanceStageOnFullPayment`, which moves an ordinary enquiry to the stage "booked" the moment it is paid in full, with no confirmed booking record. Seen in the lab (ENQ-JRN-GHY: stage booked, zero booking confirmations). The booking confirmation controls (agreement threshold, overlap checks, assigned person, deposit/full-payment condition) are then skipped for that project, and the booking card may show it as done. Crew Support is already excluded from this advance. Suggested change (not made): when the booking-confirmation switch is on, do not advance ordinary enquiries to "booked" from a payment (let the confirmation do it), as Crew Support already does.
