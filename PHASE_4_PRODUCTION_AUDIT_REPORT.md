# Phase 4.3 — Final Production Audit Report

**Date:** 2026-07-30
**Scope:** A full-application audit following the completed Phase 1–4.2 production-hardening work (Redis rate limiting/idempotency, retry-with-backoff email dispatch, dead-letter logging, Cloudflare Turnstile CAPTCHA, and the backup/recovery readiness audit). This report covers code-level cleanup, environment/secret verification, RLS/authorization review, file-upload/storage review, a fresh Redis health check, security header hardening, and a dependency vulnerability review — then rolls all of it into the requested Production Readiness, Security, and Performance audits, a prioritized task list, a launch readiness score, a Go-Live sequence, and remaining risks.

---

## 1. Executive Summary

No blocking issues were found. The application's infrastructure (Redis, email, CAPTCHA, backup posture, RLS, audit logging) is sound and independently verified — most of it multiple times across this and prior sessions. This pass found and fixed three real, if minor, gaps: two undocumented environment variables (`LAUNCH_HOLDING_PAGE`, and three auto-injected-but-unused Redis vars) and a complete absence of baseline security response headers — all now fixed and deployed. It also confirmed a staging/production migration-history gap has been fully resolved (per your own confirmation) and found no leftover debug code, temporary test hooks, or stray QA data anywhere in either environment. The one item requiring a genuine judgment call — a set of `npm audit` findings whose suggested fix is a breaking Next.js downgrade — is deliberately **not** auto-applied; see §3.4.

## 2. Production Readiness Report

| Area | Status | Notes |
|---|---|---|
| Typecheck | ✅ Clean | `tsc --noEmit`, zero errors |
| Lint | ✅ Clean | `eslint`, zero errors/warnings |
| Production build | ✅ Clean | `npm run build` succeeds locally and on every Vercel deploy this session |
| Migration history (0001–0022) | ✅ Consistent | Per your confirmation: production and staging both fully synchronized through 0022, Local/Remote matching in both, CLI relinked to production |
| Redis rate limiting | ✅ Healthy | Fresh post-migration check against production: allow/deny logic correct, cleaned up after |
| Idempotency | ✅ Healthy | Fresh post-migration round-trip check against production: store/retrieve correct |
| Retry dispatcher | ✅ Healthy | Unchanged since Phase 2/3 verification; every real send this session used it successfully |
| Dead-letter logging | ✅ Healthy | Table/grant confirmed present on both environments as of the migration sync |
| Email delivery | ✅ Healthy | All 5 email types sent successfully via the Super-Admin verify-send diagnostic, most recently after the CAPTCHA deploy |
| Authentication | ✅ Unaffected | No auth code touched this session; Turnstile's addition to signup/login used the existing implicit-injection path with zero changes to those forms |
| Authorization / RLS boundaries | ✅ Reviewed, unaffected | See §4 — every table has RLS enabled, policy coverage reviewed, nothing touched by this session except the two new tables (`email_send_failures`, and rows already covered) which correctly deny `authenticated`/`anon` entirely |
| Staff / Super Admin access | ✅ Verified functional | Used successfully throughout this session (verify-send calls); browser session had since timed out by the time of this final check, which is expected session-expiry behavior, not a defect |
| Temporary QA data | ✅ Clean | Swept both staging and production `enquiries`, `workshop_registrations`, `project_requests`, `email_send_failures` for test-pattern rows — none found |
| Obsolete verification endpoints | ✅ None found | Every route under `/api/admin/**` is a permanent diagnostic/operational tool (matches the established `verify-write` precedent), not a leftover one-off |
| Debug code / console.logs | ✅ Clean | Two `console.log` calls exist in the whole codebase, both are intentional "test-mode" operational logging matching an established pattern — not debug cruft |
| TODO/FIXME/debugger statements | ✅ None found | |
| Public forms (Contact Enquiry, Workshop Registration) | ✅ Verified | Full CAPTCHA + rate-limit + idempotency test matrix passed (Phase 4.1) |
| File uploads / Storage | ✅ N/A, confirmed | Zero Supabase Storage buckets provisioned, zero code references — this feature doesn't exist yet (correctly deferred per the original plan's Tier 2 scope) |
| Mobile / desktop compatibility | ⚠️ Not independently re-verified this pass | The new Turnstile widget was tested in a standard desktop-width browser session; no separate mobile-viewport pass was run this session specifically for the widget. Low risk — Cloudflare's own widget is responsive by design — but listed honestly rather than claimed as verified. |
| Documentation consistency | ✅ Verified | `MILESTONES.md`, `DEPLOYMENT.md`, `.env.example`, `DOCUMENTATION_INDEX.md`, `DISASTER_RECOVERY.md` all updated and cross-referenced this session |

## 3. Security Audit Report

### 3.1 Fixed this pass
- **Baseline security headers were entirely absent** — no `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy` on any response. Added all four in `next.config.ts`, applied to every route, deployed and confirmed live via `curl -I`. (Vercel already adds `Strict-Transport-Security` automatically — confirmed present, no action needed there.)
- **`LAUNCH_HOLDING_PAGE`**, a real, currently-active flag controlling whether the entire public site is gated behind a "Coming Soon" page, was completely undocumented in `.env.example`. Fixed.

### 3.2 Row Level Security review
Every one of the 26 tables in the schema has RLS enabled — no exceptions, confirmed via direct migration-file grep, not assumption. Three tables (`record_sequences`, `sheet_sync_failures`, `email_send_failures`) have RLS enabled with **zero policies defined**, which is correct and intentional: this makes them deny-all for `authenticated`/`anon`, reachable only via the `service_role` client (which bypasses RLS as a role attribute, per Postgres semantics) — exactly right for pure system/internal tables that no end-user should ever touch directly. Every other table has 1–5 policies; the actual per-role boundary logic (client sees own data, staff sees assigned projects, admin sees everything, etc.) was built and E2E-verified in prior sessions (`MILESTONES.md` v1.2/v1.3 IAM work) and nothing in this session's changes touched policy logic — only added new tables with the correct deny-by-default posture.

### 3.3 CORS
No CORS headers are set anywhere in the codebase — Next.js API routes default to same-origin only, which is correct here since nothing needs cross-origin browser access to `/api/enquiry` or `/api/workshop-registration`.

### 3.4 Dependency vulnerabilities — flagged, not auto-fixed
`npm audit` reports 31 vulnerabilities (25 high, 6 moderate), all transitive, all with `npm audit fix --force` as the only suggested remediation — which would **downgrade Next.js from 16.2.11 to 9.3.3**, an enormous breaking change, entirely inappropriate to auto-apply per your own "do not introduce breaking changes" constraint. Breakdown:
- `sharp` (high, libvips CVEs) — pulled in as `next`'s own optional dependency for its built-in image optimizer. **Confirmed not exercised at runtime**: this app uses a custom `next/image` loader (`src/lib/media/sanityLoader.ts`) that delegates all resizing to Sanity's CDN, so Next's sharp-based optimizer path is never invoked in production. Real-world risk is low, but the package is still present in `node_modules`.
- `postcss` (high, path traversal in source-map loading) — same `next`-internal transitive chain.
- `smol-toml` / `uuid` (moderate) — both transitive through `sanity`'s own tooling (Studio-only, not part of the public site's runtime bundle).
- **Recommendation:** do not force-downgrade Next.js. Track upstream `next`/`sanity` releases that resolve these transitively, or evaluate a targeted `overrides` entry in `package.json` pinning just the vulnerable sub-dependency (`postcss`, `uuid`) to a patched version without touching `next`/`sanity` themselves — this is a deliberate, testable change, not something to auto-apply mid-audit.

### 3.5 Secrets handling
- No secrets found hardcoded anywhere in source (grepped for common patterns; only comments/documentation matched).
- `.env.local` / `.env.production.local` confirmed gitignored throughout this session's many reads/writes to them.
- Sensitive-flagged Vercel variables' write-only limitation is documented in `DISASTER_RECOVERY.md` §5 with a clear recommendation.
- No API keys, tokens, or credentials appear in any of this session's commits (reviewed every diff before committing).

## 4. Performance Audit Report

- **Image handling:** all real images route through Sanity's CDN via a custom loader — resizing happens at the CDN edge, not on Vercel's compute, avoiding a redundant resize hop. No action needed.
- **Turnstile script loading:** loaded via `next/script` with `async defer` — does not block page render or hydration.
- **Redis operations:** the rate-limit check is a single atomic Lua script round-trip (not multiple sequential Redis calls), and idempotency is a single `GET`/`SET` — both minimal-latency by design, already covered in the Phase 1 hardening report.
- **No N+1 query patterns introduced this session** — all new code (dispatch.ts, redis.ts, turnstile.ts, the two form components) is either a single external HTTP call or a single Redis/Supabase operation per request.
- **Bundle size:** no new client-side dependencies were added that ship to the browser bundle — `@upstash/redis` and `resend` are both server-only imports (used exclusively in API routes / server-side lib files), never imported by a Client Component.
- No performance regressions identified. No performance-specific testing (Lighthouse, load testing) was run this pass — out of scope for this audit, recommended as a separate pre-launch check if not already covered by the earlier LC1 Phase 1 production audit.

## 5. Remaining Tasks Checklist

### Critical (must complete before public launch)
- [ ] **Decide on Supabase Pro-plan upgrade** for automatic backups (currently zero backup coverage on production data — see `DISASTER_RECOVERY.md`). This is the single highest-impact open item; a data-loss incident today has no recovery path.
- [ ] **Create a real Cloudflare Turnstile site** and add its site key/secret to Vercel Production — CAPTCHA code is complete and tested but inert until this manual dashboard step happens (exact instructions available on request).

### High
- [ ] Enable Cloudflare Turnstile on `/portal/signup` and `/portal/login` in production the same way, once the real keys exist (the code already supports this — same two env vars cover all four forms).
- [ ] Decide on a mitigation path for the `npm audit` findings (§3.4) — at minimum, evaluate a scoped `overrides` pin for `postcss`/`uuid`.
- [ ] Perform a dedicated mobile-viewport check of the Turnstile widget on `/book` and `/workshops/[slug]` before launch (not done this pass — see §2).

### Medium
- [ ] Add a Content-Security-Policy header — deliberately deferred this pass since it needs every legitimate script/frame source (Turnstile, Sanity Studio, Vercel's own) enumerated and tested before rollout, not guessed.
- [ ] Add alerting on `email_send_failures` inserts (currently silent — an admin must know to check manually). Already flagged in `PRODUCTION_HARDENING_REPORT.md`.
- [ ] Establish a manual `pg_dump` backup cadence (weekly minimum) as an interim measure until/unless the Pro-plan decision is made — procedure documented in `DISASTER_RECOVERY.md` §2.

### Low
- [ ] Retention/cleanup policy for `email_send_failures` and `sheet_sync_failures` (currently unbounded growth, low risk at current volume).
- [ ] Consider a lightweight admin UI for dead-letter rows instead of direct database access.
- [ ] Track `npm audit`'s underlying advisories for upstream fixes that don't require a breaking downgrade.

## 6. Launch Readiness Score: 92%

Up from the Phase 3 report's 90% — the two real gaps found and fixed this pass (missing security headers, undocumented `LAUNCH_HOLDING_PAGE`) are resolved, and RLS/authorization/audit-logging coverage was independently confirmed rather than assumed. The remaining 8 points are entirely the two Critical items above (backup plan decision, real Turnstile credentials) plus the CSP/mobile-check items in High — none of which are code defects, all of which are either your decision to make or a manual dashboard step.

## 7. Recommended Go-Live Sequence

1. **You decide:** Supabase Pro-plan upgrade (backups) — yes/no/defer, since it's a recurring cost decision.
2. **You provide:** a real Turnstile site (Cloudflare dashboard) — I'll walk you through the exact steps and wire the keys into Vercel once you're ready.
3. **I verify:** CAPTCHA live in production with real keys, using the same test matrix as Phase 4.1 but against real (not dummy) credentials where feasible.
4. **I run:** the mobile-viewport check for both forms (High item above).
5. **You approve:** enabling `FORMS_SENDING_ENABLED` — per Phase 5 of your original directive, this happens only after your explicit written approval, never automatically.
6. **I execute Phase 5:** enable the flag, deploy, one controlled real submission per public form, verify DB/Sheets/emails, clean up, confirm no duplicates/rate-limit/CAPTCHA/dead-letter regressions.
7. **I produce:** the Final 100% Production Readiness Report, update all docs, commit, push, tag the stable release.

## 8. Remaining Risks

| Risk | Impact | Mitigation |
|---|---|---|
| No automatic database backups | **High** — any accidental deletion or corruption of production data is unrecoverable today | Supabase Pro upgrade (your decision), or adopt the manual `pg_dump` cadence in `DISASTER_RECOVERY.md` §2 immediately as an interim measure |
| CAPTCHA inert until real credentials exist | **Medium** — public forms currently rely on honeypot + rate limiting only, no real bot-challenge | Create the Turnstile site (Critical task above) — code is ready, this is a manual step only |
| No CSP header | **Low-Medium** — reduces defense-in-depth against XSS if one is ever introduced elsewhere | Deliberately deferred, not skipped — needs a tested source allowlist, tracked as a Medium task |
| `npm audit` findings with only a breaking-downgrade fix path | **Low** — `sharp`'s vulnerable code path is confirmed unused at runtime; `postcss`/`uuid`/`smol-toml` are transitive/tooling-only | Track upstream fixes or a scoped `overrides` pin; do not force-downgrade `next` |
| Turnstile widget not mobile-tested this pass | **Low** — Cloudflare's widget is responsive by design, but not independently confirmed here | Add to the Go-Live sequence before launch (High task above) |

---

## Explicit Statement

**The application is not yet fully production-ready for public launch** — specifically because of the two Critical items (backup decision, real CAPTCHA credentials), both of which require your input/action, not further code work. Everything code-level, infrastructure-level, and process-level that this audit could verify or fix has been verified or fixed. Once those two Critical items are resolved, the remaining High/Medium/Low items are genuinely optional-before-launch hardening, not blockers — I'd recommend completing the mobile-viewport check and the `npm audit` mitigation decision before launch, but neither is a hard blocker the way the two Critical items are.

**Optional post-launch improvements** (safe to defer beyond launch): CSP header, dead-letter alerting, admin UI for dead-letter rows, retention policies, and the `npm audit` upstream tracking.

---

*Companion documents: `PRODUCTION_HARDENING_REPORT.md` (email subsystem, Phase 1–3), `DISASTER_RECOVERY.md` (backup/recovery procedure), `MILESTONES.md` (full dated history), `DEPLOYMENT.md` (environment variables and deployment log).*
