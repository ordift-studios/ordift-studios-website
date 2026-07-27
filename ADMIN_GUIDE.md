# Ordift Studios — System Administrator Guide

**Last updated:** 2026-07-27
**Audience:** Super Admins and Admins operating the Ordift Studios platform day-to-day.

This is the operational manual for managing users, roles, permissions, and the platform's email infrastructure. It documents the system as built through migration `0009` (access management) and the production email rollout that followed it. For the underlying architecture and *why* it was built this way, see `ARCHITECTURE.md`; for the point-in-time verification behind this guide, see `PRODUCTION_READINESS_REPORT.md`.

---

## 1. Roles, Permissions, and the Role Hierarchy

Every person with an account can hold **one or more roles**, stored in `user_roles` (a many-to-many join, not a single field). Someone can be, for example, both `client` and `workshop_participant`, or both `admin` and `super_admin`.

| Role | Who | Where they land after login |
|---|---|---|
| `super_admin` | The two founder-level accounts (see §2) | `/admin` |
| `admin` | Day-to-day operational administrators | `/admin` |
| `staff` | Internal team members | `/admin` |
| `contractor` | External collaborators, project-scoped | `/portal/collaborator` |
| `vendor` | External vendor partners | `/portal/vendor` |
| `model` | Talent-management placeholder role (see §9) | `/portal/model` |
| `workshop_participant` | Anyone who registered for a workshop | `/portal/workshops` |
| `client` | Default role for anyone who signs up | `/portal/client` |

**Self-signup always starts as `client` only.** Every other role must be granted by an existing Admin or Super Admin from the Admin Portal (`/admin/users`) — there is no self-service upgrade path, by design. `workshop_participant` is the one exception: it's granted automatically the first time a workshop registration email matches an existing account.

**Role hierarchy for granting/revoking:**
- An **Admin** can grant or revoke any role *except* `admin` and `super_admin`.
- Only a **Super Admin** can grant, revoke, suspend, or deactivate another `admin` or `super_admin` account. This is enforced in code (`SUPER_ADMIN_ONLY_ROLES` in `src/lib/portal/roles.ts`), not just by convention.
- The system will **refuse to suspend/deactivate/demote the last active Super Admin** — there must always be at least one active Super Admin able to recover the account. If you ever see a "last active Super Admin" refusal, promote a second account to Super Admin first.
- **You cannot suspend or deactivate your own account** from the Users screen, even as a Super Admin — this prevents an accidental self-lockout.

**Permissions are controlled exclusively by Role.** Two other fields exist per person and are deliberately *not* permission-bearing:
- **Title / Operational Title** (e.g. "Photographer", "Creative Lead") — a lookup table (`operational_titles`), managed under Admin → Titles & Engagement Types. Purely descriptive.
- **Engagement Type** (e.g. "Full-time", "Freelance", "Contractor") — a separate lookup table (`engagement_types`), same management screen. Also purely descriptive.

A planned third axis, **Grade** (organizational seniority, e.g. "Senior Contributor"), is specified but not yet built — see §9.

### Access status (separate from Role)
Every account also has an `access_status`: `active`, `suspended`, or `deactivated`. This is orthogonal to Role — a suspended Admin keeps the `admin` role row in the database, but it becomes unusable everywhere (the central `private.has_role()` check on the database side, and the equivalent check in `getCurrentUser()` on the app side, both return "no roles" for any non-active or expired account). This is the single enforcement point for every RLS policy and every page gate in the system — see `ARCHITECTURE.md` for why it's built this way.

An account can also have an **`access_expires_at`** timestamp — useful for a fixed-term contractor engagement. Once that timestamp passes, the account is treated exactly like a suspended one, automatically, with no manual action needed.

---

## 2. Super Admin Capabilities

Reserved for a very small set of high-risk actions — day-to-day operations should not need a Super Admin:
- Grant or revoke the `admin` or `super_admin` role on any account.
- Suspend, deactivate, or restore another `admin` or `super_admin` account.
- Manage the lookup tables (Titles, Engagement Types) under Admin → Titles & Engagement Types.

**Current Super Admins:**
- `matetey@ordiftghana.com` — **Primary Super Admin**
- `ordift.ghana@gmail.com` — **Recovery Super Admin** (kept specifically so account recovery is never dependent on a single inbox)

## 3. Admin Capabilities

Everything else — the actual day-to-day work:
- Invite new collaborators/contractors, staff, vendors, models, or clients.
- Grant or revoke any role *except* `admin`/`super_admin`.
- Suspend, deactivate, reactivate, or set an access-expiry date for any non-Super-Admin account.
- Assign a collaborator/contractor to a project, and update their assignment status.
- View a user's full access history (audit trail) from their detail panel.
- Everything in the rest of the Admin Platform (Enquiries CRM, Bookings, Content hub, Deliverables, Activity Log, Settings) — unrelated to IAM but part of the same `/admin` console.

## 4. Staff, Collaborator, Contractor, Vendor, Model, and Client Roles

- **Staff** — internal team members, land on `/admin`, same operational console as Admin (staff can be granted operational access without being an Admin — check what specific permissions your build grants staff vs. admin if this distinction matters to you; as of migration 0009, staff and admin share the `/admin` landing path).
- **Contractor** — the collaborator role. Lands on a dedicated portal (`/portal/collaborator`), **never** the internal Admin Platform, no matter what. Access is meant to be **project-scoped**: a contractor sees only what they've been explicitly assigned to (see §6), plus deliverables and updates tied to those assignments.
- **Vendor** and **Model** — external-partner placeholder roles with their own dedicated portals. `model` is currently a placeholder for the future Talent module (see §9) — it exists as a role today so the permission system doesn't need to change when Talent is built.
- **Client** — the default customer-facing role. Everyone starts here.
- **Workshop Participant** — auto-granted the moment a workshop registration email matches an account; not something you assign manually.

## 5. Inviting New Users

From **Admin → Users & Roles**, use the **Invite Collaborator** panel:
1. Enter the person's name, email, and the role you want them to start with.
2. Submitting sends a branded invitation email (see §8) via Resend/Supabase Auth to that address.
3. Accepting the invite creates their account with **exactly the role you specified** — no default `client` role is added on top, and no other role leaks in.
4. The invite action is written to the audit log (`activity_log`) as `collaborator.invited`, with the target role and email in the metadata — this is your record of who invited whom, and with what access.

**A note on invite validation:** Resend/Supabase Auth reject sending to an address on a "reserved" test TLD (e.g. `.test`). Always invite to a real, deliverable address — use the QA convention in §9.3 for test invites.

## 6. Assigning and Revoking Permissions

**Role changes** (grant/revoke) happen from a user's detail panel on **Admin → Users & Roles**:
- Grant: pick the role, confirm. Logged as an audit event.
- Revoke: same panel, same audit trail. You cannot revoke `admin`/`super_admin` unless you are yourself a Super Admin.

**Project assignments** (for contractors) are separate from roles entirely:
- From a contractor's detail panel, use **Assign to Project** — search picks an existing `enquiries` or `workshop_registrations` record (there's no separate "project" table; a project *is* one of those two, referenced polymorphically).
- Each assignment has its own status you can update independently of the person's account-level access status (e.g. an assignment can be marked complete while the person's account stays active for future work).
- A contractor only sees deliverables/updates tied to their *own* active assignments — this is enforced by RLS (`private.has_project_access()`), not just hidden in the UI.

## 7. Suspending, Deactivating, Restoring, and Removing Users

All from the user's detail panel on **Admin → Users & Roles**:

- **Suspend** — temporary. Sets `access_status = suspended`. The account keeps all its role rows in the database, but every one of them stops working immediately (RLS + app-level check both key off `access_status`). Also syncs a matching ban at the Supabase Auth layer (defense in depth — this means even a valid, unexpired session token can't be used to bypass the database-level block).
- **Deactivate** — same mechanism as suspend, distinguished by convention as a longer-term/more deliberate state (the underlying enforcement is identical). Use whichever your internal process calls for.
- **Restore / Reactivate** — set status back to `active`. This also lifts the Auth-layer ban. Roles that were already there become usable again immediately — you do not need to re-grant them.
- **Set an expiry date** — for fixed-term engagements. Once the date passes, the account behaves as suspended automatically, with zero manual action.
- **Permanent removal** — done from **Supabase Dashboard → Authentication → Users**, not the Admin Portal (there's no in-app "delete forever" button, deliberately — this matches the project's "never hard-delete casually" philosophy). Deleting a user there cascades cleanly to their `profiles`, `user_roles`, and `project_assignments` rows (verified zero-orphan after each deletion during this session's cleanup). **This is irreversible** — always confirm the exact email address shown in the confirmation dialog before proceeding, and never do this from a raw SQL `DELETE` (`service_role` deliberately has no `DELETE` grant on most tables, by design).

Every suspend/deactivate/restore/expiry action is written to the audit log as `access_status.change`, with the actor, target, new status, and reason (if provided).

## 8. Email Infrastructure

- **Provider:** Resend, sending domain `auth.ordiftstudios.com` (a dedicated subdomain — the root domain's mail, including Google Workspace, is completely untouched by this).
- **Sender:** `Ordift Studios <no-reply@auth.ordiftstudios.com>` for every Supabase Auth email (signup confirmation, password reset, invite, magic link, email change, reauthentication).
- **Configuration lives in:** Supabase Dashboard → Authentication → Emails → SMTP Settings (credentials) and → Templates (the 6 branded HTML templates, each with the Ordift Studios logo and navy/gold styling).
- **DNS:** SPF, DKIM, and a **subdomain-scoped DMARC record** (`_dmarc.auth.ordiftstudios.com`, not the root) live in Squarespace DNS. The subdomain-scoped DMARC record was a deliberate choice — it can't conflict with a future root-domain DMARC policy for Google Workspace, since subdomain DMARC always takes precedence for mail from that subdomain.
- **No Reply-To header is currently configured** — Supabase's dashboard doesn't expose one for Auth emails. If `info@ordiftstudios.com` as a reply address becomes a real requirement, it needs a custom Auth Hook (not yet built).
- **Verifying delivery health:** open any real received email in Gmail (or similar) and check the message details — look for `mailed-by: send.auth.ordiftstudios.com` and `signed-by: auth.ordiftstudios.com` with no security warning banner. That combination is Gmail's own confirmation that SPF and DKIM passed and are aligned.
- **Tier-1 form notifications** (enquiry/booking submissions) use a separate code path (the Resend SDK called directly from the form's server action), not the Supabase Auth SMTP path documented above — keep that distinction in mind when troubleshooting a "form email didn't arrive" report vs. an "auth email didn't arrive" report.

## 9. Future Expansion

### 9.1 Grade System — built (2026-07-28), see §17
A separate organizational-seniority axis, fully independent of Role and Title/Engagement Type — Permissions **never** derive from Grade. Implemented as part of the Admin Profile Quick Card (§17): `grades` lookup table (10-tier hierarchy, Intern/Trainee → Founder/CEO), migration `0017`. Grade Management (create/rename/reorder/archive) is Super Admin-only; not yet a dedicated UI module — grades are seeded and managed via migration/SQL for now, assignment happens through a person's Edit Profile page. **Grade Visibility Policy (a governance standard, not just a default):** Grade is confidential internal metadata, gated to Admin/Super Admin only in every surface that shows it — see §17 for the exact enforcement mechanism. It must **never** appear anywhere public-facing or client-facing: no ID cards, name badges, email signatures, public team pages, client dashboards, booking pages, deliverables, printed materials, business cards, or contracts. Public/client-facing surfaces show **Title/Position only**.

### 9.2 Talent Module
The `model` role exists today specifically so this future module doesn't require a permission-system change when it's built — talent directories, applications, and bookings are Phase 1B work per `MILESTONES.md`, gated behind a secure-storage evaluation (CVs, ID documents, and consent forms are sensitive enough to need their own storage decision before that form goes live).

### 9.3 QA / Test Account Convention
For all future testing, use a reserved naming convention rather than ad hoc names: `QA Photographer`, `QA Retoucher`, `QA Client`, `QA Contractor`, `QA Admin`, etc., with a reserved email-alias pattern (e.g. plus-addressing off a controlled inbox). This makes automated cleanup and identification of test accounts mechanical instead of requiring a judgment call every time (as happened this session with an ambiguously-named test account that had to be confirmed with the Super Admin before deletion).

---

## 10. Security Best Practices

- Never grant `admin`/`super_admin` casually — every grant is a standing capability, not a one-time action. Prefer time-boxed access (`access_expires_at`) for anything temporary.
- Treat the two Super Admin accounts as your account-recovery lifeline — never let both become inaccessible at once, and never reduce the active Super Admin count below one (the system won't let you anyway, but don't try to route around that protection).
- All destructive account actions (permanent deletion in particular) should be done from the Supabase Dashboard's own confirmation flow, which requires you to see and match the exact email address — never automate this without a human reading the confirmation.
- Auth providers should stay Email-only unless there's a specific reason to add an OAuth provider — every additional provider is additional attack surface.
- Review the Supabase Security Advisor (Dashboard → Advisors → Security) periodically — it flags real, actionable issues (missing grants, overly-permissive functions) as they arise from schema changes.

## 11. Backup and Recovery Procedures

**Not yet formally verified as of this writing** — see `PRODUCTION_READINESS_REPORT.md` §2. Supabase provides automatic daily backups on paid plans; confirm the current retention window under Dashboard → Database → Backups, and do a test restore into a scratch project at least once before the platform holds real client data at volume. This is tracked as Milestone 0.6 in `MILESTONES.md`.

## 12. Environment Variables and Deployment Notes

Production environment variables live in Vercel (Project Settings → Environment Variables), never committed to git. As of this writing, production has:
`RESEND_API_KEY`, `EMAIL_ADMIN_NOTIFICATION_TO`, `EMAIL_FROM_ADDRESS`, `LAUNCH_HOLDING_PAGE`, `NEXT_PUBLIC_SITE_URL`, `SANITY_API_TOKEN`, `SUPABASE_SECRET_KEY`, `LEGAL_PAGES_APPROVED`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SANITY_API_VERSION`, `NEXT_PUBLIC_SANITY_DATASET`, `NEXT_PUBLIC_SANITY_PROJECT_ID`, `SITE_ENV`.

**Not yet present in production** (see `.env.example` for the full expected set): Google Sheets service-account credentials, Google Analytics measurement ID, `OPERATIONS_EMAIL` (§16.2 — optional, falls back to `EMAIL_ADMIN_NOTIFICATION_TO`), and the public contact-info display variables. See `PRODUCTION_READINESS_REPORT.md` §2 for what each gates.

Deployment is via Vercel, connected to the project's git repository. See `DEPLOYMENT.md` for the full historical deployment log and known issues.

## 13. Routine Maintenance

- Check the Activity Log (`Admin → Activity`) periodically for anomalous patterns (repeated failed access-status changes, unexpected role grants).
- Re-run the Supabase Security Advisor after any schema migration.
- Clean up test/QA accounts promptly after use, following the convention in §9.3 — don't let them accumulate in production.
- Confirm Resend's domain-verification status hasn't lapsed (Dashboard → Domains) — DNS records can occasionally be modified or removed by other tooling touching the same DNS zone.

## 14. Troubleshooting Guide

| Symptom | Likely cause | Where to look |
|---|---|---|
| A user reports they can't log in / see the wrong thing | Check `access_status` on their profile — suspended/deactivated/expired accounts return zero roles everywhere, by design | Admin → Users & Roles → their detail panel |
| Auth email (signup/reset/invite) never arrives | Check Resend Dashboard → Logs for the send attempt; check Supabase Auth SMTP settings are still configured; check the recipient's spam folder first | Resend Dashboard, Supabase Dashboard → Auth → Emails |
| A brand-new table/feature throws `permission denied for table X` only in production, never in staging | Production has "Automatically expose new tables" disabled by design (see migration `0001`'s Hardening Pass 4) — `service_role` needs an explicit grant on any new table, staging doesn't surface this gap because it auto-exposes | Add a narrowly-scoped additive migration granting the specific privilege needed, following the pattern of migrations `0010`–`0012` |
| "Refused — last active Super Admin" error | You're trying to suspend/deactivate/demote the only active Super Admin | Promote a second account to Super Admin first, then retry |
| Invite send fails with an "invalid email" error | The target address is on a reserved test TLD (e.g. `.test`) | Use a real, deliverable address per the QA convention in §9.3 |

---

## 15. Internal Governance

Standards established 2026-07-27, as Ordift Studios moves from initial build to ongoing operation with a separated long-term roadmap (see `PRODUCT_ROADMAP.md`). These are the rules a future contributor — human or AI — should follow by default, not just guidance for this session.

### 15.1 Naming Standards
- **Roles, Positions, Grades, Engagement Types** are lookup-table driven (`slug`/`name` pairs), never hardcoded strings scattered through the codebase — see `ROLE_SLUGS` in `src/lib/portal/roles.ts` as the canonical pattern for roles; `operational_titles`/`engagement_types` for the others.
- **Database migrations** are numbered sequentially with a short descriptive suffix (`0009_access_management.sql`, `0010_service_role_grants_fix.sql`) — never renumbered or renamed after being applied to any environment.
- **QA/test accounts** follow the reserved convention in §9.3 (`QA Photographer`, `QA Client`, etc.) — never ad hoc names like "Email Infra Test," which require a manual judgment call to identify and clean up safely (as happened this session).
- **Documents** use `SCREAMING_SNAKE_CASE.md` at the repo root for project-wide reference documents (this file, `PRODUCT_ROADMAP.md`, `PRODUCTION_READINESS_REPORT.md`) — consistent with every existing doc in this repo.

### 15.2 Security Principles
- Least-privilege by default (§10) — every new capability starts from no access.
- The central-enforcement-point pattern (§1: suspended/expired accounts return zero roles from one single check, both in the database via `private.has_role()` and in the app via `getCurrentUser()`) should be the model for any *new* access-control concept too — never scatter the same check across many call sites.
- Any new sensitive-data surface (Talent documents in Version 2.0, HR data in Version 1.1) gets its own explicit storage/security decision before being built, not assumed safe by default — see `PRODUCT_ROADMAP.md`'s Version 2.0 risk section for the concrete example already flagged.

### 15.3 Permission Architecture
Full detail in §1–§7 above. The one governance rule worth restating here: **Role, Position, Grade, and Engagement Type are four independent axes and must never become coupled** — this is a hard constraint carried into every future version on the roadmap (see `PRODUCT_ROADMAP.md` Version 1.1), not just a preference for this session's work.

### 15.4 QA Standards
- Every new feature gets tested against a real, disposable account following the naming convention in §9.3 before being considered done — not just unit-tested in isolation.
- Test accounts and any data they generate (invitations, project assignments, audit-log entries referencing them) are cleaned up promptly after verification — except audit-log entries documenting a real administrator's real action, which are kept (see §7's note on this exact distinction, learned this session).
- Staging is verified before production for any schema change — no migration goes to production untested.

### 15.5 Documentation Standards
- Every new module or version gets: an entry in `PRODUCT_ROADMAP.md` before it's built (vision/objectives/features/dependencies/risks), a `CHANGELOG.md` entry when it ships, and an update to this guide if it changes how the platform is operated day-to-day.
- Documents cross-reference each other explicitly (a "Companion document" footer, as used throughout) rather than duplicating content — see `DOCUMENTATION_INDEX.md` for the full map of what lives where.
- Stale content gets corrected, not left to rot — e.g. `DEPLOYMENT.md`'s email-infrastructure note was updated the same day SMTP actually went live, rather than left describing a since-resolved gap.

### 15.6 Audit Logging
Every state-changing administrative action already writes to `activity_log` (§1, §7) — this must remain true for every future module. Concretely: Grade assignments, equipment checkouts (Version 3.0), leave approvals (Version 3.0), and Ordift Pulse content publishes (Version 4.0) must all log to the same table, following the exact `{action, entity_type, entity_id, metadata}` shape already established.

### 15.7 Release Management
- Every release belongs to a semantic version, gets a git tag, a `CHANGELOG.md` entry, and (for anything beyond a small patch) a `RELEASE_NOTES.md` section — policy already established in `VERSIONS.md`, unchanged by this update.
- Staging-first for every migration; production only after independent verification, exactly as done for every migration `0001`–`0012` to date.
- A version doesn't get marked done in `PRODUCT_ROADMAP.md` until its own Release Criteria (specified per-version in that document) are actually met — not just "code complete."

### 15.8 Change Management
- Scope changes mid-version get a dated note in the relevant document (the same convention `MILESTONES.md` already uses) rather than a silent rewrite of prior decisions.
- Any change that would affect the four-axis independence rule (§15.3), the central-enforcement-point pattern (§15.2), or introduce a new sensitive-data surface without a storage decision (§15.2) should be flagged for explicit approval before proceeding, regardless of how small it seems in isolation — these are the three architectural guarantees this whole system's safety currently rests on.

## 16. Operational Reporting

Added 2026-07-27, on top of the dual-storage form workflow (Supabase primary + Google Sheets secondary — see `GOOGLE_SHEETS_INTEGRATION.md`). Supabase is the authoritative source for every report below; Google Sheets is never read from for reporting, only written to as a secondary operational mirror.

### 16.1 What's where
- **`/admin/enquiries`** and **`/admin/bookings`** — the day-to-day CRM lists. Each has search, status/stage filters, a payment-status filter, a service/workshop filter, a date-range filter, and its own **Export CSV / Export Excel** buttons that carry whatever filters are currently applied.
- **`/admin/reports`** — curated, named reports (not a second filter UI): one card per reportable entity with Download CSV / Download Excel / **Email to Operations**, plus a Monthly Workshop Registration Summary (counts by month, not raw rows), plus a "Not Yet Live" section for entities with no form yet (Client Bookings, Newsletter Subscribers, Vendor/Model/Employment Applications, Equipment Rentals, Studio Reservations).
- Live reportable entities today: **Contact Enquiries**, **Workshop Registrations**, **Project Requests**.

### 16.2 "Email to Operations"
Sends the report as an `.xlsx` attachment to the address in `OPERATIONS_EMAIL` (falls back to `EMAIL_ADMIN_NOTIFICATION_TO` if unset — see `.env.example`), via the same Resend infrastructure as every other transactional email (§8). Staging always logs instead of sending, same `productionSendingEnabled()` gate as everything else. Sent reports are **not** archived anywhere by the app itself — if you need a permanent record of what was sent when, forward or file the received email.

### 16.3 Extending this for a future module
One registration, no new synchronization logic — see the comment at the top of `src/lib/admin/reports/registry.ts`:
1. Add a `fetchRows()` implementation (a query against the module's Supabase table, filtered and mapped to flat `{ column: value }` rows) to `src/lib/admin/reports/modules/`.
2. Register it in `REPORT_MODULES` in `registry.ts`, replacing its placeholder entry in `modules/reserved.ts` if it already has one.
3. Search, filter, CSV/XLSX export, and "Email to Operations" all work immediately — none of `src/app/api/admin/reports/**`, `csv.ts`, `xlsx.ts`, or `sendReportEmail.ts` need to change.

### 16.4 Access control
Every `/api/admin/reports/**` route is gated by `requireAdminApiUser()` (`src/lib/admin/apiAuth.ts`) — staff, admin, or super_admin only, same role check as the `/admin/**` page layout, checked independently since `proxy.ts` doesn't gate API routes the way it gates pages. An unauthenticated or under-privileged request gets a `401`, not a redirect.

`/api/admin/google-sheets/**` uses two different gates on the same helper file: `GET`/`POST /api/admin/google-sheets/setup` uses the same `requireAdminApiUser()` as the reports routes, but `POST /api/admin/google-sheets/verify-write` uses the stricter `requireSuperAdminApiUser()` — staff and admin are rejected, only super_admin passes. This is the first route in the codebase to need a gate narrower than "any staff/admin/super_admin," since it writes directly to an external system (Google Sheets) with no visitor-facing origin to audit against. See `GOOGLE_SHEETS_INTEGRATION.md` §10 for what it does.

## 17. Admin Profile Quick Card

Clicking your own name in the `/admin` header (`src/app/admin/layout.tsx`) opens a Quick Card (`src/components/admin/ProfileQuickCard.tsx`) with Staff Number, Job Title, Department, Grade, Date Joined, calculated tenure, Account Status, and Last Login, plus "View Full Profile" and "Edit Profile" links to `/admin/profile/[id]` (`src/app/admin/profile/[id]/page.tsx`).

**V1 scope — self-view only.** The card and Full Profile page are reachable exclusively via your own name; requesting anyone else's `id` in the URL redirects you back to your own profile (`src/app/admin/profile/[id]/page.tsx`). Viewing colleagues (a staff directory) is a future capability, not yet built.

**Grade visibility — double-gated.** Grade is confidential internal metadata (§9.1). It is hidden from anyone who isn't Admin or Super Admin — including from the graded person themselves, if they hold neither role — via two independent layers:
1. **RLS** (`grades: admin read` policy, migration `0017`): a non-admin/-super_admin viewer's own join to `public.grades` returns nothing, even on their own `staff_details` row.
2. **App layer** (`src/lib/portal/profileCard.ts`): `getProfileCard()` only resolves and returns `grade`/`gradeId` when `canViewGrade` is true, so a UI bug alone could never leak it — the data was never fetched to begin with.

**Editing — split by risk, not just by ownership.** Contact fields (Full Name, Phone) are self-service: any admin can edit their own via the existing `profiles` self-update grant (`src/app/admin/profile/[id]/actions.ts` → `updateOwnContactDetailsAction`, request-scoped client, RLS-enforced). Operational fields (Staff Number, Job Title, Department, Grade) are **Super Admin-only to edit, even on your own card** — these are admin-managed facts, not self-service — via `updateStaffOperationalDetailsAction`/`assignStaffNumberAction`, both gated by `isSuperAdmin()` and using the service-role client, the same precedent as `updateCollaboratorDetailsAction` in `src/app/admin/users/actions.ts`.

**Staff Numbers** (`STAFF-YYYY-NNNNNN`) reuse the existing `public.next_record_sequence()` function (migration `0013`) with a new `STAFF` prefix — no new counter mechanism. Nullable, assigned lazily via the "Assign Staff Number" button on a Super Admin's edit view; never auto-backfilled for existing accounts.

**Photo upload is not yet built.** `profiles.avatar_url` exists but has no upload path; the card falls back to initials (first + last name, or first two characters of the email if no name is set). Estimated at 70–90 minutes when it's picked up — a Supabase Storage bucket, an upload route, and wiring into the Edit Profile form.

**Known follow-up:** migration `0017` granted `authenticated` access to `public.grades` but not `service_role` (same gap class as `0010`/`0016` — production has "Automatically expose new tables" disabled). Fixed as migration `0018`. Doesn't affect the live feature, which never uses `service_role` to read/write `grades`.

---

*Companion documents: [PRODUCTION_READINESS_REPORT.md](PRODUCTION_READINESS_REPORT.md) — the point-in-time verification and Go/No-Go assessment behind this guide. [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md) — the long-term version plan referenced throughout §9 and §15. [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md) — how every project document relates to this one.*
