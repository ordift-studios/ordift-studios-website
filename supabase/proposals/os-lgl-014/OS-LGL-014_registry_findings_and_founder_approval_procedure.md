# OS-LGL-014 - registry findings and the Founder approval procedure (LOCAL, nothing applied)

Prepared 9 Nov 2026. Read-only inspection of the code in `local/client-service-agreement` and of the two earlier read-only Production snapshots (8 Nov). Nothing was registered, approved, activated, published or issued, and no registry record was changed.

## 1. Can the Founder record the approval directly through the Super Admin profile today?
**No, not through any screen that exists.** The authority is there; the screen is not.

| Step needed for v1.1 | Authority check | Where it can be done today |
|---|---|---|
| Create the v1.1 version row (draft) under OS-LGL-014 | n/a | **Nowhere in the app.** Version rows have only ever been created by migrations (0067 seed, 0081/0082/0125 ingestion pattern). A migration is a Production change. |
| Store the v1.1 Word and PDF masters with fingerprints | n/a | Controlled import process (release package), not a screen. |
| draft -> legal review -> **approved** (stamps the approval date) | contract-administer authority; a Super Admin passes through the override | **Code function only** (`transitionLegalDocumentVersionStatus`). No screen calls it. |
| Register the controlled master (fingerprints, review-marker check) | same | Only inside the onboarding journey screen (`/admin/organization/onboarding/<id>`), which works on the current version of a document in that journey. OS-LGL-014 has no journey. |
| Activate (explicit, separate) | same | Same journey screen only, and it refuses unless the version is the master's *current* version (see 3.3). |
| "Attest historical approval" | same | Journey screen only, and only for a version labelled approved that has **no** stamp. It requires a stored written evidence file of kind signed letter / counsel email / counsel message / message transcript / signed register / other written record, plus an independent identity check of counsel. A telephone consultation recorded by the Founder is not one of those kinds, and it is also the wrong instrument: it verifies counsel's own approval, whereas your decision is the Founder's. |

The public page `/admin/legal` is deliberately read-only ("no forms, no server actions").

## 2. Can I record it for the Founder under the authorized profile?
Technically only in ways I do not recommend, so I will not do either without a fresh, explicit instruction from you.

- **Drive your signed-in browser session.** There is no screen to drive, so there is nothing to click until the screen in section 4 exists and is released.
- **Run a service-role script naming your profile as the actor.** That writes a record in your name that you did not make in the application, skips the typed confirmation, and uses my access to Production. The legal approval should be an act you perform yourself.

What I can do, once the section 4 screen exists: prepare every field from your completed telephone sheet so that you only review, type the confirmation sentence and press the button yourself, signed in as the Founder. That is the same pattern as booking confirmation.

## 3. The precise restrictions
1. **No approve screen** for any version (section 1).
2. **No way to create a v1.1 row** from the app.
3. **The activation guard blocks a successor.** `activateMasterVersion` refuses unless `legal_document_masters.current_version_id` already equals the version being activated. Only the activation itself repoints the pointer, and for OS-LGL-014 the pointer currently sits on the legacy active row (section 5). Activation also does not retire the row being replaced.
4. **The approve transition records no basis.** It stamps `approved_at` and logs who and when, but it neither records that the approval is the Founder's on counsel's advice nor sets `approved_by`, which for the existing seeded rows reads "Legal Counsel".
5. **Phone review is not an accepted attestation evidence kind** (and should not be forced into one).

I did not find any rule that prevents a Super Admin from approving a version; the missing pieces are screens and one guard.

## 4. Smallest compliant adjustment (proposal only; not built)
Three small parts, all local-first, each needing your approval before any Production step:

**A. A controlled "register version 1.1" proposal (migration + import).** Create the 1.1 row as `draft` under OS-LGL-014 with `approved_by` and `approved_at` null, link it to its predecessor in the notes, and attach the stored master files with fingerprints. Rehearsed on the local lab first. It touches no existing row.

**B. One Super Admin action and one small screen: "Record Founder approval on counsel's advice".** It would:
1. Require contract-administer authority **and** that the signed-in profile is the active Founder identity.
2. Require the version to be in legal review, the controlled master registered, and zero unresolved review markers.
3. Require a legal-review record: consultation date (not in the future, not before the version existed); mode fixed to "telephone consultation"; counsel's name and firm; call start and end; how the Founder confirmed they were speaking with counsel; counsel's recommendations, requested amendments and conclusion; and the SHA-256 of the exact final text, which must equal the registered master's hash (if it differs, the screen refuses unless every change is listed and stated to be counsel's recommendation).
4. Require the typed sentence `approve OS-LGL-014 1.1`.
5. Then perform the existing approve transition (so the registry itself stamps the date and time, never back-dated), set `approved_by` to "Founder, on advice of counsel (telephone consultation)", and write one audit entry carrying the full review record, whose basis reads `founder_approval_on_counsel_advice_telephone_review`. Audit identity uses the member number.
6. Never activate, never issue, never publish. Activation stays a separate act.

**C. A small activation-guard change.** Allow activation when the version is the master's current version **or** the newer successor of the active version, and in the same step mark the replaced version superseded and repoint the master. This does not touch the public `/legal/booking` page, which is served from code, not from the registry, and is only changed by a separate release.

Tests would cover: refusal for a non-Founder Super Admin, refusal for a non-Super-Admin, wrong lifecycle state, unregistered master, review markers present, hash mismatch, future or pre-creation consultation date, wrong typed sentence, a second approval attempt, and an audit-write failure leaving nothing changed.

## 5. The two OS-LGL-014 version 1.0 rows (investigated)
Sources: migration `0067_legal_suite_foundation.sql` and the 8 Nov read-only Production snapshot (both rows present, `approved_at` and `activated_at` empty on both). There is no unique constraint on (master, version), which is why two rows can carry the same label.

| | Row A: canonical Official Master 1.0 | Row B: legacy-mapped 1.0 |
|---|---|---|
| Created by | 0067 seed, 8 Sep 2026, for **all 21** masters | 0067 reconciliation, only for OS-LGL-014/015/016/017 |
| Status | approved (seeded label) | **active** |
| Approver label | "Legal Counsel" (recorded in the seed as the Founder's asserted fact that counsel approved all 21 documents) | "Management" |
| Approval date / stamp | none | none |
| Content | **none**: "not yet imported through the controlled import process"; no OS-LGL-014 import migration exists | the existing Master Booking Terms & Conditions, legacy code OS-LGL-004, public page `/legal/booking`, unchanged |
| Effective date | none | the real pre-existing date carried over from the live document |
| Master's current version | not current | **current** (repointed to it by 0067) |

**Relationship:** Row B is what is genuinely live and what the website serves. Row A is a placeholder for an "Official Master" text that the registry holds no copy of. The migration says in terms that Row B is not assumed identical to a future counsel-approved OS-LGL-014 Official Master.

**Consequences for v1.1**
- My v1.0-versus-v1.1 comparison is against **Row B** (the live terms in `src/lib/legal/documents/os-lgl-004-booking.ts`). It is not a comparison against an approved Official Master, because the registry holds none.
- Row A's "approved by Legal Counsel" label has no date and no evidence in the registry. v1.1 must not rely on it.
- **Decision for you (and a question for counsel):** is there a separate counsel-approved OS-LGL-014 Official Master v1.0 document outside the registry? If yes, I should compare v1.1 with that as well. If no, I recommend asking counsel on the call whether Row A should be recorded as superseded by v1.1 (a later registry step, never an edit of either row today).
- v1.1 would be a third row, labelled 1.1, with its own stored files.

## 6. The hard-coded "1.0" (fixed locally, commit f001a97)
Correction to my earlier report: the content reference was **never** derived from the version label. It is built from the stored file paths and SHA-256 values only, so a v1.1 would not have been registered "as 1.0". The defect was narrower: four call sites passed a literal "1.0", the version row's own label was not read, and the instructor issuance path returned a fixed "1.0" label. Fixed by selecting the row's own `version` and passing it everywhere, with tests for a 1.1 version (registration, activation, tamper refusal) and for label-independence of the reference. This change affects no stored data and needs no migration.

## 7. UPDATE 9 Nov (later): the Founder approval screen is built locally
Authorized by the Founder; built and tested on `local/client-service-agreement`; nothing released. It lives at **Legal & Governance -> Document Versions -> "Founder approval: Open"** (`/admin/legal/approval/<version id>`), Super Admin only, and only the active Founder identity sees the forms.
- **Step 1 Start the legal review** (draft -> legal review) and **Step 2 Verify and register the stored master** use the existing registry transition and the existing registration control unchanged.
- **Step 3 Record my Founder approval** (shown only when the version is in legal review, registered, clause-clean and byte-verified): the consultation (date, call times and time zone, counsel's name and firm, how you confirmed you were speaking with counsel), counsel's recommendations and requested amendments, counsel's conclusion, the SHA-256 of the draft counsel heard, how the registered master relates to it, the registered master's hash (you compare it with your sheet and type its first 12 characters), your statement that this is your Founder approval and not a written approval issued by counsel, and the typed sentence `approve OS-LGL-014 1.1`. The system stamps the real time, sets the approver label to "Founder, on advice of counsel (telephone consultation <date>)", and writes one audit entry holding everything. It is set once; if the record cannot be written, the approval is reversed.
- It refuses when counsel's recorded conclusion is that amendments are needed or more time is wanted, when the registered master is not the text counsel heard, and when counsel asked to see the final text and no follow-up is recorded.
- It never activates, publishes or issues. The active version stays current.

### Legal-control conflicts found (nothing bypassed)
1. **The draft as written cannot be registered.** The registry's own marker check finds **20 unresolved markers** in `OS-LGL-014_v1.1_DRAFT.md` (19 `[COUNSEL]` flags plus the "COUNSEL REVIEW" title banner) and refuses with "Nothing was registered" (verified on screen against a synthetic copy). That is correct. After the call, a **clean master** (counsel's decisions incorporated, markers and banner removed) must be produced and stored, and only that is registered and approved. The hash you record as "the draft counsel heard" will therefore differ from the registered master's hash; the screen asks you to say how they relate.
2. **Activation is still blocked after approval.** `activateMasterVersion` refuses a version that is not the master's current version; the current version is the legacy active row, and the existing code also does not retire it. This is the already-reported guard conflict. Not changed: activation was not authorized.
3. **Creating the v1.1 row and storing its master files is still a migration plus a controlled import** (proposal A). The screen cannot create a version.
4. **Approver-label field:** the registry's approve transition does not set `approved_by`; the screen sets it once, only if empty.
