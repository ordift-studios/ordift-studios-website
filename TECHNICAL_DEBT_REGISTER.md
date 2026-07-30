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
- **Status:** Open (tracked, not scheduled for action)

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

---

## Adding new entries

Any future compromise — a deferred edge case, a "fix properly later" comment, a scope-narrowing decision made under time pressure — gets an entry here at the time it's made, not retroactively. Cross-reference the relevant `TECHNICAL_DECISION_RECORDS.md` ADR if the debt stems from a documented architectural trade-off.

*Cross-references: `PRODUCT_ROADMAP.md` (Version 1.0.5, this register's parent milestone), `TECHNICAL_DECISION_RECORDS.md` (the "why" behind decisions that produced some of this debt), `DISASTER_RECOVERY.md` (TD-008), `PHASE_4_PRODUCTION_AUDIT_REPORT.md` (TD-006 origin), `DOCUMENTATION_INDEX.md`.*
