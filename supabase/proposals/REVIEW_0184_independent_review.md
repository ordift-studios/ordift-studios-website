# Independent read-only review of migration 0184 (2 Nov 2026)
Reviewed: the actual revision-2 SQL (sha256 050fcd4d7766585f842a09ba51b37a47488fa81ade801dd1ad80f55dee598315, confirmed unchanged), its rollback and rehearsal, against the live Production baseline (ledger 0183/175; the dependencies and the four triggers to be replaced exist; the five affected tables hold 0 rows). Nothing in Production was changed.

Result: no critical or high SQL defect. Four medium and several low findings led to a REVISION 3 candidate (not approved, not deployed).

## Findings
| Level | Finding | Correction |
|---|---|---|
| Critical | none | |
| High (legal, not SQL) | Ghanaian and Qatari assumptions below are unresolved: they must be cleared by qualified advice BEFORE any real erasure or purge, not before applying the migration | see list |
| Medium | M1. The erasure checked "not in force" and then updated without locking the grant row; a concurrent verification could slip in between | rev3: select ... for update on the grant |
| Medium | M2. A hold placed while a purge runs could be missed | rev3: the purge locks the two hold tables (share row exclusive) |
| Medium | M3. Hold-log rows were protected only by a hold at their own level: a file-level log row could be purged while its job was held, and a job-level log row while one of its photographs was held | rev3: protected by a hold at either level (two new helper functions) |
| Medium | M4. The retention clock started at the LATER of a withdrawal and a past expiry; the policy is the permission's end, i.e. the earliest end event (and a person removed from the photograph left their grant "in force") | rev3: ended = earliest of withdrawal/replacement, past expiry, removal; a removed person's grant is not in force |
| Medium | M5. The permanent purge audit references the administrator by profile id (a pseudonymous identifier of a person) and is kept forever | justified, see below; defined review mechanism recommended (policy, no SQL) |
| Medium (application, not SQL) | M6. The dormant application code still calls the four-argument erasure function that 0184 replaces; it must be moved to the five-argument signature in the same release as 0184 and before SUBJECT_PERMISSIONS_ENABLED is ever switched on | code change prepared only after approval |
| Low | L1. p_actor is supplied by the calling server; the database checks that person's authority but cannot authenticate the session (the same trust model as 0170-0183; protected by the service key) | document; no change |
| Low | L2. The audit's purged_by foreign key would block deleting that administrator's profile | document; profiles are not deleted |
| Low | L3. A later policy row that shortens the period makes more rows eligible at once; purge stays manual, confirmed and audited (the audit records the years used) | document; consider requiring a second look when the policy is shortened |
| Low | L4. After a log row is purged, an erased permission has no record of its erasure basis | accepted consequence of the policy |
| Low | L5. "Last authorised use" counts any use of the photograph, not only the uses this permission covered; this only lengthens retention | conservative; no change |
| Low | L6. Verifying an already-erased grant is not blocked by the applied 0182 guard | no effect on eligibility beyond the normal rules; note |

## Checks you asked for
- Retention eligibility: basis required; retention basis needs a recorded policy and the period; other bases skip the period only. In force, covered current use, photograph-level and job-level holds block every basis (tests 3, 4a, 6a, 6b, 7, 7b).
- Management-only: every new function is executable only by the service role and checks private.is_portfolio_authority(p_actor); purge also needs a fixed reason code and an explicit confirmation.
- Atomicity: the deletion and the permanent audit row are one function in one transaction; a forced audit failure undoes the deletion (test 9d2).
- No automatic deletion: only the purge function deletes from the four log tables and no scheduled job refers to it (test 7c). No top-level data statement exists in the file (only DDL and function bodies).
- Existing records: no UPDATE/INSERT/DELETE at top level; the added column and trigger swap touch four EMPTY tables; permission records, agreements, evidence, instructor records and the activity log are not referenced by any statement that runs on application.
- Eligibility and append-only safeguards: the eligibility function is untouched; the 0182/0183 append-only guards still refuse edits and deletes (test 7d).
- Rollback and rehearsal against the 0183 baseline: rollback restores the exact 0182 function and the original triggers; the 0183 rehearsal and the 0182 revision-2 rehearsal still pass afterwards.

## Permanent purge audit: personal data and retention
Contents: table name, row count, cutoff date, policy years, a fixed reason CODE, a confirmation flag, who (profile id) and when. No free text and nothing about the people in photographs. The only personal data is the administrator's pseudonymous identifier. Keeping it is justified by accountability (it evidences that lawful erasures were carried out and by whom) and is limited to the Founder or an authorised executive admin acting in a business capacity. "Indefinite" should nevertheless be a DEFINED mechanism: the Founder's annual retention review includes the purge audit; keep it for the life of the compliance record; if advice later requires, pseudonymise purged_by by a separate, separately approved migration (not purge the audit).

## The six-year period
It is an internal management policy choice (Option C), recorded by management in portfolio_retention_policy (nothing is seeded). It is not presented as a Ghanaian or Qatari statutory period; the SQL treats it as a configurable value, and holds and the non-retention bases handle longer or shorter legal requirements.

## Legal assumptions needing qualified advice before any real erasure or purge
1. Limitation periods: Ghana Limitation Act 1972 (ss.2-5 only partly retrievable; contract 6 years per secondary sources) and Qatar Civil Code (Art. 219 verified: 3 years from knowledge, 15 years from the act; Arts. 403-418 general prescription not retrieved): whether six years can defeat a legitimate claim.
2. Ghana Act 843 s.24(4): a record used to make a decision about a data subject must be kept long enough to let them request access; whether permission evidence counts, and for how long.
3. Ghana s.37 and Qatar Art. 16 (children's data as special): whether erasing guardian-permission evidence conflicts with the duty to be able to show permission for material still in use.
4. Qatar PDPPL Arts. 5, 6, 11(4): any prescribed time to answer an erasure request and any duty to notify; whether a hold or an in-use block may lawfully delay a valid request.
5. Whether keeping hold logs, erasure logs and the purge audit (with administrator identifiers) is itself lawful and for how long.
6. Registration and permit status in both countries (Ghana registration answer pending; Qatar Art. 16 answer pending) as preconditions to processing at all.
