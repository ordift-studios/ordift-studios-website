# Architecture Decision Records

**Established:** 2026-07-30, as Workstream F of `PRODUCT_ROADMAP.md`'s Version 1.0.5 — Platform Foundation Hardening.

**Purpose:** record every major technical decision with its reasoning, not just its outcome — so a future engineer (including a future instance of whoever is building this) understands *why* the system works the way it does instead of having to reverse-engineer it or guess. ADRs are never edited after acceptance to reflect new information — a changed decision gets a new ADR that supersedes the old one.

**Format:** each ADR has an ID, title, status, date, the problem being solved, the options genuinely considered, the decision made, the reasoning behind it, its consequences (including trade-offs accepted), and a future review trigger — the condition that should prompt revisiting it.

**Numbering 1-8 below are backfilled** for major decisions already made and shipped, reconstructed accurately from the project's build history. From this point forward, every new major technical decision gets a new ADR at the time it's made, not retroactively.

---

### ADR-001 — CMS-agnostic content repository abstraction
- **Status:** Accepted, implemented
- **Date:** during CMS migration phase (pre-2026-07-27)
- **Problem:** the site initially read content from local TypeScript fixture files; moving to a real CMS (Sanity) meant every page component would otherwise need to know about Sanity's specific query/client API directly.
- **Options considered:** (a) call the Sanity client directly from every page/component; (b) build a `contentRepository` interface with swappable implementations (local fixtures, Sanity).
- **Decision:** built the `contentRepository` abstraction (`src/lib/content/index.ts`) with `sanityContentRepository` as the live implementation and the local-fixture implementation kept as a reference/fallback shape.
- **Reasoning:** decouples every consuming page from the specific CMS vendor; made the migration itself verifiable in stages (swap the implementation behind one flag, not rewrite every page); keeps a future CMS migration (if ever needed) to one layer instead of a site-wide rewrite.
- **Consequences:** one extra abstraction layer to maintain; in exchange, every new content type (Ordift Pulse, media metadata, site-wide singletons) has shipped through the same seam without touching page components' calling code.
- **Future review trigger:** none currently — revisit only if a second CMS implementation is ever genuinely needed (not anticipated).

### ADR-002 — Supabase Row-Level Security as the primary authorization boundary
- **Status:** Accepted, implemented
- **Date:** portal auth build phase
- **Problem:** the platform has seven distinct roles (Super Admin/Admin/Staff/Contractor/Vendor/Model/Client) each needing different data visibility; authorization logic needed one enforcement point, not scattered checks.
- **Options considered:** (a) enforce access rules only in application code (API routes/server components check role before returning data); (b) enforce at the database layer via Postgres RLS policies, with app code as a secondary convenience layer, not the security boundary.
- **Decision:** RLS policies are the actual security boundary; a query only returns rows a given authenticated user is permitted to see, regardless of what the calling code does.
- **Reasoning:** application-layer-only checks fail silently the moment one code path forgets to check — RLS makes an unauthorized read structurally impossible rather than a discipline requirement. This was validated directly: every role's RLS boundary was independently E2E-tested in production (client/staff/anonymous-access boundary checks).
- **Consequences:** RLS policy correctness is now the single most security-critical thing in the schema — every new table needs its policies designed deliberately, and `service_role` grants scoped to exactly what code needs (the lesson from migrations 0010-0012, where over-broad grants were caught and narrowed).
- **Future review trigger:** every new table addition (Version 1.1+ onward) must have its RLS policy reviewed before merge — this is the primary subject of Version 1.0.5 Workstream I's re-review.

### ADR-003 — Google Sheets as a secondary durability layer, Supabase as primary
- **Status:** Accepted, implemented
- **Date:** migration 0013 (record IDs + Sheet sync)
- **Problem:** business operations wanted enquiry/booking/registration data visible in Google Sheets (familiar tool, easy for non-technical staff), but a third-party API can't be the primary system of record — it can fail, rate-limit, or have an outage independent of the platform.
- **Options considered:** (a) Google Sheets as the sole/primary data store; (b) Supabase as primary with Sheets as a best-effort mirror; (c) Supabase only, no Sheets integration.
- **Decision:** Supabase Postgres is the system of record; every write also attempts a Sheets sync, and a failed Sheets write is logged to `sheet_sync_failures` (migration 0013) rather than blocking or losing the primary submission.
- **Reasoning:** gives the business the Sheets workflow it wants without making platform correctness depend on a third-party API's uptime; the dead-letter table means a Sheets outage is recoverable (replayable) rather than silent data loss.
- **Consequences:** dual-write complexity (two places to keep consistent); the dead-letter table itself needs monitoring to be useful, which it currently doesn't have (see `TECHNICAL_DEBT_REGISTER.md` TD-005) — an operational gap in an otherwise sound architectural choice.
- **Future review trigger:** if Sheets sync failure rate ever becomes chronic rather than occasional, worth reassessing whether Sheets stays a live sync vs. a scheduled batch export instead.

### ADR-004 — Four independent axes for people-classification: Role, Position, Grade, Engagement Type
- **Status:** Accepted, implemented
- **Date:** Grade system build (migration 0017 onward)
- **Problem:** the platform needed to represent organizational seniority (Grade) and job title/function (Position) in addition to permission-role (Role) and contractual relationship (Engagement Type) — without letting any of these accidentally start gating access.
- **Options considered:** (a) fold seniority/title into the existing Role enum; (b) keep four genuinely independent concepts, each with its own table/column, none referenced by permission checks except Role.
- **Decision:** four independent axes, hard constraint that Grade/Position/Engagement Type must never be read by an authorization check — only Role controls permissions.
- **Reasoning:** conflating "what you're allowed to do" with "how senior you are" or "what you're called" is a well-known source of permission bugs (a senior title accidentally granting access it shouldn't, or a permission change accidentally affecting someone's org-chart position). Keeping them structurally separate — separate tables, explicitly never joined into an `if` gating access — makes that entire bug class impossible rather than a code-review discipline.
- **Consequences:** more tables/lookups than a single combined field would need; in exchange, Grade is confidential (admin-only visible) while Role/permissions are functionally necessary everywhere, and the two can now evolve completely independently without risk of cross-contamination.
- **Future review trigger:** any future feature request that wants to "just check someone's Grade to decide access" is a signal this boundary is being pressured — treat it as a design smell requiring the same explicit-Role-based approach instead, not an exception.

### ADR-005 — Separate Sanity datasets for staging and production (not content flags)
- **Status:** Accepted, implemented
- **Date:** original CMS/staging architecture (Phase 1A plan)
- **Problem:** needed a way to test real CMS-driven pages with placeholder/sample content without any risk of that sample content reaching the live production site.
- **Options considered:** (a) one shared Sanity dataset with a `status`/`environment` flag on documents to distinguish staging-only content; (b) two fully separate Sanity datasets (staging, production), with production querying only its own dataset.
- **Decision:** fully separate datasets. Staging placeholder/sample content structurally cannot appear on production because production's queries never touch the staging dataset at all.
- **Reasoning:** a content-flag approach depends on every query correctly filtering by the flag, forever — one missed filter and sample content leaks to production. Dataset separation makes that failure mode structurally impossible instead of a discipline requirement, the same reasoning pattern as ADR-002's RLS decision.
- **Consequences:** any content approved for production has to be explicitly loaded into the production dataset (no promote-by-flipping-a-flag) — more manual step, but it directly enforces the project's standing "never invent facts, always get explicit approval" content discipline at the infrastructure level, not just as a process rule.
- **Future review trigger:** none — this pattern should be the default for any future environment-separation need too (e.g., if a second business unit is ever onboarded onto the `business_id`-scoped schema).

### ADR-006 — Reusable CMS-agnostic media component library, built ahead of specific content types
- **Status:** Accepted, implemented
- **Date:** 2026-07-27, media architecture build
- **Problem:** Portfolio, Journal, Workshops, and (later) Talent portfolios and Ordift Pulse all needed responsive image/gallery rendering — building it separately per content type would duplicate the same responsive/empty-state/accessibility logic repeatedly.
- **Options considered:** (a) build image/gallery handling inline per content type as each one is built; (b) build one reusable component set (`ResponsiveImage`/`MediaAsset`/`Gallery`/`Avatar`/`BeforeAfterGallery`) decoupled from any specific content type, used by all of them.
- **Decision:** built the reusable library first, deliberately forward-looking to content types (Staff Profiles, Talent portfolios, Ordift Pulse cards) that didn't exist yet at build time.
- **Reasoning:** the responsive/accessibility/empty-state requirements are identical regardless of content type; building it once means every future content type that needs media rendering is a wiring exercise, not a new implementation.
- **Consequences:** this is the one piece of "build ahead of immediate need" in the codebase — justified because the pattern (image/gallery rendering) was already proven identical across four use cases at decision time, not speculative. See `MEDIA_ARCHITECTURE.md` §8 for the full breakdown of what it already serves.
- **Future review trigger:** if a future content type needs media rendering that doesn't fit this library's shape, that's a signal to extend the library, not fork a parallel implementation.

### ADR-007 — Ordift Pulse embedded into existing Journal section, not a separate route
- **Status:** Accepted, implemented
- **Date:** 2026-07-27
- **Problem:** Ordift Pulse (curated industry-news feed) was being built well ahead of its originally planned schedule (Version 4.0); needed a public-facing surface without building a second, largely-duplicate article/content system alongside the existing Journal.
- **Options considered:** (a) a dedicated `/pulse` route and UI, fully separate from `/journal`; (b) embed Pulse content into the existing `/journal` hub via a Content Type filter and trust badges, keeping the underlying Sanity schemas (`journalPost` vs `pulseArticle`) fully separate behind the scenes.
- **Decision:** embedded into `/journal`, per explicit direction to save implementation time and avoid a duplicate article system, while keeping the two document types schema-separate so a dedicated `/pulse` section remains "new routes away, not a schema migration" if audience demand ever justifies splitting it out.
- **Reasoning:** the public-facing cost of a second content hub (navigation, discovery, another set of list/detail templates) wasn't justified yet by demonstrated demand; keeping schemas separate preserved the option to split later without a data migration.
- **Consequences:** `/journal` now serves two conceptually distinct content types behind one UI (Content Type filter distinguishes them) — slightly more complex hub logic in exchange for zero duplicate infrastructure.
- **Future review trigger:** explicitly flagged in `PRODUCT_ROADMAP.md` Version 4.0 — revisit if audience demand for a distinct Pulse identity ever justifies the split.

### ADR-008 — Forms default to external reference links, not direct upload (Tier 1 vs Tier 2)
- **Status:** Accepted, implemented (Tier 1); Tier 2 explicitly not yet implemented
- **Date:** original Phase 1A plan
- **Problem:** several forms conceptually want to accept files (portfolio samples, booking references) but building file upload well means answering real security questions (storage, access control, retention) that hadn't been evaluated yet.
- **Options considered:** (a) build generic file upload immediately for any form that could use it; (b) tier forms by data sensitivity — Tier 1 (general contact, booking, waitlist) uses reference links (a URL field) with no upload capability at all; Tier 2 (talent applications, CVs, ID documents) stays disabled until a dedicated secure-storage evaluation (signed-URL object storage vs. a dedicated secure-forms provider) is completed and tested.
- **Decision:** (b) — this is why the Client Portal has zero upload capability today (confirmed in-code) and Deliverables are external links, not hosted files.
- **Reasoning:** building upload infrastructure before deciding how sensitive documents (CVs, ID documents, consent forms) will be stored risks either over-building for Tier 1's low-sensitivity needs or under-building security for Tier 2's high-sensitivity needs. Splitting them let Tier 1 ship immediately with negligible risk while deliberately gating Tier 2 behind a real decision.
- **Consequences:** Version 2.0 (Talent Management) cannot ship Contracts/Documents features until the secure-storage evaluation happens — already encoded as a hard release-criterion dependency in `PRODUCT_ROADMAP.md`.
- **Future review trigger:** Version 2.0's kickoff is the trigger — the storage evaluation must happen as its own explicit decision point before any code touches real sensitive documents.

---

## Adding new ADRs

Every major technical decision going forward — schema architecture choices, third-party service selections, security-boundary designs, anything a future engineer would otherwise have to guess the reasoning for — gets a new numbered ADR here at decision time, cross-referenced from `TECHNICAL_DEBT_REGISTER.md` where the decision also produced an accepted trade-off, and from `MILESTONES.md` at the point it ships.

*Cross-references: `PRODUCT_ROADMAP.md` (Version 1.0.5, this record's parent milestone), `TECHNICAL_DEBT_REGISTER.md` (trade-offs some of these decisions produced), `MEDIA_ARCHITECTURE.md`, `PULSE_ARCHITECTURE.md`, `DOCUMENTATION_INDEX.md`.*
