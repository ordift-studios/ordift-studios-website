# Technical Debt Register

**Established:** 2026-07-30, as Workstream E of `PRODUCT_ROADMAP.md`'s Version 1.0.5 — Platform Foundation Hardening.

**Purpose:** every compromise, shortcut, deferred decision, and known limitation made across this build, recorded permanently instead of living only in session history. This is a living document — add an entry the moment a compromise is made, don't wait for a retrospective pass.

**How to read this:** each entry states what the debt is, why it was accepted (not a mistake — a deliberate trade-off at the time), its current impact, and what would trigger paying it down. Severity is a rough operational-risk read, not a formal CVSS-style score.

---

## Format

```
### [ID] Title
- **Category:** Testing / Infra / Security / Data / Performance / Documentation
- **Severity:** Low / Medium / High
- **What:** the compromise itself
- **Why accepted:** the trade-off reasoning at the time
- **Current impact:** what this actually costs today
- **Pay-down trigger:** the condition that should prompt fixing it
- **Status:** Open / Scheduled / Resolved
```

---

### TD-001 — Zero automated test coverage
- **Category:** Testing
- **Severity:** High
- **What:** No `.test.ts`/`.spec.ts` files anywhere in the repo; no Jest/Vitest/Playwright/Cypress dependency. Every one of the ~250 completed build milestones was verified manually (browser walkthroughs, curl checks, manual staging regression passes).
- **Why accepted:** early-stage single-session build velocity mattered more than test infrastructure; manual verification was tractable at v1.0's feature count.
- **Current impact:** regression risk grows with every new feature; no safety net for refactors.
- **Pay-down trigger:** this is exactly what Version 1.0.5 Workstream A exists to resolve.
- **Status:** Scheduled (Workstream A, in progress)

### TD-002 — No CI pipeline
- **Category:** Infra
- **Severity:** High
- **What:** No `.github/workflows`. Lint/typecheck/build verification happens manually before each deploy, not automatically on push.
- **Why accepted:** same as TD-001 — solo-session velocity over process overhead at small scale.
- **Current impact:** a bad push can reach production without an automated gate catching it first.
- **Pay-down trigger:** Version 1.0.5 Workstream B.
- **Status:** Scheduled (Workstream B)

### TD-003 — No production error monitoring
- **Category:** Infra
- **Severity:** High
- **What:** No Sentry, no APM, no error-tracking dependency anywhere in `package.json`. Production failures are currently discovered via client report or manual log review, not alerting.
- **Why accepted:** deferred until real production traffic existed to justify it; site is still behind `LAUNCH_HOLDING_PAGE`.
- **Current impact:** currently low (no real visitors yet), but this is the single most time-sensitive item to fix before the holding page comes down.
- **Pay-down trigger:** Version 1.0.5 Workstream C — should land before `LAUNCH_HOLDING_PAGE` is removed.
- **Status:** Scheduled (Workstream C)

### TD-004 — No Content-Security-Policy header
- **Category:** Security
- **Severity:** Medium
- **What:** `next.config.ts` deliberately excludes CSP while shipping the other baseline security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy). Documented in-code: *"this app loads third-party scripts (Cloudflare Turnstile, Sanity Studio's own asset pipeline) that a CSP would need careful, tested scoping to not break."*
- **Why accepted:** a wrong CSP silently breaks Turnstile or Studio rather than failing loudly — judged riskier to guess than to ship without one initially.
- **Current impact:** one layer of defense-in-depth against XSS/injection is missing; other mitigations (React's default escaping, no `dangerouslySetInnerHTML` misuse observed) still apply.
- **Pay-down trigger:** Version 1.0.5 Workstream I (security re-review) should scope a tested CSP covering exactly Turnstile + Sanity's script/frame sources.
- **Status:** Open

### TD-005 — Google Sheets sync failures are logged but not alerted
- **Category:** Data
- **Severity:** Medium
- **What:** `sheet_sync_failures` table (migration `0013`) captures every failed dual-write to Google Sheets, and `email_send_failures` (migration `0022`) does the same for email — but nothing currently reads either table proactively and notifies anyone. A failure sits silently until someone thinks to query it.
- **Why accepted:** the resilience pattern (log-and-continue rather than blocking the user-facing submission on a third-party API) was the priority; alerting on the dead-letter table was explicitly flagged as a follow-up, not built at the time.
- **Current impact:** a sustained Sheets or Resend outage could accumulate unnoticed failures until a manual check catches it.
- **Pay-down trigger:** natural fit once Workstream C's alerting infrastructure exists — route dead-letter-table growth into the same alert channel.
- **Status:** Open

### TD-006 — 31 npm audit findings (6 moderate, 25 high), all in transitive dependencies
- **Category:** Security
- **Severity:** Medium
- **What:** `npm audit --production` reports 31 advisories, concentrated in transitive deps: `sharp`'s inherited `libvips` CVEs (high), `smol-toml` DoS (moderate, via `@vercel/frameworks`), `uuid` buffer-bounds issue (moderate, via `typeid-js`). Every fix path `npm audit` offers requires a breaking major-version bump (`next@9.3.3` — an actual downgrade relative to what's installed — and `sanity@5.14.1`).
- **Why accepted:** none of the flagged packages are reachable via untrusted user input in this app's actual usage (image processing via `sharp` runs on trusted CMS-uploaded assets, not arbitrary user uploads; `smol-toml`/`uuid` are build-tool-adjacent, not runtime request-path code) — flagged previously in `PHASE_4_PRODUCTION_AUDIT_REPORT.md` §3.4 as non-blocking for that reason, not fixed blindly with `--force` since the "fix" versions are actually incompatible or older.
- **Current impact:** low today given the non-reachability reasoning above; needs periodic re-verification since transitive dependency trees shift.
- **Pay-down trigger:** re-run `npm audit` each time Workstream D's release playbook is exercised; revisit if any flagged package's usage pattern changes (e.g., if `sharp` ever processes untrusted uploads).
- **Status:** Open (monitored, not blocking)

### TD-007 — No file-upload storage; Deliverables/Portfolio are link-based only
- **Category:** Data
- **Severity:** Low (by design, not oversight)
- **What:** the `deliverables` table's `url` field stores an external link (Drive/Dropbox/etc.), not a platform-hosted file. There is zero upload capability anywhere in the Client Portal — confirmed via an explicit in-code comment on the Model portal page: "no application form, portfolio upload, or booking workflow."
- **Why accepted:** this was the original Phase 1A scope decision — Tier 1 forms use reference links, direct upload was deliberately deferred to Phase 1B pending a secure-storage evaluation (signed-URL object storage vs. a dedicated secure-forms provider).
- **Current impact:** none currently — this is working as designed for v1.0's scope.
- **Pay-down trigger:** Version 2.0 (Talent Management)'s Contracts/Documents features, which explicitly cannot go live before this evaluation happens (already a hard release-criterion in `PRODUCT_ROADMAP.md` Version 2.0).
- **Status:** Open, intentionally deferred — not urgent until Version 2.0 begins

### TD-008 — Supabase on Free plan: no automated backups
- **Category:** Data
- **Severity:** Medium (mitigated, not eliminated)
- **What:** production Supabase project has zero automated backup coverage on the Free tier. One manual `pg_dump` backup has been taken and verified (`ordift-production-20260730-043436.dump`, all 26 tables confirmed via `pg_restore --list`), but there is no recurring, automated backup job.
- **Why accepted:** flagged explicitly as a "Pending Owner Decision" (Supabase Pro-plan billing) in `PRODUCT_ROADMAP.md` Version 1.0 rather than silently upgraded — a billing decision, not a technical one.
- **Current impact:** any data loss since the one manual backup would not be recoverable until another manual backup is taken; no restore rehearsal has been performed yet (only a `pg_restore --list` table-presence check, not a full restore drill).
- **Pay-down trigger:** the three Supabase Pro-upgrade trigger conditions already documented in `DISASTER_RECOVERY.md` §9; Version 1.0.5 Workstream H should also schedule the first genuine restore-test rehearsal.
- **Status:** Open, owner-decision-gated

### TD-009 — No load testing has ever been performed
- **Category:** Performance
- **Severity:** Low (current scale)
- **What:** Redis-backed sliding-window rate limiting exists (`src/lib/shared/rateLimit.ts`, Upstash-backed with an in-memory fallback for local dev) and has been verified to correctly block rapid repeated requests, but no load/stress test has been run against realistic concurrent traffic.
- **Why accepted:** no real production traffic exists yet (site is behind `LAUNCH_HOLDING_PAGE`) — nothing to load-test against meaningfully until launch.
- **Current impact:** none yet; genuinely can't be assessed pre-launch.
- **Pay-down trigger:** Version 1.0.5 Workstream J should document the trigger point rather than test now; a real load test becomes worthwhile once real traffic patterns exist to model.
- **Status:** Open, deferred by design

### TD-010 — Sanity `legalPage` body is plain text, not portable text
- **Category:** Data
- **Severity:** Low
- **What:** the `legalPage` schema's `body` field is a single plain-text field, not Sanity's portable-text rich-content type. This caused a real rendering bug (fixed 2026-07-30 in `src/app/legal/[slug]/page.tsx`) where the entire body rendered as one unbroken paragraph — worked around with a `\n{2,}` split into paragraphs, but the field still can't support real formatting (headings, lists, links, bold/italic) within a legal document body.
- **Why accepted:** the schema was built when legal pages were expected to be short placeholder text; the QC pass that drafted the full 11-part Legal Suite happened afterward and exposed the limitation, but changing the schema type is a bigger migration than the immediate paragraph-rendering fix needed.
- **Current impact:** legal documents currently can't use inline links, numbered lists, or emphasis within Sanity — the drafted Legal Suite lives as a separate Markdown/PDF artifact rather than being loaded into this field as-is.
- **Pay-down trigger:** when the approved final Legal Suite is ready to actually publish through Sanity — worth revisiting the schema (migrate `body` to portable text) at that point rather than forcing the finished legal text through a plain-text field.
- **Status:** Open

### TD-011 — React component testing (jsdom + Testing Library) blocked by a dependency conflict
- **Category:** Testing
- **Severity:** Low
- **What:** discovered while building Workstream A: `npm install @vitejs/plugin-react jsdom @testing-library/react` fails with a peer-dependency conflict — `@vitejs/plugin-react` (via `@rolldown/plugin-babel`) wants `@babel/core@^7.29.0 || ^8.0.0-rc.1`, while Sanity's toolchain (`@sanity/codegen`) pins a resolved `@babel/core@8.0.1` that doesn't satisfy that range. Both sides are legitimate, current versions — this is this repo's bleeding-edge Next.js 16 / React 19 toolchain (see `AGENTS.md`'s warning) colliding with Sanity's own bundled tooling.
- **Why accepted:** the highest-priority initial test coverage (role/auth logic, rate limiting, idempotency) needed no React rendering — pure Vitest with a `node` environment covers it, so this didn't need to block Workstream A's first increment.
- **Current impact:** no component-level (React Testing Library) tests exist yet; the pure-logic unit-test layer (`vitest.config.ts`, `node` environment) is unaffected and green (35/35 passing as of 2026-07-30).
- **Pay-down trigger:** when component-level testing is actually prioritized, either (a) re-check whether `@vitejs/plugin-react`/`@rolldown/plugin-babel` has released a version compatible with Sanity's pinned `@babel/core`, or (b) install with `--legacy-peer-deps` after confirming it doesn't silently break Sanity Studio's own build.
- **Status:** Open

### TD-012 — Vendor lock-in concentrated in Supabase (Auth + RLS + Realtime)
- **Category:** Infra
- **Severity:** Low (accepted trade-off, not an oversight — surfaced here for visibility, not as a problem to fix)
- **What:** identified during the 2026-07-30 Platform Health Review. Most of this platform's third-party dependencies are shallow and swappable (Resend for email, Upstash for rate limiting, Turnstile for CAPTCHA — all stateless, low-switching-cost). Supabase is different: Auth, RLS-based authorization (TDR-002), and Realtime presence are all deeply load-bearing architectural choices, not interchangeable plumbing. Migrating off Supabase would mean rebuilding authentication and every RLS policy from scratch, not swapping a client library.
- **Why accepted:** this is the direct, deliberate consequence of TDR-002 (RLS-as-security-boundary) — the whole point of that decision was to get a structural guarantee only Postgres RLS provides. Depth of integration was the goal, not an accident.
- **Current impact:** none today; named here so it's a visible, tracked trade-off rather than an unstated assumption.
- **Pay-down trigger:** none planned — this isn't debt to pay down so much as a concentration risk to keep visible. Worth revisiting only if Supabase's pricing, reliability, or product direction ever changes enough to threaten the relationship — not proactively.
- **Status:** Open (tracked, not scheduled for action; kept as accepted architectural debt, not an immediate migration project, per explicit 2026-07-30 direction)

**Dependency inventory (added 2026-07-30, per explicit request):**

- **What depends on Supabase:**
  - *Auth*: every login/signup/password-reset flow (`src/app/portal/login`, `signup`, `forgot-password`, `reset-password`), session management via `@supabase/ssr`, custom SMTP routing through Resend.
  - *RLS-based authorization*: the actual security boundary (TDR-002) for every table — `profiles`, `enquiries`, `workshop_registrations`, `project_requests`, `project_assignments`, and every other table under RLS. This is the single deepest dependency — RLS policies are Postgres-native SQL, not portable to another provider without a full rewrite.
  - *Realtime*: the Active Users presence panel (`/admin/overview`, migration `0019`'s presence channel).
  - *Primary data store*: every table in `supabase/migrations/0001`–`0022` — this is also just "using Postgres," the least Supabase-specific layer.
  - *Storage/database functions*: `find_user_id_by_email`, `next_record_sequence`, `has_project_access`, `is_staff_or_admin`, and others — Postgres functions, portable in principle, but currently invoked via Supabase's RPC mechanism.
- **What would be genuinely difficult to migrate:** (1) Auth — session/token handling, password reset flows, and the custom-SMTP wiring would need to be rebuilt against a different provider's auth model, not just reconfigured; (2) RLS policies — while the SQL itself is standard Postgres and portable to any Postgres host, the *combination* of RLS + Supabase Auth's `auth.uid()` function is Supabase-specific plumbing that a migration would need to reproduce; (3) Realtime presence — would need a different pub/sub mechanism entirely.
- **What would be comparatively easy:** the raw data itself (any Postgres-compatible host can restore a `pg_dump`), and every table/function that doesn't reference `auth.*` schema objects.
- **Available export and recovery paths today:** `pg_dump`/`pg_restore` already proven working (`DISASTER_RECOVERY.md`, the verified 2026-07-30 production backup) — this is both the disaster-recovery mechanism and, incidentally, the data-portability mechanism. Auth users themselves are also exportable via Supabase's Admin API (`listUsers`), though passwords/hashes are not portable to a different auth provider by design (a real migration would require a password-reset flow for every existing user, not a data copy).
- **Reasonable warning indicators to watch for** (not currently present): sustained Supabase outages beyond their published SLA; pricing changes that don't scale reasonably with usage; deprecation of RLS, Realtime, or the Auth product; a security incident affecting Supabase's infrastructure specifically (as opposed to this project's own configuration).
- **Future reassessment triggers:** any of the warning indicators above becoming real, or a genuine business requirement emerging that Supabase structurally can't meet (not before).
- **Practical steps that reduce lock-in without duplicating the platform** (none currently implemented, listed for future reference, not scheduled): (1) keep RLS policy SQL itself well-documented and centralized in versioned migrations (already true) so it's at least readable/portable even if the runtime coupling to `auth.uid()` isn't; (2) maintain the existing `pg_dump` backup discipline, which doubles as data-portability insurance; (3) avoid growing *new* Supabase-specific coupling casually — e.g., prefer standard Postgres functions over Supabase-proprietary extensions where a standard approach works equally well. **Explicitly not recommended:** introducing a second database/auth provider in parallel "just in case" — that duplicates real operational complexity today to hedge a risk that isn't currently materializing, the opposite of proportionate engineering.

### TD-013 — No uptime/synthetic monitoring for the public site
- **Category:** Infra
- **Severity:** Medium
- **What:** identified during the 2026-07-30 Platform Health Review. Workstream C (Sentry) will catch application errors, but nothing currently pings the live site from outside to detect "the site is down" — a Vercel platform incident, a DNS problem, or an expired certificate would currently be discovered by a client noticing, not by the platform.
- **Why accepted:** not yet built — site is still behind `LAUNCH_HOLDING_PAGE`, so there's no real uptime to monitor yet.
- **Current impact:** none pre-launch; becomes a real gap the moment the holding page comes down.
- **Pay-down trigger:** should land alongside or shortly after Workstream C (Sentry) — a lightweight synthetic check (e.g. a free-tier uptime pinger hitting the homepage every few minutes) is a natural, low-cost extension of the same observability push, not a separate initiative.
- **Status:** Open

### TD-014 — No recurring secret-rotation cadence
- **Category:** Security
- **Severity:** Low
- **What:** identified during the 2026-07-30 Platform Health Review. The Supabase production Secret Key was rotated once, as a specific incident response (Task #68). There is no standing policy for periodically rotating API keys/secrets (Supabase, Sanity, Resend, Google service account, Upstash) on a cadence — only reactive, one-off rotation.
- **Why accepted:** reasonable for current scale and single-operator context; a rotation cadence is more valuable once there's a team with turnover to protect against.
- **Current impact:** low today; the risk profile changes once more than one person holds these credentials.
- **Pay-down trigger:** `MAINTENANCE_SCHEDULE.md`'s Annual review is the natural home for this — add a secret-rotation line item there once Workstream I (security re-review) reaches credential management.
- **Status:** Open

### TD-015 — Documentation split across two tools (Claude Code / Claude Chat) has no drift check
- **Category:** Documentation
- **Severity:** Low
- **What:** identified during the 2026-07-30 Platform Health Review, specific to this project's 2026-07-30 workflow split: legal/governance/commercial documentation now lives in and is maintained via Claude Chat, while technical documentation (this register, `PRODUCT_ROADMAP.md`, `TECHNICAL_DECISION_RECORDS.md`, etc.) is maintained here. Nothing currently checks that a legal-suite change made in Claude Chat that touches a factual/technical claim (e.g. the already-found Workshop-status-field discrepancy in `LEGAL_REVIEW_REPORT.md`) gets flagged back here, or vice versa.
- **Why accepted:** the split itself was a deliberate, explicit decision (2026-07-30) to separate concerns cleanly; this entry names the one coordination cost that decision introduces, rather than leaving it implicit.
- **Current impact:** low — the one known instance (Workshop status field) was already caught and flagged, showing the discipline works today at small scale.
- **Pay-down trigger:** if the legal suite is ever approved/published, a one-time cross-check against current platform behavior (the same discipline already used in the QC pass) before publishing is the practical mitigation — not a permanent automated system, which would be disproportionate at this scale.
- **Status:** Open

### TD-016 — Concurrent cleanup raced a restrictive FK, orphaning test users (found and fixed 2026-07-30)
- **Category:** Testing
- **Severity:** Low (found, fixed, and verified within the same session — logged for the historical record per the standing "nothing should exist only in memory" discipline, not because it's still open)
- **What:** `projectRequests.integration.test.ts`'s original `afterAll` deleted `project_requests` and every test auth user inside one `Promise.allSettled`, running them concurrently. `project_requests.created_by`/`decided_by` reference `public.profiles(id)` with Postgres's default `RESTRICT` (no `on delete cascade`/`set null`, unlike every other test-adjacent FK in this schema) — when a `deleteUser()` call reached the database before the `project_requests` row was gone, deleting the profile (cascaded from the auth user) violated that FK and the deletion silently failed. `scripts/verifyStagingTestCleanup.ts` (built the same session, specifically to catch exactly this class of problem) caught 2 orphaned `*.invalid` staging accounts that the test suite's own "cleanup succeeded" self-check had missed.
- **Why this happened:** the concurrent-cleanup pattern is correct and safe for every other suite in this project, because every other FK a test touches uses `on delete cascade` or `on delete set null` — `project_requests.created_by`/`decided_by` is the one exception, and it wasn't checked for before writing the cleanup logic.
- **Current impact:** none — fixed same-session (sequential delete of dependent rows, then users), re-run twice to confirm, independently re-verified clean via `verifyStagingTestCleanup.ts` after the fix.
- **Pay-down trigger:** N/A — resolved. Worth remembering as a pattern: any future table with a non-cascading FK to `profiles` needs sequential (not concurrent) cleanup ordering in its integration tests.
- **Status:** Resolved (2026-07-30)

### TD-017 — Disabled `Button` links were still keyboard-activatable (found and fixed 2026-08-01)
- **Category:** Security / Accessibility
- **Severity:** Low (found, fixed, and verified same-session — logged for the historical record)
- **What:** found during the customer-lens production audit (real browser walkthrough, real staging login). `src/components/Button.tsx`'s `href` branch always rendered a real Next.js `<Link>`, using CSS `pointer-events-none` plus `aria-disabled` to represent a disabled state. `pointer-events-none` only blocks mouse activation; `aria-disabled` is purely informational to assistive tech and does not stop native anchor behavior. A keyboard user could Tab to a "disabled" quick-action link (`View Deliverables`, `Request Reschedule`, `Edit Profile` on the client dashboard — the only call site combining `disabled` + `href`) and press Enter to navigate it anyway, landing on `href="#"` with no explanation.
- **Why this happened:** the pattern correctly handled mouse users but was never checked against keyboard-only navigation, a real WCAG-relevant user population this project's own engineering standards (mobile-first, accessible) are meant to cover.
- **Current impact:** none — fixed same-session. `Button` now renders a non-interactive `<span aria-disabled="true">` (no href, no tab stop) whenever `disabled` is true, for every input method, not just the mouse.
- **Pay-down trigger:** N/A — resolved.
- **Status:** Resolved (2026-08-01)

### TD-018 — Form validation errors not programmatically linked to their fields (found and fixed 2026-08-02)
- **Category:** Accessibility
- **Severity:** Low (found, fixed, and verified same-session — logged for the historical record)
- **What:** found during the public-site deep pass (real browser walkthrough of `/book`, triggering the "Brief project description" required-field error). Both multi-step forms with client-side validation — `src/app/book/BookingForm.tsx` (~15 fields) and `src/app/workshops/[slug]/RegistrationForm.tsx` (fullName/email/phone/consent) — rendered their local `FieldError` component as a plain `<p>` with no `id`, and the corresponding `<input>`/`<textarea>`/`<select>`/checkbox never set `aria-describedby` or `aria-invalid`. A screen-reader user got no indication which field an error message belonged to, or that a field was invalid at all — a WCAG 3.3.1 (Error Identification) gap. Grepped for `aria-describedby`/`aria-invalid` across `src/components` and `src/app` and confirmed zero matches before the fix.
- **Why this happened:** each field was hand-wired individually rather than through a shared `Field` wrapper that couples label+input+error, so the ARIA linkage had to be added per-field and was simply never done.
- **Current impact:** none — fixed same-session. `FieldError` now takes an explicit `id` and renders `role="alert"`; every field passes `aria-describedby`/`aria-invalid` via a small `fieldAria()` helper when its error is set. Verified live in-browser (not just by inspection) via `javascript_tool` on both forms: `aria-describedby` correctly points at the error paragraph's `id`, and `aria-invalid="true"` is set exactly when an error is present.
- **Pay-down trigger:** N/A — resolved. Other forms audited for the same pattern (`LoginForm`, `SignupForm`, `ForgotPasswordForm`, `ResetPasswordForm`, admin forms) use a single top-level error banner rather than per-field errors, so they were not affected by this specific gap.
- **Status:** Resolved (2026-08-02)

### TD-019 — Super Admins were locked out of Feature Flags, Settings, and Users & Roles (found and fixed 2026-08-02)
- **Category:** Security / Access Control
- **Severity:** Medium (found, fixed, and verified same-session — logged for the historical record; over-restrictive, not a privilege-escalation risk, but a real functional block on the platform's highest-privilege role)
- **What:** found during the admin deep pass, using a real `super_admin`-only staging test account (no separately-granted `admin` role — a realistic account shape, since `super_admin` is meant to be the top of the hierarchy and can itself grant/revoke `admin`). `hasRole()` (`src/lib/portal/roles.ts`) does exact-match role checks with no built-in hierarchy — `hasRole(user, "admin")` is `false` for an account that only holds `super_admin`. Eight call sites across the admin surface used this narrow check directly instead of the codebase's own broader `isStaffOrAdmin()` pattern, silently locking a Super-Admin-only account out of: the `/admin/flags`, `/admin/settings`, and `/admin/users` pages (redirected to Overview with no explanation); the nav links to all three (hidden by `admin/layout.tsx`'s `adminOnly` filter); the `toggleFlagAction`/`createFlagAction` and every `users/actions.ts` mutation (`requireAdmin()`); and the "New Category" deliverables form + its `createCategoryAction` on the booking/enquiry detail pages. Confirmed live: logged in as the test super_admin account, saw the three nav items missing, then fixed and re-verified they appeared and each page loaded.
- **Why this happened:** `isStaffOrAdmin()` already existed and correctly ORs in `super_admin`, but several admin-only (not staff-inclusive) guards were written directly against `hasRole(user, "admin")` instead of an equivalent `isSuperAdmin(user) || hasRole(user, "admin")` helper — an easy, easy-to-miss inconsistency across 8 independent call sites built at different times, never triggered before because every admin test account used so far also happened to hold the literal `admin` role alongside `super_admin`.
- **Current impact:** none — fixed same-session across all 8 sites (`admin/layout.tsx` nav filter, `admin/flags/page.tsx` + `actions.ts`, `admin/settings/page.tsx`, `admin/users/page.tsx` + `actions.ts`, `admin/deliverables/actions.ts`'s `createCategoryAction`, and the `isAdmin` prop passed from `admin/bookings/[id]/page.tsx` + `admin/enquiries/[id]/page.tsx`). All now use `hasRole(user, "admin") || isSuperAdmin(user)`. `tsc --noEmit` and `eslint` both clean; live-verified nav visibility and page access for the three redirect-gated pages with a real staging super_admin test account (created, tested, then deleted — cleanup independently confirmed via `verify:staging-test-cleanup`).
- **Pay-down trigger:** N/A — resolved. Worth considering, as a future (not urgent) improvement: a single `isAdminTier(user)` helper in `roles.ts` that encodes "admin or super_admin" once, so this class of bug can't recur at a 9th call site — flagging as an idea, not doing it now since the current fix is minimal, consistent, and fully verified.
- **Status:** Resolved (2026-08-02)

### TD-020 — OS-LGL-000 (Definitions Register) and OS-LGL-099 (Document Control Standard) are code-level scaffolding, not the actual governance documents

- **Category:** Documentation / Content
- **Severity:** Low
- **What:** the 2026-08-04 Legal Suite integration request asked for OS-LGL-000 (Master Definitions Register) and OS-LGL-099 (Document Control & Numbering Standard) to be "implemented." Neither document's actual text was provided — only OS-LGL-001 (Privacy Policy) was. What exists instead: `src/lib/legal/definitions.ts` aggregates every registered document's own defined terms into a deduplicated glossary (currently seeded only with the 7 terms actually defined in OS-LGL-001 §2 — real content, not invented), designed so OS-LGL-000 slots in the same way any future document does once it arrives. `DocumentControlMetadata` in `src/lib/legal/types.ts` encodes the metadata shape OS-LGL-099 would presumably standardize (code, version, status, classification, dates, owner, related documents) as a TypeScript type every document must satisfy — but this was reverse-engineered from OS-LGL-001's own Document Control block, not authored from an actual OS-LGL-099 standard, since none was provided.
- **Why accepted:** building real code-level scaffolding that OS-LGL-000/099 can be dropped into later is legitimate, content-free architecture work — the same "prepare the route, don't fabricate the page" principle already applied to OS-LGL-002/003/004 (see `registry.ts`'s `upcomingDocuments`). Inventing plausible-sounding governance-document text to mark this "done" would have violated this project's standing "never invent facts" discipline for legal content.
- **Current impact:** none functionally — the Privacy Policy page and all four publication formats work correctly today. The gap is that `DocumentControlMetadata`'s field set is inferred, not standard-derived, so if the real OS-LGL-099 specifies fields or constraints this type doesn't have (e.g. a formal numbering scheme beyond `OS-LGL-NNN`, required approval workflow states, a controlled distribution list), the type will need extending when that document arrives — not a breaking change, but not yet verified against a real standard either.
- **Pay-down trigger:** when the actual OS-LGL-000 and/or OS-LGL-099 text is provided. At that point: add OS-LGL-000 to the registry like any other document (its terms then flow into `definitions.ts` automatically); reconcile `DocumentControlMetadata`'s fields against whatever OS-LGL-099 actually specifies, extending rather than replacing since OS-LGL-001 is already live against the current shape. Per explicit 2026-08-04 user decision (see `TD-024`), completing OS-LGL-000 also triggers a single controlled harmonization pass across every published document's Client/Services/Creative Works definitions (currently worded differently in Privacy Policy, Website Terms, and Booking Terms — none conflict, but none are identical either) — not four separate ad hoc edits.
- **Status:** Open — blocked on the source documents, not on effort.

### TD-021 — Three OS-LGL-001 additions requested 2026-08-04, initially flagged rather than implemented: Jurisdiction-Specific Data Protection Addendum, Government/Law Enforcement Requests clause, Data Breach Response Summary

- **Category:** Documentation / Content
- **Severity:** Low
- **What:** the 2026-08-04 direction listed 10 items to add to OS-LGL-001 and future documents. Seven were implemented immediately (Definitions Cross-References, Version Control Appendix/running change log, Interpretation & Severability, Accessibility Commitment, Contact Escalation Procedure, Cross-Document Hierarchy, Enterprise Definitions Register architecture — see `TECHNICAL_DECISION_RECORDS.md` for the version-1.1 changes this produced). Three were flagged instead of drafted at that point: a Jurisdiction-Specific Data Protection Addendum addressing Ghana's Data Protection Act, Qatar's PDPPL, and GDPR; a Government and Law Enforcement Requests clause; and a Data Breach Response Summary referencing "your internal incident response process." Later the same day, the user explicitly authorized drafting all three using "legally conservative language" and directed that no certifications, registrations, or operational procedures be invented — with that authorization and constraint, all three were drafted as Appendices E, F, and G in `src/lib/legal/boilerplate.ts` (shared Enterprise Legal Series appendices, applied to every registered document via `withStandardAppendices()`) and published in OS-LGL-001 v1.2.
- **Why accepted (as resolved):** each Appendix is deliberately hedged rather than asserting compliance: Appendix E states Ordift Studios "aims to process personal information in a manner consistent with" the named laws and explicitly disclaims that it "does not constitute a representation of certification, accreditation, or registration under any specific law"; Appendix F states only that requests are answered "where legally required" without describing a verification procedure as already-adopted; Appendix G commits to investigate/contain/remediate/notify "where required by applicable law" and explicitly states it "does not describe specific internal procedures." No statute section numbers, certification names, registration numbers, or internal process names are asserted anywhere in the three appendices — consistent with the user's explicit instruction and this project's standing "never invent legal or business facts" discipline (see `feedback_ordift_content_accuracy.md` in project memory).
- **Current impact:** none — OS-LGL-001 v1.2 is published with all three appendices; the Cookie Policy (OS-LGL-002) inherits them automatically via the shared boilerplate module, as will every future document in the series.
- **Related:** the DOCX publication format renders defined-term cross-references (item 4) as bold text rather than clickable internal hyperlinks — the PDF and website both have real working internal links; DOCX's equivalent needs the same raw-OOXML technique used for the letterhead background, and building that for cross-reference links specifically wasn't judged worth the added fragility this session. Documented in `scripts/generateLegalPublication.py`'s `add_text_with_terms()`, not a silent gap.
- **Status:** Resolved (2026-08-04) — drafted under explicit user authorization with conservative-language constraints; DOCX cross-reference-as-hyperlink gap remains open as a separate, unrelated minor item (see Related).

### TD-022 — OS-LGL-003 (Website Terms of Use) has two pairs of headings that overlap in subject with the shared Enterprise Legal Series appendices

- **Category:** Documentation / Content
- **Severity:** Low
- **What:** OS-LGL-003 arrived 2026-08-04 with 21 verbatim sections plus 4 requested additions, one of which was explicitly titled "Severability & Entire Agreement." Every document in the series already inherits a shared "Appendix A — Interpretation and Severability" and "Appendix B — Accessibility Commitment" automatically via `withStandardAppendices()` (see `TECHNICAL_DECISION_RECORDS.md` TDR-012). The user's own wording for OS-LGL-003 requested a document-specific "Accessibility Commitment" (Section 22, about the *website itself* being accessible — different scope from Appendix B, which is about *legal documents* being available in accessible formats) and a "Severability & Entire Agreement" clause (Section 25, which duplicates Appendix A's severability wording almost exactly, alongside a genuinely new Entire Agreement clause).
- **Why accepted:** rather than silently rename, merge, or trim the user's own supplied headings/wording to avoid the overlap, both were transcribed exactly as given — Section 22 kept the label "Accessibility Commitment" even though it now appears twice on the same page with different bodies; Section 25 kept the full "Severability & Entire Agreement" wording even though the severability sentence is now stated twice on the same page (once in Section 25, once in Appendix A). Neither is a factual conflict — both statements are consistent with each other, and generic severability boilerplate is commonly repeated within a single Terms document even where a broader policy also states it. Judged safer to flag this than to unilaterally decide it was redundant and cut content the user explicitly asked for.
- **Current impact:** cosmetic only — a careful reader sees two "Accessibility Commitment"-labeled entries (Section 22, Appendix B) and two severability statements (Section 25, Appendix A) on `/legal/terms` and its four publication formats. No legal or factual inconsistency.
- **Pay-down trigger:** ask the user whether to (a) leave as-is (harmless, faithful-to-source redundancy), (b) rename OS-LGL-003's Section 22 heading to something more distinct (e.g. "Website Accessibility") while keeping its website-specific body text, or (c) trim Section 25 down to only the new "Entire Agreement" content and rely on Appendix A for severability. Any of the three is a small, low-risk edit once decided.
- **Status:** Open — awaiting a decision, not blocked on effort.

### TD-023 — OS-LGL-004 (Master Booking Terms & Conditions) is a staged Production Draft; source-level duplications identified and consolidated

- **Category:** Documentation / Content
- **Severity:** Low (was Medium while duplications were still unresolved; downgraded now that the editorial consolidation pass is complete — document not yet approved, so still no live exposure)
- **What:** OS-LGL-004 arrived 2026-08-04 as a "Version 1.0 (Production Draft)" — 121 base clauses plus roughly 50 "Strategic Enhancement" descriptions, which the user authorized drafting into full clauses ("Master Approval Instruction," same message). Built as `src/lib/legal/documents/os-lgl-004-booking.ts`. The document's own top-of-message Table of Contents outline listed a "Part K — International Clients" and a "Contact Information" section under a "Part L" that didn't exist anywhere in the actual body — both were drafted new to close that gap. An initial pass flagged three source-level topic duplications (No Waiver/Waiver, Assignment/Assignment, International Clients/International Clients) without resolving them. A follow-up instruction requested a full editorial review of every duplicated clause, not just those three.
- **Resolution (2026-08-04, same day):** a document-wide audit found five genuine duplications total (the three originally flagged, plus "Acceptance of Terms" appearing in both Part A and Part J, and "Rescheduling" appearing in both Part C and Part F). All five were consolidated: "No Waiver" and "Assignment" (Part A) were removed and merged into Part J's "Waiver" and "Assignment" clauses, preserving every unique protection from each side (e.g. Part A's "prevents bookings from being passed to unrelated parties" rationale folded into Part J's fuller Assignment clause). "Acceptance of Terms" (Part J) was removed and merged into Part A's clause 4, combining every trigger from both versions. "International Clients" (Part I) was renamed to "Cross-Border Dispute Cooperation," trimmed of its redundant bullets, and now cross-references Part K (kept as the authoritative section) instead of repeating it. "Rescheduling" (Part C and Part F) was merged into a single comprehensive clause in Part F (matching Part F's own title), with Part C's slot replaced by a short cross-reference rather than removed. Two heading repeats were deliberately left in place as intentional by design: the Rescheduling stub/authoritative pair (same cross-reference pattern as International Clients), and "Accessibility Commitment" (this document's clause covers service accommodation; the shared Appendix B covers document formats — different legal subjects, consistent with the same pair being left unmerged in OS-LGL-003 per TD-022).
- **Verification:** all 162 clauses (down from 165, after removing 3 true duplicates) renumbered sequentially by position via a scripted pass — verified programmatically: no duplicate section ids, no gaps or duplicate numbers in the 1-162 sequence, exactly one intentionally-unnumbered closing clause (Statement of Professional Commitment). Every internal numeric cross-reference in the body (Cross-Border Dispute Cooperation → Governing Law; International Data Handling → Cross-Border Data Transfers) re-verified against the final numbering. `tsc --noEmit` and `eslint` both clean. Draft publications regenerated (64-page PDF) and visually verified: the consolidated Acceptance of Terms, Waiver, and Assignment clauses render correctly with all merged content present; the Rescheduling cross-reference stub and its authoritative Part F counterpart both render correctly. DOCX zip/XML integrity re-verified.
- **Current impact:** none — superseded by approval. `control.status` is now `"approved"`, `approvedBy` is `"Management"`, `bookingTerms` is registered in `registry.ts`'s `rawDocuments`, and `/legal/booking` serves the live document. Publications regenerated to `public/legal/publications/booking/` via `npm run legal:publish:booking`; the interim `-draft` script, folder, and export file were removed as part of publication (superseded, not needed going forward).
- **Related:** `TD-022` (the same category of source-level heading/topic overlap, first identified in OS-LGL-003 — that one remains open/unresolved by the user's own choice); `TECHNICAL_DECISION_RECORDS.md` TDR-013 (the Part-based, 3-tier section architecture this document introduces).
- **Status:** Resolved and Closed (2026-08-04) — all genuine duplications consolidated, document approved and published live. No further action.

### TD-024 — Publication-readiness audit of OS-LGL-004 found two cross-document findings that need a business decision, not an engineering fix

- **Category:** Documentation / Content
- **Severity:** Low (cosmetic/terminology only — no factual or legal conflict in either finding)
- **What:** a full publication-readiness QA pass (2026-08-04) compared OS-LGL-004 against the three already-published documents (Privacy Policy, Cookie Policy, Website Terms of Use) for terminology consistency. Two findings surfaced that are genuine but not mechanically fixable without a decision: (1) the "Client", "Services", and "Creative Works" defined terms are worded differently in each of the three documents that define them (Privacy Policy, Website Terms, Booking Terms) — e.g. Privacy Policy's "Client" is "any individual, organization, company, institution, or representative who enquires about or receives services", Website Terms' is "any individual or organisation engaging or intending to engage Ordift Studios", Booking Terms' is "any individual, business, organisation, institution, or authorised representative requesting, booking, or receiving services." None conflict in substance, but they are not identical. (2) Booking Terms uses the informal phrase "the company" six times (e.g. "the company's artistic standards", "the company's reputation") where the rest of the document, and the other three documents, consistently use "Ordift Studios" by name. Five of the six instances are inside clauses transcribed verbatim from the user's own supplied text, so they were flagged rather than silently rewritten.
- **Why not fixed automatically:** (1) is architecturally expected under the current design — every document's own Definitions section already states "Terms defined below are specific to this document... where a term is not defined below, its meaning in the Master Definitions Register applies," deferring full cross-document harmonization to OS-LGL-000 (Master Definitions Register), which has not been provided yet (`TD-020`, open). Rewriting Privacy Policy's or Website Terms' already-approved definition text to match Booking Terms' wording would mean editing two live, approved documents as a side effect of this Booking Terms review — out of scope without separate authorization. (2) touches verbatim source text in 5 of 6 instances; replacing informal "the company" with "Ordift Studios" is a defensible, low-risk consistency polish, but changing the user's own supplied wording without being asked was judged worth flagging rather than assuming.
- **Also observed, out of scope for this document:** Privacy Policy (already Approved, v1.2) internally mixes American and British spelling in several places (e.g. "organization" 6× and "organisation" 2× within the same document; similarly "authorized"/"authorised", "recognize"/"recognise", "fulfill"/"fulfil"). This predates this session's work on Booking Terms and was not introduced by it — noted here only because the requested cross-document audit surfaced it, not because it's part of Booking Terms' publication readiness.
- **Current impact:** none — cosmetic/terminology only, no legal ambiguity or conflict in any of the three findings.
- **User decisions (2026-08-04):** (1) Client/Services/Creative Works definition wording left unchanged for Version 1.0 — the user confirmed the wording is "legally consistent even if not identical" and directed that a single controlled harmonization pass be performed across the whole legal framework once OS-LGL-000 (Master Definitions Register) is completed, rather than editing already-approved documents piecemeal now. Remains deferred to `TD-020`. (2) "The company" replaced with "Ordift Studios" in all 6 instances (clauses 8, 31, 48, 66, 94, 96) — done, verified (no legal meaning changed, no cross-references affected, numbering unchanged, all publication formats regenerated). (3) Privacy Policy's internal American/British spelling mix was not actioned — no decision requested by the user; remains an unscheduled, low-priority item, unrelated to Booking Terms.
- **Related:** `TD-020` (OS-LGL-000 Master Definitions Register not yet provided — the root cause of finding 1; the deferred single-pass harmonization across the full legal framework is the agreed remediation once it lands).
- **Status:** Resolved (2026-08-04) — both items resolved by explicit user decision (one deferred by design, one fixed); Booking Terms approved and published. Privacy Policy's internal spelling mix remains a separate, unscheduled, non-blocking observation.

### TD-025 — `private.is_staff_or_admin()` doesn't include `super_admin`, so a Super-Admin-only account can't write to tables gated by it

- **Category:** Access Management
- **Severity:** Low (real accounts are expected to hold `admin` alongside `super_admin` — 0009's own comment: "stacks on top of admin" — so this is a latent edge case, not an active gap for any known account)
- **What:** found live while building and testing the Portfolio Management System (2026-08-05): a disposable QA account granted only the `super_admin` role could correctly update Sanity content (unaffected by this), but its writes to `activity_log` and the new `workflow_statuses` table were silently rejected by RLS. Both tables' insert policies call `private.is_staff_or_admin()` (migration 0004/0023), which checks `has_role('staff') or has_role('admin')` — `super_admin` is not included. `deliverables` (0007) likely has the same characteristic, since its policies follow the same helper.
- **Why not fixed now:** `is_staff_or_admin()` is shared, load-bearing infrastructure used well beyond Portfolio — changing it is a security-relevant edit to already-live production RLS policies, out of scope for a Portfolio-specific build. The immediate work-around (granting the test account `admin` too, matching the documented intended pairing) resolved the test; this entry exists so the underlying inconsistency isn't lost.
- **Current impact:** none known — assumes every real `super_admin` account also holds `admin` (true by the migration's stated design intent; not verified against the live production owner account, which does not exist on the staging project used for this test).
- **Pay-down trigger:** either (a) confirm and document that `super_admin` must always be granted alongside `admin` (a UI/process fix in `/admin/users`, not a schema change), or (b) redefine `is_staff_or_admin()` to include `super_admin` explicitly — the latter should get its own review given how many policies depend on it.
- **Status:** Open, low priority — flag only, no other action taken.

### TD-026 — Native Portfolio Project creator can't upload direct video files or edit the before/after gallery, relatedWorkshopIds, or SEO ogImage/canonicalUrl

- **Category:** Feature Scope
- **Severity:** Low (by design, disclosed at proposal time, not an oversight)
- **What:** the native Admin Portal project creator/editor (`/admin/portfolio/new`, `/admin/portfolio/[id]/edit`, shipped 2026-08-05) covers every field the user's 32-item capability list named, but deliberately does not cover: direct video FILE upload (embed URLs — YouTube/Vimeo/etc. — are fully native), the before/after gallery, `relatedWorkshopIds`, and SEO `ogImage`/`canonicalUrl`.
- **Why accepted:** Vercel's Serverless Functions enforce a hard ~4.5MB request-body ceiling (platform-level, not configurable), which makes direct video upload impractical through the same upload path used for images (images are viable because they're compressed client-side first — see `src/lib/media/clientImageCompress.ts`). Sending Sanity write credentials to the browser to bypass this via a direct-to-Sanity upload was explicitly ruled out by the user's own security constraint. The other three fields (before/after gallery, relatedWorkshopIds, SEO extras) were simply not in the requested 32-item list and were scoped out to control the size of an already-large build, consistent with "avoid duplicating functionality already provided by Sanity unless there is a clear operational benefit."
- **Current impact:** none for the confirmed everyday workflow (photos, all metadata, full case study, categories/collections, workflow lifecycle) — Sanity Studio remains available as the fallback ("Open Advanced Editor in Sanity Studio") for these four specific fields.
- **Pay-down trigger:** revisit only if a real project needs one of these four fields and the Studio fallback proves genuinely inconvenient in practice — not scheduled.
- **Status:** Open, accepted scope boundary — not a defect.

### TD-027 — `portfolioProjectFragment` returned `null` (not `[]`) for any array-reference field that was never initialized on the Sanity document, crashing the public project page

- **Category:** Correctness / Regression Risk
- **Severity:** Medium while open (crashed a live public page); Resolved same day
- **What:** found live during Portfolio Management System native-editor QA (2026-08-05): a project created entirely through the new native wizard crashed its own `/work/[slug]` page with `TypeError: Cannot read properties of null (reading 'includes')`. Root cause: GROQ returns `null` (not `[]`) for an array field that was never set at all on a document, as distinct from one saved empty — and the native wizard deliberately never writes to `relatedWorkshops`/`beforeAfterGallery` (see TD-026), leaving those fields fully unset rather than merely empty. `src/app/work/[slug]/page.tsx` called `.includes()` on the result without a null check.
- **Why this could also have affected Studio-created content:** the same risk exists for any document where a Studio editor leaves an optional array field (awards, publications, videos, downloadableAssets, etc.) completely untouched rather than explicitly saving it empty — not unique to the native editor, just first surfaced by it.
- **Fix:** every array-typed projection in `portfolioProjectFragment` (`src/lib/content/sanity/queries.ts`) now wrapped in `coalesce(..., [])`, so the query layer itself guarantees an array regardless of whether the underlying Sanity field was ever initialized — fixes the root cause for all content, not just wizard-created projects, and needed no change to the consuming page components.
- **Verification:** re-tested live — the same project's public page rendered correctly after the fix; `tsc`/`eslint`/`vitest`/production build all clean afterward.
- **Status:** Resolved (2026-08-05), same session it was found in.

### TD-028 — Audit trail "Department" label resolves from the legacy `staff_details.department` free-text column, not `operational_title_id`

- **Category:** Data Model / Consistency
- **Severity:** Low
- **What:** `resolveActorIdentities()` (`src/lib/portal/actorIdentity.ts`, built for `TECHNICAL_DECISION_RECORDS.md` TDR-014's Audit Identity Standard) resolves an actor's "Department" from `staff_details.department` — a free-text column migration 0009 itself already flags as predating `operational_title_id`/`engagement_type_id` and states "prefer the latter going forward." No account currently has `operational_title_id` populated with anything department-equivalent, so this wasn't a live choice between two populated sources — it's simply the only one with data today.
- **Why not fixed now:** out of scope for the Audit Identity Standard change itself, which was about *where* identity resolves from (member_number via existing FKs), not about migrating the underlying department/title data model — that's a separate, pre-existing piece of debt this work only surfaced by consuming the field, not one it created.
- **Pay-down trigger:** if/when `operational_title_id` (or a dedicated department lookup table) becomes the actual source of truth for department/function, update `resolveActorIdentities()`'s single query to match — every audit display downstream picks it up automatically, no other file changes needed.
- **Status:** Open, low priority.

### TD-029 — No functional Portfolio workflow exists for `contractor`-role accounts, despite permission-layer scaffolding suggesting one does

- **Category:** Access Model / Feature Gap
- **Severity:** Medium
- **What:** discovered while verifying the admin holding-page bypass (2026-08-06). `PORTFOLIO_CAPABILITIES` (`src/lib/admin/portfolioPermissions.ts`) grants `contractor` the capabilities `upload`, `edit_own`, `submit` — implying contractors can upload images, edit their own submissions, and submit for review. In practice, none of this is reachable: `/admin/**` redirects any non-`staff`/`admin`/`super_admin` account straight to `/portal` at the layout level (`src/app/admin/layout.tsx`), before the request ever reaches the portfolio-specific capability checks. `/portal/collaborator` (the actual landing surface for `contractor` accounts, per `primaryPortalPath()` in `src/lib/portal/roles.ts`) only handles `enquiry`/`workshop` project kinds (`src/lib/portal/collaboratorData.ts`'s `ProjectKind` type) — Portfolio was never wired into it. Additionally, `isAssignedToProject()` (`src/lib/admin/portfolioPermissions.ts`) — the function that's supposed to scope a contractor to only their assigned projects — is dead code with zero call sites; the "Assigned Collaborators" section on `/admin/portfolio/[id]` (which only `staff`/`admin`/`super_admin` can even view) lets an admin assign a contractor to a project, but nothing then grants that contractor anywhere to act on it.
- **Why not fixed now:** out of scope for the admin preview-bypass work that surfaced it — building a real contractor Portfolio workflow (assigned-project listing, image upload, mandatory Alt Text, the new Production Notes field, submit-for-review, explicitly no publish authority) is a meaningfully sized feature in its own right, not a bug fix, and was explicitly descoped by the project owner from the current task.
- **Current impact:** the `contractor` role's Portfolio capabilities are currently inert — granting `upload`/`edit_own`/`submit` to a contractor account today has no effect, since no route exists for them to exercise it. Not a security issue (nothing is under-protected — if anything, contractors are more restricted than the permission matrix implies), but a functionality gap if the business intends to onboard photographers/contributors this way.
- **Pay-down trigger:** when a real contractor/photographer needs to submit portfolio work directly, rather than via a staff/admin account uploading on their behalf. Design should cover: assigned-project access (finally wiring up `isAssignedToProject`/`workflow_assignments`), image upload reusing the existing compression/upload pipeline, mandatory Alt Text (no `publish`-capability exemption — contractors should never get the skip), the new Production Notes field for photographer context, and a submit-for-review action with no direct publish authority.
- **Status:** Open, not scheduled. Also logged in `PRODUCT_ROADMAP.md`.

---

## Adding new entries

Any future compromise — a deferred edge case, a "fix properly later" comment, a scope-narrowing decision made under time pressure — gets an entry here at the time it's made, not retroactively. Cross-reference the relevant `TECHNICAL_DECISION_RECORDS.md` ADR if the debt stems from a documented architectural trade-off.

*Cross-references: `PRODUCT_ROADMAP.md` (Version 1.0.5, this register's parent milestone), `TECHNICAL_DECISION_RECORDS.md` (the "why" behind decisions that produced some of this debt), `DISASTER_RECOVERY.md` (TD-008), `PHASE_4_PRODUCTION_AUDIT_REPORT.md` (TD-006 origin), `DOCUMENTATION_INDEX.md`.*
