# Ordift Studios — Product Roadmap

**Established:** 2026-07-27
**Status:** the authoritative long-term planning document for Ordift Studios' evolution beyond the v1.0 production baseline. This **supersedes** the earlier illustrative roadmap sketches in `VERSIONS.md` and `MILESTONES.md` (both now point here — see §8, Documentation Index cross-references, for exactly what changed).

**Purpose:** separate day-to-day production maintenance from long-term platform evolution. Version 1.0 is now a stable, frozen production baseline (see `PRODUCTION_READINESS_REPORT.md`); everything below is *planned future work*, not committed or scheduled until each version is explicitly approved to begin.

**How to read this document:** each version lists Vision, Objectives, Features, Dependencies, Estimated Complexity, Risks, Release Criteria, Priority, and where it sits in the Suggested Implementation Order. Nothing here is a commitment to build — it's a shared reference so every future request gets evaluated against the same long-term picture instead of in isolation.

---

## Version 1.0 — Current Production Launch *(baseline, complete)*

**Status:** ✅ Stable production baseline, as of 2026-07-27.

**Vision:** establish Ordift Studios as a fully operational multidisciplinary creative house online — public site, content platform, client portal, admin platform, and the identity/access/email infrastructure needed to run it safely with real users.

**What's included:** the public brand site (Sanity-driven), Client Portal (dashboard, deliverables, requests, project workspace), Admin Platform (CRM, bookings, content hub, users & roles, activity log), full Identity & Access Management (Super Admin/Admin/Staff/Contractor/Vendor/Model/Client roles, suspend/deactivate/expire/restore lifecycle, project-scoped collaborator access), and production email infrastructure (Resend, branded auth emails, SPF/DKIM/DMARC verified).

**Remaining before full public launch** (tracked in `MILESTONES.md`, not this roadmap — these are production-hardening tasks, not new product versions): Google Sheets data-durability integration, CAPTCHA on public forms, backup/restore verification, and the final Launch Readiness Go/No-Go review. See `PRODUCTION_READINESS_REPORT.md` §2 and §7 for the current state of each.

**🟡 Pending Owner Decision** (explicitly deferred 2026-07-27 so infrastructure decisions don't block feature work — kept visible here rather than silently dropped):
1. **Cloudflare Turnstile keys** — CAPTCHA is code-complete on `/portal/signup`/`/portal/login`; needs a Turnstile site + 2 keys from you.
2. **Google Cloud service account** — needed for Google Sheets data-durability (code already complete).
3. **Google Sheets credentials** — the spreadsheet ID + sharing setup, alongside item 2.
4. **Google Analytics** — no code built yet; needs a decision + measurement ID before it's worth building.
5. **Supabase Pro-plan billing decision** — the highest-priority of the five: production currently has **zero backup coverage** on the Free plan. See `PRODUCTION_READINESS_REPORT.md` §7.

None of these block Version 1.1+ work — they're infrastructure/billing decisions independent of feature development, revisit whenever ready.

No further planning fields apply — this version is done, not proposed.

**Media architecture, built forward-looking (2026-07-27):** the reusable media component library (`ResponsiveImage`/`MediaAsset`/`Gallery`/`Avatar`/`BeforeAfterGallery`, see `MEDIA_ARCHITECTURE.md`) that replaced Portfolio/Journal/Workshops' placeholder boxes was deliberately built CMS-agnostic rather than content-type-specific, so it's already the direct foundation for: Staff Portal / Employee Profiles (`Avatar`, Version 1.1/1.2 below), Talent Management's public portfolios (`Gallery` + `MediaAsset`, Version 2.0), a future Vendor Directory (same pattern as Talent), Client Portal Deliverables migrating onto `Gallery` for the same responsive/empty-state benefits, and Ordift Pulse's content cards (Version 4.0). No new media component is expected to be needed for any of these — see `MEDIA_ARCHITECTURE.md` §8 for the full breakdown.

**🔒 Version 1.0 feature implementation complete — architecture frozen (2026-07-27), tagged `v1.0.0-lc1`.** Every feature planned for Version 1.0, including the media architecture and Ordift Pulse × Stories/Journal integration above, is built, verified, and deployed. No new major system, portal, database, schema, or infrastructure ships from here forward unless a critical defect requires it. The project now enters **Launch Candidate 1 (LC1)** — production readiness, UI/UX refinement, content population, performance, accessibility, SEO, responsiveness, and launch QA against what already exists, not new feature work. See `LAUNCH_CANDIDATE_1.md`. Versions 1.1 and beyond below remain planned future work, unaffected by LC1, and stay paused until LC1 concludes and you decide to resume feature development.

---

## Version 1.0.5 — Platform Foundation Hardening

**Approved:** 2026-07-30, inserted ahead of Version 1.1 at the user's direction, after a CTO-level current-state assessment surfaced a gap no feature checklist had caught: zero automated tests, no CI pipeline, no production error monitoring anywhere in the codebase (verified directly — no `.test.ts`/`.spec.ts` files, no `.github/workflows`, no Sentry/analytics dependency in `package.json`).

**Vision:** this is not a feature version — it is the engineering foundation every future version inherits. The objective is not new visible functionality; it is making every future feature safer, faster, more maintainable, easier to deploy, debug, recover, and scale. Every decision in this version is evaluated against one question: *"Will this reduce operational risk over the next 10–20 years?"* If yes, it belongs here.

**Objectives:**
- Give the platform a regression safety net before Version 1.1+ adds more schema/permission/workflow surface area to it.
- Make production failures visible via alerting instead of via client emails.
- Convert everything currently living only in this project's session history — technical debt, architectural reasoning, "why we did it this way" — into permanent, queryable documents.
- Stress-test disaster recovery and security against adversarial "assume it already went wrong" scenarios, not just checklist confirmation.
- Document scaling trigger points without doing premature scaling work.

**Workstreams:**

### A — Engineering Test Foundation
Testing *architecture*, not isolated tests: unit, integration, role-permission, API, authentication, RLS verification, booking workflow, client portal workflow, admin workflow, Google Sheets sync, email delivery. Goal is confidence, not a coverage percentage.
- **Why it matters:** every subsequent version (starting with 1.1's Grade/Department schema) adds surface area with no regression net today. This is the single highest-leverage item on the whole list.
- **Effort:** Medium — framework setup (Vitest + React Testing Library fits the existing Next.js/TS stack with no new infra) plus writing tests for the highest-risk logic first (RLS-dependent queries, record-ID/Sheets-sync service, auth/role resolution), not full coverage everywhere.
- **Dependencies:** none. Fully additive.
- **Risks:** scope creep toward "100% coverage" instead of confidence on the highest-risk paths; mitigate by explicitly prioritizing RLS/auth/money-adjacent flows first.
- **Long-term value:** very high, compounding — this is what Workstream B needs to have anything to run.

### B — Continuous Integration
GitHub Actions: lint, typecheck, test, build-verify on every push. No deploy proceeds if any gate fails.
- **Why it matters:** currently every one of ~250 completed milestones was verified manually by hand. That does not scale, and it is the first thing that silently degrades as the codebase grows.
- **Effort:** Low — standard GitHub Actions workflow, no new services.
- **Dependencies:** Workstream A (needs tests to run in the pipeline; can start with lint/typecheck/build-only gates before A finishes and add the test gate once A lands).
- **Risks:** minimal — worst case is a slower push-to-deploy loop, tunable via caching.
- **Long-term value:** high — this is the mechanism that makes Workstream A's value durable instead of one-time.

### C — Production Observability
Error tracking, performance monitoring, source maps, alerting.
- **Why it matters:** today, a production failure is discovered when a client reports it, not before. For a platform meant to run 10–20 years, flying blind on errors is a real operational risk, not a nice-to-have.
- **Effort:** Low-Medium — Sentry's free tier fits current scale; evaluated against alternatives before implementation per your instruction (see below).
- **Dependencies:** none.
- **Risks:** low; the main discipline risk is alert fatigue if thresholds aren't tuned — start conservative.
- **Long-term value:** high — turns silent failures into actionable alerts.

**Tool evaluation (Sentry vs. alternatives), as requested:**
| Option | Fit for Ordift at this scale |
|---|---|
| **Sentry** (recommended) | Free tier covers current traffic comfortably; native Next.js SDK (auto source-map upload, edge/server/client coverage in one config); combines error tracking + performance + session context in one tool instead of three. This is the standard choice for a solo/small-team Next.js + Vercel stack and needs the least glue code. |
| Vercel's own Observability (Web Analytics + Speed Insights) | Good complementary signal (Core Web Vitals, traffic), but it is not an error tracker — no stack traces, no alerting on exceptions. Worth adding alongside Sentry later as a cheap add-on, not a substitute. |
| LogRocket / Datadog / self-hosted (GlitchTip) | Overkill or costly at this scale — session-replay and full APM suites solve problems Ordift doesn't have yet (no team of engineers triaging dashboards daily). GlitchTip (self-hosted, Sentry-API-compatible) is worth keeping in mind as a future zero-cost pivot if Sentry's free tier is ever outgrown, since the SDK integration wouldn't need to change. |

Recommendation: Sentry now; revisit only if usage outgrows the free tier.

### D — Technical Documentation
`ENGINEERING_GUIDE.md`, `ENGINEERING_STANDARDS.md`, `RELEASE_PLAYBOOK.md` covering engineering standards, testing standards, deployment standards, rollback procedures, incident response, monitoring architecture, repository structure, coding standards.
- **Why it matters:** the standing goal is that a future senior engineer with zero session history can understand the system. Substantial pieces already exist (`ARCHITECTURE.md`, `OPERATIONS_MANUAL.md`, `ADMIN_GUIDE.md`) — this workstream fills genuine gaps and cross-references rather than duplicating them.
- **Effort:** Medium — mostly synthesis of what's already been learned, plus the genuinely new pieces (incident response runbook, monitoring architecture doc once C exists).
- **Dependencies:** benefits from B and C existing first (nothing to document as "CI process" or "monitoring architecture" before they're built).
- **Risks:** documentation sprawl if not checked against `DOCUMENTATION_INDEX.md` for overlap before writing.
- **Long-term value:** high for continuity/handover; the actual bar is "another engineer, years from now, with no memory of this project."

### E — Technical Debt Register
Permanent `TECHNICAL_DEBT_REGISTER.md`: every compromise, shortcut, known limitation, and deferred architectural decision made across the build so far.
- **Why it matters:** a large amount of this currently exists only in this session's history — the exact thing the "nothing should exist only in memory" principle is meant to prevent. Urgency is real: this should be captured before further context compaction or session boundaries erode it further.
- **Effort:** Low — this is a capture exercise against already-known facts, not new investigation.
- **Dependencies:** none.
- **Risks:** none of consequence — pure documentation.
- **Long-term value:** high and immediate; also the input list for prioritizing later versions' scope.

### F — Architecture Decision Records
`ARCHITECTURE_DECISIONS.md`: problem / options considered / decision / reasoning / consequences / date / future review trigger, for every major technical decision — backfilled for past decisions (Sanity dataset isolation, Supabase RLS-first authorization model, dual-write record-ID/Sheets-sync architecture, CMS-agnostic content-repository abstraction, the four-independent-axis IAM model), then required for every major decision going forward.
- **Why it matters:** several major architectural choices already made this build (e.g., why Sheets is a secondary durability layer and not the primary store; why Grade/Role/Position/Engagement Type must never couple) exist only as reasoning inside a very long conversation history. Same urgency as Workstream E.
- **Effort:** Medium — backfilling ~6-8 real historical decisions accurately takes more care than writing new ones going forward.
- **Dependencies:** none.
- **Risks:** low; the discipline risk is letting ADRs lapse once this initial burst is done — mitigate by making "write an ADR" part of the standard defined in Workstream D.
- **Long-term value:** high — this is literally "why does it work this way," which is the hardest thing for a future engineer (or future me, post-compaction) to reconstruct without it being written down.

### G — Platform Health Dashboard
**Scope flag, per your invitation to challenge unnecessary complexity:** a full live internal dashboard *application* is itself a new feature — the thing this version is explicitly not supposed to be ("not another feature above it"). At current scale — pre-launch, founder-led, no engineering team checking a dashboard daily — a maintained `SYSTEM_HEALTH.md` capturing deployment health, test/CI status, monitoring status, backup status, security-check status, outstanding technical debt, and release readiness, with direct links out to Vercel/Sentry/Supabase's own dashboards (which already provide live graphs), delivers most of the value at a fraction of the cost and zero new infrastructure to maintain.
- **Recommendation:** build the `SYSTEM_HEALTH.md` version now; revisit an in-app live dashboard once Version 1.1's staff/org structure means there's an actual team who would check it regularly.
- **Effort:** Low (doc) vs. High (live app) — recommending the low-effort path.
- **Dependencies:** benefits from B, C, E all existing (it's substantially a synthesis view over their outputs).
- **Risks:** a markdown doc goes stale if not updated; mitigate by treating updates to it as part of the definition-of-done for future milestones, same discipline as `MILESTONES.md`.
- **Long-term value:** medium now, high later once a live version is warranted.

### H — Disaster Recovery Review
Stress-test against "a disaster happened today," not checklist confirmation: backup verification, restore procedures, rollback procedures, credential recovery, infrastructure recovery.
- **Why it matters:** `DISASTER_RECOVERY.md` and one verified backup already exist, but "we took a backup once" and "we could actually recover today" are different claims — this workstream tests the second one.
- **Effort:** Low-Medium — largely a rigorous review pass plus a genuine restore-test rehearsal (already flagged as outstanding in `LAUNCH_CHECKLIST.md`'s After Launch section).
- **Dependencies:** none technically, though doing it after E (debt register) means any gap found here can immediately be logged there.
- **Risks:** none — this is a review, not a build.
- **Long-term value:** high — untested recovery procedures are the classic "found out the hard way" risk.

### I — Security Hardening Re-Review
Re-challenge every layer: authentication, authorization, RLS, API protection, rate limiting, secrets management, environment variables, logging, audit trails — a skeptical second look, not a first pass.
- **Why it matters:** several security passes already happened during launch prep (Phase 4 audit, backup/Turnstile work); this is deliberately an adversarial re-review rather than trusting those findings are still complete as the system has grown.
- **Effort:** Medium — review-heavy, code changes only where a real gap is found.
- **Dependencies:** none.
- **Risks:** none from doing it; risk is in *not* doing it periodically as the system grows.
- **Long-term value:** high — security is the one category where "it passed once" doesn't mean "it's still true."

### J — Scalability Assessment
Per major subsystem (Supabase, Sanity, Vercel, Redis rate-limiting, Google Sheets sync): current capacity, expected bottlenecks, scaling strategy, and the specific trigger point that should prompt a redesign — explicitly documentation, not premature optimization or actual scaling work now.
- **Why it matters:** at current scale none of these subsystems are under real load, so building for scale now would be waste — but knowing *what number* should trigger action (e.g., "reassess Supabase plan at X concurrent connections," "Sheets sync becomes a bottleneck past Y submissions/day") means the decision is planned instead of reactive.
- **Effort:** Low — analysis and documentation against known service tiers/limits, no implementation.
- **Dependencies:** none.
- **Risks:** none; the only failure mode is over-scoping into actual infrastructure changes, which this workstream explicitly excludes.
- **Long-term value:** medium-high — cheap insurance against being surprised by a limit.

**Release criteria:** CI pipeline green and blocking on every push; Sentry capturing real errors in production with source maps resolved; all six living documents (`ENGINEERING_GUIDE.md`, `TECHNICAL_DEBT_REGISTER.md`, `ARCHITECTURE_DECISIONS.md`, `ENGINEERING_STANDARDS.md`, `RELEASE_PLAYBOOK.md`, `SYSTEM_HEALTH.md`) exist and are cross-referenced in `DOCUMENTATION_INDEX.md`; DR review and security re-review each produce a written findings list (even if the finding is "no gap found"); scalability trigger points documented for every major subsystem.

**Priority:** Highest — approved ahead of Version 1.1.

**Suggested execution order** (dependency-driven, not workstream-letter order):
1. **E, F** (Technical Debt Register, ADRs) — pure knowledge capture from what's already known, zero code risk, most time-sensitive (currently exists only in session history).
2. **A** (Testing foundation) — the technical bedrock everything else in this version either depends on or is more valuable alongside.
3. **B** (CI) — immediately follows A.
4. **C** (Observability/Sentry) — independent of A/B, high value, low effort.
5. **I** (Security re-review) and **H** (DR review) — independent reviews, can run in either order or in parallel with the above.
6. **J** (Scalability assessment) — pure documentation, low effort, any time.
7. **D** (Standards docs) — most valuable once B/C exist to describe.
8. **G** (Health status doc, lightweight version) — synthesis view over B/C/E's outputs, naturally last.

---

## Version 1.1 — Internal Organization Module

**Vision:** give Ordift Studios a real internal-HR foundation — departments, positions, reporting lines, and organizational seniority — without touching or complicating the permission system that already works. This is about *who reports to whom and how the organization is structured*, not about *what anyone is allowed to do in the system*.

**Objectives:**
- Model the organization's actual shape (departments, positions, reporting structure) inside the platform instead of only in people's heads or an external spreadsheet.
- Introduce the **Grade** system specified in this session (see `ADMIN_GUIDE.md` §9.1 for the full spec) as a fourth, strictly independent axis alongside Role, Position, and Engagement Type.
- Build the HR foundation that Version 1.2 (Skills) and Version 2.0 (Talent) will both extend.

**Features:**
- **Organization Grades** — 10-tier seniority hierarchy (Intern/Trainee → Founder/CEO), managed via a dedicated Admin-only Grade Management module (create/rename/reorder/archive/assign, block-delete-if-assigned).
- **Departments** — a lookup table grouping people organizationally (e.g. Photography, Post-Production, Operations), independent of Role.
- **Positions** — formalizes the existing `operational_titles` lookup (already built in migration 0009) into a richer Position concept if needed, or extends it directly — to be decided at implementation time based on how much richer "Position" needs to be versus the existing Title field.
- **Reporting Structure** — a manager/reports-to relationship per person, for org-chart and future approval-workflow use (e.g. leave approval in Version 3.0).
- **Engagement Types** — already built (migration 0009); this version just formally documents it as one of the four independent axes rather than adding new schema.
- **Employee Profiles** — an internal-facing profile view per staff/collaborator combining Position, Department, Grade, Engagement Type, and reporting line in one place (admin-only, per the Grade visibility policy).
- **Internal hierarchy / HR foundations** — the org-chart view this data enables.

**The four independent concepts (hard constraint, not a suggestion):** Role, Position, Grade, and Engagement Type must never become coupled to each other or to permissions. Permissions remain exclusively controlled by Role. Grade is confidential internal metadata — see the full Grade Visibility Policy already documented in `ADMIN_GUIDE.md` §9.1 (never on staff IDs, name tags, email signatures, business cards, client pages, public profiles, or contracts unless explicitly required).

**Dependencies:** migration 0009's `operational_titles`/`engagement_types` pattern (direct precedent to follow); no dependency on any other planned version.

**Estimated complexity:** Medium. New schema (grades, departments, reporting_line) follows an already-proven additive-lookup-table pattern; the main effort is the Admin UI (reorderable Grade Management screen, org-chart-style view) rather than the data model itself.

**Risks:** the primary risk is *scope leakage* — Grade or Department fields being read by permission checks "just this once." Mitigate by keeping every new table's RLS/read policies separate from `private.has_role()` entirely, and by code review explicitly checking that no new column here is ever referenced in an `if` gating access.

**Release criteria:** all four axes (Role, Position, Grade, Engagement Type) independently verified changeable without affecting a user's actual permissions; Grade never renders outside an authenticated Admin/Super Admin-gated view; staging regression pass covering every existing role's login/access behavior shows zero change.

**Priority:** High — this is the necessary foundation for Version 1.2 and Version 2.0, and was explicitly requested as the next milestone after v1.0.

**Suggested implementation order:** 1st (immediately after v1.0 closes).

---

## Version 1.2 — People & Skills Management

**Vision:** know what your people (staff and collaborators) can actually do — skills, certifications, languages, equipment proficiency, availability — so project assignment and talent-matching (Version 2.0) can eventually be data-driven instead of purely relationship-driven.

**Objectives:**
- Give every staff/collaborator profile a structured skills record.
- Lay groundwork for availability-aware project assignment (extends the existing `project_assignments` table from migration 0009).
- Provide the internal performance-metrics foundation that Version 4.0's Business Intelligence module will eventually visualize.

**Features:**
- **Skills Matrix** — tag-based or rated skill assignment per person (e.g. "Studio Lighting: Advanced").
- **Certifications** — record of professional certifications with optional expiry tracking.
- **Languages** — spoken/written language proficiency per person.
- **Equipment proficiency** — which gear/software each person is competent with (feeds Version 3.0's equipment-checkout module).
- **Portfolio links** — external portfolio URLs per internal person (distinct from the public Talent portfolios in Version 2.0).
- **Availability** — a calendar-style availability record per person, feeding project assignment decisions.
- **Internal performance metrics** — a foundation table for whatever metrics matter later (project completion rate, client feedback score, etc.) — deliberately built as an extensible schema rather than a fixed set of fields.

**Dependencies:** Version 1.1 (Employee Profiles is the natural home for this data); the existing `project_assignments` table from migration 0009 for availability-aware assignment.

**Estimated complexity:** Medium. Mostly additive schema plus UI; the availability/assignment matching logic is the one genuinely new piece of business logic, not just CRUD.

**Risks:** "Internal performance metrics" is the one feature here vague enough to scope-creep into a full performance-review system. Recommend defining the exact metric set explicitly (with you) before building, rather than open-endedly.

**Release criteria:** every field independently editable from an Employee Profile; skills/certifications visible only to Admin/Super Admin and the person themselves; no coupling to Role or Grade.

**Priority:** Medium — valuable, but not blocking anything else; can slip behind Version 2.0 if Talent Management becomes more urgent.

**Suggested implementation order:** 2nd, directly after Version 1.1.

---

## Version 2.0 — Talent Management

**Vision:** grow the current placeholder `model` role into a full external-talent management system — the first version to generate real commercial value beyond internal operations, supporting every kind of talent Ordift Studios represents or books, not just models.

**Objectives:**
- Replace the single `model` role's implicit scope with an explicit, multi-category Talent system.
- Give talent a real portfolio, availability, and booking presence.
- Build the Talent CRM needed to manage bookings, auditions, contracts, and rates at scale.

**Features:**
- Support for **Models, Influencers, Brand Ambassadors, Actors, Artists, Hosts, Presenters, Performers** as talent categories (not new roles in the permission sense — a talent-category lookup, same independent-axis discipline as §Version 1.1).
- **Portfolios** — public-facing talent portfolios (distinct from internal Skills/Portfolio-links in Version 1.2), built on the existing `Gallery`/`MediaAsset` components (see `MEDIA_ARCHITECTURE.md` §8) rather than a new gallery implementation.
- **Availability** — talent-specific availability calendar (separate concept from internal-staff availability, though sharing the same underlying pattern).
- **Contracts** — talent engagement contracts, likely needing the secure-document-storage evaluation already flagged in this project's original Phase 1B plan (CVs/ID documents/consent forms are sensitive — a storage decision, not just a schema decision, is needed before this goes live).
- **Auditions** — a pipeline for talent applications and casting calls.
- **Rates** — talent rate cards, likely tied into Version 3.0/4.0's financial reporting eventually.
- **Documents** — secure storage for talent-related sensitive documents (same dependency as Contracts, above).
- **Talent CRM** — the operational view tying all of the above together for whoever manages talent relationships.

**Dependencies:** the secure-document-storage evaluation flagged in the original project plan (Part G — Tier 2 forms) must happen *before* Contracts/Documents go live, not after. Builds on the `model` role and Version 1.1's Department/Position concepts for internal talent-management staff.

**Estimated complexity:** High. This is the largest version on the roadmap — new public-facing surfaces (talent directory, applications), a CRM, and a genuine security/compliance decision (secure document storage) that has to be resolved deliberately, not assumed.

**Risks:** the biggest risk on this entire roadmap is sensitive-document handling (ID documents, contracts, consent forms) — get this wrong and it's a real privacy/legal exposure, not just a bug. Do the storage evaluation (signed-URL object storage vs. a dedicated secure-forms provider, as originally scoped) as its own explicit decision point before writing any code that touches real documents.

**Release criteria:** secure-storage decision made and implemented *before* any real talent document is ever stored; every talent category demonstrably independent of the internal Role/Grade/Position system; public talent directory reviewed for the same content-accuracy discipline used on the rest of the public site (no invented bios, no unapproved photos).

**Priority:** High commercially, but gated on the security decision above — don't rush this one to hit a date.

**Suggested implementation order:** 3rd — after Versions 1.1/1.2 give it a Department/Position foundation to plug into, and after the secure-storage decision is made independently.

---

## Version 3.0 — Studio Operations

**Vision:** run the physical/operational side of the business — equipment, vehicles, studio space, and staff leave — through the same platform, closing the gap between "who can do what" (v1.0/1.1) and "what physically needs to be tracked and approved" (v3.0).

**Objectives:**
- Track physical assets (equipment, vehicles) with checkout/return accountability.
- Manage studio-space booking to avoid double-booking.
- Bring leave management and internal approvals into the platform, using the reporting structure from Version 1.1.

**Features:**
- **Equipment inventory** — a register of owned equipment.
- **Equipment checkout** — who has what, when it's due back, tied to the equipment-proficiency data from Version 1.2 (only people marked proficient with a piece of gear should be able to check it out, if that constraint is wanted).
- **Vehicle management** — same checkout/accountability pattern applied to vehicles.
- **Studio booking** — an internal calendar for studio-space reservations.
- **Leave management** — request/approval workflow, using Version 1.1's reporting-structure data to route approvals to the right manager.
- **Internal approvals** — a general-purpose approval workflow, of which leave approval is the first concrete use.
- **Maintenance** — scheduled/reported maintenance tracking for equipment and vehicles.
- **Asset tracking** — the umbrella reporting view across equipment/vehicle inventory and condition.

**Dependencies:** Version 1.1's reporting structure (for approval routing) and Version 1.2's equipment-proficiency data (if the checkout constraint above is wanted).

**Estimated complexity:** Medium-High. Individually each feature is straightforward CRUD-plus-workflow, but there are many of them, and the approval-workflow engine (if built generally rather than just for leave) is real design work.

**Risks:** scope risk — "Internal approvals" as a general-purpose workflow engine could balloon significantly beyond what leave management alone needs. Recommend building it narrowly for leave first, and only generalizing if a second real approval use case actually shows up.

**Release criteria:** equipment/vehicle checkout produces an audit trail (who, when, returned-when); leave approval correctly routes to the requester's manager per Version 1.1's reporting structure; no double-booking possible on studio reservations.

**Priority:** Medium — operationally valuable but not commercially load-bearing the way Version 2.0 is.

**Suggested implementation order:** 4th, after Version 1.1 (for reporting structure) and ideally after Version 1.2 (for the equipment-proficiency constraint, though this dependency is soft, not hard).

---

## Version 4.0 — Business Intelligence & Creative Intelligence

**🟢 Ordift Pulse built ahead of schedule (2026-07-27):** per explicit direction, the Creative Intelligence half's schema, taxonomy, editorial workflow, and repository layer were built now rather than waiting for Versions 1.1–3.0 to close — see `PULSE_ARCHITECTURE.md` for the full design. Its public-facing experience is **embedded inside the existing Stories/Journal section for this release** — a Content Type filter (Studio Stories/Editorial/Creative News/Industry Updates/Opportunities/Upcoming Events) and trust badges (Verified by Ordift Studios/Official Source/Community Submitted/Archived) inside `/journal`, not a separate `/pulse` platform — per explicit direction to save implementation time and avoid a duplicate article system. See `STORIES_PULSE_INTEGRATION.md`. The two Sanity document types (`journalPost`/`pulseArticle`) remain fully separate behind the scenes, so a dedicated Pulse section is still just new routes away, not a schema migration, if audience demand ever justifies it. Not started: any data-provider/ingestion integration, AI summarization, and the Business Intelligence half below (which still genuinely depends on Versions 1.1–3.0's data).

**Vision:** turn everything the platform has been recording since v1.0 (enquiries, bookings, deliverables, staff activity, project outcomes) into decision-useful insight, and simultaneously keep the public site editorially alive with curated, high-quality industry content — two distinct systems sharing one version because they're both about *intelligence*, one internal (BI) and one external-facing (Creative Intelligence / Ordift Pulse).

**Objectives:**
- Build real analytics on top of data that's already being collected, rather than adding new tracking.
- Introduce **Ordift Pulse**, a curated (never scraped, never auto-published) industry-news and creative-intelligence feed for the public site.

**Features — Business Intelligence:**
- **Analytics dashboards** — an Admin-facing view over existing CRM/booking/deliverable data.
- **Revenue reports** — depends on whatever financial data exists by the time this is built (payment integration is a separate, not-yet-scheduled item per the historical `MILESTONES.md` sketch).
- **Client analytics** — engagement/booking patterns per client.
- **Staff analytics** — drawing on Version 1.2's performance-metrics foundation.
- **AI insights / business forecasting** — the most speculative item on this entire roadmap; scope this last, once the underlying data (the four items above) actually exists to forecast from.

**Features — Ordift Pulse (Creative Intelligence):**
- A curated content module keeping the site "alive" with relevant industry updates, **never** raw-scraped or auto-published.
- **Workflow (hard requirement, not a suggestion):** Source → AI summarization → Draft → Admin Review → Publish. No automatically-fetched content reaches the live site without a human approval step — this mirrors the exact content-accuracy discipline already used for every other piece of copy on this site (see `feedback_ordift_content_accuracy` in project memory).
- **Sources:** trusted news providers, official event organizers, public APIs, RSS feeds, and other legally-usable sources. Explicitly **not** scraping or republishing copyrighted content directly — summarization and attribution, not reproduction.
- **Taxonomy (built 2026-07-27, see `PULSE_ARCHITECTURE.md` §2):** three independent axes rather than one flat list — Category (Creative Industry News, Fashion News, Photography News, Videography & Filmmaking News, Music & Entertainment News, Creative Technology, Camera & Equipment Releases, Adobe & Editing Software Updates), Region (Ghana, Qatar, Africa, International), and — for opportunity-kind listings only — Opportunity Type (Exhibition, Fashion Week, Festival, Award, Workshop, Masterclass, Grant, Competition, Casting Call, Collaboration Opportunity).
- **Designed modularly**, with room to grow into a full Creative Intelligence Hub via later additions: Creative Quote of the Day, Tip of the Day, Featured Creator, Creative Opportunity of the Week, Upcoming Industry Events, Photography/Videography/Editing Tip, Business Insight, AI Tool Spotlight. None of these are scoped for the initial build — they're the extension points the initial architecture should leave room for.

**Dependencies:** meaningful BI needs Versions 1.1–3.0's data already flowing (staff/project/asset data) to have anything worth analyzing; Ordift Pulse has no dependency on any other version and could, in principle, be built earlier if there's appetite — it's grouped here because it's the other "intelligence" half of this version, not because it's blocked on anything.

**Estimated complexity:** High for BI (real dashboard/reporting work, plus the open-ended "AI insights" item); Medium for Ordift Pulse (the approval-workflow discipline is the main design constraint, not the content-fetching itself).

**Risks:** for Ordift Pulse specifically — copyright/legal risk if the "summarize, don't republish" boundary isn't enforced carefully in whatever AI-summarization step is built; editorial-quality risk if the Admin Review step is ever skipped or rubber-stamped under time pressure. For BI — the temptation to over-promise on "AI insights" before the underlying data is rich enough to support it.

**Release criteria:** zero Ordift Pulse content ever reaches the public site without an explicit Admin publish action logged in the audit trail; every BI report traceable back to real underlying data (no fabricated/placeholder numbers, consistent with this project's content-accuracy standard).

**Priority:** Lower than Versions 1.1–3.0 for the BI half (needs their data to be useful); Ordift Pulse could be reprioritized earlier if keeping the public site freshly updated becomes a nearer-term marketing priority — flagging this as a genuine scheduling flexibility point, not a fixed 5th-place slot.

**Suggested implementation order:** 5th for BI (after 1.1–3.0 produce real data); Ordift Pulse's public-facing content module could be pulled forward independently if desired — call this out explicitly if you want to reorder it.

---

## Vision 2030

By 2030, Ordift Studios should have evolved from a creative-services website into a **comprehensive operating platform** for a multidisciplinary creative business — one system covering:

- Photography, Videography, and Creative Production (the founding disciplines)
- Client Management (CRM, project workspace, deliverables — largely built in v1.0)
- Talent Management (Version 2.0)
- Studio Operations (Version 3.0)
- HR (Version 1.1/1.2)
- Business Intelligence (Version 4.0)
- AI-assisted workflows (starting with Ordift Pulse's summarization step, expanding wherever else genuine value emerges)
- Multi-country operations (the "Ghana" and "Qatar" categories already anticipated in Ordift Pulse's taxonomy signal this is a real, not hypothetical, direction)
- Multiple business units (the `business_id`-scoped architecture, already built into the schema since migration 0001, was specifically designed so a second business could be onboarded without re-architecting)

**Every future architectural decision should be evaluated against this long-term vision** — the same permanent engineering principle already adopted for this project (see `MILESTONES.md`: *"no feature ships unless it has a clear place in the long-term Ordift ecosystem... if it can't eventually connect to one of those, that's a reason to challenge it before building, not after"*). This roadmap is that principle applied concretely, version by version.

---

## Engineering Standards for Future Development

Every version above must be built following the same discipline already established and proven through v1.0:

- **Modular architecture** — new modules (Grade system, Talent, Studio Ops, Ordift Pulse) should be addable without modifying the core permission/RLS architecture, the same way migration 0009 added Contractor/Super Admin without touching any pre-existing policy.
- **Additive migrations only** — every migration adds; none edit or delete a previously-applied migration. Staging-first, always, exactly as done for every migration `0001`–`0012`.
- **Backward compatibility** — new roles, statuses, or fields must never break an existing user's access or an existing integration's assumptions.
- **Mobile-first design** — every new UI surface (Grade Management, Talent portfolios, Ordift Pulse's public feed) designed for mobile first, verified at mobile/tablet/desktop widths before considered done.
- **Accessibility** — alt text, keyboard navigation, sufficient contrast, and semantic HTML on every new surface, public or internal — the same bar already applied to the branded email templates this session (retina-sharp logo, proper `alt` text).
- **Audit logging** — every state-changing administrative action (grants, revokes, status changes, Pulse publishes, equipment checkouts) writes to `activity_log`, following the exact pattern already used throughout v1.0.
- **Scalable schema** — every new lookup table follows the `operational_titles`/`engagement_types` pattern (id, slug, name, sort_order/rank_order, active flag) rather than inventing a new shape each time.
- **Maintainable code** — no premature abstraction, no speculative generality beyond what the current version actually needs (the same restraint already applied in this session's IAM work).
- **Least-privilege permissions** — every new capability starts from "no access" and is granted explicitly, never the reverse; every new Supabase table gets its `service_role` grants scoped to exactly what the code needs, following the lesson learned from migrations `0010`–`0012` this session.

---

*Companion documents: [ADMIN_GUIDE.md](ADMIN_GUIDE.md) (operational manual, including the full Grade system spec and Internal Governance standards), [PRODUCTION_READINESS_REPORT.md](PRODUCTION_READINESS_REPORT.md) (v1.0 verification), [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md) (how every project document relates to this one).*
