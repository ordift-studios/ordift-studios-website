# Staging vs. Production — isolation rules

Per the approved Phase 1A plan (Part J), staging and production must never
share credentials, datasets, or records. This document is the checklist for
setting that up once you've created the underlying accounts (which must be
owned by Ordift Studios — see Plan Part I).

## What's already built (this repo)

- **`src/proxy.ts`** — when `SITE_ENV=staging`, gates every request behind
  HTTP Basic Auth and tags every response `X-Robots-Tag: noindex, nofollow,
  noarchive`. It fails *closed*: if the staging auth env vars aren't set, the
  site returns 503 rather than accidentally going public. In production
  (`SITE_ENV=production` or unset), it's a no-op.
  **Known trade-off:** static asset files (images, fonts, css/js, video) are
  excluded from the gate by file extension, not just `_next/*`. This was
  required — Next's own image optimizer fetches `/public` source files
  internally, and the gate was blocking that fetch, breaking every
  `next/image` render on staging. Practical effect: someone who already
  knows (or guesses) an exact asset URL can fetch that one file directly
  without credentials, but every HTML page — the only way to discover those
  URLs, and the only place with anything meaningful on it — stays fully
  gated. Acceptable for a pre-launch staging site with no real client data
  in its assets; revisit if that ever changes.
  **Localhost exemption (2026-07-23):** the Basic Auth requirement is
  skipped for `localhost`/`127.0.0.1`/`::1` even when `SITE_ENV=staging` —
  the dev server isn't publicly reachable, so the gate's actual purpose
  doesn't apply there, and requiring it locally only encouraged embedding
  credentials in preview URLs (`http://user:pass@localhost:3000`), which
  browsers themselves warn against. Preview links should always be plain
  `http://localhost:3000` — never credential-embedded. Any real staging
  deployment (a non-localhost hostname) stays fully gated with no
  exemption.
- **`src/app/robots.ts`** — returns `Disallow: /` (no sitemap) while
  `SITE_ENV=staging`; normal rules + sitemap in production.
- **`.env.example`** — documents every variable that must differ between
  staging and production (Sanity dataset, Google Sheet ID, auth credentials).
- **`.env.local`** (gitignored, not committed) — safe local-dev defaults with
  `SITE_ENV=staging` so local development always behaves like staging by
  default; you can never accidentally run `npm run dev` in "production mode."

## What you need to set up when accounts exist

1. **Two Vercel environments** (or two projects) pointing at the same repo:
   one for staging (e.g. a `staging` branch → Preview/staging deployment),
   one for `main` → Production. Set the env vars from `.env.example`
   differently in each, per Vercel's environment scoping UI.
2. **Two Sanity datasets** in the same Ordift-owned Sanity project:
   `staging` and `production`. Point `NEXT_PUBLIC_SANITY_DATASET`
   accordingly per environment. Sample/demo content for layout review only
   ever goes into the `staging` dataset.
3. **Two Google Sheets (or two tabs)** for Tier 1 form submissions — one for
   staging test submissions, one for real production enquiries. Point
   `GOOGLE_SHEETS_SPREADSHEET_ID` accordingly per environment.
4. **A muted or staging-only notification address** for
   `EMAIL_ADMIN_NOTIFICATION_TO` in staging, so test form submissions don't
   page a real inbox as if they were genuine enquiries.
5. **Analytics**: only wire `NEXT_PUBLIC_GA_MEASUREMENT_ID` in the production
   environment. Staging should not report to the real Analytics property.
6. Optionally, layer Vercel's own Preview Deployment Protection on top of the
   Basic Auth gate for defense in depth — belt and suspenders, not a
   replacement for it.

## Verification (per Plan Part J / Verification section)

Before Phase 1A is considered launch-ready:
- Confirm staging is unreachable without the Basic Auth credentials.
- Confirm `curl -I https://staging.<domain>/robots.txt` shows `Disallow: /`.
- Submit one real test enquiry on staging and confirm it lands in the
  staging Sheet/inbox — and does **not** appear in the production Sheet,
  production inbox, or production analytics.
- Confirm the production Sanity dataset has zero sample/placeholder content
  in it (it should be genuinely empty until real content is approved and
  loaded, per the empty-state rule in Plan Part F).
