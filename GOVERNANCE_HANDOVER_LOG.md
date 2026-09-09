# Governance Handover Log

**Established:** 2026-07-30, per `GOVERNANCE_HANDOVER_STANDARD.md`. Every entry below is a flag pointing at a real technical record — not a copy of it. Add a new entry the same session a triggering change ships.

**Format:**
```
### [Date] Short title
- **Trigger category:** (from GOVERNANCE_HANDOVER_STANDARD.md §2)
- **What changed (technical):** pointer to the real record — TD-xxx, TDR-xxx, or migration number
- **Why it matters for governance:** the specific governance question this raises
- **Status:** Flagged / Reviewed / Resolved
```

---

### 2026-07-30 (backfilled) — Workshop status field mismatch
- **Trigger category:** Client rights / data accuracy in published policy
- **What changed (technical):** the real `workshop` schema (`src/lib/content/sanity/schemas/workshop.ts`) has five status values (`coming-soon`, `open`, `full`, `closed`, `completed`); the drafted Legal Suite's Part 11.7 describes only three, omitting the waitlist-triggering `full` state.
- **Why it matters for governance:** a published policy describing platform behavior inaccurately is itself a governance/accuracy risk, independent of which values are "correct" — the policy text needs to match reality before publication.
- **Status:** Flagged — already surfaced directly in `LEGAL_REVIEW_REPORT.md` Part C (2026-07-30 QC pass) per your explicit "flag it clearly instead of silently changing it" instruction. Backfilled into this log for continuity now that the formal handover standard exists. Awaiting resolution via Claude Chat's governance track.

---

### 2026-09-06 — Public website went live with no dated milestone entry or documented approval trail

- **Trigger category:** Production configuration change with no governance record
- **What changed (technical):** a 2026-09-06 Pending Production Audit reconciliation found, via direct live checks against `ordiftstudios.com`, that the public site is reachable (not gated by `/coming-soon`) — contradicting every launch/readiness document produced between 2026-07-27 and 2026-08-16, all of which describe public launch as a still-pending, separately-approved gate. See `TECHNICAL_DECISION_RECORDS.md` TDR-018 for the full decision record.
- **Why it matters for governance:** `LAUNCH_CHECKLIST.md`'s own "Launch Day" procedure explicitly required documenting "the actual go-live date and time in `MILESTONES.md`" as its final step — that never happened for whatever transition actually occurred. This means a genuinely significant Production event (the platform becoming publicly reachable) happened with no dated record of when, how, or under what explicit authorization — a real gap in this project's otherwise consistently strong practice of dating and evidencing every significant change. You have since confirmed, this session, that the current live state is intentional and should continue (develop-in-public, per TDR-018) — this flag is about the missing historical record of the transition itself, not a disagreement with the current state.
- **Status:** Reviewed — business decision confirmed and recorded (TDR-018); documentation corrected in place across `ORDIFT_STUDIOS_MASTER_ROADMAP.md`, `LAUNCH_CHECKLIST.md`, `PRODUCTION_READINESS_CHECKLIST.md`, `DEPLOYMENT.md`, `SYSTEM_HEALTH.md`, `CONTENT_READINESS_CHECKLIST.md` (all 2026-09-06). The exact original transition date/mechanism remains unrecoverable and is not expected to be reconstructed retroactively — flagged for the historical record, not for further investigation.

---

### 2026-09-07 (backfilled 2026-09-09) — Partnership referral leads collect a prospect's name and email

- **Trigger category:** Personal-data collection (new field, new form, new data source)
- **What changed (technical):** migration `0063_partnerships_collaborations_v1.sql`'s `partnership_referral_leads` table adds `prospect_name`/`prospect_email` columns — personal data about a referred prospect, who is not necessarily a platform user or account holder at the time it's collected.
- **Why it matters for governance:** this is new personal-data collection about a third party who has not created an account and may never interact with the platform directly — the existing Privacy Notice/legal framework was not written with this data source in mind and should be reviewed against it.
- **Status:** Flagged — backfilled during the 2026-09-09 documentation reconciliation (`TECHNICAL_DEBT_REGISTER.md` TD-066). Awaiting review via Claude Chat's governance track.

---

### 2026-09-07 (backfilled 2026-09-09) — Background Screening and Employment Status: new sensitive staff-data fields

- **Trigger category:** Staff or talent workflows (new HR/talent data fields)
- **What changed (technical):** migration `0065_org_structure_authority_grants_onboarding_v1.sql` adds `public.background_screenings` (Super-Admin-only structured screening status/outcome — never raw sensitive documents, per the migration's own design) and `staff_details.employment_status` (Employment/Engagement status, distinct from `access_status`).
- **Why it matters for governance:** background-screening status is sensitive employment data even in structured/summary form; this is a new HR data category that the existing governance framework has not reviewed.
- **Status:** Flagged — backfilled during the 2026-09-09 documentation reconciliation (`TECHNICAL_DEBT_REGISTER.md` TD-066). Zero real records exist in Production as of this reconciliation (not independently re-verified this pass). Awaiting review via Claude Chat's governance track.

---

### 2026-09-08 (backfilled 2026-09-09) — LEGAL-SYS-1: Signature Engine and Releases/Rights architecture

- **Trigger category:** Data storage (new table holding personal/sensitive data) · File handling (uploads, storage, access control) · Client rights (a client's own agreement/signature/release state, exposed via `/portal/client/legal`)
- **What changed (technical):** migrations `0067`–`0071` (commits `e344519`/`d7a4ae7`/`f086f27`) — `signature_requests`/`signature_signatories`/`signature_events`/`signature_evidence`, `agreement_releases` (Model/Talent, Property/Location, RAW releases, with AI/synthetic-rights categories defaulting to NOT GRANTED), and new party-scoped RLS read policies giving an authenticated client visibility into their own signature state.
- **Why it matters for governance:** this is real legal-agreement and rights-release infrastructure — signature evidence, release scope, and AI/synthetic-rights defaults are all governance-relevant even though the system currently has zero real-world use (migration `0070`'s own comment: "no real agreement has been sent and no real signature request exists"). Founder-confirmed 2026-09-09 as authorized existing work; that confirmation is explicitly not authorization for expansion, wider exposure, or new sensitive-document classes.
- **Status:** Flagged — backfilled during the 2026-09-09 documentation reconciliation (`TECHNICAL_DEBT_REGISTER.md` TD-066). Awaiting review via Claude Chat's governance track.

---

### 2026-09-08 (backfilled 2026-09-09) — Talent Management foundation and Phases 1–5

- **Trigger category:** Staff or talent workflows (explicitly named in `GOVERNANCE_HANDOVER_STANDARD.md` §2 as "relevant from Version 1.1/2.0 onward")
- **What changed (technical):** migrations `0072`–`0073` (commits `af8a8a5`/`d336391`/`d65489d`/`af8c72d`) — new talent-profile data model, public Talent directory (`/talent/[slug]`), Our Roster, Shortlist/Compare, and admin talent-management workflows.
- **Why it matters for governance:** new talent-category personal data (profile/bio/media fields) and a public-facing directory raise the same content-accuracy and consent questions this project's standing discipline already applies elsewhere (no invented bios, no unapproved photos — `PRODUCT_ROADMAP.md` Version 2.0's own release criteria) — worth a governance-track review specifically for whether the public directory's current content meets that bar.
- **Status:** Flagged — backfilled during the 2026-09-09 documentation reconciliation (`TECHNICAL_DEBT_REGISTER.md` TD-066). Awaiting review via Claude Chat's governance track.

---

*Cross-references: `GOVERNANCE_HANDOVER_STANDARD.md`, `TECHNICAL_DEBT_REGISTER.md` (TD-015, TD-066), `LEGAL_REVIEW_REPORT.md`, `TECHNICAL_DECISION_RECORDS.md` (TDR-018).*
