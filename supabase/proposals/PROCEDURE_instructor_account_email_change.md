# PROCEDURE (PROPOSED, NOT EXECUTED) — changing an instructor's account email safely

Status: prepared locally on 31 October 2026. Nothing has been changed, no message sent. Needs the Founder's separate written authorization for each step marked **[AUTH]**.

## 1. What was requested
On 30 October 2026 (07:58 UTC) the instructor wrote from a personal address (not the address on his account) asking that this address be used for correspondence "as this is my personal facilitator engagement", and asking how to change his registered email from his business address.

## 2. What the platform supports (checked in the code, 31 Oct 2026)
- The login email is the Supabase Auth email of his account. **There is no in-app way to change it**: no Admin action, and no self-service screen (the portal can only change a password). A change is an Auth-user update performed outside the app (Supabase dashboard, Auth → Users, or the Auth admin API) — an authentication-identity change, therefore **RED** under the error-prevention protocol (explicit authorization every time; never print or retrieve secrets).
- No separate "preferred contact email" exists for instructors (the client-directory `contact_emails` table is for client contacts and is not used by agreements or signing).
- His profile (id, member number, name) does not change; only the Auth email does. Nothing in the app stores the email as an identity key other than Auth.

## 3. Where the account email is used, and what a change affects
| Use | When read | Effect of a change |
|---|---|---|
| Login and password recovery | live | He logs in with the new address afterwards. |
| Signing links for the agreement | **at the moment of issue** (`getUserById`) | Links go to whatever the account email is at issue time. A link already sent stays with the old address. |
| "Contact:" line in the agreement's Schedule A | frozen in the draft's snapshot when the draft is prepared | Shows the OLD address until the draft's terms are saved again. **Local fix prepared:** saving the terms now re-reads name, member number and account email and adds a NEW snapshot; earlier snapshots are kept byte-for-byte (tested). |
| Issued / signed agreements | frozen | Never change. An agreement issued before the change keeps the old Contact line and the old signing address. |
| Notices (workshop assignments, recruitment data) | live | Go to the new address. |

Consequence: **the change must be made BEFORE the agreement is approved and issued** (consistent with Founder decision 9: the draft stays a draft until his signing email and the final preview are confirmed).

## 3a. Identity verification (why this is not just an email reply)
The request came from an address that is not on the account, so on its own it proves nothing about who wrote it. The signing link is the only thing that lets a person sign for the instructor; whoever controls the inbox controls the signature. Before any change:
1. Verify the request through a channel already tied to him: reply to the REGISTERED address (his business address on the account) asking him to confirm the new address, and/or confirm by a call-back to a number held on record (not one supplied in the request). **[AUTH — sending is a separate authorization]**
2. Record the evidence (date, channel, who verified) in the onboarding notes. The existing optional requirement "Identity document sighted and verified" is satisfied already; it does not cover the email.
3. Confirm he understands: his login changes; the agreement's contact and signing address will be the new one; his business address stays only as his business affiliation address (not a party).

## 4. Safe correction procedure (once verified and authorized)
1. **[AUTH]** Founder authorizes the change in writing, naming the exact new address and the verification evidence.
2. Read-only pre-check: current Auth email, that the new address is not already used by another account, onboarding state, draft status (must be `draft`), 0 signature requests.
3. **[AUTH]** Change the Auth email (Supabase dashboard, by the Founder or by me under explicit authorization; mark the new address confirmed only if verification above succeeded). No password or secret is displayed or requested.
4. Read-only post-check: Auth email is the new one; profile unchanged; no other account affected.
5. In the Admin UI the Founder saves Schedule A again on the draft (no values need changing). A new snapshot is added; the three earlier snapshots are untouched. Verify the preview's `Contact:` line shows the new address and the preview hash matches the expected value in the release plan (variant F2).
6. Only then: approve for issue, and later issue. Delivery goes to the new address; verify "email accepted" for both signatories.
7. Send the instructor one confirmation message to the NEW address (separate authorization) — and nothing to the old one beyond the verification message.

## 5. Rollback
- Before issue: change the Auth email back (same steps), save Schedule A again (a further snapshot is added; none are removed).
- After issue: not reversible for that issued document (it keeps the Contact line and signing address it was issued with). This is why the change precedes issue.

## 6. Alternative that avoids changing the login
Keep the account email as the registered business address for the agreement and signing, and use the personal address only for ordinary correspondence. Simpler and fully supported today, but the agreement's contact and the signing link would then use the business address he asked not to use for this engagement. A third option — a dedicated "preferred contact email" field for instructors — would need a migration and is not part of this release.

## 7. Separate issue he raised
His dashboard shows "payment destination" and "facilitator agreement" as pending "but there are no forms or links to complete them". The payment destination is staff-entered (Finance); the agreement is prepared and issued by staff. The portal has no form for either, which is as built, but his message suggests the pending labels are confusing. Worth a short, separately authorized reply explaining what happens next.
