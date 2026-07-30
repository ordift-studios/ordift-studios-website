# Maintenance Schedule

The full maintenance cadence for the Ordift Studios platform, Daily through Annual, in one place. Daily/Weekly/Monthly already have detailed checklists in `OPERATIONS_MANUAL.md` §1–§3 — this document summarizes each so the full rhythm is visible at a glance, and adds the two cadences that don't exist anywhere yet: Quarterly and Annual.

---

## Daily
Startup check, shutdown check, and ongoing monitoring of enquiries/bookings/emails/dashboard/spreadsheet sync.

Full checklist: `OPERATIONS_MANUAL.md` §1.

## Weekly
Manual database backup + verification, deployment review, error-log review, email-failure review, Redis health check, a light security skim, an informal performance check.

Full checklist: `OPERATIONS_MANUAL.md` §2.

## Monthly
Dependency review (`npm outdated`/`npm audit`), environment-variable audit, user permission audit, database/storage health review, a broader security review, backup restore-testing, and re-reading `DISASTER_RECOVERY.md` for drift.

Full checklist: `OPERATIONS_MANUAL.md` §3.

## Quarterly

- [ ] **Dependency upgrade pass** — beyond the monthly `npm audit` read, actually attempt non-breaking upgrades (`npm update` within semver ranges) in a branch, run the full local test/build/typecheck pass, and merge if clean. Breaking upgrades (major version bumps, the Next.js downgrade `npm audit` currently suggests) stay a deliberate, separately-scoped decision — never bundled into this pass.
- [ ] **Supabase Pro-plan trigger review** — re-check the three conditions in `DISASTER_RECOVERY.md` §9 (`FORMS_SENDING_ENABLED` live, 20 real bookings, first real payment) even if none has obviously been hit; traffic can cross a threshold quietly.
- [ ] **Full restore-test rehearsal** — a real, timed restore into a scratch Supabase project per `DISASTER_RECOVERY.md` §3, not just the lighter monthly check — confirm the whole team member who'd actually run this in an emergency still can, unassisted.
- [ ] **Rate-limit and idempotency threshold review** — with a full quarter of real traffic data, confirm the 5-requests/10-minutes default is still appropriate; adjust in `src/lib/shared/rateLimit.ts` if real usage patterns say otherwise.
- [ ] **Content freshness review** — Portfolio, Journal, and Workshops against `CONTENT_READINESS_CHECKLIST.md`'s original field list: is anything stale, are new projects/posts/workshops missing, do any cross-links need updating.
- [ ] **Roadmap check-in** — read `PRODUCT_ROADMAP.md` against what actually happened the last quarter; note drift rather than silently letting the roadmap go stale.
- [ ] **Legal page accuracy check** — re-read the published Terms/Privacy/Cookies/Booking Terms against how the platform actually behaves today (e.g. any new data collection, new third-party processor); update and re-approve if anything's drifted.

## Annual

- [ ] **Full security audit re-run** — repeat the scope of `PHASE_4_PRODUCTION_AUDIT_REPORT.md` §3 from first principles (RLS, CORS, secrets, dependency tree, security headers, CSP feasibility) rather than just confirming the prior findings still hold — new attack surface accumulates with every feature shipped since the last full pass.
- [ ] **Full performance audit** — an actual Lighthouse/load-testing pass (never yet run as of this document's creation, per `FINAL_GO_LIVE_REPORT.md` §5), covering both the marketing site and the authenticated portal/admin areas under realistic load.
- [ ] **Disaster recovery drill** — beyond a routine restore test, simulate a fuller incident (e.g., "the production Vercel project is gone, rebuild from git + a restored database") end-to-end at least once a year, so `DISASTER_RECOVERY.md` is validated against reality, not just read.
- [ ] **Backup strategy re-evaluation** — revisit the Free-vs-Pro-plan decision explicitly once a year even absent a specific trigger, since Supabase's plan/pricing terms can themselves change.
- [ ] **Credential/access review** — every Vercel/Supabase/Sanity/Cloudflare/Google Cloud/Resend account with production access; remove anyone who no longer needs it, rotate any credential that's never been rotated.
- [ ] **Domain and DNS review** — registration renewal status, DNS records still match `DNS_SNAPSHOT_PRE_LAUNCH.md`'s intent (or a documented, deliberate change since).
- [ ] **Dependency major-version review** — deliberately evaluate (not necessarily execute) the breaking upgrades deferred all year, since a framework left too many majors behind eventually forces a much larger migration than doing it incrementally.
- [ ] **Documentation audit** — a lighter version of this project's own `DOCUMENTATION_INDEX.md` cross-reference passes: confirm every document's "Update when" trigger has actually been honored over the year, retire anything genuinely dead.
- [ ] **Brand and content refresh review** — with a full year of real client work behind the platform, is the Portfolio/Journal/Services copy still the strongest representation of the business, or is it worth a deliberate refresh.

---

*This document defines cadence; it does not duplicate procedure. For "how," see `OPERATIONS_MANUAL.md` (day-to-day), `DISASTER_RECOVERY.md` (backup/restore), `PHASE_4_PRODUCTION_AUDIT_REPORT.md` (security audit scope), and `PRODUCT_ROADMAP.md` (long-term planning).*
