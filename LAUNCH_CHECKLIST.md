# Launch Checklist

The single canonical checklist for going from "platform is technically ready" to "real visitors are on the live site." Three sections — Before Launch, Launch Day, After Launch — each with concrete, checkable items. Where a full procedure already exists elsewhere, this points to it rather than duplicating it; where no procedure exists yet, the step is spelled out here directly.

**Status as of 2026-07-30 (updated same day):** `LAUNCH_HOLDING_PAGE` is still on — deliberately not touched. Every Technical item is now checked except the one real-widget Turnstile verification, which structurally cannot happen until the holding page comes down. Content readiness is the one remaining Before Launch item that's genuinely a business decision. See `FINAL_LAUNCH_CERTIFICATION.md` for the full current readiness picture.

**Correction (2026-08-10, Production Readiness Reconciliation):** two Content items below are stale and corrected in place rather than left contradicting current reality — see the checkboxes themselves for detail. `LAUNCH_HOLDING_PAGE` is still on as of this correction; nothing here implies otherwise. For the full current-state picture (migrations, Sentry, Paystack, security, technical debt), see `PRODUCTION_READINESS_RECONCILIATION.md`.

**Correction (2026-09-06, Documentation Reconciliation) — the public site is now live; this document's own framing above is historical.** Confirmed by direct, unauthenticated live checks against `ordiftstudios.com` (root, `/work`, `/journal`, `/workshops`, `/book`, `/legal/privacy`): none rewrite to `/coming-soon`. `LAUNCH_HOLDING_PAGE` is not currently gating the public site. **You have confirmed this is an intentional business decision, not a discrepancy to fix:** Ordift Studios' public website is intentionally live and accessible while continued system development, operational expansion, and content population proceed. The `/coming-soon` mechanism and `LAUNCH_HOLDING_PAGE` remain available as infrastructure (unchanged in code) but are not the intended current gating state.

This changes how to read everything below: the "Launch Day" section is now a **historical record of the planned procedure**, not a pending runbook — the exact mechanics of how/when the holding page stopped gating traffic were not captured in real time and can't be reconstructed from this environment (a genuine gap — see `GOVERNANCE_HANDOVER_LOG.md`'s new entry). The "Before Launch" checklist below is **not a gate that was formally cleared item-by-item** before this happened; several Content and Business items remain genuinely open today, now on a *live* site rather than a pre-launch one. Treat unchecked items below as the **current, real content/business backlog**, not pre-launch blockers.

**Authoritative current status:** `ORDIFT_STUDIOS_MASTER_ROADMAP.md` is the single place that states whether the public site is live — this document should never be read as contradicting it. This document's own remaining value is the Content/Business checklist and the After Launch operational cadence below, both still genuinely relevant.

**Last reconciled against Production:** 2026-09-06.

---

## Before Launch

### Technical
- [x] All environment variables present and correct in Production (`vercel env ls production` against `.env.example`)
- [x] Domain connected, resolving, SSL active (`ordiftstudios.com`)
- [x] Email delivery verified end-to-end — `verify-send` diagnostic re-run 2026-07-30 post-`FORMS_SENDING_ENABLED`, all 7 real sends `"mode": "sent"`
- [x] CAPTCHA live with real Turnstile credentials — done 2026-07-30; enforcement re-confirmed 2026-07-30; the real-widget success-path completion once deferred here has since happened repeatedly against the live public site (most recently a genuine end-to-end login verified 2026-09-06, Phase K.2C — see `TECHNICAL_DEBT_REGISTER.md`; that same investigation also found Turnstile's own documented intermittent "600*" retryable failure family, unrelated to this checklist item)
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
- [x] **Legal documentation — STALE, corrected 2026-08-10.** This item as originally written (superseded by `ORDIFT_STUDIOS_LEGAL_SUITE_v1.md`, "nothing publishes until you return with approved wording") is no longer accurate. The Public Website Legal Suite v1.0 (Privacy Policy, Cookie Policy, Website Terms, Booking Terms — `OS-LGL-001` through `-004`) was approved and published live 2026-08-04 (commit `2f914c7`); all four carry `status: "approved"` in `src/lib/legal/registry.ts`. An Enterprise Legal Library (ESA/MSA and similar) remains planned but paused — not a Before-Launch blocker, a separate future initiative.
- [~] Portfolio, Journal, Workshops — **re-verified live 2026-09-06 against the real public site (`ordiftstudios.com`), superseding the 2026-08-10 correction below.** Portfolio: Photography now shows 4 real published projects (real client names/years, e.g. "Destination White Wedding — Sampson & Sadia · 2021"); the other 6 departments (Videography, Graphic Design, Branding & Creative Strategy, Content Creation, Talent Management, Production Services) each show an honest "PORTFOLIO COMING SOON" state — real content still genuinely missing there, not a bug. Journal and Workshops no longer show fake `[SAMPLE]`-prefixed rows at all (that specific defect is resolved) — both now show a clean, honest empty state ("Stories/Workshops... are on the way"); Journal has exactly one real featured item. See `CONTENT_READINESS_CHECKLIST.md` (also reconciled 2026-09-06) for the full field-by-field detail. *(Historical: the 2026-08-10 note below, superseded, is kept for the record rather than deleted.)* 2026-08-10 correction: "Portfolio is no longer 100% sample: one real project ('Sampson & Sadia Wedding') has been published live via the native Admin Portal editor since 2026-08-05. Journal and Workshops remain sample content as originally stated."
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

## Launch Day *(historical — planned procedure; the site is now live, see the 2026-09-06 correction above)*

This was written as the exact, planned procedure — see `DEPLOYMENT.md`'s "Removing the launch holding page" section for the mechanical steps. The public site is confirmed live as of 2026-09-06 (and possibly earlier — the exact date/time this took effect was not captured and could not be reconstructed from documentation or git history during the 2026-09-06 audit). Kept below as the documented intent, not a claim that every step was executed exactly as written:

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

*Cross-references: `ORDIFT_STUDIOS_MASTER_ROADMAP.md` (authoritative on whether the public site is live — read that first), `DEPLOYMENT.md` (holding-page procedure detail), `OPERATIONS_MANUAL.md` (day-to-day + Business Launch Checklist this doc summarizes), `DISASTER_RECOVERY.md` (backup procedure), `CONTENT_READINESS_CHECKLIST.md` (Portfolio/Journal/Workshops fields), `PRODUCTION_READINESS_CHECKLIST.md` (authoritative on the current technical hardening backlog), `FINAL_GO_LIVE_REPORT.md` (historical, last full pre-launch readiness audit), `TECHNICAL_DECISION_RECORDS.md` TDR (2026-09-06 "develop-in-public" decision).*
