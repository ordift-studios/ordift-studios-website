# Release Notes

Detailed, per-release notes. `CHANGELOG.md` is the running dated log
across every version; this file expands on the *current* release in
more depth — what changed, why, what to verify, what's explicitly not
included yet. Superseded by a new file section each time a version
closes.

---

## Version 1.3.0 — Authentication & Client Portal

**Status: ✅ Complete, approved 2026-07-25.**

### What this release is

A full authentication system and Client Portal, built on Supabase
(Postgres + Auth + Row Level Security), designed around Ordift Studios'
real business workflows — six distinct roles, each seeing only what's
relevant to them — rather than a generic "user accounts" bolt-on.

### What's new for each audience

**For clients:** self-service sign-up, a portal showing their own
enquiries with live status, no more needing to email and ask "where's my
booking at."

**For workshop participants:** the same portal shows their workshop
registrations, including waitlist position and (when issued)
certificates — auto-linked the moment they register with the same email
as their account, no manual linking step.

**For staff/admin:** a read-only operational view of all enquiries and
workshop registrations (staff), plus full user/role management — granting
Model, Vendor, Staff, or Admin access to any account (admin).

**For models/vendors:** a placeholder portal showing their real,
admin-set status — deliberately not inventing a Talent/Vendor management
workflow that doesn't exist yet (matches this project's standing
zero-invention rule).

### What's under the hood

- Every table has Row Level Security enabled from the first migration —
  nobody sees data that isn't theirs, enforced at the database level,
  not just in application code.
- Three migrations, each hardened and live-verified: schema + RLS,
  a Security Advisor remediation (closed all 8 flagged warnings by
  moving authorization helpers into a non-exposed schema), and a
  case/whitespace-normalized email-matching function for linking guest
  form submissions to existing accounts.
- The existing Google Sheets-based enquiry/workshop-registration system
  is **unchanged and remains the primary record** — Supabase is an
  additive, best-effort mirror that never blocks or corrupts that flow
  even if it fails.

### What was tested

Full live end-to-end verification with clearly-labeled test data
(created and fully removed, not left behind): account linking (exact
and case-variant email matches), guest submissions, automatic role
granting, duplicate-submission protection, per-role data access
boundaries, and confirmation that anonymous requests see nothing —
tested with real data present, not just empty tables.

### What's explicitly NOT in this release

- Production deployment — the app runs against one Supabase project
  used for verification; a separate production project, SMTP, CAPTCHA,
  and domain configuration are scoped to the following **Production
  Readiness & Launch Preparation** phase (see `MILESTONES.md`), not part
  of this release.
- Payment collection — workshop payments remain manual-confirmation
  only, as before.
- Any CRM/Admin Dashboard features beyond the basic staff operational
  view and admin role management already described above — full CRM is
  Version 2.0, not started.

### Known limitations (non-blocking, tracked)

- Supabase's Admin API intermittently fails on this project's new
  API-key format for certain calls (`updateUserById`, occasionally
  `listUsers`) — mitigated with retries where it matters, documented in
  `MILESTONES.md`/`DEPLOYMENT.md`.
- Leaked-password protection requires a Supabase Pro plan upgrade — a
  pricing decision for you, not a code gap.
