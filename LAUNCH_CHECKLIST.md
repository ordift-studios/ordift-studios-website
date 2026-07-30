# Launch Checklist

The single canonical checklist for going from "platform is technically ready" to "real visitors are on the live site." Three sections — Before Launch, Launch Day, After Launch — each with concrete, checkable items. Where a full procedure already exists elsewhere, this points to it rather than duplicating it; where no procedure exists yet, the step is spelled out here directly.

**Status as of 2026-07-30:** `LAUNCH_HOLDING_PAGE` is still on. Every "Before Launch" item below must be genuinely checked off before Launch Day's single action (removing it) happens — see `FINAL_GO_LIVE_REPORT.md` §11 for the last full audit of where each item stands.

---

## Before Launch

### Technical
- [ ] All environment variables present and correct in Production (`vercel env ls production` against `.env.example`)
- [ ] Domain connected, resolving, SSL active (`ordiftstudios.com`)
- [ ] Email delivery verified end-to-end (verify-send diagnostic, all 5 types)
- [ ] CAPTCHA live with real Turnstile credentials — done 2026-07-30; one gap remains: a real-widget success-path completion, deferred until Launch Day since the holding page blocks reaching the public forms today
- [ ] Redis rate limiting and idempotency verified healthy
- [ ] Supabase production schema fully migrated and verified
- [ ] Vercel deployment healthy, security headers present
- [ ] Sanity content connected and rendering correctly
- [ ] Database RLS reviewed
- [ ] No leftover QA/test data in either Supabase project
- [ ] Sitemap (`/sitemap.xml`) and `robots.txt` present and correct — done 2026-07-30
- [ ] Open Graph / social-share preview correct — done 2026-07-30
- [ ] Favicon present — confirmed live
- [ ] **First manual production database backup taken and verified** (`DISASTER_RECOVERY.md` §2) — genuinely outstanding; needs your database password entered directly in the tool you back up with, never in chat
- [ ] **`FORMS_SENDING_ENABLED` decision made** — requires your explicit written approval before I enable it, deploy, and run one final controlled real-submission test across every public form

Full detail and current status on each item: `OPERATIONS_MANUAL.md` §7, `FINAL_GO_LIVE_REPORT.md`.

### Content
- [ ] Homepage, About, Services — already real and launch-ready, re-confirmed 2026-07-30
- [ ] Portfolio, Journal, Workshops — currently 100% `[SAMPLE]` placeholder; work through `CONTENT_READINESS_CHECKLIST.md`, or unpublish the sample entries in Sanity if none will be ready by launch
- [ ] Pricing information accurate wherever shown
- [ ] Legal pages (Terms, Privacy, Cookies, Booking Terms) published and approved, `LEGAL_PAGES_APPROVED` set correctly
- [ ] Contact details correct (`NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_WHATSAPP_NUMBER`)
- [ ] Social media links correct, if/where displayed
- [ ] Branding (logo, colors, typography) final

### Business
- [ ] Analytics configured, if desired (currently unset — gated on Cookie Notice approval, see `DEPLOYMENT.md`)
- [ ] Google Search Console set up and domain verified, if desired
- [ ] You've personally reviewed the live site end-to-end as a real client would (homepage → services → portfolio → workshops → book) — the closest thing to a dress rehearsal before real visitors see it

---

## Launch Day

This is the exact, already-tested procedure in `DEPLOYMENT.md`'s "Removing the launch holding page" section — summarized here as a same-day runbook:

1. Confirm every Before Launch item above is genuinely checked — this step is effectively irreversible once real visitors start interacting with the live site.
2. In Vercel → Project Settings → Environment Variables, remove `LAUNCH_HOLDING_PAGE` from Production (or set it to `false`).
3. No redeploy required — takes effect on the next request, typically under a minute.
4. Verify immediately in a private/incognito window: real homepage loads, not `/coming-soon`.
5. Spot-check `/services`, `/work`, `/workshops`, `/book` all serve the real site.
6. Confirm `/studio`, `/admin`, `/portal` still work exactly as before (should be unaffected, but verify).
7. **Complete one real Turnstile challenge on the live `/book` page** — the one CAPTCHA verification step that was deliberately deferred until the site was actually reachable.
8. Document the actual go-live date and time in `MILESTONES.md`.

**Rollback if something is wrong:** re-add `LAUNCH_HOLDING_PAGE=true` in Vercel Production — takes effect on the next request, no data impact.

---

## After Launch

**First day:** monitor form submissions and emails closely (more than the normal daily cadence); watch Vercel's function logs for an error spike; confirm the first real enquiry/registration flows through cleanly end-to-end (database row, email, Sheets sync).

**First week:** run the full Weekly Operations checklist (`OPERATIONS_MANUAL.md` §2) at least once; review whether the Redis rate-limit thresholds (5 requests/10 minutes) suit real traffic, not just test scenarios.

**First month:** run the full Monthly Operations checklist (`OPERATIONS_MANUAL.md` §3); check whether any of the three Supabase Pro-upgrade triggers in `DISASTER_RECOVERY.md` §9 has been hit; do a genuine restore-test rehearsal if one hasn't happened yet.

**Three-month review:** revisit `PRODUCT_ROADMAP.md` for what's next now the platform has real usage data to design against, rather than assumptions; reassess the `npm audit` findings noted in `PHASE_4_PRODUCTION_AUDIT_REPORT.md` §3.4 in case a non-breaking fix has since become available.

**Routine maintenance going forward:** see `MAINTENANCE_SCHEDULE.md`.

---

*Cross-references: `DEPLOYMENT.md` (holding-page procedure detail), `OPERATIONS_MANUAL.md` (day-to-day + Business Launch Checklist this doc summarizes), `DISASTER_RECOVERY.md` (backup procedure), `CONTENT_READINESS_CHECKLIST.md` (Portfolio/Journal/Workshops fields), `FINAL_GO_LIVE_REPORT.md` (last full readiness audit).*
