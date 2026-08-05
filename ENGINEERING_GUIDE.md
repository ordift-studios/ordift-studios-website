# Engineering Guide — Ordift Studios Engineering Standards Manual

**Established:** 2026-07-30, as Workstream D of `PRODUCT_ROADMAP.md`'s Version 1.0.5 — Platform Foundation Hardening. **Expanded to its full scope 2026-08-05**, at your explicit instruction, as Phase 1 of the platform-standardization initiative that followed the Portfolio Management System's completion.

**Status:** complete as a standards document. Every section below states a rule, then grounds it in the actual code that already follows it — almost entirely the Portfolio Management System, per your instruction that it become "the architectural benchmark for the entire Ordift Studios ecosystem." Nothing here is aspirational or invented; every pattern cited is live, shipped code you can open and read today.

**Purpose:** the standing engineering reference a future senior engineer — including a future instance of whoever is building this — should be able to read and understand how this system actually works, without reconstructing it from session history. Pairs with `TECHNICAL_DECISION_RECORDS.md` (why specific decisions were made), `TECHNICAL_DEBT_REGISTER.md` (what's known to be imperfect and why that was accepted), and `DEVELOPMENT_GUIDE.md` (the process contract — branching, versioning, release/deployment/PR checklists, commit conventions, documentation standards — deliberately **not** repeated here; see §16).

**How to use this document:** when starting any new module (Bookings, CRM, HR, Finance, Vendors, Models, Workshops, Inventory, Legal, Reports, Notifications, Client Portal, Staff Portal — see `PRODUCT_ROADMAP.md`), read this guide first and build the module so that, if someone swapped its business domain for Portfolio's, the resulting code would look structurally identical. Deviating from a pattern here is not forbidden — but it must be a deliberate, reasoned choice (documented as a TDR if it's a real architectural fork), never an accident of not having read this.

---

## §1 — Environment Configuration — the Config-Injection Principle

**The rule:** nothing in this codebase hardcodes which environment (staging vs. production, or — going forward — real staging vs. a future disposable test environment) it's talking to. Every environment-specific value — which Supabase project, which Sanity dataset, which Sheets spreadsheet, which Resend configuration — is resolved from environment variables, read at runtime, never baked into source.

**Why this matters, concretely:**

- **It's already load-bearing for staging/production isolation.** TDR-005 (`TECHNICAL_DECISION_RECORDS.md`) established fully separate Sanity datasets specifically so sample content is *structurally* incapable of reaching production — that guarantee only holds because which dataset gets queried is an environment variable, not a hardcoded string anywhere in a page component.
- **It's the exact mechanism that made the Version 1.0.5 integration-testing decision possible.** You approved a hybrid model (2026-07-30): use the real staging environment for integration tests today, but design the test harness so a future migration to a dedicated ephemeral test environment is a configuration change, not a rewrite. That's only achievable because the test harness (`INTEGRATION_TESTING_STRATEGY.md` §7, `src/lib/testing/testEnvironment.ts`) resolves its target environment from env vars (`TEST_SUPABASE_URL`, `TEST_SHEETS_SPREADSHEET_ID`, etc.) exactly the same way the application itself does — the pattern didn't need to be invented for testing, it already existed and was simply extended.
- **It generalizes beyond this one decision.** Any future need to point the platform (or its test suite) at a different backend — a new environment tier, a disaster-recovery failover target, a regional deployment (Vision 2030's multi-country direction) — is a configuration change under this principle, not an architecture change. This is why it's documented here as a standing principle rather than a one-off note in the testing strategy alone.

**How to apply it going forward:** any new integration this codebase adds — a new third-party API, a new data store, a new notification channel — should default to reading its target/credentials from environment variables from the first line of code, not "for now hardcode it and parameterize later." Retrofitting this after the fact (as TDR-005 did have to do carefully for datasets) is more work than building it in from the start.

---

## §2 — Repository & Folder Structure

**The rule:** the codebase is organized by *layer*, not by feature-per-folder — `src/app` (routes), `src/components` (presentation), `src/lib` (domain logic), `src/sanity` (CMS schema/config). Within `src/lib` and `src/components`, a subfolder per business domain groups everything that domain owns.

```
src/
  app/                          # Next.js App Router — routes only, minimal logic
    admin/portfolio/            #   e.g. the reference implementation's admin surface
      [id]/edit/page.tsx        #   dynamic route segments in [brackets]
      actions.ts                #   Server Actions co-located with the routes that call them
      page.tsx
    work/[slug]/page.tsx        # the matching PUBLIC route for the same domain
    api/admin/portfolio/assets/route.ts   # Route Handlers, only where Server Actions can't do the job (see §7)
  components/
    portfolio/PortfolioCard.tsx # presentation components, grouped by domain
    media/ResponsiveImage.tsx   # cross-domain shared components live in their own folder (see §18)
    admin/ProfileQuickCard.tsx
  lib/
    admin/                      # admin-only domain logic (permissions, activity log, workflow glue)
      portfolioPermissions.ts
      activityLog.ts
      portfolioWorkflow.ts
      portfolioValidation.ts
    content/
      types.ts                  # the CMS-agnostic domain types every page/component consumes
      sanity/                   # the Sanity-specific adapter (queries.ts, repository.ts, portfolioAdmin.ts)
      local/                    # the local-fixture adapter (same interface, sample data)
    portal/                     # cross-cutting identity/roles/auth (roles.ts, actorIdentity.ts, profileCard.ts)
    workflow/                   # the generic, reusable engine (engine.ts, types.ts) — not portfolio-specific
    media/                      # shared media utilities (sanityLoader.ts, ogImageUrl.ts, clientImageCompress.ts)
  sanity/schemaTypes/
    documents/portfolioProject.ts
    objects/mediaAsset.ts       # shared object types referenced by multiple document schemas
supabase/migrations/            # numbered, additive-only (§10)
scripts/                        # one-off/operational scripts — never referenced by the app itself
```

**Why layered-by-domain rather than one folder per feature:** a new module (Bookings, CRM, HR, …) doesn't get its own top-level directory — it gets a slice through `app/admin/<module>/`, `lib/<module>/` or `lib/admin/<module>*.ts`, and `components/<module>/`, exactly matching how Portfolio is laid out today. This keeps the three concerns (routing, presentation, domain logic) separable and testable independently, and keeps `src/lib` reusable by both the public site and the Admin Portal without either importing from `src/app`.

**Cross-domain code goes in a shared folder, not duplicated.** `src/lib/workflow/` (the generic approval-workflow engine, §13), `src/lib/media/` (§18), and `src/lib/portal/actorIdentity.ts` (§12) all exist because Portfolio needed them but nothing about their implementation is Portfolio-specific — every future module reuses them rather than reimplementing.

## §3 — File & Naming Conventions

- **Files:** `camelCase.ts` for modules/utilities (`portfolioPermissions.ts`, `activityLog.ts`); `PascalCase.tsx` for React components (`PortfolioCard.tsx`, `ResponsiveImage.tsx`); `page.tsx` / `layout.tsx` / `actions.ts` / `route.ts` for the fixed Next.js App Router file roles.
- **Functions:** verb-first and specific — `getPortfolioProjectByIdAdmin`, `createProjectDraftAction`, `resolveActorIdentities`, `canCreatePortfolioProjectsNatively`. A function's name should make its return shape guessable (`get*` returns data or null, `create*Action`/`update*Action`/`delete*Action` are Server Actions, `can*`/`has*` return booleans, `require*` throws or returns a guaranteed-non-null value).
- **Types:** `PascalCase`, named after the domain concept they model, not their storage shape — `PortfolioProject`, `MediaAsset`, `ActorIdentity` — never `PortfolioProjectRow` or `PortfolioProjectDTO`. The domain type is the only shape components should ever see (see §10's CMS-agnostic repository pattern).
- **Server Action naming:** `<verb><Noun>Action`, e.g. `transitionPortfolioProjectAction`, `toggleFeaturedAction`, `saveProjectFieldsAction`, `deletePortfolioProjectAction` — the `Action` suffix is load-bearing, not decorative: it's what lets a reader scan an imports list and immediately know which functions are Server Actions (client-callable, capability-checked, revalidate paths) versus plain internal helpers.
- **Sanity GROQ query constants:** `<noun>Query` or `<noun>Fragment` (`portfolioProjectsQuery`, `portfolioProjectFragment`, `mediaAssetFragment`) in `src/lib/content/sanity/queries.ts` / `groqFragments.ts` — never inlined as a string literal inside a repository method.
- **Migrations:** `NNNN_short_description.sql`, four-digit zero-padded, strictly increasing, one migration per logical change (see §10).

## §4 — Component Architecture

**The default is a Server Component.** `PortfolioProjectForm.tsx` (the native creation/editing wizard) is explicitly called out in its own file header as *"the one significant Client Component in an otherwise Server-Component-heavy admin surface"* — that asymmetry is the standard, not an accident. A component only becomes a Client Component (`"use client"`) when it genuinely needs browser APIs, local interactive state, or event handlers that can't be expressed as a Server Action form submission.

**Composition over configuration.** `ResponsiveImage` (§18) takes `src`/`alt`/`width`/`height`/`lqip` — plain data — and renders correctly or falls back to `MediaPlaceholder` on its own; callers never pass a `mode` or `variant` flag to steer its internal behavior. `PortfolioCard` composes `MediaAsset` rather than reimplementing image rendering. When two components need to share behavior, extract a smaller component (`Gallery` wraps `ResponsiveImage` per tile) rather than adding conditional branches to one component for multiple contexts.

**Presentation components take domain types, not raw CMS shapes.** `PortfolioCard({ project, categories })` receives a `PortfolioProject` and `Category[]` — types from `src/lib/content/types.ts` — never a raw Sanity document. This is what makes the CMS-agnostic repository pattern (§10) actually pay off: swapping the data source doesn't touch a single component.

**Reusable UI primitives live in `src/components/` at the top level** (`Button.tsx`, `NavBar.tsx`, `Footer.tsx`); domain-specific composites live in their domain subfolder (`components/portfolio/PortfolioCard.tsx`). A component only moves up to the top level once a second, unrelated domain actually needs it — don't pre-emptively generalize a one-off.

## §5 — UI Design Patterns: Loading, Empty, and Error States

**Loading state:** this codebase does **not** use Next.js's file-based `loading.tsx` convention — there are zero `loading.tsx` files in `src/app`. Loading state is handled locally, inside the interactive component that triggers the async work, via plain `useState` and inline feedback text. `PortfolioProjectForm`'s save flow is the reference: a `saving` boolean flag disables the button and swaps its label to "Saving…", and a separate `saveError`/`dirty` pair drives the unsaved-changes warning and error message shown inline next to the action, not as a toast (see §17 for why this codebase doesn't use toasts).

**Empty state — the single most important UI rule in this codebase.** A section that queries the CMS/database and finds nothing renders **nothing**, never a fake/sample placeholder standing in for real content. This is stated explicitly in `src/app/page.tsx`'s own header comment and enforced identically in three places: the homepage's Featured Work section (`{featuredProjects.length > 0 && <section>...}`), `/work`'s Featured Projects section (same pattern), and `Gallery.tsx` (`if (images.length === 0) return null;`). The one sanctioned exception is `MediaPlaceholder` (§18) — a *branded*, clearly-not-real-content placeholder used only for image slots, never for whole sections of copy or listings. Never fabricate a "no items yet" sample row, a placeholder testimonial, or a synthetic featured project — either the section is absent, or (where a genuine informational empty state is appropriate, e.g. `/work`'s filtered results) a plain, honest sentence: *"No projects match these filters yet."*

**Error state — Server Actions return typed results, they don't throw for expected failures.** `ActionResult = { ok: true } | { ok: false; error: string }` (and `ActionResultWithId` when an id needs to come back) is the standard return shape for every mutating Server Action (`src/app/admin/portfolio/actions.ts`). A Server Action **throws** only for genuinely exceptional/programmer-error conditions — failed authorization (`requirePortfolioAdmin()`/`requireNativeCreator()` throw `"Not authorized."`), a readiness-check violation on a status transition. It returns `{ ok: false, error }` for expected, user-facing validation failures (a taken slug, a missing required field) so the calling Client Component can show the message inline without an error boundary. Route Handlers (§7) follow the equivalent convention: a typed JSON error body with a matching HTTP status, never a bare 500 for a validation failure.

## §6 — Server Actions Architecture

**Server Actions are called directly from Client Components as typed functions, not exclusively through `<form action>`.** `PortfolioProjectForm.tsx` calls `createProjectDraftAction(title, slug)`, `saveProjectFieldsAction(id, fields)`, and `checkSlugAvailableAction(slug, excludeId)` as plain async function calls with arbitrary typed parameters and typed return values — not just `FormData` and `void`, which is the more limited pattern still used by the older lifecycle actions (`transitionPortfolioProjectAction(formData: FormData)`, kept as-is because it's driven by a plain `<form>` with no client-side interactivity needed). **Use the richer typed-parameter form for anything a Client Component needs a real return value from** (an id to auto-select, a boolean availability check, a discriminated success/error result); keep the `FormData`-void form only for simple, no-JS-required form submissions.

**Every Server Action re-checks authorization itself — it never trusts that the page that rendered its trigger button already gated it.** `requirePortfolioAdmin()` / `requireNativeCreator()` (thin wrappers around `getCurrentUser()` + a capability check, throwing if unmet) are called at the top of every mutating action, not just once at the page level. This matters because a Server Action is a real network endpoint reachable independent of the UI that happens to render a button for it — the same reasoning that led to independently verifying the native editor's upload Route Handler returns 403 for an unauthorized request that bypasses the UI entirely (see `MILESTONES.md`'s native-editor entry).

**Mutations call `revalidatePath()` for every path whose rendered data just changed** — `saveProjectFieldsAction` revalidates both `/admin/portfolio/${id}` and `/admin/portfolio/${id}/edit`; `transitionPortfolioProjectAction` revalidates the list and the detail page. Forgetting a path means a page shows stale data until the next unrelated navigation — treat this as part of the action's contract, not an afterthought.

**Every state-changing action logs to `activity_log`** — see §11. This is not optional per-action; it's the same requirement as authorization and revalidation.

## §7 — API Route Conventions (Route Handlers)

**Default to a Server Action. Only reach for a Route Handler (`route.ts`) when Server Actions genuinely can't do the job.** The one Route Handler in the reference implementation, `POST /api/admin/portfolio/assets`, exists specifically because real file uploads need `multipart/form-data` handling and a materially higher request-body size limit than Server Actions default to — everything else in the native editor (creating, patching, transitioning, deleting a project) is a Server Action. Don't build a Route Handler as a matter of habit or because it "feels more like a real API" — it's strictly more code (manual request parsing, manual response construction, no automatic CSRF-equivalent protection Server Actions get) for the same outcome in every case Server Actions already cover.

**A Route Handler is a real, directly-fetchable HTTP endpoint — it must independently re-implement every check a Server Action gets for free.** The assets Route Handler authenticates via `getCurrentUser()` and checks `canCreatePortfolioProjectsNatively(user)` itself, exactly as if no page ever existed that happened to call it — verified live by hitting it directly with a non-admin session and confirming 403, not just confirming the UI hides the upload button.

**Response contract:** a typed success body (`{ ok: true, ...data }`) or a typed error body with a status code matching the failure category — `401` (not authenticated), `403` (authenticated, not authorized), `413` (payload too large), `415` (unsupported media type), `400` (malformed input), `502` (upstream/Sanity failure). Never a bare `500` for anything the caller could have avoided by sending a valid request.

**Size and type limits are enforced twice: fast-path on the `content-length` header, then again on the actual parsed file** — the assets handler checks `content-length` before doing any work (cheap early rejection), then re-checks `file.size` after parsing (since a client can lie about `content-length`). Apply the same two-layer discipline to any future upload endpoint.

## §8 — Validation Standards

**Public-facing form input is validated with Zod schemas, defined once and shared between the client form and the server that receives it.** `src/lib/enquiry/schema.ts` / `src/lib/workshops/registrationSchema.ts` define the canonical shape (`z.object({...})`) imported by both the client form component (`BookingForm.tsx`, `RegistrationForm.tsx`) for inline field-level feedback and the API route (`src/app/api/enquiry/route.ts`) for the authoritative server-side check — the client-side validation is a UX convenience, never the actual trust boundary. A new public form (a future Bookings/CRM contact form, etc.) gets its own `schema.ts` in that module's `lib` folder, following the same shared-schema shape.

**Internal admin mutations validate with plain, explicit checks close to the data, not a schema library.** The native Portfolio editor's slug-uniqueness check (`isSlugAvailable`), required-title check, and the Publish Readiness engine (`src/lib/admin/portfolioValidation.ts` — `getPublishReadiness()`) are hand-written functions returning `{ blocking: string[], warnings: string[] }`, not a Zod schema. This is deliberate, not a gap: admin validation here is business-rule validation ("a project needs a hero image before it can go to Pending Review"), which is usually cross-field and stateful in a way a static schema expresses awkwardly — write it as a plain function with a clear, testable return shape instead of forcing it through the schema-validation pattern meant for shaping raw external input.

**Server-side validation is re-run at the point of consequence, not trusted from an earlier step.** `saveProjectFieldsAction` re-checks slug availability server-side even though the wizard already did a live client-side check — a race between two open editor tabs is exactly the scenario a client-only check can't catch. `transitionPortfolioProjectAction` re-runs `getPublishReadiness()` before allowing a transition to `pending_review`/`published`, so the Review step's client-side checklist is informational, not the actual gate.

## §9 — Error Handling

**Expected failures are typed return values; only genuinely exceptional conditions throw.** See §6/§7 for the Server Action / Route Handler contracts. This extends to library code: `getPortfolioProjectForEdit(id)` returns `null` for "not found," which the calling page turns into `notFound()` (Next.js's canonical 404) — it does not throw a "not found" error for a completely ordinary, expected outcome (a bad or stale id in the URL).

**`notFound()` is the standard 404 mechanism for every dynamic route**, used consistently across `/journal/[slug]`, `/journal/authors/[slug]`, `/workshops/[slug]`, `/workshops/instructors/[slug]`, `/admin/bookings/[id]`, `/admin/portfolio/[id]`, `/admin/portfolio/[id]/edit`, and the portal's dynamic project routes — a new dynamic route follows the same `if (!entity) notFound();` shape rather than a custom "not found" page or a redirect.

**Best-effort side effects log and continue rather than fail the primary action.** `logActivity()`'s own comment states the principle directly: *"a failed log write should never block the action it's recording."* The same reasoning governs the Sheets dual-write (`sheet_sync_failures` dead-letter table instead of blocking the primary Supabase write) and the workflow-metadata companion writes (`recordPortfolioWorkflowTransition` — a failure there logs to console but never rolls back the Sanity status change that already succeeded, since Sanity is the source of truth for what's publicly visible). Apply this pattern whenever a mutation has one authoritative write and one or more secondary/observability writes: the authoritative write's success is what the user's action succeeded or failed on, never gated by a secondary write's outcome.

**Console errors are logged with a consistent, greppable prefix** — `[admin] failed to ...`, matching the module doing the logging — so production log search can filter by subsystem.

## §10 — Database Design Principles

**Migrations are additive-only, numbered, and never edited after being applied.** Every migration in `supabase/migrations/` adds a table/column/policy/function; none edits or drops a previously-applied migration's own changes (see `DEVELOPMENT_GUIDE.md` §6 for the full migration policy and rollback procedure — not repeated here). Staging always gets a migration first, verified, before it's ever applied to production.

**Row-Level Security is the actual authorization boundary, not application code** (TDR-002, `TECHNICAL_DECISION_RECORDS.md`). Every new table gets a deliberately-designed RLS policy at creation time, and `service_role` grants are scoped to exactly what the code needs — not broadened defensively "in case it's needed later." A query only ever returns rows the authenticated caller is actually permitted to see, regardless of what the calling code does or forgets to check.

**Polymorphic association over per-feature junction tables, once a pattern repeats.** `activity_log`, `workflow_statuses`, `workflow_assignments`, `deliverables`, and `project_requests` all share the same `entity_type text` / `entity_id text` shape rather than each inventing its own foreign-key relationship — this is what let the workflow engine (§13) become genuinely reusable across future entity types (workshop assignment review, talent applications, vendor submissions) without a new migration per consumer. `entity_id` is `text`, not `uuid`, specifically because Sanity document IDs (Portfolio's content) aren't UUIDs — a new polymorphic table should default to `text` unless every consumer is guaranteed UUID-keyed.

**Content stays in the CMS; operational/workflow state stays in Supabase — never duplicated across both.** Sanity is authoritative for portfolioProject content (galleries, case-study text, `status`); Supabase's `workflow_statuses` holds only the review metadata Sanity has no fields for (who submitted, who reviewed, review notes, when) — this hybrid split, not a full migration of content into Postgres or workflow state into Sanity, is the standing pattern for any future CMS-backed entity that also needs a Supabase-side approval workflow.

**Lookup tables follow one fixed shape.** `id`, `business_id` (multi-business-ready, defaults to `ordift_studios_business_id()`), a `slug`/`code`, `name`, a `sort_order`/`rank_order` integer, and an `active` boolean instead of hard deletion (`operational_titles`, `engagement_types`, `grades`, `member_number_classifications` all follow this exact shape). A new lookup table (a future module's status list, category list, etc.) should match this shape rather than inventing a new one.

**`coalesce(field, [])` at the query layer for every optional array-typed projection**, learned the hard way (TD-027): GROQ returns `null`, not `[]`, for an array field a document never had set at all, as distinct from one explicitly saved empty — a page component calling `.includes()`/`.map()` on that field crashes. Every array projection in a GROQ fragment gets wrapped in `coalesce(..., [])` from the start; don't wait for a null-array crash to discover the gap.

## §11 — Audit Logging & Activity Log

**Every state-changing administrative action writes one row to `public.activity_log`** (migration 0004) — this is the single shared audit trail every module writes to, not a per-module log table. The row captures `actor_user_id` (a `profiles.id` FK — see §12, never a stored name), `action` (a dot-namespaced string, e.g. `portfolio.published`, `portfolio.featured`, `portfolio.updated`), `entity_type`/`entity_id` (the same polymorphic pair as §10), and a free-form `metadata` JSONB for action-specific detail (e.g. `{ from, to, title }` for a status transition).

**The write path is one function, `logActivity()`** (`src/lib/admin/activityLog.ts`) — a new module never writes to `activity_log` with a raw insert; it calls `logActivity({ actorUserId, action, entityType, entityId, metadata })` from inside its Server Action, immediately after the primary mutation succeeds (best-effort — see §9). A real gap found and closed during the Portfolio work is instructive: the native wizard's per-step field save (`saveProjectFieldsAction`) initially had no `logActivity()` call at all — every full lifecycle transition was audited but a plain content edit wasn't. **Audit every mutating action, including the ones that don't feel like a "big" event** — a missing `logActivity()` call is a silent gap in the audit trail, not a harmless omission.

**Three read functions cover every consumption pattern** — `getRecentActivity()` (global feed, e.g. `/admin/activity`), `getRecentActivityByType(entityType)` (all activity for one entity type, e.g. Portfolio's "Recently Edited" panel), `getActivityForEntity(entityType, entityId)` (one specific record's full history, e.g. a project detail page's History section). A new module reuses these three functions rather than writing its own query — they already handle actor-identity resolution (§12) uniformly.

## §12 — Member Number–Based Identity Standard

**The authoritative identifier for every "Created/Updated/Reviewed/Approved/Published/Featured/Archived/Deleted/Assigned/Submitted By" surface is the actor's immutable `profiles.member_number`, never their display name** (TDR-014, established platform-wide 2026-08-05). This exists because every audit-relevant table already stores the actor as a `profiles.id` foreign key — `activity_log.actor_user_id`, `workflow_statuses.submitted_by`/`reviewed_by`, `workflow_assignments.assigned_by`/`removed_by` — so the standard didn't require any new schema, only a correct read-layer resolution of what those FKs already point at. `member_number` itself is assigned once per classification via an append-only ledger (`member_numbers`, migration 0019) — changed only on reclassification, with full history preserved, never reused. (Note: an earlier `staff_details.staff_number` field, migration 0017, was deliberately retired in migration 0019 in favor of this single platform-wide system — never reintroduce a second numbering scheme.)

**One shared resolver, `resolveActorIdentities()` (`src/lib/portal/actorIdentity.ts`), is the only place a new module should resolve an actor's display identity.** It batches profile ids to `{ fullName, memberNumber, roleLabel, department }` in three queries regardless of how many distinct actors are in a result set (not N+1 per row), and `formatActorLabel()` produces the standard display format: `"MEMBER-NUMBER — Full Name"`, falling back to name-only for an account that doesn't have a member number yet, never a blank. **A new module inventing its own actor-label logic instead of calling this resolver is a regression against this standard, not a fresh design choice** — this is the explicit rule TDR-014 states, repeated here because it's the one most likely to be silently reinvented under time pressure.

## §13 — Approval Workflow Architecture

**A generic, entity-agnostic engine (`src/lib/workflow/engine.ts` + `types.ts`) implements the review/approval state machine once; every entity type that needs approval reuses it rather than hand-rolling its own status logic.** The engine defines a fixed status lifecycle (`draft → pending_review → approved → published → archived`, with a `reject` transition back to `draft` from either review stage) as a capability-gated transition table (`allowedTransitions()`, `canTransition()`), plus an independent boolean flag pattern (`canToggleFeatured()`) for state that doesn't belong in the linear lifecycle — Portfolio's `featured` flag is deliberately *not* a workflow stage, since a published item shouldn't have to leave "published" to become featured or vice versa. A future entity with a genuinely different lifecycle (e.g. a two-stage approval instead of one) extends the same engine's types rather than forking it.

**The Supabase side of the workflow (`workflow_statuses`) holds only review metadata the CMS/primary store has no fields for** — see §10's content/workflow split. `workflow_assignments` (the same table shape, generalized) scopes a contractor/collaborator to specific entities, checked via `private.has_workflow_access()` — a new module needing "this collaborator can only see/edit entities explicitly assigned to them" reuses this table and function rather than a new one.

**Every transition re-validates readiness server-side, never trusting a client-side checklist alone** — see §8's validation-at-point-of-consequence rule, concretely applied: `getPublishReadiness()` runs again inside `transitionPortfolioProjectAction` before any `pending_review`/`published` transition is allowed to commit.

## §14 — Role & Permission Architecture

**Two layers, never conflated: `roles.ts` answers "who is this person" (the platform-wide RBAC model — `super_admin`/`admin`/`staff`/`contractor`/`vendor`/`model`/`workshop_participant`/`client`); a per-module capability matrix answers "what can this role do in this specific module."** `src/lib/admin/portfolioPermissions.ts`'s `PORTFOLIO_CAPABILITIES` (a `Partial<Record<RoleSlug, WorkflowCapability[]>>`) is the pattern: a new module defines its own capability matrix mapping the *same* global roles to module-specific capabilities (`upload`, `edit_own`, `approve`, `publish`, `manage_taxonomy`, etc. for Portfolio; a new module names its own verbs), rather than inventing new roles per module. **Never build a second permission system inside a module** — Portfolio's own build explicitly rejected a Sanity-side permission layer for exactly this reason (roles/capabilities live in Supabase/`roles.ts`, checked before any Sanity write, never re-implemented in Sanity's own access rules).

**A capability can be narrower than the module's general access tier** — `canCreatePortfolioProjectsNatively(user) = isSuperAdmin(user)` is deliberately stricter than the broader `super_admin`+`admin` pairing (`canAccessPortfolioAdmin`) used for the rest of the module. Scope a specific dangerous or high-trust action (native content creation, deletion, financial approval in a future Finance module) to a narrower check than the module's baseline, when the business decision calls for it — don't default every capability to the module's widest access tier just because that's simpler to write.

**RLS (§10) is the actual security boundary; role/capability checks in application code are the second, defense-in-depth layer, never the only one** — a capability check that's correct in the UI and the Server Action but backed by an RLS policy that doesn't actually restrict the row is not a real permission boundary. Every new table's RLS policy must independently enforce the same access rule the application code assumes.

## §15 — Feature Flag Conventions

**Feature flags are boolean rows in a Supabase table (`/admin/flags`), managed through the Admin Portal, read server-side at the point of use — not environment variables, not a third-party flag service, not a hardcoded constant.** This keeps flag state changeable by a Super Admin without a deployment, auditable (flag toggles go through `activity_log`, per §11, since they're a state-changing admin action), and consistent with the config-injection principle (§1) — the flag's *value* is data, resolved at runtime, exactly like which Sanity dataset to query. A new module gating a feature behind a flag adds a row to the existing flags table rather than introducing a parallel mechanism (a `.env` toggle, a Sanity singleton boolean, etc.).

**A flag is for staged rollout or a genuine on/off operational switch (`FORMS_SENDING_ENABLED` is the platform's other real example, gating live vs. logged-only email/Sheets sends) — not a substitute for RLS/capability-based permissions (§14).** If the real question is "which *roles* can do this," that's a capability, not a flag; if the question is "is this feature live for *anyone* right now, regardless of role," that's a flag.

## §16 — Documentation Standards

**Full standard lives in `DEVELOPMENT_GUIDE.md` §10 — this section only states the one rule most relevant to building a new module:** before creating a new markdown document, check `DOCUMENTATION_INDEX.md` for an existing document that already owns the topic. This project has twice already had to retire/merge duplicate documentation (the old ADR log into `TECHNICAL_DECISION_RECORDS.md`; old roadmap sketches into `PRODUCT_ROADMAP.md`) — a new module's architecture gets documented as a new dated entry in `MILESTONES.md`, a new TDR in `TECHNICAL_DECISION_RECORDS.md` for any real architectural decision, and (only if the module is genuinely complex enough to need one, following Portfolio's, Workshops', and Ordift Pulse's precedent of a dedicated `<MODULE>_ARCHITECTURE.md`) a new architecture document — added to `DOCUMENTATION_INDEX.md`'s table in the same change, not left undiscoverable.

## §17 — Notification Patterns

**This platform has no in-app toast/snackbar library, and that's a deliberate absence, not a gap.** Two real notification channels exist, and a new module reuses one of them rather than introducing a third:

1. **Email**, for anything a person needs to know about outside an active session — booking confirmations, admin alerts, workshop registration receipts (`src/lib/enquiry/email.ts`, `src/lib/workshops/registrationEmail.ts`, `src/lib/projectRequests/email.ts`), sent via the shared Resend-backed dispatcher with retry/backoff and dead-letter logging on failure (see `PRODUCTION_HARDENING_REPORT.md`). Every email module pairs a `*Email.ts` sender with a `*EmailTemplates.ts` template file.
2. **The Activity Log / Recent Activity feed**, for anything a person only needs to see the *next* time they're looking at the relevant screen — `RecentActivityWidget`/`RecentNotificationsWidget` on the client portal dashboard, and `/admin/activity` platform-wide, both reading through §11's `getRecentActivity*()` functions.

**In-page, immediate feedback for a user's own action** (a save succeeding, a validation error) is handled locally inside the component that triggered it — see §5's loading/error-state pattern — not through either notification channel. Reach for email only when the recipient genuinely isn't looking at the app right now; reach for the Activity Log only when the information is inherently retrospective ("here's what happened"), never as a substitute for either of the other two.

## §18 — Media Handling

**Full architecture lives in `MEDIA_ARCHITECTURE.md` — this section states the standard for new code, not a duplicate of that document.** Every real image on the site renders through `ResponsiveImage` (`src/components/media/ResponsiveImage.tsx`), never a bare `next/image` or `<img>` — it handles aspect-ratio-derived layout (no CLS), a CDN-swappable custom loader (`src/lib/media/sanityLoader.ts`, configured once in `next.config.ts` rather than per-instance), Sanity's blur-up LQIP placeholder, and lazy-loading by default (`priority` only for the one or two above-the-fold images per page). `Gallery` and `MediaAsset` compose `ResponsiveImage`; a new module never re-implements image rendering from scratch.

**`MediaPlaceholder` is the only sanctioned "coming soon" visual** — a branded, reduced-motion-respecting empty state for a CMS field that genuinely has no asset yet, distinct from `ResponsiveImage`'s own null-src fallback (which renders the same component). Never substitute stock photography or an invented image for missing real content — see §5's empty-state rule, which this is the media-specific instance of.

**Server-only upload code never ships to the client.** The Sanity write client and its asset-upload helpers (`src/lib/content/sanity/portfolioAssets.ts`) are imported only from Server Actions and Route Handlers; the write token is never present in any client bundle — verified explicitly during the native editor's build by scanning the shipped JS/network responses for secret-shaped strings, not just assumed from the import graph.

**Social-share images are always resized, never the raw uploaded original.** `ogImageUrl()` (`src/lib/media/ogImageUrl.ts`) applies a fixed 1200×630 crop transform via Sanity's own URL-based image API before an image is used as `og:image`/`twitter:image` — found necessary live (a 4155×6232px original was shipped unresized until this was added) and now the standard for any new page's social-share metadata.

## §19 — SEO Implementation Standards

**Every public page sets its own `generateMetadata()` (or static `metadata` export) — never relies solely on the root layout's site-wide defaults falling through.** A page-specific `title`, `description`, `alternates.canonical`, `openGraph` block, and an explicit `twitter` block are all required — the last one specifically because Next.js does **not** auto-derive Twitter Card fields from `openGraph`: a page that sets `openGraph` but not `twitter` silently keeps the root layout's generic site-wide Twitter title/description/image, found live on the Portfolio project page and now a standing check for any new page.

**Canonical URLs are computed from `NEXT_PUBLIC_SITE_URL`, never hardcoded**, following §1's config-injection principle — `${siteUrl}/work/${project.slug}`, falling back to `http://localhost:3000` only for local dev.

**Structured data (JSON-LD) is added per entity type once that type has a real public detail page**, injected via a `<script type="application/ld+json">` with `dangerouslySetInnerHTML` in the page component itself (`src/app/work/[slug]/page.tsx`'s `CreativeWork` block is the current example) — a new content type's detail page adds the appropriate `schema.org` type the same way, not a separate structured-data-generation library.

**OG/Twitter images always go through §18's `ogImageUrl()` resize step** — never the raw CMS asset URL.

## §20 — Accessibility Standards

**Every section of real content gets a real semantic heading — never a styled `<p>` standing in for an `<h2>`.** Found and fixed live on the Portfolio project page: seven content sections (Project Objective, Challenges, Deliverables, etc.) were styled to look like headings but marked up as paragraphs, so a screen-reader user navigating by heading structure skipped the entire case study. A new page's section labels are `<h2>`/`<h3>` from the start, styled however the design calls for — semantic correctness and visual styling are independent; Tailwind classes don't change the underlying element.

**Every image has real alt text — never the caption text duplicated, never empty, never a filename.** `MediaAsset`/`GalleryImage`'s `alt` field is a required, separate field from `caption` in both the Sanity schema and the TypeScript domain type — alt text describes the image for someone who can't see it; caption is editorial voice for someone who can. A gallery upload flow that doesn't require alt text per image is missing a validation rule, not a shortcut.

**`prefers-reduced-motion` is respected by every animation, no exceptions** — `MediaPlaceholder`'s shimmer effect uses `motion-reduce:animate-none` as the concrete pattern to copy for any future animated element.

**Responsive verification is mobile/tablet/desktop, checked for both layout (no horizontal overflow) and functional heading/landmark structure** — not just "does it look fine on a laptop." See §21's QA checklist.

## §21 — QA Testing Checklist

Run before any feature is considered done, in addition to the automated suite (`DEVELOPMENT_GUIDE.md` §5):

- [ ] Full lifecycle exercised end-to-end with real (disposable) data — not just the happy path of one status, but every transition the module supports.
- [ ] Every empty state checked with genuinely zero data — confirms §5's "render nothing" rule actually holds, not just that it looks fine with sample data present.
- [ ] Unauthorized access checked at **both** the UI level (button/link hidden) and the direct endpoint level (Server Action / Route Handler called directly by an unauthorized session, confirming it's rejected server-side, not just hidden client-side).
- [ ] No secret/credential exposure — network responses and the shipped JS bundle scanned for secret-shaped strings after any change touching a server-only credential.
- [ ] Desktop, tablet, and mobile viewports checked, specifically for horizontal overflow (`document.documentElement.scrollWidth > window.innerWidth`) — not just eyeballed.
- [ ] Console checked for errors *and* warnings on every page touched — a warning found live and left unexplained is a QA gap, even if it doesn't block the feature.
- [ ] `tsc --noEmit`, `eslint`, `vitest run`, and a full production `npm run build` all clean before commit.
- [ ] All disposable QA accounts/records independently re-verified deleted — via a direct query against the actual data store, never just trusting the UI stopped showing them.

## §22 — Deployment Checklist

**Full checklist lives in `DEVELOPMENT_GUIDE.md` §4 — not repeated here.** The one addition this Engineering Guide makes: any change to production environment variables (a flag toggle, a credential rotation) requires a fresh production deployment to take effect — Vercel does not hot-apply env var changes to an already-built deployment — and any temporary production configuration change (e.g. briefly disabling the launch holding page for a live review) must be verified restored to its exact prior state afterward, not just assumed to have reverted.

## §23 — Code Review Checklist

**Full checklist lives in `DEVELOPMENT_GUIDE.md` §9 (Pull Request checklist) — not repeated here.** Engineering-standards-specific additions to check against this document specifically:
- [ ] New Server Actions re-check authorization themselves (§6), not just relying on the page.
- [ ] New mutating actions call `logActivity()` (§11).
- [ ] Any new "who did this" display resolves through `resolveActorIdentities()` (§12), not a raw `full_name` join.
- [ ] New tables follow the lookup-table shape (§10) if applicable, and have a deliberately-designed RLS policy, not a copy-pasted permissive one.
- [ ] New public pages set canonical/OG/Twitter metadata explicitly (§19).

## §24 — Security Checklist

- [ ] RLS policy exists and is deliberately scoped for every new table — never "will add RLS later."
- [ ] `service_role` grants scoped to exactly what the code needs, not broadened defensively.
- [ ] No write-capable credential (Sanity token, service-role key, API secret) ever imported into a file reachable from a Client Component's bundle — server-only files stay server-only.
- [ ] Every mutating Server Action / Route Handler independently authorizes, not just the page around it (§6/§7).
- [ ] Public form input validated server-side with the shared Zod schema (§8), never trusting client-side validation alone.
- [ ] File uploads validate both declared `content-length` and actual parsed size/type (§7).
- [ ] A disposable QA account used for any production-adjacent testing is deleted and its removal independently re-verified via a direct data-store query, not just the UI.

## §25 — Performance Checklist

- [ ] Every real image renders through `ResponsiveImage` (§18) with an accurate `sizes` hint for its actual rendered context — not a default full-viewport-width guess for an image that's actually nested in a narrower column (found and fixed live: a `sizes` hint that assumed full-bleed was requesting ~4x more image data than a gallery tile nested in a two-column layout actually needed).
- [ ] Social-share images resized via `ogImageUrl()` (§18/§19), never the raw original.
- [ ] Lazy-loading (`loading="lazy"`, the default via `ResponsiveImage`) for everything below the fold; `priority` reserved for the one or two genuinely above-the-fold images per page.
- [ ] No N+1 query pattern for batch identity/data resolution — `resolveActorIdentities()` (§12) is the concrete example of a batched-not-per-row resolver; any new "resolve N records' related data" need should follow the same shape.
- [ ] Production build (`npm run build`) run and checked clean — not just `next dev` — before any performance claim is made, since dev-mode timing is not representative.

## §26 — Reference Implementation Map

The Portfolio Management System is the concrete example for nearly every section above. When building a new module, these are the files worth opening side-by-side with this guide:

| Concern | Reference file(s) |
|---|---|
| Server Actions architecture (§6) | `src/app/admin/portfolio/actions.ts` |
| Route Handler pattern (§7) | `src/app/api/admin/portfolio/assets/route.ts` |
| Publish-readiness / business-rule validation (§8) | `src/lib/admin/portfolioValidation.ts` |
| CMS-agnostic repository pattern (§10) | `src/lib/content/types.ts`, `src/lib/content/sanity/`, `src/lib/content/local/` |
| Audit logging (§11) | `src/lib/admin/activityLog.ts` |
| Member Number identity resolution (§12) | `src/lib/portal/actorIdentity.ts` |
| Generic approval-workflow engine (§13) | `src/lib/workflow/engine.ts`, `src/lib/workflow/types.ts` |
| Per-module capability matrix (§14) | `src/lib/admin/portfolioPermissions.ts` |
| Media component library (§18) | `src/components/media/` |
| Wizard-style multi-step admin UI (§4/§5) | `src/app/admin/portfolio/PortfolioProjectForm.tsx` |
| Public detail page with full SEO/structured data (§19) | `src/app/work/[slug]/page.tsx` |

---

*Cross-references: `TECHNICAL_DECISION_RECORDS.md` (TDR-002 RLS, TDR-005 dataset isolation, TDR-014 Audit Identity Standard, and others cited above), `TECHNICAL_DEBT_REGISTER.md` (TD-025 through TD-028), `DEVELOPMENT_GUIDE.md` (process contract — branching, versioning, release/deployment/PR checklists, commit conventions, documentation standards), `MEDIA_ARCHITECTURE.md`, `INTEGRATION_TESTING_STRATEGY.md`, `ADMIN_GUIDE.md` (role/permission operational reference), `PRODUCT_ROADMAP.md` (Version 1.0.5 Workstream D; Engineering Standards for Future Development), `MILESTONES.md` (the Portfolio Management System and native-editor entries this guide draws from), `DOCUMENTATION_INDEX.md`.*
