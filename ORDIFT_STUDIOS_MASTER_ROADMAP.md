# Ordift Studios — Master Roadmap

**Established:** 2026-07-30, at your explicit request, as the single executive source of truth across the whole company — not a governance document, not a technical specification. Every section below is a short status summary that links to the real, detailed source rather than duplicating it. If a fact isn't independently verifiable from this environment, it's marked **Unknown** rather than guessed — this document follows the same "never invent facts" discipline as everything else in this project.

**Owner of this document:** Claude Code (Technical Authority). Governance/Brand/Commercial/Marketing sections reflect what's verifiable from the technical repository and prior session history; anything owned by Claude Chat's governance track is marked as such and should be treated as informational, not authoritative, until confirmed there.

**Reconciliation (2026-09-06) — this document is now designated the single authoritative source for one specific fact: whether the public site is currently live, and the general current-phase summary of the platform.** Everything below the "Established" line predates a large amount of real Production work (Payments/Paystack go-live, CRM Lifecycle Automation, Universal Payables, Organizational Architecture, External Workforce Portal, Admin/Founder Overview) and was not kept current through it — that gap is itself recorded as a governance finding, not silently fixed by pretending this document was always current. The **Business** and **Engineering** sections below have been rewritten to reflect the real September 2026 state; other sections (Governance, Brand, Operations, Commercial, Marketing) were left as historical unless directly touched by this reconciliation's scope, and should be treated as **Unknown/unverified past 2026-07-30** until independently re-checked. **Last reconciled against Production: 2026-09-06.**

**Document hierarchy, to prevent this happening again:** this document is authoritative for *"is the platform live, and what phase are we in."* `TECHNICAL_DEBT_REGISTER.md` is authoritative for the itemized technical backlog (add new items there, don't duplicate a list here). `PRODUCTION_READINESS_CHECKLIST.md` and `PRODUCTION_READINESS_RECONCILIATION.md` are historical, closed records of the Aug 2026 payments-go-live chain — not living documents. `LAUNCH_CHECKLIST.md` and `CONTENT_READINESS_CHECKLIST.md` own the content/business launch checklist detail. `SYSTEM_HEALTH.md` owns day-to-day platform health signals. If any of those ever contradicts this document on the live/not-live fact specifically, this document wins.

---

## Business

**Current phase (2026-09-06 reconciliation — historical framing above superseded):** the platform has moved well past the Version 1.0.5 hardening pass this section originally described. **The public website is live.** Confirmed by direct, unauthenticated checks against `ordiftstudios.com` on 2026-09-06 — the homepage, Portfolio, Stories (Journal), Workshops, Booking, and Legal pages all serve real content, not `/coming-soon`. **This is a confirmed, intentional, ongoing business decision, not an accidental gap:** Ordift Studios' public website is meant to stay live and accessible while continued system development, operational expansion, and content population proceed — it is not gated on "finish everything first." The `/coming-soon` page and the `LAUNCH_HOLDING_PAGE` mechanism remain in the codebase as available infrastructure (e.g. for a future maintenance window) but are not the current public state. *(Historical note, preserved rather than deleted: as of 2026-07-30, this section correctly described the site as pre-launch, behind the holding page — that was accurate at the time.)*

Since 2026-07-30, in addition to the hardening work already listed below, substantial new platform capability has shipped to Production: a **Client Portal payments system** (Paystack, live since 2026-08-14/15, including a real completed transaction), **CRM Lifecycle Automation**, a **Universal Payables system** (engagements, payment obligations/instructions/evidence — covering both internal staff and external contractors/vendors/models), an **Organizational Architecture** (Grades, Departments, Positions, Authority Grants, Staff Onboarding), a generalized **External Workforce Portal**, and an **Admin/Founder Overview** command centre. See `MILESTONES.md` for the full dated log and `TECHNICAL_DEBT_REGISTER.md` for what each left open.

**Major milestones (see `MILESTONES.md` for the full dated log):** public brand site, Client Portal, Admin Platform, full Identity & Access Management (7 roles), Grade/Classification/Member Number systems, Google Sheets dual-write durability, production email infrastructure, CAPTCHA, first verified production backup, full Legal Suite **drafted and since approved and published** (Enterprise Legal Series, `OS-LGL-001`–`004`, live since 2026-08-04), Technical Decision Records + Technical Debt Register + Platform Health Review process established, Paystack payments go-live, CRM Lifecycle Automation, Universal Payables, Organizational Architecture, External Workforce Portal, Admin Overview.

**Open priorities, as they actually stand today (not the pre-launch framing above):**
- **Content population** — real projects for 6 of 7 Portfolio departments (only Photography has real content), real Journal articles, real Workshops (`CONTENT_READINESS_CHECKLIST.md`, reconciled 2026-09-06)
- **Business/content confirmations** — contact email/WhatsApp (currently a personal Gmail + UK number), social links (currently empty), pricing display accuracy, final branding, Founder photo (`LAUNCH_CHECKLIST.md`, reconciled 2026-09-06)
- **Operational proof, not more engineering** — TD-046 (automatic refund path built, awaiting one genuine real-world refund to prove it) and the Organizational Architecture/Staff Onboarding module (fully built, zero real onboarding/authority-grant/requisition rows in Production as of 2026-09-05) both need real-world use, not further code
- **Tier 1 Technical Hardening — CLOSED (2026-09-06).** All seven items implemented across three independently deployed and verified batches (commits `b53ae8a`, `52cb80a`, `0fbb782`):
  | Item | Status |
  |---|---|
  | `/studio` noindex | ✅ PASS |
  | `X-Powered-By` removal | ✅ PASS |
  | HSTS (`max-age=86400; includeSubDomains`) | ✅ PASS |
  | Dead-code cleanup (`content/local/repository.ts`, `pulseData.ts`) | ✅ PASS |
  | Holding-page allowlist boundary fix | ✅ PASS |
  | Turnstile configuration hardening | ✅ PASS — including a real human Production login, post-deploy, in a clean Chrome Incognito session |
  | ISR / on-demand revalidation (4 SSG routes, 1-hour interval) | ✅ Implementation PASS; real-content behavioral verification **pending** — tracked as `TECHNICAL_DEBT_REGISTER.md` TD-062, to be exercised the first time a genuine Journal/Workshop item is published |

  One unrelated, pre-existing defect was found incidentally during verification (a nonexistent `/journal/[slug]` returns HTTP 500 instead of 404) — not caused by this phase, not fixed under this authorization, tracked as `TECHNICAL_DEBT_REGISTER.md` TD-061.
- The Version 1.1 (Internal Organization/Grade) freeze mentioned below has, in substance, already been superseded — that work (Organizational Architecture) has shipped. Treat the "Version 1.1 stays frozen" line immediately below as historical.

---

## Engineering

**Overall completion:** the last full readiness scoring (`FINAL_LAUNCH_CERTIFICATION.md`, 2026-07-30, **before** Version 1.0.5 began) recorded Technical 99% / Business 92% / Security 97% / Performance 90% / Operations 100% / **Overall 96%**. This was never re-scored after Version 1.0.5 closed, and a huge amount of further engineering has shipped since (see Business section above) — **this score should be treated as historical, not current.** No fresher formal score exists as of this 2026-09-06 reconciliation; producing one would be a genuine future exercise, not something this documentation-only pass fabricated.

**Current workstream (2026-09-06 correction):** the "Workstream B (CI pipeline)" line this section previously carried is stale — CI, and every workstream through at least J, are long since complete (`PRODUCT_ROADMAP.md`, `MILESTONES.md`). The most recent substantial engineering work, in order: Universal Payables (engagements/payment obligations/instructions/evidence), Organizational Architecture (Grades/Departments/Positions/Authority Grants/Staff Onboarding), External Workforce Portal generalization, Internal Staff Onboarding safeguards, an intermittent-Turnstile-failure investigation (root-caused to Cloudflare's own documented retryable bot-heuristic, not a code defect — a narrow retry-UX fix shipped), and the Admin/Founder Overview command centre. See `MILESTONES.md` for the dated log — this document does not duplicate it.

**Bugs:** none currently open, as of this reconciliation. Historical: one real bug (a test-cleanup race condition, TD-016) was found and resolved during Workstream A; several others have been found and resolved across later phases (see `TECHNICAL_DEBT_REGISTER.md`'s Resolved entries, e.g. TD-058, TD-059).

**Technical debt:** `TECHNICAL_DEBT_REGISTER.md` is the current authoritative count and detail — it has grown substantially past the "16 tracked items" this section previously stated (through TD-060 as of 2026-09-06) as the platform itself has grown; most remain Low/Medium severity with a stated pay-down trigger, and none are launch-blocking, since public launch already happened.

**Platform readiness:** the public site is live (see Business section above) — `LAUNCH_CHECKLIST.md` is kept as the historical Before Launch / Launch Day / After Launch record and current content/business checklist, not a pending gate. `TECHNICAL_DECISION_RECORDS.md` holds the reasoning behind every major architectural choice, including the 2026-09-06 decision to develop in public.

---

## Governance

**Constitution status:** **Unknown from this environment.** Governance documentation (including any company constitution) is owned by Claude Chat per the 2026-07-30 workflow split — not independently verifiable here. Confirm directly with that track.

**Legal framework status:** `ORDIFT_STUDIOS_LEGAL_SUITE_v1.md` (11 parts) is drafted but **not approved or published** (`isApproved: false` on all live legal pages, both datasets). Per `LEGAL_REVIEW_REPORT.md`'s Executive Readiness Dashboard (2026-07-30): Documentation Architecture 95%, Platform Accuracy 90%, Technical Verification 100%, **Business Policy Completion 25%**, **Legal Review Status 0%** (no qualified legal review has occurred, by design).

**Policies:** Privacy Notice, Booking Terms, Cookie Notice, Website Terms, Media Usage & Portfolio Policy, IP Policy, AI & Digital Workflow Policy, Client Portal Terms, Workshop Terms — all drafted, none published.

**Reviews:** two open, named risks per `LEGAL_REVIEW_REPORT.md` Part B — model/property release handling, and international data transfers — flagged as needing resolution or conscious acceptance before real client work accumulates against undocumented terms. One known technical/legal documentation drift (the Workshop status field describing 3 values vs. the real schema's 5) is tracked in `GOVERNANCE_HANDOVER_LOG.md`, awaiting resolution via Claude Chat.

---

## Brand

**Identity:** locked — Fraunces (display) + Inter (body/UI) typography, navy (`#0B1220`)/gold (`#BFA14A`) palette, approved anchor statement: *"Ordift Studios is a multidisciplinary creative house where photography, film, design, branding, content and talent work as one connected system."*

**Mission/Vision/Values status:** approved and live on the public site (About page) — drafted from your brief, reviewed before publication, per this project's standing content-accuracy discipline.

**Guidelines:** the Brand Bible (built early in this engagement) is the source document for identity/typography/color/voice guidelines.

---

## Operations

**SOPs:** `OPERATIONS_MANUAL.md` (Daily/Weekly/Monthly checklists, System Administration routing), `MAINTENANCE_SCHEDULE.md` (Daily→Annual cadence), `ADMIN_GUIDE.md` (roles/permissions/account lifecycle/troubleshooting).

**Client onboarding:** informal today — via portal signup (`/portal/signup`) and the enquiry/booking flow. **No dedicated client-onboarding SOP document exists yet** — noted honestly rather than assumed.

**Internal processes:** `DISASTER_RECOVERY.md` (backup/restore procedure), `INTEGRATION_TESTING_STRATEGY.md` and `ENGINEERING_GUIDE.md` (engineering process), `GOVERNANCE_HANDOVER_STANDARD.md` (technical-to-governance handoff).

---

## Commercial

**Pricing:** displayed on the public site (budget-range selector on the enquiry form; department pages) — **exact current wording not re-verified as part of this document's creation.** `LAUNCH_CHECKLIST.md` lists "pricing information accurate wherever shown" as an open Before Launch content item; confirm there before treating pricing as final.

**Payments (2026-09-06 correction — the line below was accurate on 2026-07-30 and is no longer current):** Paystack is integrated and live in Production, since 2026-08-14/15, including a verified real completed transaction. A full Universal Payables system (engagements, payment obligations/instructions/evidence, manual-payment recording and automatic refund-webhook reconciliation) covers both client payments and external-workforce compensation. See `PAYSTACK_PRODUCTION_HANDOVER.md` and `TECHNICAL_DEBT_REGISTER.md` (TD-046) for current detail — TD-046 specifically notes the automatic refund path is built but not yet proven against a genuine real-world refund. *(Historical, as originally written: "no payment gateway is integrated anywhere in the codebase... All bookings are manual-confirmation, no online payment exists today" — true as of 2026-07-30, per `TECHNOLOGY_COST_REGISTER.md` and the then-retired "Version 3.0 — Commerce" section of `MILESTONES.md`.)*

**Launch readiness:** see `LAUNCH_CHECKLIST.md` for the single canonical Before Launch / Launch Day / After Launch runbook — do not duplicate its content here.

---

## Marketing

**Portfolio:** 100% `[SAMPLE]` placeholder content across Portfolio, Journal, and Workshops (verified, `CONTENT_READINESS_CHECKLIST.md`) — real content is a launch-blocking content gap, not a technical one.

**Website readiness:** technically complete per Launch Candidate 1 (`LAUNCH_CANDIDATE_1.md`); content readiness is the remaining gap (above).

**Social content:** social media links are confirmed **empty** on both staging and production Sanity datasets (`DOCUMENTATION_INDEX.md` §4) — a genuine open decision (add real accounts, or confirm the empty state is intentional for launch), not yet made.

**Launch campaign:** **not started** — no evidence of any marketing/launch-campaign work in this repository or session history. This is expected; campaign planning sits outside this environment's technical scope.

---

## Launch Checklist

The full Before Launch / Launch Day / After Launch runbook lives in **`LAUNCH_CHECKLIST.md`** — this document does not duplicate it. **Public launch has already happened, confirmed 2026-09-06, as an intentional decision to develop and populate content in public rather than gate everything on a single go-live date** — see the Business section above. The former Turnstile gap has since been satisfied by real live use. Content and Business items (real portfolio/journal/workshop content, contact/social/pricing/branding confirmations) remain genuinely open, but as ongoing work on a live site, not a pre-launch blocker.

---

*This document is maintained alongside major milestones — update it when a section's status materially changes, not on a fixed schedule, matching the convention already used by every other living document in this project (`DOCUMENTATION_INDEX.md`, `MAINTENANCE_SCHEDULE.md`). Cross-references: `PRODUCT_ROADMAP.md`, `LAUNCH_CHECKLIST.md`, `TECHNICAL_DEBT_REGISTER.md`, `TECHNICAL_DECISION_RECORDS.md`, `LEGAL_REVIEW_REPORT.md`, `GOVERNANCE_HANDOVER_LOG.md`, `DOCUMENTATION_INDEX.md`.*
