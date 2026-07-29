# Disaster Recovery Procedure

**Last audited:** 2026-07-30, directly against the live Supabase and Vercel dashboards (not from memory or a prior note) — see §1 for what was actually checked and how.

This document exists so that a real incident (accidental data deletion, a bad migration, a compromised credential, a broken deployment) has a documented path back to a working state — written *before* an incident, not improvised during one.

---

## 1. Current Backup & Recovery Capability (audited 2026-07-30)

| Item | Status | Source |
|---|---|---|
| Automatic scheduled backups | **None.** "Free Plan does not include project backups." | Supabase Dashboard → Database → Backups → Scheduled backups |
| Point-in-Time Recovery (PITR) | **Not available on Free.** Pro Plan add-on, starts at $100/month on top of Pro. | Supabase Dashboard → Database → Backups → Point in time |
| Backup retention period | **N/A** — nothing is being backed up | — |
| Supabase Storage (file backups) | **N/A — no buckets exist.** All media (images/video) is served by Sanity's CDN, not Supabase Storage. Confirmed zero buckets under Storage → Files. | Supabase Dashboard → Storage |
| Plan / organization | "Ordift Studios" organization, **Free Plan**, 2 projects (staging + production) sharing that plan | Supabase Dashboard → organization selector |
| Staging/production separation | Confirmed separate projects (`omtmxvsjmlrnbtxiesqn` staging, `goxuyooxrekzstssjgly` production) — an incident in one cannot corrupt the other's data | `.env.local` / `.env.production.local`, cross-checked live in this session |
| Project region | Central EU (Frankfurt) | Supabase Dashboard → Settings → General |
| Project ownership | Single owner (`matetey@ordiftghana.com`), org-wide access | Supabase Dashboard → Settings → General |

**The real risk in plain terms:** if the production database is corrupted, has data accidentally deleted, or the project is lost, **there is currently no way to restore the actual data** (enquiries, workshop registrations, client accounts, profiles, everything in `public.*`). The *schema* is always recoverable (every table/column/function/grant exists as SQL in `supabase/migrations/*.sql`, replayable against a fresh project), but the *rows* are not, unless a manual export was taken first. This is not a new finding — it was flagged 2026-07-27 in `MILESTONES.md` (Phase E) as a pending owner decision — this audit confirms it is still true as of today and adds the PITR pricing detail and the Storage/ownership confirmation that weren't previously verified directly.

**Decision (2026-07-30):** stay on the Free plan for now. §2 below is therefore the **primary** backup strategy, not a stopgap — it must actually be followed on the schedule given, not treated as optional. §9 gives the concrete milestone for revisiting the Pro-plan decision.

## 2. Manual Backup Strategy (the current primary strategy — Free plan)

### 2.1 What gets backed up, and how often

| Asset | Method | Frequency | Where it lives day-to-day |
|---|---|---|---|
| **Database** (all of `public.*` — enquiries, workshop registrations, profiles, everything) | `pg_dump` (custom format, see §2.2) | **Weekly**, every Monday morning, *and* immediately before any migration or risky manual change | Supabase production project |
| **Storage** | N/A — no buckets provisioned (§4) | — | — |
| **Environment variables** (all Production values) | `vercel env pull` snapshot + a manual copy of every Sensitive-flagged value into your password manager at the moment each is set | **Monthly**, and immediately whenever any variable changes | Vercel Production environment |
| **Config/code** | Git — already continuous, every commit is a restore point | Continuous (every push) | GitHub `ordift-studios/ordift-studios-website`, `main` branch |
| **Sanity content** (site copy, portfolio, workshops, journal) | Sanity's own dataset export | **Monthly** | Sanity's hosted dataset (separate from Supabase entirely) |

Weekly for the database specifically because that's this business's realistic tolerance for data loss at current volume (pre-launch, low transaction count) — tighten to daily once real bookings start flowing (see §9).

### 2.2 Running the backup

```bash
# Requires the Postgres connection string from Supabase Dashboard →
# Settings → Database → Connection string (URI, "Session pooler" or
# "Direct connection"). Never commit this string or paste it anywhere
# other than your own terminal — it contains the database password.
pg_dump "postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres" \
  --no-owner --no-privileges -F c -f "ordift-production-$(date +%Y%m%d).dump"
```

This produces a single restorable file (`pg_restore` reverses it against any Postgres instance, including a fresh Supabase project). **This is a manual, human action** — I cannot run this myself since it requires the database password from the dashboard, which is a credential I must never handle in plaintext per this session's standing security rules.

Also snapshot environment variables in the same sitting:
```bash
vercel env pull ordift-production-env-$(date +%Y%m%d).env --environment=production --yes
```
Note: this file will contain the literal string `[SENSITIVE]` in place of any Sensitive-flagged variable's real value (Vercel's write-only design — see §5) — it's a record of *which variables exist*, not a substitute for your password-manager copies of the actual Sensitive values.

### 2.3 Verifying the backup succeeded (do this every time, immediately after)

A backup you haven't verified is not a backup — it's an assumption. After every `pg_dump`:

1. **File exists and isn't empty:** `ls -lh ordift-production-YYYYMMDD.dump` — should be well above 0 bytes (a truncated/failed dump is often suspiciously small).
2. **File is a valid dump:** `pg_restore --list ordift-production-YYYYMMDD.dump` — this lists every table/object the dump contains without actually restoring anything. Confirm it lists all 26 tables (compare against the table list in `PHASE_4_PRODUCTION_AUDIT_REPORT.md` §4 or re-check live via the production PostgREST introspection method used throughout this project's audits).
3. **Row-count sanity check:** pick 2–3 tables you know have real rows (e.g., `enquiries`, `workshop_registrations`) and confirm the dump's row counts roughly match what you'd expect from the admin dashboard's own counts — catches a dump that succeeded structurally but captured a stale or partial snapshot.
4. **Log it:** append one line to a simple `backup-log.txt` (date, file name, size, verification result) kept alongside your backups — not fancy, just enough that "when was our last good backup?" always has a fast answer.

### 2.4 Safe storage of backup files

- **Never** store backup files in the Git repository (they contain real client PII — names, emails, phone numbers).
- Store in a location with its own access control and, ideally, versioning: a private cloud storage bucket (S3/R2/Google Drive in a restricted folder), not a laptop's Downloads folder.
- Keep at least the **last 4 weekly backups** (one month of rollback depth) before deleting older ones — balances real recoverability against unbounded storage growth.
- Encrypt at rest if the storage location doesn't already do so by default (most cloud storage does).
- Whoever holds backup files should be the same person(s) with Supabase dashboard access — don't create a new access surface just for backups.

## 3. Database Restoration Procedure

**If a manual `pg_dump` backup exists (the expected case, per the §2 schedule):**
1. Create a fresh Supabase project (or use an existing empty one) — same region (Central EU / Frankfurt) to keep latency characteristics consistent.
2. `pg_restore --no-owner --no-privileges -d "postgresql://..." ordift-production-YYYYMMDD.dump`
3. Re-run any migrations newer than the dump's date in order (check `supabase/migrations/` filenames against the dump's date — the dump only captures schema/data as of when it was taken, so a migration applied after that date won't be in it).
4. **Verify the restore before treating it as done** — see §3.1 below.
5. Proceed to §7 (full post-recovery validation).

**If no backup exists or the most recent one is unusably old (should not happen if §2's schedule is followed — treat this branch as the failure case, not the plan):**
1. Schema-only recovery is still possible: run every file in `supabase/migrations/` in order (`0001` through `0022`) against a fresh project via `supabase db push` or the SQL Editor.
2. **Data since the last good backup is unrecoverable** unless it can be reconstructed from a secondary source:
   - Google Sheets (`GOOGLE_SHEETS_INTEGRATION.md`) holds a best-effort secondary copy of Enquiries, Workshop Registrations, and Project Requests — check the "Ordift Studios Operations" spreadsheet for whatever rows synced successfully.
   - `sheet_sync_failures` and `email_send_failures` (if the primary Supabase write itself failed, these would be empty for that row — they only capture *secondary*-system failures, not primary data).
   - Auth users (`auth.users`) have no secondary copy anywhere — a lost `auth.users` table means every account must re-register from scratch.
3. Notify affected users if real client/model/vendor data was lost — this is a business/legal decision for you, not something to handle unilaterally.

### 3.1 Verifying a restore actually worked

Don't consider a restore complete just because `pg_restore` exited without an error — confirm the data is actually there and correct:

1. Row counts on the restored project roughly match what the backup-log entry (§2.3) recorded for that backup's date.
2. Spot-check 2–3 specific real records by reference number (e.g., a known `ENQ-2026-######`) and confirm the full row content matches what you'd expect, not just that *a* row with that reference exists.
3. Run the full schema check from §7 below (table/column/RPC/grant enumeration) — a restore can succeed at the row-data level while still being missing a grant or two if `--no-owner --no-privileges` interacted unexpectedly with a particular object; this catches that class of partial restore.
4. Only after 1–3 pass, proceed to make the restored project live (re-point `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SECRET_KEY` in Vercel, or promote the restored project) — never cut over on an unverified restore.

## 4. Storage Restoration

**Not applicable today** — no Supabase Storage buckets are in use; all media is served by Sanity (a separate CDN-backed system with its own dataset versioning, outside this document's scope). If a future feature starts using Supabase Storage (e.g., Tier 2 sensitive-document uploads per the original Plan Part G), this document must be revisited before that feature launches, since Storage files are backed up separately from the database and are also excluded from the Free plan's (nonexistent) backup coverage.

## 5. Environment Variable Recovery

- **Source of truth:** Vercel Project Settings → Environment Variables, per environment (Production/Preview/Development).
- **Critical gap:** variables flagged **"Sensitive"** in Vercel are write-only by design — once set, `vercel env pull`, the dashboard, and the API can never read the value back (this was the root cause of an extended RESEND_API_KEY debugging session earlier in this project — see `MILESTONES.md`). **If a Sensitive variable's real value is lost, it must be regenerated at the source** (e.g., a new Resend API key, a new Supabase secret key) — there is no recovery path for the old value.
- **Recommendation:** maintain your own secure, encrypted copy (password manager, not a plaintext file) of every Sensitive-flagged production value at the moment it's set, specifically because Vercel cannot ever show it to you again.
- **Non-Sensitive variables** (most of them) remain readable via `vercel env pull` or the dashboard at any time — no special recovery action needed for those.
- **Full current variable list:** `.env.example` documents every variable this app uses and why; use it as the checklist when rebuilding an environment from scratch.

## 6. Vercel Deployment Rollback

Every deployment Vercel builds is retained (not just the current production one). To roll back:

**Dashboard:** Vercel → Project → Deployments → find the last known-good deployment → "⋯" menu → "Promote to Production".

**CLI:**
```bash
vercel ls --yes                          # list recent deployments
vercel promote <deployment-url> --yes    # alias it to production
```

This only changes which build serves traffic — it does **not** touch the database. A deployment rollback after a bad code change is fast and safe; it does not by itself undo any data changes that bad code already made (see §3 for that).

## 7. Post-Recovery Validation Checklist

After any recovery action (schema restore, data restore, or deployment rollback), confirm before considering the incident closed:

- [ ] Production PostgREST introspection (`GET /rest/v1/`) enumerates all expected tables — compare against the list in this session's migration-verification pass (25 tables as of migration 0022).
- [ ] `service_role` grants intact on every table that needs them (see `ADMIN_GUIDE.md` §10's checklist) — a schema-only restore from raw migration files should include these automatically, but verify.
- [ ] A test account can sign up, log in, and reach the correct portal for its role.
- [ ] Contact Enquiry and Workshop Registration forms submit successfully (staging first) and create the expected database row.
- [ ] Redis-backed rate limiting and idempotency still respond correctly (see `PRODUCTION_HARDENING_REPORT.md` for the exact verification method).
- [ ] Email sending (verify-send endpoint) still authenticates and sends.
- [ ] Admin (`/admin`) and Super Admin functions are reachable and role boundaries still hold.
- [ ] `FORMS_SENDING_ENABLED` is in the state you intend it to be in (recovery actions should never silently change this flag).
- [ ] No leftover QA/test data from the recovery process itself.
- [ ] Document what happened, when, and what was lost (if anything) in `MILESTONES.md`, dated, same as every other incident in this project's history.

## 8. Recovery Responsibilities

- **Database password, Supabase dashboard access, Vercel account access, domain registrar access:** all owned by the Ordift Studios organization/account — recovery of any of these requires the account owner's direct action. No AI session (including this one) holds standing credentials between conversations; every session starts with no memory of prior secrets.
- **Manual backups (§2):** must be run by a human with the database connection string, on the weekly/monthly schedule in §2.1 — recommend assigning this to a specific person, since nothing currently does it automatically. This is now the actual backup strategy, not a placeholder — treat the schedule as a real operational commitment.
- **Decision to upgrade to Supabase Pro** (enabling automatic backups + optional PITR): explicitly deferred (2026-07-30) — staying on Free for now. §9 below gives the concrete trigger for revisiting this, rather than leaving it open-ended.
- **Incident response order of operations:** (1) stop further damage (pause the affected Vercel deployment or Supabase project if actively being exploited), (2) assess what's actually lost, (3) restore per §3–§6 above, (4) validate per §7, (5) document per §7's last item.

## 9. When to Revisit the Supabase Pro Decision

Staying on Free is a reasonable choice *before* the business is handling real, ongoing client data — the manual weekly backup in §2 is a genuine, workable strategy at that stage, not just a stopgap. It stops being the right choice once there's real business data whose loss would actually hurt. Concrete trigger, not a vague "someday":

**Upgrade to Supabase Pro ($25/month) at the earlier of:**
1. **The day `FORMS_SENDING_ENABLED` is turned on in production** — this is the literal moment real client enquiries, workshop registrations, and personal data start flowing in from the public. A week of exposure between that day and the next scheduled manual backup is the single largest realistic risk window this document describes, and $25/month is trivial against the cost of losing even one real client's data or a week of bookings.
2. **20 real (non-test) enquiries or workshop registrations processed**, if launch happens gradually rather than as a single cutover — a concrete, countable number rather than "when it feels like enough," checkable at any time via the admin dashboard's own counts.
3. **The first real payment/booking is confirmed** — the point at which the business has a direct financial relationship with a client tied to records in this database.

Whichever happens first, upgrade within that same week — don't let "we'll do it later" quietly become the permanent state, which is exactly how the Free-plan gap got flagged three times (2026-07-27, 2026-07-30 audit, and now this decision) before actually being resolved. When you hit any of these three triggers, tell me and I'll walk you through the upgrade (dashboard clicks, verifying backups activate, and updating this document to reflect Pro coverage) the same way this document walks through the current manual process.
