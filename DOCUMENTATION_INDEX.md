# Ordift Studios — Documentation Index

**Established:** 2026-07-27, alongside `PRODUCT_ROADMAP.md`, to give every project document a clear purpose and stop duplicate/conflicting guidance from accumulating as the project grows. If you're unsure which document to read or update for something, start here.

---

## 1. How the documents relate

Three tiers, roughly in order of how often each changes:

- **Rarely changes — foundational reference:** `ARCHITECTURE.md`, `TYPOGRAPHY.md`, `VERSIONS.md` (the tool-version half), `AGENTS.md`.
- **Changes per release:** `CHANGELOG.md`, `RELEASE_NOTES.md`, `MILESTONES.md`, `PRODUCTION_READINESS_REPORT.md`.
- **Living, operational documents:** `ADMIN_GUIDE.md`, `PRODUCT_ROADMAP.md`, `DEPLOYMENT.md`, `DEVELOPMENT_GUIDE.md`.

## 2. Document-by-Document

| Document | Purpose | Update when |
|---|---|---|
| `README.md` | Standard Next.js scaffold readme (dev server commands) | Rarely — only if the local dev workflow itself changes |
| `AGENTS.md` | Instructs any AI agent working in this repo to check `node_modules/next/dist/docs/` before writing code, since this Next.js version has breaking changes vs. training data | Rarely |
| `ARCHITECTURE.md` | The standing architectural-decision record — the audit done before building major systems, reviewed against forward-looking scale dimensions | When a new system needs its own architectural review before being built |
| `DEVELOPMENT_GUIDE.md` | The engineering process contract — how work actually gets done (workflow, conventions) for Tier 2+ development | When the development *process* itself changes, with a dated note |
| `TYPOGRAPHY.md` | The locked type system (Fraunces + Inter) and why alternatives were retired | Only if the type system itself is ever revisited |
| `VERSIONS.md` | Two things in one file: (1) exact tool/dependency versions installed (Node, Next.js, etc.) — update alongside `package-lock.json`; (2) the product semver *policy* (every feature gets a tagged version, no untagged releases) — **the version *roadmap* table that used to live here is retired; see `PRODUCT_ROADMAP.md` instead** | Tool versions: on any dependency bump. Policy: rarely |
| `MILESTONES.md` | The full historical build log — every milestone from project scaffold through v1.0.0, including the now-retired pre-v1.0 "Version 2.0–4.0" scope sketches (kept for continuity, each now pointing at its replacement in `PRODUCT_ROADMAP.md`) | As each milestone within the *current* Milestone-0 production-readiness phase closes |
| `CHANGELOG.md` | The permanent, dated release history — every release (git-tagged or not) gets an entry: features added, improvements, bug fixes, security updates, migrations, breaking changes, known issues, upgrade notes | Every release, without exception, going forward |
| `RELEASE_NOTES.md` | Deeper per-release detail than `CHANGELOG.md`'s summary — what changed, why, what to verify | Same cadence as `CHANGELOG.md`, for any release substantial enough to warrant expanded notes |
| `DEPLOYMENT.md` | Deployment log, known issues, and non-blocking pre-launch items (the "small stuff that isn't a version, just a gap") | As deployment issues are found/fixed, or a tracked gap closes (e.g. the email-infrastructure note updated the same day SMTP went live) |
| `DNS_SNAPSHOT_PRE_LAUNCH.md` | A frozen point-in-time rollback reference for DNS/production config, captured before the domain connection | Never edited after capture — it's a snapshot, not a living doc; a new snapshot would be a new dated file if ever needed again |
| `STAGING.md` | The staging/production isolation checklist (separate credentials, datasets, records — Plan Part J) | If the isolation setup itself changes |
| `GOOGLE_SHEETS_INTEGRATION.md` | The dual-storage form workflow (Supabase primary + Google Sheets best-effort secondary) — service account setup, the 9-worksheet "Ordift Studios Operations" spreadsheet structure, column mappings, the `sheet_sync_failures` retry queue, and the testing procedure. Code complete; **not yet connected** (see `PRODUCTION_READINESS_REPORT.md` §2) | When the Sheets integration is actually connected, a worksheet's mapping changes, or a new form is wired in |
| `RECORD_ID_STANDARD.md` | The platform-wide sequential record ID format (`PREFIX-YYYY-NNNNNN`) and the 9 reserved prefixes, generated via `src/lib/shared/recordId.ts` | If a new prefix is reserved, or the generation mechanism changes |
| `WORKSHOPS_ARCHITECTURE.md` | The Workshop Platform's content model and registration/capacity logic | If the Workshop Platform's architecture changes |
| `MEDIA_ARCHITECTURE.md` | The reusable media component library (`ResponsiveImage`/`MediaAsset`/`Gallery`/`Avatar`/`BeforeAfterGallery`) — CDN-swap design, loading/empty-state handling, the reusable CMS content-model pattern, and which future features (Talent, Staff Portal, Ordift Pulse, etc.) it already supports without refactoring | If a new media component is added, or the CDN/loader strategy changes |
| `PULSE_ARCHITECTURE.md` | Ordift Pulse (Creative Industry Hub) — the taxonomy design (category/region/opportunity type as independent axes), the editorial/curated content model, the no-scraping trusted-source data layer, the editorial-approval workflow, and future-proofing for newsletters/personalization/saved articles/notifications/AI summaries. Schema/repository only — see `STORIES_PULSE_INTEGRATION.md` for how it's presented publicly | If the Pulse schema, workflow, or taxonomy changes |
| `STORIES_PULSE_INTEGRATION.md` | How Ordift Pulse content is presented publicly — embedded inside the existing Stories/Journal section (grouping tabs, trust badges, merged category filter) rather than a separate `/pulse` platform. Covers the read-layer merge design, what's reused vs. added, and what's explicitly out of scope | If the public presentation changes, or if Pulse is ever extracted into its own dedicated section |
| `LAUNCH_CANDIDATE_1.md` | The LC1 production-readiness program (post Version 1.0 architecture freeze, 2026-07-27) — the phase-by-phase plan (production audit, UI/UX refinement, content readiness, portfolio/service readiness, launch QA), the prioritized punch list, and the eventual Go/No-Go launch report | As each LC1 phase completes or new findings surface |
| `MEDIA_UPLOAD_LIST.md` | The comprehensive Media Requirement List — every image/video/logo/promotional-asset area on the public site, page by page, with required type/orientation/dimensions/format, suggested subject, and whether it's ready for upload today, has a placeholder but no CMS field yet, or hasn't been wired up at all | When new media areas are built, existing placeholders get wired up to render real content, or an upload priority changes |
| `CMS_MIGRATION.md` | The path from local content data to Sanity CMS — **status: live and connected** | If the CMS connection or content model changes |
| `PRODUCTION_READINESS_REPORT.md` | Point-in-time verification of what's actually production-ready, security/performance observations, and a Go/No-Go recommendation | Whenever a full readiness pass is redone (not every release — this is a checkpoint document, most recently 2026-07-27 covering email infrastructure and IAM) |
| `PRODUCTION_HARDENING_REPORT.md` | Point-in-time checkpoint for the email subsystem specifically — Redis-backed rate limiting/idempotency, retry-with-backoff dispatch, Project Request emails, dead-letter logging, tests performed/results, readiness score, and the `FORMS_SENDING_ENABLED` recommendation | Whenever the email subsystem gets another full hardening/verification pass (most recently 2026-07-29) |
| `DISASTER_RECOVERY.md` | The documented recovery procedure — current backup/PITR capability (audited live against the Supabase dashboard), the actual manual-backup strategy in effect (Free plan, weekly `pg_dump`, verification steps, safe storage), database/Storage/env-var/deployment restoration steps, a post-recovery validation checklist, recovery responsibilities, and the concrete milestone for revisiting a Pro-plan upgrade | Whenever backup capability changes (e.g. a Pro-plan upgrade) or the recovery procedure itself is revised |
| `PHASE_4_PRODUCTION_AUDIT_REPORT.md` | The full-application Phase 4.3 audit — Production Readiness, Security, and Performance reports; RLS/CORS/dependency/secrets review; a prioritized Critical/High/Medium/Low task list; a 92% launch readiness score; the recommended Go-Live sequence; and remaining risks with impact/mitigation | Whenever another full pre-launch audit pass is run |
| `WORKSHOP_CONTENT_CHECKLIST.md` | Every real Sanity `workshop` schema field that needs real content before launch (the current 4 workshops are all explicitly `[SAMPLE]` placeholder), plus an honest note on what's not a content task (pricing structure, workshop-specific terms) | Whenever the workshop content-readiness state changes, or the schema itself changes |
| `OPERATIONS_MANUAL.md` | **The day-to-day operational entry point** — Daily/Weekly/Monthly operations checklists, a System Administration routing table, Disaster Recovery pointers, Monitoring guidance, and the Business/Post-Launch checklists. Cross-references `ADMIN_GUIDE.md`/`DISASTER_RECOVERY.md`/`DEPLOYMENT.md` for detailed "how," rather than duplicating them | Whenever the operational cadence or launch checklist changes |
| `ADMIN_GUIDE.md` | The detailed reference for roles/permissions, inviting and managing users, account lifecycle, email infrastructure, troubleshooting, and (as of 2026-07-27) Internal Governance standards — see `OPERATIONS_MANUAL.md` for the higher-level day-to-day entry point that routes here | Whenever how the platform is operated day-to-day changes |
| `PRODUCT_ROADMAP.md` | **The authoritative long-term plan** — Versions 1.1 through 4.0, each with vision/objectives/features/dependencies/risks/release criteria, plus Vision 2030 and Engineering Standards for future work | Whenever roadmap scope, priority, or sequencing is deliberately revisited — not casually |
| `DOCUMENTATION_INDEX.md` | This document | Whenever a document is added, removed, or repurposed |

## 3. What Changed in This Cross-Reference Pass (2026-07-27)

To remove duplicate/conflicting guidance, per this session's explicit instruction:

- **`VERSIONS.md`**'s old "Roadmap from v1.0.0 forward" table (v1.1.x Client Experience, v1.2.x Scheduling & Calendar, v1.3.x CRM & Client Timeline, v1.4.x Finance & Invoicing, v1.5.x AI Assistant, v2.0.x Multi-business Ecosystem) — **retired**, replaced with a pointer to `PRODUCT_ROADMAP.md`. None of those groupings were ever built under those names, and they conflicted with the new, more detailed roadmap.
- **`MILESTONES.md`**'s matching illustrative list, and every "carries forward into vX.x" pointer inside the historical "Version 2.0–4.0" sections — **updated** to point at the correct `PRODUCT_ROADMAP.md` version instead of the retired table.
- **`CHANGELOG.md`** — was already the permanent release-history document this session's instruction asked to "create"; rather than creating a duplicate, it was updated in place with a new dated entry covering this session's Access Management + Email Infrastructure work, since that work predates this entry and wasn't logged yet.
- No other document contained conflicting version/roadmap claims as of this pass.

## 4. Remaining Strategic Decisions Needing Your Approval

These are the genuine open decision points surfaced across `PRODUCTION_READINESS_REPORT.md`, `ADMIN_GUIDE.md`, and `PRODUCT_ROADMAP.md` — listed once, here, rather than scattered:

1. **When to begin Version 1.1 (Internal Organization/Grade system).** Fully specified and ready; not started. Your call on timing relative to closing the remaining Milestone 0 production-readiness items.
2. **Supabase Pro-plan upgrade** — needed to enable leaked-password protection (a real, if minor, security improvement). A billing decision, not a technical one; flagged, not acted on.
3. **Reply-To header for auth emails** (`info@ordiftstudios.com`) — would need a custom Supabase Auth Hook (new code path, not yet built). Worth confirming whether this is actually needed before building it, since reply traffic to a `no-reply@` sender is typically rare.
4. **Google Sheets / CAPTCHA / Analytics setup** — all gated on you generating the relevant credentials (Google Cloud service account, Turnstile keys, GA measurement ID); these are the main remaining blockers to closing Milestone 0 and considering the site ready for full public launch.
5. **Backup and restore verification** — needs you to confirm Supabase's backup retention settings and approve a test-restore being run (into a scratch project, not production) before the platform holds real client data at volume.
6. **Version 2.0 (Talent Management)'s secure-document-storage decision** — before any Contract/Document feature is built, a deliberate choice between signed-URL object storage (e.g. S3/R2) vs. a dedicated secure-forms provider needs to be made and reviewed with you — flagged in the roadmap as a hard release-blocking dependency, not something to default into.
7. **Ordift Pulse's content-source legal vetting** (Version 4.0) — the specific news providers/APIs/RSS feeds to actually use need a legal-usability check before integration, beyond the general "don't scrape, don't republish" principle already documented.
8. **Whether to reorder Ordift Pulse ahead of the rest of Version 4.0** — it has no real dependency on Versions 1.1–3.0's data (unlike the Business Intelligence half of Version 4.0), so it could be pulled forward if keeping the public site editorially fresh becomes a nearer-term priority. Flagged in `PRODUCT_ROADMAP.md` as a genuine scheduling option, not a fixed position.

---

*Read `PRODUCT_ROADMAP.md` first for where the platform is going; `ADMIN_GUIDE.md` for how to run what's already live; `PRODUCTION_READINESS_REPORT.md` for exactly what's verified as of the last checkpoint.*
