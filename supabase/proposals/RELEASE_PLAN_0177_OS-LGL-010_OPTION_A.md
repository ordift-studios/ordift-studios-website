# Release plan — OS-LGL-010 Option A (instructor agreement signing format) + signatory supersession (migration 0177). LOCAL ONLY: nothing here is authorized, committed, pushed, applied or deployed.

Prepared 31 October 2026 from the Founder's nine decisions. Baseline: `origin/main` = `f2e2305`. `main` deploys to Production automatically; there is no Staging step.

## 1. What ships
| Area | Files | Behaviour |
|---|---|---|
| Option A composer | `src/lib/legal/instructorAgreementDocument.ts`, `instructorMasterSections.ts` | One clean agreement: master title/introduction, one party record, clauses 1-29 verbatim, one Schedule A, Session Schedule statement, signatories. Refuses (never guesses) when the master structure or any required particular is missing. Master blank forms, Schedule F counsel notes and banners are not carried. Term prints "From 1 January 2027 to 31 December 2027". Nationality and phone are stored but never printed. |
| Signature block (counsel-approved) | same | For a signatory recorded with legal capacity `sole_proprietor`: the contracting party is "Alex Sample Name, trading as Ordift Studios"; block = `For Ordift:` / name / `<title> and Sole Proprietor` / `Trading as Ordift Studios`, then a blank line and `Authority: …` as its own line (Founder decision 4). Other entities keep the original one-line form. |
| Address | same + `instructorAgreements.ts` | A stored address `"P.O. Box … \|\| street, area, city, country"` prints the street as *business address* and the box as *postal address*; never "registered address"; a box with no street refuses. |
| Draft refresh | `instructorAgreementIssuance.ts`, `instructorAgreements.ts` | Saving a draft's terms again re-reads the entity registration number/address, the signatory (following supersession to its current entry) and the instructor's name/member number/**account email**, and adds a NEW snapshot. Earlier snapshots are never changed (tested byte-for-byte). Approved/issued agreements are frozen. |
| Signatory supersession | `entityRegistrations.ts` (`supersedeEntitySignatory`), migration 0177 | The only sanctioned way to correct a signatory entry (see §3). |
| Deterministic signing-email order | `instructorAgreementIssuance.ts` | Instructor first, then Ordift, always. Same failure handling, no duplicates, same statuses. Fixes the section-7 end-to-end flake (cause: unordered query). |
| Migration artefacts (proposals folder, not yet migrations) | `PROPOSED_0177…sql`, `ROLLBACK_0177…sql`, `ROLLBACK_0176…sql`, `REHEARSE_0177_body.sql`, `REHEARSE_0176_0177_extra.sql`, `rehearse_0177.sh`, `rehearse_0176_0177.sh`, `PROPOSED_0176_amendment_for_0177.diff` | |
| Procedures / proposals | `PROCEDURE_instructor_account_email_change.md`, `PROPOSAL_instructor_policy_acknowledgements.md` | Documents only. |
| Tests | `instructorAgreementDocument.test.ts`, `phase3Issuance.localdb.e2e.ts`, `signatorySupersession.localdb.e2e.ts` | |

**Explicitly OUTSIDE the release:** the 21 uncommitted rate-card files (`src/app/admin/pricing/rate-card/*`, `src/lib/pdf/rateCard/*`) and `.poc-build/*`. The release patch (`release_candidate.patch`, 19 files + this plan = 20) contains none of them (0 matches), applies cleanly to a clean checkout of `f2e2305`, and passes there (§6). Employee, vendor and general agreement code is unchanged. No application page, no policy record, no gate and no existing data is changed.

## 2. Migration compatibility (0176 and 0177)
- **0176** (`PROPOSED_0176_ghana_admin_enhancements.sql`, not applied, no application code uses it): adds `entity_compliance_reviews` and `entity_signatories.signing_designation`, and **re-creates** the signatory guard. **0177** also re-creates the same guard (adds the controlled end-date).
- **Dependencies:** 0177 needs only 0173 (the signatory table, `legal_capacity`, the guard) and `profiles`/`activity_log`. It does not need 0176. 0176 does not need 0177.
- **Conflict:** the guard is one function; the LAST migration to define it wins. 0176 applied AFTER 0177 would silently remove the end-date clause (the correction path then fails closed with "only the legal capacity, the person link and the signing designation can be set" — rehearsed, mode `neg`). Nothing is corrupted.
- **Order rehearsed on a local scratch database (all inside rolled-back transactions):** `seqA` 0176→0177; `seqB` 0177→0176 *amended* (`PROPOSED_0176_amendment_for_0177.diff`, a 29-line diff that keeps the end-date clause); `neg` 0177→0176 unamended. In every working order: set-once capacity/person/designation still enforced, supersession works and carries `signing_designation` across, the review table stays append-only, **real agreements, snapshots, signature requests and real signatories are unchanged**, superseded history survives each rollback, and each rollback restores the guard of the step before it (0177's rollback restores the 0176 guard when 0176 is present, else the 0173 guard; 0176's rollback keeps the 0177 guard when 0177 is present).
- **Silent-overwrite protection (added at the local commit).** Four static checks in `src/lib/legal/instructorAgreementDocument.test.ts` run with the normal unit suite and fail the build if the guard could be overwritten unnoticed: (1) once 0177 is in `supabase/migrations`, every migration from it onward that defines `private.entity_signatories_guard` must contain the controlled end-date (`ordift.signatory_supersede`); (2) the 0177 proposal must contain the guard clause, the error text and the function; (3) any other pending proposal that redefines the guard without the clause (today: 0176) must have its `_amendment_for_0177.diff`, and that diff must contain the clause; (4) both rollbacks keep the other migration's behaviour. Demonstrated in a scratch copy: 0177 as a migration passes; an UNAMENDED 0176 added as 0178 FAILS naming the file; 0176 carrying the clause passes; removing the amendment while 0176 is pending FAILS. Nothing is renumbered or applied by the commit.
- **Pre-release checklist for 0176 (when it is ever authorized):** apply the amendment diff to the migration file first; confirm the new check (1) passes; re-run `rehearse_0176_0177.sh seqA` and `seqB`; renumber to 0178 or push with `--include-all`.
- **Recommended sequence:** apply **0177 alone first** (it is independent, additive and needed now). 0176 is unrelated to this release and not yet authorized; when it is, it must be amended with the diff above (or released after 0177 with the amended guard) and, because the ledger will then already hold 0177, either renumbered **0178** or pushed with `--include-all`. A gap at 0176 is allowed.
- **Production state:** verified read-only before release (ledger position, signatory-guard identity, absence of the new objects, no duplicate current signatory, baseline fingerprints of agreements, snapshots, signatories and profiles). The observed values are kept in the private release notes, not in this repository.

## 3. Signatory supersession (0177) in one paragraph
`public.supersede_entity_signatory(id, corrected name, reason, date, actor, corrected authority)`, executable by `service_role` only, in ONE transaction: end-dates the old entry (kept, otherwise unchanged), inserts the corrected entry copying every other column (position, capacity, person link, source document, any later column), records `supersedes_id` and the reason, checks exactly one current entry remains for the person, writes the audit event. A blank name or authority means "keep". The guard still refuses every other update and every delete; the end-date can be set once, only inside the function. New rules: one successor per entry; one current entry per person per entity.

## 4. Production data corrections (after the release; each separately authorized)
The exact current and target values are kept in the private release notes (they contain real business and personal details). In outline:
| # | Item | Outline | How |
|---|---|---|---|
| 1 | Business address | corrected spelling; postal box held as its own part (`P.O. Box … \|\| street, area, city, country`) | Super Admin edits the entity in the Admin UI (legal entities) |
| 2 | Signatory name | corrected spelling; title and legal capacity carried over | one `supersede_entity_signatory` call, together with #3 |
| 3 | Authority wording | the Form A-supported wording the Founder approved | same call |
| 4 | Draft refresh | a NEW snapshot; every earlier snapshot stays byte-identical | Founder saves Schedule A in the Admin UI |
| 5 | Affiliation, nationality, phone | unchanged; nationality and phone are never printed and are not presented as verified | none |
| 6 | Account email / preferred correspondence email | per `PROCEDURE_instructor_account_email_change.md` and `RELEASE_PLAN_0178_CORRESPONDENCE_EMAIL.md`; the account email is never changed by this release | separately authorized |
| 7 | The first instructor's draft agreement | stays a draft until the signing email and final preview are confirmed | none |

## 5. Agreement preview verification
Expected previews are built locally from the real master text, the real stored Schedule A and the corrected data, with the real content reference and hash. Content checks pass (clauses 1-29 byte-identical to the master; counsel's three lines exact and contiguous; authority on its own line; no hyphenated name, misspelling or "registered address"; business and postal address as verified; affiliation printed as a stated affiliation only; nationality and phone not printed; term, notice, regulatory status and special terms as stored; no placeholders, Schedules B-F, counsel notes, renewal or 2028).
Two variants exist: **F1** (Contact line = account email) and **F2** (Contact line = preferred correspondence email; differs from F1 only in the `Contact:` line). Their expected SHA-256 values and the preview texts are kept in the private release notes. After the Schedule A save, the Admin preview's SHA-256 must equal the matching value; if not, diff against the text and stop.

## 6. Verification done locally
- Working tree: unit suite 317 files / 5,343 tests pass; typecheck clean; lint 0 errors.
- **Clean checkout of `origin/main` + the release patch only: 312 files / 5,260 tests pass; typecheck clean.** (Fewer tests than the working tree because the rate-card WIP is not included.)
- Real-schema end-to-end on fresh scratch databases: issuance 23 + supersession 10 + workflow 20 = **53 tests, all passing in each of three runs** with 0177 applied; issuance and workflow (43) also pass without 0177.
- Migration rehearsals: 0177 apply and rollback; sequences `seqA`, `seqB`, `neg` (§2).
- Not rehearsed on Production data (never done); the Production guard identity and the absence of duplicates were checked read-only.

## 7. Rollback
| Step | Rollback |
|---|---|
| Migration 0177 | `ROLLBACK_0177…sql` (rehearsed): removes function, indexes, columns; restores the previous guard; superseded rows stay as data. |
| Code deploy | redeploy the previous Vercel deployment (`f2e2305`). The migration is additive, so old code runs against the new schema. |
| Address edit / Schedule A save | edit again / save again (adds a snapshot; none removed). |
| Signatory supersession | not undone: the corrected entry is the record; if wrong, supersede again (history kept). |
| Account email | change back before issue (procedure §5). |
| Issue | cannot be recalled once emails are sent. |

## 8. Order of authorization (each step needs its own explicit written approval)
1. Commit (local only, release files only; stage by explicit paths; verify `git diff --cached --stat` equals these 20 files; no rate-card/`.poc-build`).
2. Read-only pre-checks (ledger = 0175, guard md5, no duplicate current person, draft untouched, `main` deployed = `f2e2305`).
3. Move `PROPOSED_0177…` to `supabase/migrations/0177_entity_signatory_supersession.sql`; confirm the CLI plan lists exactly that file; apply with the established gated script; verify function, grants (anon/authenticated cannot execute), indexes, guard, ledger 0177.
4. Push to `main` (auto-deploy); Vercel Ready; verify deployed commit.
5. Address edit (Admin UI).
6. Supersession call (actor = Founder profile), then read-only verification: one current entry, old entry kept, one audit row.
7. Founder decision on the instructor's account email and, if changed, the verified change (procedure).
8. Founder saves Schedule A (new snapshot); read-only verification of snapshot count, old snapshots unchanged.
9. Compare preview SHA-256 with §5.
10. Decision 9: draft stays a draft until the signing email and final preview are confirmed. Then approve for issue; later, issue (separate authorization).

## 9. Remaining risks / open decisions
Identity of counsel's mailbox (same caveat as before); Registrar address update due at the 2027 renewal (retain proof); the instructor's account email (decision pending); instructor policies (separate proposal, not part of this release); the `rate-card` WIP must not be committed with this release; 0176 numbering/amendment when it is authorized.
