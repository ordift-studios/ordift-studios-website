# Release plan — Preferred Correspondence Email (migration 0178 + application). LOCAL ONLY: nothing here is authorized, pushed, applied or deployed.

Prepared 31 October 2026 from the Founder's approval of the dedicated correspondence-email feature. Built as its OWN commit on top of the OS-LGL-010 Option A release commit `a7d1e72`.

## 1. What it does (and does not)
- **Account Email — Used for Login** is the Supabase Auth email. It is read-only everywhere in this feature. Login, password reset and agreement signing links always use it.
- **Preferred Correspondence Email — Used for Communication** is what a person asked Ordift to use for ordinary correspondence. It is recorded by an authorized administrator with a source and a short evidence reference, is shown as *unverified*, and never replaces the account email.
- Authorized administrators can **record, change or clear** it. Every action is a NEW row in an append-only history; nothing is edited or deleted.
- The agreement **Contact line** prints the preferred email when one is recorded, otherwise the account email. Nothing else in the agreement changes (clauses 1–29, the party record, Schedule A and the signature block are identical with or without a preference — tested).
- **Not changed:** Supabase Auth accounts, passwords, login, password reset, signing-link recipients, the approved master, any existing agreement or snapshot.

## 2. Files (new commit)
| Area | Files |
|---|---|
| Database (proposal, not a migration yet) | `supabase/proposals/PROPOSED_0178_profile_correspondence_emails.sql`, `ROLLBACK_0178_…sql`, `REHEARSE_0178_body.sql`, `rehearse_0178.sh` |
| Server module | `src/lib/organization/correspondenceEmail.ts` |
| Screens | `src/app/admin/organization/ContactEmailLines.tsx` (read-only lines), `src/app/admin/organization/people/[id]/CorrespondenceEmailPanel.tsx` (lines + record/change/clear form), edits to `people/[id]/page.tsx` and `people/[id]/actions.ts`, and `onboarding/[onboardingId]/page.tsx` (read-only lines on external-contributor onboardings) |
| Agreement | edits to `instructorAgreementDocument.ts` (Contact line), `instructorAgreements.ts` (draft's first snapshot and the refresh read the preference), `instructorAgreementIssuance.ts` (Schedule A save merges it) |
| Tests | `correspondenceEmail.test.ts`, `correspondenceEmailIsolation.test.ts`, `instructorAgreementDocument.test.ts` (Contact-line tests), `src/lib/legal/correspondenceEmail.localdb.e2e.ts` |
| This plan | `RELEASE_PLAN_0178_CORRESPONDENCE_EMAIL.md` |

## 3. Database (migration 0178)
One additive table `public.profile_correspondence_emails`: person, email (NULL = cleared), source (`person_request` or `staff_entered`), evidence note (a short reference, 10–500 characters; the database refuses an address or a run of 7+ digits in it), recorded-by, timestamp (`clock_timestamp()`, so entries in one transaction still have a strict order). The current preference is the latest row. A guard trigger makes the table append-only (update and delete raise). **Database privacy:** no signed-in role has any privilege on the table (`anon` and `authenticated` are revoked entirely; row-level security stays on with no policy), so nobody can retrieve an evidence note, administrative metadata, history or another person's record through the API. The only read available to a signed-in person is the parameterless security-definer function `public.my_correspondence_email()`, which answers from the caller's own identity (`auth.uid()`) and returns that ONE current address (or NULL when none or cleared); `anon` cannot execute it. Authorized administrators work through server code (service role, after the application's people-management authority check); the service role can only select and insert. A direct read by a Super Admin through a signed-in session is no longer possible by design (admin screens use the service role). No existing table, function, row or grant is touched.

## 4. Compatibility with the pending migrations (0176, 0177) and numbering
- **No shared objects.** 0178 does not touch `private.entity_signatories_guard()` or any signatory object, so it has **no ordering conflict** with 0176 (Ghana administrative enhancements) or 0177 (signatory supersession).
- **Rehearsed** (`rehearse_0178.sh`, local scratch database, rolled-back transactions): 0178 alone; 0178 with rollback (table, guard and function gone, nothing else changed); both full orders — 0176→0177→0178 and 0178→0177→0176(amended) — each with the 0177 rehearsal body re-run afterwards, the signatory guard compared before and after (unchanged) and each rollback in turn. All pass.
- **Numbering.** If 0178 were applied before 0177, the ledger would hold 0178 and a later 0177 would need `--include-all` (or a renumber). Recommended order is 0177 first, then 0178; the Founder may instead renumber at release. Nothing is renumbered or applied by the commit.
- **Code before migration is safe.** The application treats an unreadable table as UNKNOWN (never "no preference"): the screens show the two lines with "not available yet", recording is refused, and the agreement keeps whatever its snapshot already holds. Verified: the instructor end-to-end suites pass with the table absent (current Production schema), with 0177 only, and with 0177 + 0178.
- **Depends on `a7d1e72`** for the agreement integration only: the Contact line and the Schedule A refresh live in the Option A composer. The table, module and screens are independent of it.

## 5. Security verification
| Requirement | Verified by |
|---|---|
| Access control and authorization | Unit: only people-management authority can read or record, ordinary staff are refused and nothing is written, an unauthorized viewer receives nothing. Real schema: Super Admin allowed through the application, staff refused; **database level: every column read, `select *`, count, insert, update, delete and truncate on the table is refused for staff, the person and Super Admin alike; `anon` is refused; `my_correspondence_email()` returns only the caller's own current address (another person, or Super Admin without an own entry, gets none), takes no parameter, and cannot be executed by `anon`.** |
| Email-format validation | Unit (accepts one plain address, lower-cased; rejects lists, names, spaces, bad dots/labels/TLD, over-length) and database check constraint (real schema). |
| Append-only history | Unit; real schema (update and delete refused, set → change → clear keeps three rows, history is returned newest first). |
| Audit-log masking | Unit and real schema: the shared audit log receives `q***4@g***.com`-style values and a flag that evidence was recorded; never a full address, never the evidence text. |
| Privacy of evidence notes | Application validation and database constraint refuse an address or a long number; notes are visible only to authorized administrators on the people page; history shows addresses masked (only the current preference is shown in full). |
| Account-email fallback | Unit and real schema: no preference, cleared, or blank → the account email is used. |
| Agreement Contact-line rendering | Unit (preferred / fallback / Not stated / placeholder refused / only the Contact line differs) and real schema (preview and issued document). |
| Preservation of historical snapshots | Real schema: saving after a change adds ONE snapshot; every earlier snapshot is byte-identical; an issued agreement is unchanged by a later change. |
| Signing-link isolation | Static checks fail the build if login, password reset, signature or issuance code mentions the preference, if the issue-for-signature path reads it, or if anything but the allow-listed screens imports the module; real schema: after issue the two signing emails went to the ACCOUNT emails of the instructor and the Ordift signatory, none to the preferred address, and no Supabase Auth write of any kind occurred. |
| Auth account never written | Unit and static: no `updateUserById`/Auth write in the module, its screens or its action; the account email is rendered read-only (no input bound to it). |
| Migration rollback | `ROLLBACK_0178` rehearsed (alone and inside the three-migration orders). It drops the history; the application never reads it for login or signing, and agreement snapshots keep their Contact value. |

## 6. Impact on the first instructor's draft
None by the commit. No preference exists, so the draft's Contact line stays the account email. Nothing changes until, after release, (1) an authorized administrator records a preference with evidence and (2) the Founder saves Schedule A again; that adds a new snapshot (earlier ones byte-identical) and the Contact line then shows the preferred email. The signing link recipient stays the account email in every case. Expected preview hashes are kept in the private release notes.

## 7. Recommended Production order (each step needs its own explicit written authorization)
1. Release the Option A commit `a7d1e72` per `RELEASE_PLAN_0177_OS-LGL-010_OPTION_A.md` (migration 0177, then push).
2. Pre-checks for 0178 (read-only): ledger, no existing `profile_correspondence_emails`, deployed commit.
3. Apply `0178_profile_correspondence_emails.sql` (already a migration after the migration-preparation commit) with the established gated script; verify the table, guard, row-level security (enabled, no policy), privileges (anon/authenticated none; service role select/insert only), the own-address function (authenticated execute only; parameterless; security definer; fixed search path) and an empty table.
4. Push the feature commit (or both commits together; the code tolerates the table being absent); verify the deployed commit.
5. Read-only: the people page shows the two labelled lines for an instructor; "no preference recorded".
6. Founder decision, then (separately authorized) the first record, with source and evidence reference.
7. Founder saves Schedule A on the draft; compare the preview hash with F2.
8. Draft stays a draft until the signing email and final preview are confirmed (decision 9).

## 8. Rollback
Migration: `ROLLBACK_0178` (drops the table; export rows first if any exist). Code: redeploy the previous deployment. A recorded preference is never edited; clear it (a new row) or leave it. No effect on authentication or signing.

## 8a. Instructor portal contact card (separate local commit, built on this one)
A read-only card, "Your contact emails", on `/portal/collaborator` and `/portal/instructor` (both branches of the instructor page, so a person with no workshop engagement yet also sees it). It shows the signed-in person's account email and preferred correspondence email, with the fallback "Not set (Ordift uses your account email)" and "Not available yet" when the record cannot be read. It has no form, input, button or link. The loader calls ONLY `public.my_correspondence_email()` through the person's own session (never the table, never the service-role client), so the page cannot select an evidence note, who recorded it, the source or the history, and cannot ask about another person.

## 9. Remaining decisions
Order and numbering relative to 0177 (and 0176 if it is ever authorized); whether the instructor portal should later show the person their own two lines (read-only was proposed, not built); whether a person may later request a change themselves (needs a confirmation step; not built); retention of history rows (kept indefinitely today).
