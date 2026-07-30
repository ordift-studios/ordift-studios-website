# Integration Testing Strategy

**Established:** 2026-07-30, as part of Version 1.0.5 (Platform Foundation Hardening) Workstream A, following your approval of a hybrid testing model.

**Companion to:** `TECHNICAL_DEBT_REGISTER.md` (TD-001, the gap this closes), `TECHNICAL_DECISION_RECORDS.md` (TDR-002, RLS-as-security-boundary — the reason this strategy exists at all), `ENGINEERING_GUIDE.md` §Environment Configuration (the config-injection mechanism this strategy depends on), `TECHNOLOGY_COST_REGISTER.md` (cost implications, kept in sync).

---

## 1. Purpose

Unit tests (the layer already built — see `vitest.config.ts`) can verify pure logic, but they cannot verify the platform's actual security guarantee: that Postgres Row-Level Security policies correctly restrict what each role can read and write (TDR-002). RLS enforcement lives in Postgres, not in JavaScript — a mocked Supabase client would only prove the mock behaves as programmed, not that the real database does. The same reasoning applies to Google Sheets sync (a real third-party API with its own failure modes) and, more narrowly, email delivery (verifying the platform *attempts* a correctly-formed send, without needing every test run to actually deliver mail).

Integration tests exist to answer one question unit tests structurally cannot: **does the real infrastructure actually enforce what we believe it enforces?**

## 2. Environments

**Hard rule, no exceptions: integration tests never touch production.** Every credential, dataset, spreadsheet, and API key used by the integration-test suite is the existing **staging** equivalent — the same staging Supabase project, staging Sanity dataset pattern (TDR-005), and staging Resend/Sheets configuration already used throughout this project's many manual E2E verification passes (Milestones #55–#65, #182–#193, and others).

No new environment is created for Version 1.0.5. This is a deliberate choice, not a shortcut: standing up a dedicated ephemeral test environment has real setup and maintenance cost that isn't justified at Ordift Studios' current stage (per your explicit direction), and staging has already been proven safe for exactly this kind of testing throughout this project's history.

### Provider-specific findings that shaped this design (verified 2026-07-30, before writing any test code, per your instruction)

| Provider | Relevant limit | Why it matters here | How the strategy accounts for it |
|---|---|---|---|
| **Supabase Auth** | Built-in default SMTP: 2 emails/hour (non-production use only). Custom SMTP (Resend, already configured): 30 new users/hour by default, adjustable in the dashboard. Once custom SMTP is active, actual delivery is governed by Resend's limits, not Supabase's. | A naive integration test that signs up a new user via the public signup flow for every test run would burn through this quota almost immediately, and would also trigger a real email (see Resend row below). | Test users are created directly via the Supabase **service-role Admin API** (`admin.createUser` with `email_confirm: true`), bypassing the public signup flow and its email trigger entirely. RLS is then exercised using a normal `anon`/`authenticated` client signed in as that pre-confirmed test user — the actual thing being tested (RLS) is unaffected by skipping the email step. |
| **Google Sheets API** | 300 read + 300 write requests/minute per project; 60/minute per user. Google has signaled quota overages may start incurring Cloud billing charges later in 2026. | Ordift's test suite is nowhere near this ceiling at current scale, but tight retry loops or a runaway test could approach it. | Sheets integration tests write to a dedicated test-only worksheet/tab (§3), use the existing exponential-backoff pattern already built into the Sheets service, and are not run in a tight loop — logged in `TECHNOLOGY_COST_REGISTER.md` as a future watch item, not a current risk. |
| **Resend** | Free tier: 3,000 emails/month, 100/day, 10 requests/second. This is a *shared* quota with real production email once the platform launches. | Automated integration tests sending real email on every run would compete with real traffic for the same daily cap, and would litter a real inbox with test noise. | Integration tests **stub the Resend API call at the HTTP boundary** — asserting the platform constructs a correct, well-formed send request (right template, right recipient, right data) without actually delivering it. Real end-to-end delivery confirmation stays the job of the existing manual `verify-send` diagnostic script, run periodically, not on every test run. |

This table is the concrete example of the standing instruction to check provider-specific testing limitations *before* implementing — this is what "surfacing findings before coding" looks like in practice, and the pattern repeats for any future third-party integration this project adds.

## 3. Data Isolation Strategy

- **Dedicated test identity, not shared with real staging content.** Every resource an integration test creates — Supabase users, database rows, Sheets rows — is prefixed `TEST-` in a human-legible field (matching the existing Record ID standard's prefix discipline, `RECORD_ID_STANDARD.md`), so a person looking at the staging dashboard or spreadsheet can immediately tell test data from real staging content at a glance.
- **Google Sheets:** tests write to a clearly separate worksheet/tab within the existing staging spreadsheet (or a dedicated tab named e.g. `_test_runs`), never into the same worksheet real staging submissions land in — mirroring the same dataset-isolation reasoning as TDR-005, applied at the worksheet level since Sheets has no equivalent to a second dataset.
- **Supabase:** test users are tagged distinguishably (e.g. an email pattern like `test+<run-id>@ordiftstudios.internal` or a dedicated `is_test_data` marker where schema allows) so they're trivially queryable for both verification and cleanup, and structurally can't be confused with a real client/staff account.
- **No shared mutable state between test runs.** Each test run generates its own unique run identifier (timestamp + random suffix) used in every resource it creates, so parallel or repeated runs never collide with each other's data — the same reasoning already applied in `rateLimit.test.ts`/`idempotency.test.ts`'s unique-key-per-test pattern, extended to real infrastructure.

## 4. Cleanup Strategy

- **Default path:** every integration test suite tears down everything it created, in its own `afterEach`/`afterAll`, immediately after that test's assertions complete — not batched at the end of a whole run, so a failure partway through a suite doesn't strand more than one test's worth of data.
- **If cleanup itself fails** (network blip, an API that's temporarily down): **do not fail silently and do not leave the run blocked retrying indefinitely.** Log the specific orphaned resource (its `TEST-` identifier, which table/sheet, timestamp) to `TECHNICAL_DEBT_REGISTER.md` as a new dated entry under a "Stale test data" heading, exactly per your instruction that cleanup failure becomes tracked debt rather than silent mess. A lightweight periodic sweep (a script matching the `TEST-`/`test+` pattern) is the practical backstop for anything a failed cleanup missed — this becomes part of `MAINTENANCE_SCHEDULE.md`'s routine once the test suite is running regularly in CI (Workstream B).
- **Never delete anything without the `TEST-`/test-identity marker.** Cleanup logic is scoped by an allowlist match on the test-identity pattern, never a broad "delete everything created today" — the same discipline already used for the project's several documented manual cleanup passes (Milestones #66, #194, #198).

## 5. Third-Party API Handling

- **Supabase:** real calls, against real staging — this is the entire point (RLS can't be honestly tested any other way). Setup/teardown uses the service-role key (bypasses RLS, for speed and reliability of fixture creation); the actual test assertions use `anon`/`authenticated`-scoped clients so RLS is genuinely exercised, not bypassed.
- **Google Sheets:** real calls against a dedicated test worksheet, real assertions on what was written — Sheets sync is a real dependency (TDR-003) and deserves a real test, just isolated to its own tab and mindful of quota (§2).
- **Resend:** stubbed at the HTTP boundary (§2) for automated integration-test runs. The existing manual `verify-send` script remains the source of truth for "does a real email actually arrive," run on its established cadence rather than folded into every automated test run.
- **Any future third-party integration** (per your standing instruction): before writing its integration tests, repeat the same exercise as §2's table — check the provider's testing/sandbox support, quotas, billing triggers, and best practices, and record the findings here before implementation, not after.

## 6. Test Credentials & Secrets Management

- Integration tests read staging credentials **exclusively from environment variables**, the same `.env.local` (local dev) / Vercel environment-variable (CI) pattern already used by the application itself — never a hardcoded value in test source, never a second credentials file.
- **No new secrets are introduced.** The staging Supabase service-role key, Sheets service-account credentials, and Resend staging API key already exist and are already scoped to staging-only per `STAGING.md`'s isolation discipline — integration tests reuse them, they don't mint new ones.
- CI (Workstream B) will need these same staging secrets available as GitHub Actions repository secrets, scoped to staging values only — production secrets are never referenced by anything test-related, enforced by naming convention (env vars read by tests are explicitly `..._STAGING_...` or the existing staging-only vars, never the production equivalents) and by the environment-injection design in §7.

## 7. Environment Injection — the Config-Driven Design (per your explicit instruction)

The integration-test harness never hardcodes "staging" as a destination. Instead, a single test-environment configuration module (`src/lib/testing/testEnvironment.ts`, built as part of this workstream) resolves *which* Supabase project, Sheets spreadsheet, and Resend configuration to use, purely from environment variables:

```
TEST_SUPABASE_URL / TEST_SUPABASE_SERVICE_ROLE_KEY
TEST_SHEETS_SPREADSHEET_ID / TEST_SHEETS_TAB_NAME
TEST_RESEND_MODE=stub   (vs. a future "live" mode, not used today)
```

Today, these are set to point at the existing staging project/spreadsheet/config. **When Ordift Studios eventually reaches the scale where a disposable, fully-isolated test environment is justified, migrating means changing these environment variables to point at the new environment — not rewriting a single test.** This is the concrete mechanism behind the "configuration, not code" migration path you asked for.

## 8. Rollback Procedures

Integration tests are read/write against a real (staging) database, so a test suite that partially fails mid-run needs a defined recovery path, not just cleanup-on-success:

1. **Every write happens inside test-scoped, uniquely-identified fixtures** (§3) — so even an interrupted run only ever needs the cleanup sweep (§4) to fully recover; there's no shared state to "roll back" in the traditional single-transaction sense.
2. **No schema migrations are ever run by the test suite itself.** Integration tests exercise existing staging schema; they never apply, modify, or revert a migration — that stays a deliberate, reviewed, staging-then-production step exactly as it's been for every migration `0001`–`0022` so far.
3. **If a test run is suspected to have corrupted staging data beyond what cleanup can fix,** the existing `DISASTER_RECOVERY.md` staging-restore path is the actual rollback mechanism — staging already has the same backup discipline as production per that document, so this strategy doesn't need to invent a separate one.

## 9. Expected Runtime

Not yet measured (no integration tests exist yet as of this document's writing — this section will be updated with real numbers once the first suite runs, not estimated in advance). Expect this section to be filled in as part of the first integration-test PR, per the standing "never invent facts" discipline — a guessed number here would be exactly the kind of thing that discipline exists to prevent.

## 10. Cost Implications

$0 additional cost today — see `TECHNOLOGY_COST_REGISTER.md`'s new "Testing Infrastructure — Cost Watch" section for the full breakdown and the specific future trigger points (Supabase staging usage growth, Sheets quota-to-billing transition later in 2026, a future dedicated ephemeral environment). This strategy document and that register entry are kept in sync — any change to what the test suite touches gets reflected in both.

## 11. Migration Path to a Future Ephemeral Environment

When justified (real team size, real CI volume, or staging contention becomes a genuine problem — not a fixed date):

1. Provision the new disposable Supabase project (and Sheets/Resend equivalents, or their replacements) following the exact same account-ownership discipline as every other service in this project (`TECHNOLOGY_COST_REGISTER.md`, `PRODUCT_ROADMAP.md`'s Engineering Standards).
2. Point the §7 environment variables at the new environment. No test file changes.
3. Add the new environment's teardown-and-recreate automation (likely a fresh-database-per-CI-run pattern, common for disposable test infra) — this is new *infrastructure* work, not new *test* work.
4. Retire the staging-reuse path once the new environment is verified stable across a few real CI runs — don't cut over on day one.

---

*Cross-references: `TECHNICAL_DEBT_REGISTER.md`, `TECHNICAL_DECISION_RECORDS.md` (TDR-002, TDR-003, TDR-005), `TECHNOLOGY_COST_REGISTER.md`, `STAGING.md`, `DISASTER_RECOVERY.md`, `ENGINEERING_GUIDE.md`, `PRODUCT_ROADMAP.md` (Version 1.0.5).*
