# Engineering Guide

**Established:** 2026-07-30, as Workstream D of `PRODUCT_ROADMAP.md`'s Version 1.0.5 — Platform Foundation Hardening.

**Status:** started ahead of schedule — the Environment Configuration section below was written now, at your explicit request, alongside the integration-testing hybrid-model decision it documents the reasoning for. The remaining sections (coding standards, repository structure, incident response, monitoring architecture) are Workstream D's main scope and will be filled in as that workstream is executed in full; this file already exists so nothing about it needs to be created fresh at that point, only extended.

**Purpose:** the standing engineering reference a future senior engineer — including a future instance of whoever is building this — should be able to read and understand how this system actually works, without reconstructing it from session history. Pairs with `TECHNICAL_DECISION_RECORDS.md` (why specific decisions were made) and `TECHNICAL_DEBT_REGISTER.md` (what's known to be imperfect and why that was accepted).

---

## Environment Configuration — the Config-Injection Principle

**The rule:** nothing in this codebase hardcodes which environment (staging vs. production, or — going forward — real staging vs. a future disposable test environment) it's talking to. Every environment-specific value — which Supabase project, which Sanity dataset, which Sheets spreadsheet, which Resend configuration — is resolved from environment variables, read at runtime, never baked into source.

**Why this matters, concretely:**

- **It's already load-bearing for staging/production isolation.** TDR-005 (`TECHNICAL_DECISION_RECORDS.md`) established fully separate Sanity datasets specifically so sample content is *structurally* incapable of reaching production — that guarantee only holds because which dataset gets queried is an environment variable, not a hardcoded string anywhere in a page component.
- **It's the exact mechanism that made the Version 1.0.5 integration-testing decision possible.** You approved a hybrid model (2026-07-30): use the real staging environment for integration tests today, but design the test harness so a future migration to a dedicated ephemeral test environment is a configuration change, not a rewrite. That's only achievable because the test harness (`INTEGRATION_TESTING_STRATEGY.md` §7, `src/lib/testing/testEnvironment.ts`) resolves its target environment from env vars (`TEST_SUPABASE_URL`, `TEST_SHEETS_SPREADSHEET_ID`, etc.) exactly the same way the application itself does — the pattern didn't need to be invented for testing, it already existed and was simply extended.
- **It generalizes beyond this one decision.** Any future need to point the platform (or its test suite) at a different backend — a new environment tier, a disaster-recovery failover target, a regional deployment (Vision 2030's multi-country direction) — is a configuration change under this principle, not an architecture change. This is why it's documented here as a standing principle rather than a one-off note in the testing strategy alone.

**How to apply it going forward:** any new integration this codebase adds — a new third-party API, a new data store, a new notification channel — should default to reading its target/credentials from environment variables from the first line of code, not "for now hardcode it and parameterize later." Retrofitting this after the fact (as TDR-005 did have to do carefully for datasets) is more work than building it in from the start.

---

## [Placeholder — remaining Workstream D scope, to be completed in full during that workstream's execution]

- **Coding Standards** — naming, file organization, TypeScript conventions actually in use across this codebase.
- **Repository Structure** — a map of `src/lib`, `src/app`, `src/components`, `supabase/migrations`, `scripts`, and how they relate.
- **Testing Standards** — how `vitest.config.ts`'s unit layer and `INTEGRATION_TESTING_STRATEGY.md`'s integration layer relate, what's expected of a new PR's test coverage.
- **Deployment Standards** — the actual `vercel --prod` / staging-first / migration-order discipline already practiced throughout this build, formalized.
- **Rollback Procedures** — code rollback (git revert + redeploy) as distinct from data rollback (`DISASTER_RECOVERY.md`'s domain).
- **Incident Response** — what happens when Workstream C's Sentry alerting actually fires; who does what, in what order.
- **Monitoring Architecture** — once Workstream C ships, document what's monitored, where, and how alerts route.

---

*Cross-references: `TECHNICAL_DECISION_RECORDS.md`, `TECHNICAL_DEBT_REGISTER.md`, `INTEGRATION_TESTING_STRATEGY.md`, `PRODUCT_ROADMAP.md` (Version 1.0.5, Workstream D), `STAGING.md`, `DOCUMENTATION_INDEX.md`.*
