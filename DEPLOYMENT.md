# Deployment Guide

Status: **not yet deployed anywhere** — this documents how to deploy once
you're ready, and captures the real operational requirements discovered
while connecting Sanity and Supabase (2026-07-24). Both CMS (Sanity) and
Auth/Database (Supabase) are live and fully verified for one environment
each (V1.2.5/V1.2.6 and V1.3 respectively) — what's left before an actual
deploy is entirely the environment-separation and launch-readiness items
in this document, not application code. For the staging/production
*isolation* rules specifically (separate datasets, separate credentials,
never mixing them), see [STAGING.md](STAGING.md) — this document is the
broader "how to actually stand up a deployment" guide and assumes
STAGING.md's rules throughout.

## Recommended host: Vercel

Matches the original plan (Plan Part I) — Vercel is the natural fit for a
Next.js App Router project, has first-class environment-scoped env vars,
and Preview Deployment Protection layers cleanly on top of the app's own
Basic Auth gate (`src/proxy.ts`). Any Node.js host that supports Next.js
16 works in principle; Vercel is what the rest of this doc assumes.

**Ownership:** the Vercel project, like every other account in this
project, must be created and owned by Ordift Studios — never a personal
or contractor account (same rule that applied to the Sanity project).

## Environments

Two Vercel environments (or two projects) pointing at the same repo, per
STAGING.md:
- **Staging** — a non-`main` branch (e.g. `staging`) → Vercel
  Preview/staging deployment. `SITE_ENV=staging`, dataset `staging`.
- **Production** — `main` → Vercel Production deployment.
  `SITE_ENV=production`, dataset `production`.

Set every variable in `.env.example` per-environment in Vercel's own
environment scoping UI (Project Settings → Environment Variables, each
with an environment checkbox) — never paste the same value into both.

## Environment variables checklist (per environment)

Full reference: [`.env.example`](.env.example). The ones that changed
status now that Sanity is actually connected:

| Variable | Staging value | Production value |
|---|---|---|
| `NEXT_PUBLIC_SANITY_PROJECT_ID` | `ixbvr1n8` (same project, both environments) | `ixbvr1n8` |
| `NEXT_PUBLIC_SANITY_DATASET` | `staging` | `production` |
| `SANITY_API_TOKEN` | An Editor-role token scoped for staging use (create via `sanity tokens create` or manage.sanity.io) | A **separate** Editor-role token for production — never reuse the staging token, so revoking one never affects the other |
| `SANITY_API_VERSION` | `2025-01-01` | `2025-01-01` |

Everything else (`STAGING_BASIC_AUTH_*`, `GOOGLE_SHEETS_SPREADSHEET_ID`,
`RESEND_API_KEY`, etc.) follows the existing rules already documented in
`.env.example` and `STAGING.md` — unaffected by this milestone.

### Supabase (Authentication & Client Portal — V1.3, not yet live)

Not configured anywhere yet — `/portal/**` currently 503s everywhere
("The Client Portal is not configured yet") because these three variables
are unset. Same isolation principle as Sanity: **staging and production
must be separate Supabase projects**, not just separate tables within one
project — project-level isolation is the natural boundary for `auth.users`
(a staging test signup should never be a real production account).

Uses Supabase's new API key system (Publishable Key / Secret Key,
`sb_publishable_...` / `sb_secret_...`) rather than the legacy anon/
service_role JWT keys — same privilege levels the code was already built
around, different names and format.

| Variable | Staging value | Production value |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Staging project's Project URL | **Separate** production project's Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Staging project's Publishable Key | Separate production project's Publishable Key |
| `SUPABASE_SECRET_KEY` | Staging project's Secret Key — server-only, never `NEXT_PUBLIC_` | Separate production project's Secret Key |

Once both projects exist (see MILESTONES.md V1.3 "Pending work" for the
account-creation steps), run all three migrations in order —
`0001_init.sql`, `0002_security_advisor_remediation.sql`, then
`0003_find_user_by_email.sql` — against **each** project (SQL Editor or
`supabase db push` against that project's connection string). Migrations
are not shared between projects, and 0001 alone is not sufficient: it
reintroduces the 8 Security Advisor warnings that 0002 fixes, so 0002
must always be replayed immediately after 0001, never skipped.

## Sanity CORS origins (discovered live — a real deployment requirement)

The embedded Studio (`/studio`) and any client-side Sanity calls will
show a **"Connect this Studio to your project"** screen instead of
loading until the exact origin making the request is allow-listed. This
isn't optional and isn't automatic — it must be added once per domain:

```bash
npx sanity cors add https://<your-staging-domain> --credentials --project-id ixbvr1n8
npx sanity cors add https://<your-production-domain> --credentials --project-id ixbvr1n8
```

`http://localhost:3000` is already registered (added while verifying the
connection locally). Add each new domain **before** the first deploy to
that domain, or `/studio` will 500/error there until you do. Vercel
preview URLs (the random `*.vercel.app` per-PR domains) are a different
origin every time — either add a wildcard-friendly production/staging
custom domain and only ever open `/studio` from that fixed domain, or
add preview URLs individually as needed. Recommended: only rely on
`/studio` from the fixed staging/production custom domains, not
ephemeral preview URLs.

## Known issue: isolated deployment hang (observed 2026-07-28)

A production deployment can occasionally hang in Vercel's "Deploying
outputs" phase indefinitely after the build itself completes
successfully — observed once, 15+ minutes with zero log progress after
a clean 2-minute build, while Vercel's own status page
(vercel-status.com) reported all systems operational. Not a code or
config issue — the same commit deployed normally on the next attempt.

**Fix:** `vercel remove <deployment-url> --safe --yes` (the `--safe`
flag refuses to remove anything with an active alias, so this can
never touch the live production deployment), then push a new commit
(or an empty commit, `git commit --allow-empty`, if there's nothing
else to ship) to trigger a fresh deployment. Production is never down
during this — Vercel keeps serving the last successful deployment
until a new one is ready to promote, so a stuck build is an
inconvenience, not an outage.

## Pre-launch checklist

1. Confirm the production Sanity dataset (`production`) has **zero**
   `[SAMPLE]`-labeled Workshop/Portfolio/Stories placeholder content — it
   should hold only the real site-wide copy (Home/About/Founder/Services/
   Nav/Footer/Legal, seeded via `scripts/seedSanitySiteWideContent.ts`)
   plus whatever real Workshops/Portfolio/Stories entries you've added
   yourself. The `staging` dataset intentionally holds both the real
   site-wide copy **and** the seeded `[SAMPLE]` placeholder content (see
   `scripts/seedSanitySampleData.ts`) — placeholder content only ever
   belongs in `staging`, never `production`.
2. Create the production `SANITY_API_TOKEN` and CORS origin (above)
   before the first production deploy.
3. Run through STAGING.md's full verification checklist (Basic Auth gate,
   `robots.txt`, test enquiry isolation) against the actual staging
   deployment, not just localhost.
4. Confirm `LEGAL_PAGES_APPROVED=false` in production until the Privacy
   Notice, Cookie Notice, Website Terms, and Booking Terms are all
   approved in Studio (`legalPage.isApproved: true` for each) — this gate
   blocks real form sends and real Sheet writes regardless of anything
   else being configured (see `src/lib/shared/env.ts`).
5. Content edits going forward happen directly in Studio, against
   whichever dataset (`staging`/`production`) you're changing — there is
   no automatic sync between the two datasets, by design (see
   CMS_MIGRATION.md). Do **not** re-run either seed script against
   `production` after real edits have been made there — both scripts use
   `createOrReplace`, which would silently overwrite any changes made
   directly in Studio.
6. After deploy, run the same route-level smoke test used throughout
   this project's development (home, about, founder, services × 7,
   book, legal × 4, work, workshops, journal, and `/studio`) against the
   real deployed URL.
7. **(V1.3 — done for the one project that exists, repeat per new
   environment)** All three migrations verified live, in order —
   `0001_init.sql`, `0002_security_advisor_remediation.sql`,
   `0003_find_user_by_email.sql`. The Security Advisor was re-checked
   after 0002 and confirmed clean (all 8 original warnings gone). Full
   end-to-end dual-write verification (2026-07-24) passed: matching-
   account linking incl. case/whitespace normalization, guest
   submissions, `workshop_participant` auto-grant, duplicate-submission
   idempotency, client/staff RLS, and anonymous-access protection with
   real data present — see MILESTONES.md V1.3 for full results. **This
   checklist item must be repeated in full for every new Supabase
   project** (a second one is needed for staging/production separation,
   see item 10 below) — migrations, Advisor check, and E2E verification
   are all per-project, not one-time.
8. Known operational gotcha, observed repeatedly (2026-07-24):
   `admin.auth.admin.updateUserById()` and (occasionally) `listUsers()`
   intermittently fail with a JWT-signing error (`unrecognized JWT kid
   <nil> for algorithm ES256`) against this project's new-format Secret
   Key, on `@supabase/supabase-js` 2.110.8 — roughly a third of calls,
   no pattern tied to parameters. Read-oriented calls and ordinary table
   writes work; this looks infra-side (Supabase's new API-key rollout),
   not fixable from application code. `src/lib/portal/adminData.ts`
   already retries with backoff — apply the same pattern to any future
   code calling `updateUserById`/`deleteUser`/`listUsers` directly, and
   never let a single failed call silently read as "no data" (show an
   honest error instead).
9. **First admin bootstrap, in any new project**: create a real admin
   account via signup, then grant yourself `admin` directly in the SQL
   Editor (`insert into user_roles (user_id, role_id) select
   '<your-auth-uid>', id from roles where slug = 'admin';`) — the Admin
   portal itself needs an existing admin to grant further roles, so the
   very first one has to be manual, in every environment.
10. Separate staging vs. production Supabase projects — **not yet
    done**, tracked as Production Readiness & Launch Preparation scope
    (a dedicated infrastructure phase, not a numbered product version).
    The single project verified above must not be reused directly for
    production; a second project needs the same setup (migrations, env
    vars, Security Advisor check, E2E verification)
    before this checklist item closes.

## Non-blocking items before public launch (tracked, not yet actioned)

None of these block continued development — they're specifically
pre-**launch** requirements, separate from the code-complete state of
V1.3:

- **Leaked-password protection** — requires a Supabase Pro plan
  upgrade (Free plan doesn't support it); flagged by the Security
  Advisor as informational, not a code issue.
- **Production `Site URL` / Redirect URLs** — Supabase Auth settings
  still point at `http://localhost:3000`; must be updated to the real
  production domain before deploy, or auth redirects (signup
  confirmation, password reset) will send users to localhost.
- **Production email/SMTP** — ✅ done (2026-07-27). Custom SMTP via
  Resend configured on the production Supabase project (sending domain
  `auth.ordiftstudios.com`, verified SPF/DKIM/DMARC), all 6 auth email
  templates rebranded with Ordift Studios styling and logo, end-to-end
  tested (signup, password reset, invite). Full detail in
  `PRODUCTION_READINESS_REPORT.md`.
- **CAPTCHA** — not yet enabled on `/portal/signup` or `/portal/login`;
  should be added before public launch to reduce automated abuse (same
  spirit as the honeypot + rate limiting already on the enquiry/
  workshop-registration forms, but auth endpoints need their own
  protection).
- **Supabase Secret Key rotation** — flagged as compromised (was
  visible during initial setup); rotation was explicitly scoped to
  happen after Migration 0003's live verification, which is now
  complete. **Not yet actioned as of V1.3 closure** — see MILESTONES.md
  V1.3 "Final closure" for the explicit flag on this.
- **Backup and recovery checks** — Supabase's automatic backup
  schedule/retention for the project should be confirmed (Dashboard →
  Database → Backups) and a restore procedure understood before
  production holds real client data, not just verified in the abstract.
- Test data deletion — **done** as part of V1.3's live verification
  (all test rows, test accounts, and temporary scripts removed,
  confirmed via direct re-query); listed here only so the full
  pre-launch list stays in one place.
