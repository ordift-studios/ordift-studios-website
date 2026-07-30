# Technical Decision Records (TDR)

**Established:** 2026-07-30, superseding `ARCHITECTURE_DECISIONS.md` at your explicit request, as part of Version 1.0.5 — Platform Foundation Hardening.

**Why this replaces, rather than sits alongside, the earlier ADR log:** running two parallel decision-record systems with different formats would itself be exactly the kind of documentation drift a platform meant to last 10-20 years shouldn't accumulate — the same reasoning already applied once before in this project (`DOCUMENTATION_INDEX.md` §3, retiring `VERSIONS.md`'s old roadmap table rather than maintaining two). `ARCHITECTURE_DECISIONS.md`'s 8 entries are migrated below under the TDR numbering and the richer field set you specified; that file now only points here.

**Format:**

```
### TDR-NNN — Title
- Status: Accepted / Superseded / Under Review
- Context: the situation/background this decision was made within
- Problem: the specific question that needed answering
- Options Considered: every option genuinely evaluated
- Decision Made: what was chosen
- Reasoning: why
- Consequences: trade-offs accepted, what this enables/constrains
- Alternatives Rejected: each non-chosen option, with the specific reason it lost
- Related Files: code/docs this decision touches
- Review Date: a condition or point that should trigger revisiting this decision (a fixed calendar date only where one genuinely applies — most engineering decisions are better tied to a triggering condition than an arbitrary date)
```

Every new major engineering decision going forward gets a new TDR here at decision time — cross-referenced from `TECHNICAL_DEBT_REGISTER.md` where it produces an accepted trade-off, and from `MILESTONES.md` at the point it ships.

---

### TDR-001 — CMS-agnostic content repository abstraction
- **Status:** Accepted, implemented
- **Context:** the site initially read content from local TypeScript fixture files during early development, before a real CMS was connected.
- **Problem:** moving to Sanity meant every page component would otherwise need to call Sanity's specific query/client API directly, coupling every page to one vendor.
- **Options Considered:** (1) call the Sanity client directly from every page/component; (2) build a `contentRepository` interface with swappable implementations.
- **Decision Made:** built the `contentRepository` abstraction (`src/lib/content/index.ts`) with `sanityContentRepository` as the live implementation.
- **Reasoning:** decouples every consuming page from the specific CMS vendor; made the CMS migration itself stageable (swap the implementation behind one flag) instead of a site-wide rewrite; every content type added since (Ordift Pulse, media metadata, site-wide singletons) shipped through the same seam without touching page components.
- **Consequences:** one extra abstraction layer to maintain in exchange for migration safety and a single seam for every future content type.
- **Alternatives Rejected:** direct Sanity calls per page — rejected because it would make any future CMS change (or even a Sanity API version bump with breaking query changes) a site-wide, high-risk rewrite instead of a one-file change.
- **Related Files:** `src/lib/content/index.ts`, `src/lib/content/sanity/`, `CMS_MIGRATION.md`.
- **Review Date:** only if a second CMS implementation is ever genuinely needed (not anticipated).

### TDR-002 — Supabase Row-Level Security as the primary authorization boundary
- **Status:** Accepted, implemented
- **Context:** the platform has seven distinct roles (Super Admin/Admin/Staff/Contractor/Vendor/Model/Client), each needing different data visibility across a growing number of tables.
- **Problem:** where should the actual security boundary live — in application code, in the database, or both?
- **Options Considered:** (1) application-layer-only checks (API routes/server components check role before returning data); (2) Postgres RLS as the real boundary, app code as a secondary convenience layer.
- **Decision Made:** RLS policies are the actual security boundary — a query only returns rows a given authenticated user is permitted to see, regardless of what the calling code does.
- **Reasoning:** application-layer-only checks fail silently the moment one code path forgets to check; RLS makes an unauthorized read structurally impossible instead of a discipline requirement.
- **Consequences:** RLS policy correctness is the single most security-critical thing in the schema; every new table needs its policy designed deliberately and its `service_role` grants scoped exactly (the lesson from migrations 0010-0012, where over-broad grants were caught and narrowed).
- **Alternatives Rejected:** app-layer-only authorization — rejected because it was already a known, well-documented bug class (one missed check anywhere = a real breach), and this project explicitly wanted a guarantee, not a discipline.
- **Related Files:** every RLS policy across `supabase/migrations/`, `src/lib/portal/roles.ts`, `src/lib/portal/rls.integration.test.ts` (the Version 1.0.5 integration test proving this decision holds in practice).
- **Review Date:** every new table addition (Version 1.1 onward) must have its RLS policy reviewed before merge; also the subject of Version 1.0.5 Workstream I's security re-review.

### TDR-003 — Google Sheets as a secondary durability layer, Supabase as primary
- **Status:** Accepted, implemented
- **Context:** business operations wanted enquiry/booking/registration data visible in Google Sheets — a familiar tool for non-technical staff.
- **Problem:** a third-party API can't safely be the primary system of record (it can fail, rate-limit, or have an outage independent of the platform) — how to give the business its Sheets workflow without making platform correctness depend on it?
- **Options Considered:** (1) Google Sheets as the sole/primary store; (2) Supabase primary with Sheets as a best-effort mirror; (3) Supabase only, no Sheets integration at all.
- **Decision Made:** Supabase Postgres is the system of record; every write also attempts a Sheets sync, and a failed sync is logged to `sheet_sync_failures` (migration 0013) rather than blocking or losing the primary submission.
- **Reasoning:** gives the business what it wants without coupling platform correctness to a third-party API's uptime; the dead-letter table makes a Sheets outage recoverable instead of silent data loss.
- **Consequences:** dual-write complexity; the dead-letter table needs monitoring to be useful, which it currently doesn't have (TD-005) — an operational gap in an otherwise sound decision.
- **Alternatives Rejected:** Sheets-as-primary — rejected outright, unacceptable reliability profile for a system of record; Supabase-only (no Sheets) — rejected because it would have ignored a genuine, named business requirement for a tool staff already knew how to use.
- **Related Files:** `supabase/migrations/0013_record_ids_and_sheet_sync.sql`, `src/lib/shared/sheetSyncFailures.ts`, `GOOGLE_SHEETS_INTEGRATION.md`.
- **Review Date:** if Sheets sync failure rate ever becomes chronic rather than occasional — reassess live-sync vs. scheduled batch export.

### TDR-004 — Four independent axes for people-classification: Role, Position, Grade, Engagement Type
- **Status:** Accepted, implemented
- **Context:** the platform needed to represent organizational seniority (Grade) and job function (Position) alongside permission-role (Role) and contractual relationship (Engagement Type).
- **Problem:** how to add seniority/title concepts without ever letting them accidentally gate access?
- **Options Considered:** (1) fold seniority/title into the existing Role enum; (2) keep four genuinely independent concepts, each its own table/column, none referenced by permission checks except Role.
- **Decision Made:** four independent axes, hard constraint that Grade/Position/Engagement Type are never read by an authorization check.
- **Reasoning:** conflating "what you're allowed to do" with "how senior you are" or "what you're called" is a known source of permission bugs; structural separation makes that bug class impossible rather than a code-review discipline.
- **Consequences:** more tables/lookups than a single combined field; in exchange Grade stays confidential (admin-only) while Role/permissions stay functionally necessary everywhere, fully independent of each other.
- **Alternatives Rejected:** folding Grade/Position into Role — rejected because it directly risked a senior title accidentally granting access, or a permission change accidentally affecting org-chart position.
- **Related Files:** `supabase/migrations/0017_grades.sql`, `supabase/migrations/0019_classifications.sql`, `ADMIN_GUIDE.md` §9.1.
- **Review Date:** any future feature that wants to "just check someone's Grade to decide access" is a signal this boundary is under pressure — treat as a design smell, not a precedent.

### TDR-005 — Separate Sanity datasets for staging and production
- **Status:** Accepted, implemented
- **Context:** needed to test real CMS-driven pages with placeholder/sample content with zero risk of that content reaching production.
- **Problem:** how to guarantee staging sample content structurally cannot appear on the live site?
- **Options Considered:** (1) one shared dataset with a `status`/`environment` flag on documents; (2) two fully separate Sanity datasets, production querying only its own.
- **Decision Made:** fully separate datasets.
- **Reasoning:** a content-flag approach depends on every query correctly filtering, forever — one missed filter leaks sample content to production. Dataset separation makes that failure mode structurally impossible, same reasoning as TDR-002.
- **Consequences:** content approved for production must be explicitly loaded into the production dataset (no promote-by-flag); more manual step, but it enforces the project's "never invent facts, always get explicit approval" content discipline at the infrastructure level.
- **Alternatives Rejected:** shared-dataset-with-flag — rejected because its safety depended on perfect, permanent query discipline rather than a structural guarantee.
- **Related Files:** `STAGING.md`, `sanity.config.ts`, `.env.example` (`NEXT_PUBLIC_SANITY_DATASET`).
- **Review Date:** none scheduled — this pattern is the default for any future environment-separation need (e.g. a second business unit onboarding onto the `business_id`-scoped schema).

### TDR-006 — Reusable CMS-agnostic media component library, built ahead of specific content types
- **Status:** Accepted, implemented
- **Context:** Portfolio, Journal, Workshops, and later Talent/Ordift Pulse all needed responsive image/gallery rendering.
- **Problem:** build media handling separately per content type (duplicating responsive/empty-state/accessibility logic each time), or once, generically?
- **Options Considered:** (1) inline per-content-type media handling as each type is built; (2) one reusable component set decoupled from any specific content type.
- **Decision Made:** built the reusable library (`ResponsiveImage`/`MediaAsset`/`Gallery`/`Avatar`/`BeforeAfterGallery`) first, forward-looking to content types that didn't exist yet.
- **Reasoning:** the responsive/accessibility/empty-state requirements were already proven identical across four real use cases at decision time — not speculative generality.
- **Consequences:** the one deliberate "build ahead of immediate need" in the codebase, justified by already-demonstrated repetition rather than guessed future need.
- **Alternatives Rejected:** per-content-type implementations — rejected because the pattern was already proven identical, making duplication pure waste, not risk-avoidance.
- **Related Files:** `MEDIA_ARCHITECTURE.md`, `src/components/media/`.
- **Review Date:** if a future content type needs media rendering that doesn't fit this library's shape — extend the library, don't fork a parallel implementation.

### TDR-007 — Ordift Pulse embedded into existing Journal section, not a separate route
- **Status:** Accepted, implemented
- **Context:** Ordift Pulse (curated industry-news feed) was built well ahead of its originally planned schedule (Version 4.0).
- **Problem:** give Pulse a public-facing surface without building a second, largely-duplicate article system alongside the existing Journal.
- **Options Considered:** (1) a dedicated `/pulse` route and UI, fully separate from `/journal`; (2) embed Pulse into `/journal` via a Content Type filter and trust badges, keeping the underlying schemas (`journalPost` vs `pulseArticle`) fully separate.
- **Decision Made:** embedded into `/journal`, schemas kept separate.
- **Reasoning:** the public-facing cost of a second content hub (navigation, discovery, duplicate templates) wasn't justified by demonstrated audience demand yet; keeping schemas separate preserved the option to split later without a data migration.
- **Consequences:** `/journal` now serves two conceptually distinct content types behind one UI — slightly more complex hub logic, zero duplicate infrastructure.
- **Alternatives Rejected:** dedicated `/pulse` route now — rejected as premature investment in discovery/navigation infrastructure for content whose audience demand hadn't been demonstrated yet.
- **Related Files:** `PULSE_ARCHITECTURE.md`, `STORIES_PULSE_INTEGRATION.md`, `src/lib/content/storiesFeed.ts`.
- **Review Date:** revisit if audience demand for a distinct Pulse identity ever justifies the split (explicitly flagged in `PRODUCT_ROADMAP.md` Version 4.0).

### TDR-008 — Forms default to external reference links, not direct upload (Tier 1 vs. Tier 2)
- **Status:** Accepted, implemented (Tier 1); Tier 2 explicitly not yet implemented
- **Context:** several forms conceptually want to accept files (portfolio samples, booking references), but real file upload requires answering storage/access/retention questions not yet evaluated.
- **Problem:** ship low-sensitivity forms without either over-building for their needs or under-building security for the high-sensitivity forms that will come later.
- **Options Considered:** (1) build generic upload immediately for any form that could use it; (2) tier by data sensitivity — Tier 1 uses reference links only, Tier 2 (CVs, ID documents, consent forms) stays disabled until a dedicated secure-storage evaluation is complete.
- **Decision Made:** (2) — tiered, with Tier 2 explicitly gated.
- **Reasoning:** building upload infrastructure before deciding how sensitive documents will be stored risks either over-building for Tier 1 or under-building security for Tier 2.
- **Consequences:** Client Portal currently has zero upload capability by design (confirmed in-code); Version 2.0 (Talent Management) cannot ship Contracts/Documents until the secure-storage evaluation happens — already a hard release-criterion dependency in `PRODUCT_ROADMAP.md`.
- **Alternatives Rejected:** building generic upload now — rejected because it would have meant guessing a security posture for sensitive documents (CVs, ID) without a deliberate evaluation, the single highest legal/privacy risk item on the entire roadmap per `PRODUCT_ROADMAP.md` Version 2.0's own risk note.
- **Related Files:** `src/lib/admin/deliverables.ts`, `PRODUCT_ROADMAP.md` (Version 2.0 dependency).
- **Review Date:** Version 2.0's kickoff — the storage evaluation must happen as its own explicit decision point before any code touches real sensitive documents.

### TDR-009 — Platform Health Dashboard stays a documentation layer, not a live application, until named triggers are met
- **Status:** Accepted, implemented (documentation layer only)
- **Context:** Version 1.0.5 Workstream G originally named a "Platform Health Dashboard." At current scale — pre-launch, founder-led, no engineering team checking a dashboard daily — a live internal application is itself a new feature, which cuts directly against this milestone's purpose ("not another feature above the platform").
- **Problem:** how to give visibility into test/CI/deployment/monitoring/backup/security/debt/release status without building disproportionate infrastructure for the team size that exists today.
- **Options Considered:** (1) build a live, real-time internal dashboard application now; (2) a maintained `SYSTEM_HEALTH.md` documentation/evidence layer, consolidating or referencing facts already owned by other living documents, with no new infrastructure.
- **Decision Made:** (2) — `SYSTEM_HEALTH.md`, explicitly scoped as documentation/evidence, not a new build.
- **Reasoning:** confirmed 2026-07-30 — the maintenance cost of a live app (hosting, auth, upkeep) isn't justified when the person who'd check it is also the person maintaining the underlying documents it would summarize. A markdown layer gets most of the visibility value at near-zero ongoing cost.
- **Consequences:** `SYSTEM_HEALTH.md` can go stale if not updated as part of each milestone's definition-of-done — an accepted, actively mitigated trade-off, not an oversight.
- **Alternatives Rejected:** the live dashboard — not rejected permanently, deferred behind explicit, named reactivation triggers (below) rather than built speculatively.
- **Related Files:** `SYSTEM_HEALTH.md` (Workstream G), `PRODUCT_ROADMAP.md` Version 1.0.5 Workstream G, `PLATFORM_HEALTH_REVIEW.md`.
- **Review Date:** reconsider a live dashboard only when any of these becomes true — manual maintenance of `SYSTEM_HEALTH.md` becomes unreliable; multiple engineers or environments need centralized visibility; incident volume justifies it; real-time operational decisions start depending on it; or the cost of not automating demonstrably exceeds the cost of building and maintaining it. None of these are true as of 2026-07-30.

---

*Cross-references: `PRODUCT_ROADMAP.md` (Version 1.0.5), `TECHNICAL_DEBT_REGISTER.md`, `INTEGRATION_TESTING_STRATEGY.md`, `ENGINEERING_GUIDE.md`, `MEDIA_ARCHITECTURE.md`, `PULSE_ARCHITECTURE.md`, `DOCUMENTATION_INDEX.md`.*
