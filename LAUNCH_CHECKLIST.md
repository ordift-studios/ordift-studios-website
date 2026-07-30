# Launch Checklist

The single canonical checklist for going from "platform is technically ready" to "real visitors are on the live site." Three sections — Before Launch, Launch Day, After Launch — each with concrete, checkable items. Where a full procedure already exists elsewhere, this points to it rather than duplicating it; where no procedure exists yet, the step is spelled out here directly.

**Status as of 2026-07-30 (updated same day):** `LAUNCH_HOLDING_PAGE` is still on — deliberately not touched. Every Technical item is now checked except the one real-widget Turnstile verification, which structurally cannot happen until the holding page comes down. Content readiness is the one remaining Before Launch item that's genuinely a business decision. See `FINAL_LAUNCH_CERTIFICATION.md` for the full current readiness picture.

---

## Before Launch

### Technical
- [x] All environment variables present and correct in Production (`vercel env ls production` against `.env.example`)
- [x] Domain connected, resolving, SSL active (`ordiftstudios.com`)
- [x] Email delivery verified end-to-end — `verify-send` diagnostic re-run 2026-07-30 post-`FORMS_SENDING_ENABLED`, all 7 real sends `"mode": "sent"`
- [ ] CAPTCHA live with real Turnstile credentials — done 2026-07-30; enforcement re-confirmed 2026-07-30 (missing-token requests correctly rejected `403`); one gap remains: a real-widget success-path completion, deferred until Launch Day since the holding page blocks reaching the public forms today
- [x] Redis rate limiting verified healthy — re-confirmed live 2026-07-30 post-deploy (blocks after rapid repeated requests)
- [x] Supabase production schema fully migrated and verified
- [x] Vercel deployment healthy, security headers present
- [x] Sanity content connected and rendering correctly
- [x] Database RLS reviewed
- [x] No leftover QA/test data in either Supabase project — today's Turnstile/rate-limit tests were all rejected before any DB write; Google Sheets `verify-write` self-cleaned its one test row
- [x] Sitemap (`/sitemap.xml`) and `robots.txt` present and correct — done 2026-07-30
- [x] Open Graph / social-share preview correct — done 2026-07-30
- [x] Favicon present — confirmed live
- [x] **First manual production database backup taken and verified** (`DISASTER_RECOVERY.md` §2.5) — completed 2026-07-30, `ordift-production-20260730-043436.dump`, all 26 tables confirmed present via `pg_restore --list`
- [x] **`FORMS_SENDING_ENABLED` decision made** — your written approval given and enabled 2026-07-30, deployed, verified: real email sends (`verify-send`) and real Google Sheets write/read-back/cleanup (`verify-write`) both confirmed against production

Full detail and current status on each item: `OPERATIONS_MANUAL.md` §7, `FINAL_GO_LIVE_REPORT.md`.

### Content
- [x] Homepage, About, Services, Founder, Client Portal — confirmed real and launch-ready via full business audit 2026-07-30 (`BUSINESS_LAUNCH_AUDIT.md`)
- [ ] **Legal pages (Terms, Privacy, Cookies, Booking Terms) — confirmed unapproved drafts on production** (`isApproved: false` on all four, verified via direct query 2026-07-30) — the single highest-priority remaining item; real, approved text needed before the holding page comes down, see `BUSINESS_LAUNCH_AUDIT.md`
- [ ] Portfolio, Journal, Workshops — currently 100% `[SAMPLE]` placeholder; work through `CONTENT_READINESS_CHECKLIST.md`, or unpublish the sample entries in Sanity if none will be ready by launch
- [ ] Every department page's "Featured Work" section shows unlabeled placeholder cards, cascading from the Portfolio gap above — resolves automatically once Portfolio content is real
- [ ] Pricing information accurate wherever shown
- [ ] Contact details — `ordift.ghana@gmail.com` and a UK (+44) WhatsApp number are confirmed live on production; confirm these are the intended public values
- [ ] Social media links — confirmed empty on both datasets; decide whether to add real accounts or confirm the empty state is intentional
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
