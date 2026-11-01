# DRAFT (for management): retention and deletion of photograph permission evidence

Status: draft for the Founder. It states principles and mechanisms. It deliberately sets NO universal retention period: the periods are decisions that depend on the obligations that apply to Ordift Studios in each place it operates, which management must confirm (the Ghana Data Protection Act, 2012 and the Qatar personal-data privacy law are the likely starting points; they have not been checked here and no counsel has been contacted). Nothing in this draft is active.

## 1. What is held, and why
| Record | Personal data it can contain | Purpose |
|---|---|---|
| Declaration (what a photograph shows) | none (an assessment note) | show a decision was made before use |
| Subject entry | a description of where someone is in the frame, never a name | list who needs permission |
| Permission grant | the name of the person who gave it; relationship or capacity; where their authority is documented; where the evidence is kept; the date; uses; limits; expiry | prove who permitted what |
| Verification / withdrawal rows | where the evidence examined is kept; the reviewer's note | prove the check and the end of permission |
| Erasure log | none (who, when, why) | prove an erasure happened |
Not held by design: identity documents, copies of forms or messages, signatures, dates of birth, contact details of guardians. The evidence stays where it already lives (a job folder, a mailbox, a signed form); the system holds only a reference to it.

## 2. Principles
1. Keep personal details only as long as a permission can still matter: while it is in force, while the photograph is in use, and for a period afterwards needed to show Ordift acted lawfully (period to be set by management; see section 5).
2. Access is restricted to the Founder and authorised executive admins; no client or ordinary staff role can read these records; every action is attributed and dated.
3. Withdrawal, expiry and replacement stop use immediately and automatically; they do not trigger deletion by themselves.
4. Erasure removes personal details and keeps the structure (decision, dates, uses, kind of grantor) so the history of what was decided remains.
5. Supporting files, if one is ever genuinely necessary, are kept only in approved secure storage with the same access rule and the same retention clock. None is stored today.

## 3. Mechanism (built into proposed 0182)
- The tables are append-only. The ONLY way personal fields change is the erasure function, which: requires the Founder or an authorised executive admin; requires a stated reason; refuses a permission that is still in force (it must first be withdrawn, replaced or expired); overwrites only the name, relationship, authority reference, evidence reference and notes with erasure markers; writes a log row; and cannot touch any other column.
- A photograph whose permission was erased and is no longer in force cannot be cleared for use; it needs a new permission.

## 4. Triggers for review (a person, not an automatic job)
a) a permission is withdrawn or replaced; b) a permission expires; c) the photograph is retired from every use; d) a person asks for access, correction or erasure (handled under the Privacy Notice); e) the retention period decided in section 5 has run.

## 5. Decisions management must make before activation
1. The retention period (per jurisdiction, if they differ) after a permission ends and after last use. No period is proposed here.
2. Who runs the periodic review and how often.
3. Whether any supporting file may ever be stored, and in which approved secure store.
4. How a data-subject request that reaches a photograph's subjects is routed (the Privacy Notice contact, once v1.3 is active).
5. Whether the policy needs the review of a qualified adviser (management has said counsel is not to be contacted without instruction).
