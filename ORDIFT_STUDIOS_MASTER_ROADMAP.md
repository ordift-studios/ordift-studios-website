# Ordift Studios — Master Roadmap

**Established:** 2026-07-30, at your explicit request, as the single executive source of truth across the whole company — not a governance document, not a technical specification. Every section below is a short status summary that links to the real, detailed source rather than duplicating it. If a fact isn't independently verifiable from this environment, it's marked **Unknown** rather than guessed — this document follows the same "never invent facts" discipline as everything else in this project.

**Owner of this document:** Claude Code (Technical Authority). Governance/Brand/Commercial/Marketing sections reflect what's verifiable from the technical repository and prior session history; anything owned by Claude Chat's governance track is marked as such and should be treated as informational, not authoritative, until confirmed there.

---

## Business

**Current phase:** Version 1.0 (production baseline) is feature-complete and architecture-frozen. Version 1.0.5 (Platform Foundation Hardening) is in progress — Workstreams E, F, and A are complete; Workstream B is in progress as of this document's creation. The public site remains behind `LAUNCH_HOLDING_PAGE`; no real visitors have reached it yet.

**Major milestones (see `MILESTONES.md` for the full dated log):** public brand site, Client Portal, Admin Platform, full Identity & Access Management (7 roles), Grade/Classification/Member Number systems, Google Sheets dual-write durability, production email infrastructure, CAPTCHA, first verified production backup, full 11-part Legal Suite drafted (not approved), Technical Decision Records + Technical Debt Register + Platform Health Review process established.

**Open priorities:**
- Complete Version 1.0.5 (Workstreams B through G — see `PRODUCT_ROADMAP.md`)
- Business decisions still needed before launch: Legal Suite review/approval (Claude Chat), Portfolio/Journal/Workshops real content (`CONTENT_READINESS_CHECKLIST.md`), contact/social-links confirmation, pricing display accuracy confirmation
- Version 1.1 (Internal Organization/Grade) onward stays frozen until Version 1.0.5 formally closes, per your explicit instruction

---

## Engineering

**Overall completion:** the last full readiness scoring (`FINAL_LAUNCH_CERTIFICATION.md`, 2026-07-30, **before** Version 1.0.5 began) recorded Technical 99% / Business 92% / Security 97% / Performance 90% / Operations 100% / **Overall 96%**. This has not been re-scored since — Version 1.0.5 is additive platform-hardening work layered on top of that baseline, not a response to a regression. A fresh score is due once Version 1.0.5 closes.

**Current workstream:** Version 1.0.5, Workstream B (CI pipeline) — see `PRODUCT_ROADMAP.md` for the full A→B→C→I→H→J→D→G sequence and `MILESTONES.md` for dated progress entries.

**Bugs:** none currently open. One real bug (a test-cleanup race condition, TD-016) was found and resolved same-session during Workstream A.

**Technical debt:** 16 tracked items (`TECHNICAL_DEBT_REGISTER.md`) — 1 Resolved, 15 Open (mostly Low/Medium severity, each with a stated pay-down trigger; none block launch).

**Platform readiness:** `LAUNCH_CHECKLIST.md` is the authoritative Before Launch / Launch Day / After Launch runbook. `TECHNICAL_DECISION_RECORDS.md` holds the reasoning behind every major architectural choice.

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

**Payments:** no payment gateway is integrated anywhere in the codebase (verified — confirmed via `TECHNOLOGY_COST_REGISTER.md` and the retired "Version 3.0 — Commerce" section of `MILESTONES.md`, explicitly excluded, not scheduled). All bookings are manual-confirmation, no online payment exists today.

**Launch readiness:** see `LAUNCH_CHECKLIST.md` for the single canonical Before Launch / Launch Day / After Launch runbook — do not duplicate its content here.

---

## Marketing

**Portfolio:** 100% `[SAMPLE]` placeholder content across Portfolio, Journal, and Workshops (verified, `CONTENT_READINESS_CHECKLIST.md`) — real content is a launch-blocking content gap, not a technical one.

**Website readiness:** technically complete per Launch Candidate 1 (`LAUNCH_CANDIDATE_1.md`); content readiness is the remaining gap (above).

**Social content:** social media links are confirmed **empty** on both staging and production Sanity datasets (`DOCUMENTATION_INDEX.md` §4) — a genuine open decision (add real accounts, or confirm the empty state is intentional for launch), not yet made.

**Launch campaign:** **not started** — no evidence of any marketing/launch-campaign work in this repository or session history. This is expected; campaign planning sits outside this environment's technical scope.

---

## Launch Checklist

The full Before Launch / Launch Day / After Launch runbook lives in **`LAUNCH_CHECKLIST.md`** — this document does not duplicate it. As of 2026-07-30, every Technical item there is checked except the one real-widget Turnstile verification (structurally blocked until the holding page comes down, by design). Content and Business items remain the primary gap to public launch.

---

*This document is maintained alongside major milestones — update it when a section's status materially changes, not on a fixed schedule, matching the convention already used by every other living document in this project (`DOCUMENTATION_INDEX.md`, `MAINTENANCE_SCHEDULE.md`). Cross-references: `PRODUCT_ROADMAP.md`, `LAUNCH_CHECKLIST.md`, `TECHNICAL_DEBT_REGISTER.md`, `TECHNICAL_DECISION_RECORDS.md`, `LEGAL_REVIEW_REPORT.md`, `GOVERNANCE_HANDOVER_LOG.md`, `DOCUMENTATION_INDEX.md`.*
