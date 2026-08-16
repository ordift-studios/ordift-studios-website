# Ordift Studios — Platform Health Status

**Established:** 2026-08-10, as `PRODUCT_ROADMAP.md` Version 1.0.5 Workstream G.

**What this is and isn't.** Per the roadmap's own scope decision (2026-07-30, recorded here and in TDR-009 of `TECHNICAL_DECISION_RECORDS.md`): a full live internal dashboard *application* is itself a new feature — the thing Version 1.0.5 is explicitly not supposed to add. At current scale (pre-launch, founder-led, no engineering team checking a dashboard daily), this document delivers most of the value of a live dashboard at a fraction of the cost: a single place that answers "is the platform healthy right now," with every claim sourced from — never duplicating — the living document that actually owns that fact. **This is a documentation/evidence layer, not a monitoring system of its own.** A future live dashboard is reconsidered only when manual maintenance becomes unreliable, multiple engineers/environments need centralized visibility, incident volume justifies it, real-time operational decisions depend on it, or the cost of not automating exceeds the build/maintenance cost — see TDR-009.

**How to keep this current:** updating this document is part of the definition-of-done for any future milestone that changes one of the rows below — the same discipline already applied to `MILESTONES.md`. A row that hasn't been touched since its "Last verified" date is a signal to re-check the source document, not to trust this summary blindly past that date.

**Superseded for Production-readiness purposes (2026-08-10):** this document remains the standing platform-health snapshot for ongoing use, but for the specific question of "is this platform ready to promote to Production," `PRODUCTION_READINESS_RECONCILIATION.md` is now the authoritative, more rigorous answer — it re-verified every claim below against actual current-state evidence (not just cited a source document) and produced a formal GO/CONDITIONAL GO/NO-GO verdict. Consult that document first for any Production-promotion decision; this one for day-to-day "what's the current state of X" questions.

---

## Status at a glance (2026-08-10)

| Area | Status | Last verified | Evidence |
|---|---|---|---|
| Test suite | 🟢 Green | 2026-07-30 | `INTEGRATION_TESTING_STRATEGY.md`; 12 `.test.ts` files, unit + hybrid integration |
| CI pipeline | 🟢 Green | 2026-07-30 | `.github/workflows/ci.yml`, live-verified (caught a real bug on a real push) |
| Deployment health (staging) | 🟢 Green | 2026-08-10 | Migration 0027 + Workstream I fixes deployed and verified this session |
| Deployment health (production) | 🟡 Behind staging | 2026-07-30 | `PAYSTACK_PRODUCTION_HANDOVER.md` §2 — see "Deployment & migration state" below |
| Error monitoring | 🟢 Green (with one known gap) | 2026-08-10 | `OPERATIONS_MANUAL.md` §6.1 — Sentry verified end-to-end on staging |
| Uptime/synthetic monitoring | 🟡 Endpoint live, monitor not configured | 2026-08-16 | TD-013 — `GET /api/health` deployed to Production and verified; external UptimeRobot monitor still a pending manual step |
| Backup | 🟡 Manual, working, unrehearsed restore | 2026-08-10 | `DISASTER_RECOVERY.md` — weekly manual `pg_dump`, restore-into-scratch-project never rehearsed |
| Security review | 🟢 Green | 2026-08-10 | `WORKSTREAM_I_SECURITY_REREVIEW.md` — 9 findings, 8 fixed + deployed to staging, 1 tracked as debt |
| Dependency risks | 🟡 4 open, all low-severity/cosmetic | 2026-07-30 | `DEPENDENCY_WATCHLIST.md`, DW-001 through DW-004 |
| Open technical debt | 🟡 ~18 open of 32 total entries | 2026-08-10 | `TECHNICAL_DEBT_REGISTER.md` — see breakdown below |
| Scalability posture | 🟢 Green, no near-term risk | 2026-08-10 | `TECHNOLOGY_COST_REGISTER.md`'s Scalability Assessment section |
| Release readiness (public launch) | 🟡 Pre-launch, business decision pending | 2026-07-30 | `LAUNCH_CHECKLIST.md` — `LAUNCH_HOLDING_PAGE` still on |

🟢 Green = no known blocking gap · 🟡 Yellow = known, tracked, non-blocking gap · 🔴 Red = known gap with a real (if currently low-impact) exposure

---

## 1. Test status

**Owning document:** `INTEGRATION_TESTING_STRATEGY.md`, `DEVELOPMENT_GUIDE.md` §5.

Unit + hybrid integration test suite (`vitest`) covers rate limiting, idempotency, role/permission boundaries, Google Sheets sync, email dispatch, booking/enquiry and project-request workflows, and RLS boundaries — run against the real staging Supabase project and staging Sanity dataset, not mocks, per this project's standing "staging verification is not optional busywork" rule (`DEVELOPMENT_GUIDE.md` §5). Component-level (React Testing Library) coverage remains blocked by a dependency conflict — see TD-011 and `DEPENDENCY_WATCHLIST.md` DW-001; unaffected, since the highest-priority tests never needed component rendering.

**Owner:** whoever's merging a PR — Testing Requirements (`DEVELOPMENT_GUIDE.md` §5) are non-negotiable before merge, not a separate QA role's job.

## 2. CI pipeline status

**Owning document:** `.github/workflows/ci.yml` itself; narrative in `TECHNICAL_DEBT_REGISTER.md`'s Workstream B entry.

Live and verified — not just present as YAML. The first real run (`30570600185`, 2026-07-30) caught a real bug on a real push, the concrete bar this project holds CI to (a green checkmark that's never actually failed proves nothing about whether it *would* catch a real problem).

## 3. Deployment & migration state

**Owning documents:** `DEVELOPMENT_GUIDE.md` §4 (the deployment checklist procedure), `PAYSTACK_PRODUCTION_HANDOVER.md` §2 (the current migration gap, Production-specific).

- **Staging:** up to date as of this session — migration `0027_security_rereview_rls_hardening.sql` applied and verified (`supabase migration list` confirms Local/Remote match), Workstream I's code fixes deployed, `tsc`/`lint`/`build` clean.
- **Production:** migration baseline `0022`, plus `0026` (`is_staff_or_admin()` RLS fix) manually applied out-of-band via SQL Editor and verified — **migrations `0023` through `0025` and `0027` remain pending promotion**, blocked on your explicit go-ahead per `PAYSTACK_PRODUCTION_HANDOVER.md` §10's execution order, not on any technical readiness gap. Production code (`main` branch) has not received the Payments feature work or Workstream I's fixes yet.

## 4. Monitoring status

**Owning document:** `OPERATIONS_MANUAL.md` §6.1 (added this session, Workstream D).

Sentry error tracking (server, edge, and client runtimes) is implemented and verified end-to-end on staging (2026-08-10) — closes TD-003. Not yet configured in Production (deliberate — Production env vars are untouched pending your approval, per this project's standing "never modify Production without explicit approval" rule). One known gap: client-side events tag `environment` from `NODE_ENV` rather than this project's own `SITE_ENV`, so a staging client-side error currently displays as "production" in the Sentry dashboard — TD-032, low severity, fix requires a new Vercel env var. **Uptime/synthetic monitoring endpoint is live, external monitor still pending** — TD-013, `GET /api/health` deployed to Production and verified 2026-08-16 (static `200 {"status":"ok"}`, `Cache-Control: no-store`, no auth, no downstream calls); an actual external monitor (recommended: UptimeRobot) still needs to be manually created and pointed at it before this closes — until then nothing is actually watching for a platform-level outage (DNS, certificate, full Vercel incident) independent of an application error Sentry would catch.

## 5. Backup & restore-test status

**Owning document:** `DISASTER_RECOVERY.md` (full detail — not duplicated here).

Manual weekly `pg_dump` backup strategy is in effect and has been exercised at least once (the first real production backup was guided and completed, per `MILESTONES.md`). The **restore-into-a-scratch-Supabase-project rehearsal has never been performed** — `DISASTER_RECOVERY.md` §2.5 flags this explicitly; it requires the database password, a human-only action per this project's standing credential-handling rules. This is the single largest gap between "we have a backup" and "we know we can recover" — see `DISASTER_RECOVERY.md`'s own framing of that distinction.

## 6. Security review status

**Owning document:** `WORKSTREAM_I_SECURITY_REREVIEW.md` (full findings), `TECHNICAL_DEBT_REGISTER.md` (the one item logged as debt rather than fixed).

Most recent adversarial re-review: 2026-08-10. Three independent passes (auth/RLS, API protection/rate limiting/webhooks, secrets/logging/audit trail) found 9 issues; 8 were fixed and deployed to staging (the most severe: bank-transfer payment initiation's missing ownership/amount check, cross-confirmed by two independent passes), 1 logged as low-severity tech debt (TD-030, file-upload content-sniffing). The RLS migration this review produced (`0027`) is verified applied to staging; not yet promoted to Production (see §3 above).

## 7. Dependency risk status

**Owning document:** `DEPENDENCY_WATCHLIST.md` (full detail — not duplicated here).

4 open items as of 2026-07-30, all low-severity or cosmetic: a Babel peer-dependency conflict blocking component-level test tooling (DW-001, workaround in place, TD-011), a soft-deprecated Vite plugin (DW-002), an unmaintained transitive dependency tied to it (DW-003), and a batch of transitive-only deprecation notices surfaced by CI's clean-environment install (DW-004). None reachable at runtime by untrusted input. Re-checked each Quarterly maintenance review per that document's standing cadence — next due per `MAINTENANCE_SCHEDULE.md`.

## 8. Technical debt summary

**Owning document:** `TECHNICAL_DEBT_REGISTER.md` (full detail, every entry's why/impact/pay-down-trigger — not duplicated here).

32 entries logged as of 2026-08-10; roughly 18 open, 14 resolved (exact counts fluctuate as entries close — the register itself is the authoritative count, this is a snapshot). Most recent additions: TD-030 (file-upload content-sniffing, low), TD-031 (IP-keyed rate limiting can false-positive-lock shared-IP users, low), TD-032 (Sentry client-side environment-tagging asymmetry, low) — none blocking. No open entry above Medium severity as of this snapshot.

## 9. Service/vendor health

**Owning document:** `TECHNOLOGY_COST_REGISTER.md` (pricing, tiers, dependency map — not duplicated here).

Every external service (Vercel, Supabase, Sanity, Resend, Upstash Redis, Cloudflare Turnstile, Google Sheets API, GitHub, Paystack) is on its free/base tier and comfortably within it at current volume — see that document's Usage Scaling table. No service is near a capacity-driven upgrade trigger; the one real future cost decision (Supabase Free→Pro) is a business-milestone trigger (`DISASTER_RECOVERY.md` §9), not a raw-volume one.

## 10. Scalability posture

**Owning document:** `TECHNOLOGY_COST_REGISTER.md`'s "Scalability Assessment (Workstream J)" section (2026-08-10 — full per-subsystem bottleneck/trigger detail, not duplicated here).

None of the five throughput-relevant subsystems (Supabase, Sanity, Vercel, Redis rate-limiting, Google Sheets sync) is within a realistic distance of a genuine capacity failure at current or near-term volume. Every identified near-term trigger is a business-milestone event, a plan/config confirmation gap, or a design/UX threshold — not a hard technical ceiling.

## 11. Release readiness

**Owning document:** `LAUNCH_CHECKLIST.md` (the canonical Before Launch / Launch Day / After Launch runbook — not duplicated here).

As of `LAUNCH_CHECKLIST.md`'s last update (2026-07-30), `LAUNCH_HOLDING_PAGE` remains on — deliberate, not an oversight. Nearly every Technical checklist item is complete; the remaining Before-Launch gate is content readiness, a business decision, not an engineering one. Substantial platform work has continued since that date (Portfolio Management System, Payments architecture, Workstreams C through J) — none of it has been a launch blocker, but this document's own date means a fresh pass against the current state is worth doing at actual launch-decision time rather than trusting this snapshot alone.

---

*Cross-references: `PRODUCT_ROADMAP.md` (Version 1.0.5 Workstream G), `PLATFORM_HEALTH_REVIEW.md` (the periodic point-in-time audit this document is a companion to, not a replacement for — that document produces a dated recommendation before major increments; this one is a continuously-maintained current-state snapshot), `TECHNICAL_DECISION_RECORDS.md` (TDR-009, the live-dashboard-vs-doc decision), `DOCUMENTATION_INDEX.md`.*
