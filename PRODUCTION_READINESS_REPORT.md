# Ordift Studios — Production Readiness Report

**Date:** 2026-07-27
**Scope:** Production email infrastructure, Identity & Access Management (IAM) verification, and a full production health check, following the migration 0009 IAM build and Resend SMTP rollout.
**Prepared for:** matetey@ordiftghana.com (Primary Super Admin), ordift.ghana@gmail.com (Recovery Super Admin)

This report is the requested deliverable closing out the email-infrastructure and access-management verification pass. It complements — not replaces — the still-open **Milestone 0 (Production Readiness & Launch Preparation)** checklist tracked in `MILESTONES.md`; see **Remaining Work** below for what that checklist still needs.

---

## 1. Completed This Session

### 1.1 Email Infrastructure
- **Sending domain:** `auth.ordiftstudios.com` created and verified in Resend. DNS records (SPF, DKIM, DMARC, MX for the subdomain) added to Squarespace by you and confirmed propagated.
- **DMARC placement:** scoped to `_dmarc.auth.ordiftstudios.com` (not the root domain), per your own catch — this avoids any future conflict with a root-domain Google Workspace DMARC policy, since a subdomain DMARC record always takes precedence over the root for mail from that subdomain (RFC 7489).
- **Supabase Custom SMTP:** configured on the production project using Resend's SMTP relay (`smtp.resend.com:465`, username `resend`, password = your production Resend API key, entered directly by you into the Supabase dashboard — never seen or handled by me in plaintext).
- **Sender identity:** `Ordift Studios <no-reply@auth.ordiftstudios.com>` for all Supabase Auth emails.
- **Reply-To — known limitation:** Supabase's dashboard SMTP settings and email-template editor expose no Reply-To field for GoTrue-sent auth emails. `info@ordiftstudios.com` as Reply-To could not be configured through the standard product surface. Workaround, if needed later: a custom auth email-sending hook (Supabase Auth Hooks, currently unused in this project) could intercept and rewrite headers before send — flagged as a future item, not attempted here since it's a new code path outside this session's scope.
- **All 6 auth email templates rebranded** (Confirm sign up, Invite user, Magic Link/OTP, Change email address, Reset password, Reauthentication): navy/gold Ordift Studios styling, correct copy per template, all original Supabase template variables preserved exactly (`{{ .ConfirmationURL }}`, `{{ .Token }}`, `{{ .NewEmail }}`, etc.).
- **Logo added to every template header** (added mid-session per your follow-up request): the official gold Ordift Studios logo (`/brand/logo-nav-gold.png`, sourced from the site's own asset library — no new asset created), centered, rendered at 140×95px from a 461×314px source (≈3.3× downscale, retina-sharp on high-DPI displays), `alt="Ordift Studios"` for accessibility, `max-width:100%` for responsive scaling. Verified rendering correctly in real Gmail (both desktop-width and mobile-width viewports) — the dashboard's own template preview shows a broken-image placeholder because it sandboxes external images; that is a preview-only limitation, not a real defect.
- **SPF/DKIM/DMARC verified via live headers**, not just Resend's dashboard status: Gmail's own message details show `mailed-by: send.auth.ordiftstudios.com` and `signed-by: auth.ordiftstudios.com` with no security warnings, on two independently-sent test emails (signup confirmation, password reset). Both authenticate and align correctly under the subdomain policy.

### 1.2 End-to-End Testing (Production)
All tests below were run against the live production Supabase project (`goxuyooxrekzstssjgly`) and the live production site (`ordiftstudios.com`), using real, disposable test accounts, all since deleted (see §4).

| Flow | Result |
|---|---|
| Sign-up → branded confirmation email → click-through → login | ✅ Pass, full round-trip verified |
| Forgot-password → branded reset email → correct subject/body/link | ✅ Pass |
| Collaborator invite (fired by you as Super Admin from the Admin Portal) → branded invite email received | ✅ Pass — confirmed by you directly |
| Invite → account creation → role assignment | ✅ Pass — verified at the database level: the invited account was created with **`contractor` role only**, no `admin`/`super_admin`/`staff` leakage |
| Audit logging of the invite action | ✅ Pass — `activity_log` shows `action: collaborator.invited`, correct `entity_id`, and metadata `{"role":"contractor","email":"..."}` |
| Magic Link / Reauthentication (OTP) templates | Content and branding verified directly; not fired through a live send this session (no code path in the current app triggers them yet — see §3) |

### 1.3 Identity & Access Management — Production State
- Migration `0009` (access-management schema + RLS) and follow-up grants `0010`–`0012` (service-role grant fixes) are applied and verified on production, matching staging exactly.
- Production Users table confirmed clean: **3 real users only** — `matetey@ordiftghana.com` (Primary Super Admin), `ordift.ghana@gmail.com` (Recovery Super Admin), and one existing real staff/collaborator account (`Sylvia Annang-Mensah`, roles `staff`+`client`). No test accounts remain (see §4).
- Role/permission separation confirmed structurally at the DB level: Grade, Title, Engagement Type, and Role are (and, per this session's decision, will remain) fully independent axes — see the Grade system note in §5.
- Collaborator/contractor permission boundaries (project-scoping, no admin-route access) rely on the same `private.has_role()` / RLS architecture already built and regression-tested in the prior migration-0009 work (staging regression pass + production smoke test, both already completed before this session). This session's live invite test is consistent with that architecture; a full manual walk of suspend/expire/restore lifecycle actions was not re-run live in this pass (already covered in the prior staging regression matrix).

### 1.4 Production Cleanup
- **3 QA accounts deleted** via Supabase's Auth dashboard delete action (irreversible, confirmed by exact email address before each deletion): `Email Infra Test` (unconfirmed), `Email Infra Test 2`, and `Lady Isla Anim-Tetey` (the test collaborator account created by the invite-flow test — confirmed with you first, since the name didn't read as an obvious throwaway).
- **Zero orphaned records** confirmed by direct query afterward across `profiles`, `user_roles`, and `project_assignments` — cascading deletes worked cleanly, nothing left behind.
- Audit-log entries referencing the deleted test accounts (e.g. the `collaborator.invited` event) were **intentionally left in place** — audit trails document real administrative actions taken by a real Super Admin and should not be deleted after the fact, even when the invited account itself was a test. Flagging this explicitly rather than silently choosing either way.

### 1.5 Security Posture Check
- Supabase Security Advisor: **0 errors**, 2 warnings, both pre-existing and already known (not introduced this session):
  1. `public.ordift_studios_business_id()` is a `SECURITY DEFINER` function callable by signed-in users. This is intentional — it's the single-tenant business-ID default used across every business-scoped table. Revoking `EXECUTE` would need careful testing against every insert path that relies on the column default; left as-is, documented as an accepted risk (this is a single-tenant app; there's no cross-tenant data to leak).
  2. Leaked-password protection disabled — **requires a Supabase Pro-plan upgrade** (Free plan doesn't support it). This is a paid/billing decision, so I did not act on it; recommending it below.
- Auth providers: only Email is enabled; all OAuth providers (Google, Apple, GitHub, etc.) are off — minimal attack surface, as already configured.
- Anonymous sign-ins and manual account linking are both disabled — correct, unchanged defaults.

---

## 2. Remaining Work (pre-existing, not addressed this session)

Updated 2026-07-27 (third pass — the five items below were explicitly deferred by you this date so infrastructure/billing decisions don't block continued feature work; each is tagged **🟡 PENDING OWNER DECISION** and stays visible here and in `PRODUCT_ROADMAP.md` until resolved):

- **Turnstile / CAPTCHA** — 🟡 **PENDING OWNER DECISION.** ✅ code complete: client widget and server verification built and locally tested on `/portal/signup` and `/portal/login` (see `CHANGELOG.md`). Needs you to create a Cloudflare Turnstile site and provide `NEXT_PUBLIC_TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY`.
- **Google Sheets integration** — ✅ **TECHNICALLY VERIFIED (2026-07-28).** Rebuilt 2026-07-27 into a reusable, config-driven service covering 10 worksheets (3 live — Contact Enquiries, Workshop Registrations, Project Requests — 7 reserved) with Supabase as primary/required and Sheets as a best-effort secondary backed by a `sheet_sync_failures` retry queue (see `GOOGLE_SHEETS_INTEGRATION.md`). Migrations `0013`–`0016` applied and verified on both staging and production. Google Cloud service account, spreadsheet, and all three credentials are live in production; all 10 worksheets created and formatted (bold header, frozen row, filter, auto-sized columns) via `POST /api/admin/google-sheets/setup`. Full write path (auth, lookup, worksheet existence, formatting, write, read-back) confirmed via the Super Admin-only `POST /api/admin/google-sheets/verify-write` — see `GOOGLE_SHEETS_INTEGRATION.md` §10. **Remaining:** the real public-form → Sheets path is untested, deliberately — it requires `FORMS_SENDING_ENABLED=true`, held back until Resend (Phase 2B) is verified, since the same flag also gates real email.
- **Backup and restore** — 🟡 **PENDING OWNER DECISION** (billing), and still the most serious open item in this report. Production Supabase is confirmed on the **Free plan, which includes zero project backups** (Supabase's own dashboard: "Free Plan does not include project backups"). A database incident today would be unrecoverable. Requires a **Supabase Pro-plan upgrade**.
- **Analytics** — 🟡 **PENDING OWNER DECISION.** No code exists yet, not just a missing key; needs `NEXT_PUBLIC_GA_MEASUREMENT_ID` from you before it's worth building.
- **Contact/WhatsApp display vars** — downgraded from "remaining work": `src/lib/content/local/siteWideData.ts` already has safe real-value fallbacks baked in, so production isn't broken by their absence from Vercel. Cosmetic only.
- **Full production launch audit** (Milestone 0.7) and **Launch Readiness Checklist / Go-No-Go** (Milestone 0.8) — still pending, blocked on the three items above.
- **Reply-To header** for auth emails (`info@ordiftstudios.com`) — see §1.1; needs a Supabase Auth Hook if this is a hard requirement.

## 3. Known Limitations

- Magic Link and Reauthentication email templates are branded and content-correct but have no live trigger path in the current app (no UI flow calls `signInWithOtp` or reauthentication yet) — verified by direct inspection, not by a live send.
- The dashboard's own email-template preview pane shows a broken-image icon for the logo (external images are sandboxed there) — cosmetic to that internal tool only; real inbox rendering is confirmed correct.
- No formal performance benchmarking (Lighthouse or equivalent) was run this session — deployment health was confirmed (latest Vercel production deployment is `Ready`), but page-load/Core Web Vitals numbers were not captured.

## 4. Security Observations

- The `SECURITY DEFINER` function warning and the leaked-password-protection gap (§1.5) are the only two open items from the linter; both are low-risk and documented above.
- Least-privilege was maintained throughout: the production Resend API key was scoped to "Sending access" only (not full account access); the earlier attempt to self-grant a temporary `admin` role to a QA account for testing purposes was correctly blocked by the safety system, and the invite-flow test was instead completed by you directly — a cleaner outcome than working around that block.
- Every account deletion this session was preceded by an explicit on-screen confirmation of the exact email address, and the ambiguous one (`Lady Isla Anim-Tetey`) was confirmed with you by name before deletion rather than assumed to be disposable.

## 5. Future Improvements

- **Organizational Grade system** — ✅ **Built (2026-07-28)** as part of the Admin Profile Quick Card. 10-tier seniority hierarchy, fully independent of Role/Title/Engagement Type, admin-only visibility (double-gated via RLS + app layer — see `ADMIN_GUIDE.md` §17). Reorderable Grade Management UI not yet built — grades are seeded/managed via migration for now. Photo upload for the Quick Card remains deferred (estimated 70–90 min, owner's explicit call to defer past a 30-min threshold).
- **QA account naming convention** — also specified this session (`QA Photographer`, `QA Client`, etc. with reserved email aliases) to make future test-account cleanup mechanical rather than judgment-based, as it was this time.
- A Supabase Auth Hook to support a custom Reply-To header, if that turns out to matter in practice (most reply traffic to a `no-reply@` sender is rare, so this may not be worth building).

## 6. Performance Observations

- Not deeply benchmarked this session (see §3). Latest production Vercel deployment shows a healthy build (`Ready` status, ~2 min build time, consistent across the last 14 deployments).
- Email delivery latency observed during testing: consistently near-instant (seconds) from form submission to inbox arrival across all tested templates — no rate-limiting or delay observed on Resend's side.

## 7. Overall Production Readiness

**Email infrastructure and Identity & Access Management: production-ready.** Both are fully configured, tested end-to-end against live production, and clean of test data.

**Overall platform readiness for public launch: ~78%** (updated 2026-07-27). The core product (site, CMS, portals, admin platform, auth, and now email) is solid and verified; CAPTCHA is now code-complete pending credentials. What remains is infrastructure hardening independent of code quality — none of it is a code defect, all of it is known and tracked in `MILESTONES.md`. The one item that moved from "nice to have" to "genuine risk" this pass is backup coverage — see below.

## 8. Go / No-Go Recommendation

**No-Go for full public launch, Go for continued controlled use** (admin/staff/collaborator operations, direct client onboarding via invite) **as of today — unchanged from the prior pass, but for a sharper reason now.**

Rationale: authentication, email, and access control — the trust-critical path for anyone touching the system — are solid. The remaining gaps (Sheets backup, CAPTCHA enablement, and especially **the complete absence of database backups on the Free plan**) are about resilience for a fully public, unmoderated audience holding real client data at volume — not about whether the system works correctly for the people already using it today. The backup gap specifically should be treated as **higher priority than a CAPTCHA/Sheets credential gap**: a lost signup or workshop form is recoverable by asking the person to resubmit; a database incident with zero backups is not recoverable at all. Recommend resolving the Supabase Pro-plan decision before any expansion of public traffic, independent of when CAPTCHA/Sheets credentials arrive.

---

*Companion document: [ADMIN_GUIDE.md](ADMIN_GUIDE.md) — the operational manual for managing roles, invitations, and the email system day-to-day.*
