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

## 2. Interim Mitigation: Manual Backups (available today, no plan upgrade needed)

Free-tier projects still expose a direct Postgres connection (Settings → Database → Connection string), so a manual backup is possible right now without paying for Pro — it's just not automatic or scheduled. Recommended until the Pro-plan decision is made:

```bash
# Requires the Postgres connection string from Supabase Dashboard →
# Settings → Database → Connection string (URI, "Session pooler" or
# "Direct connection"). Never commit this string or paste it anywhere
# other than your own terminal — it contains the database password.
pg_dump "postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres" \
  --no-owner --no-privileges -F c -f "ordift-production-$(date +%Y%m%d).dump"
```

This produces a single restorable file (`pg_restore` reverses it against any Postgres instance, including a fresh Supabase project). **This is a manual, human action** — I cannot run this myself since it requires the database password from the dashboard, which is a credential I must never handle in plaintext per this session's standing security rules. Recommended cadence: weekly at minimum, or before any risky migration.

## 3. Database Restoration Procedure

**If a manual `pg_dump` backup exists (see §2):**
1. Create a fresh Supabase project (or use an existing empty one).
2. `pg_restore --no-owner --no-privileges -d "postgresql://..." ordift-production-YYYYMMDD.dump`
3. Re-run migrations 0001–0022 in order if the dump predates the most recent ones (check `supabase/migrations/` against the dump's date).
4. Proceed to §6 (post-recovery validation).

**If no backup exists (current default state):**
1. Schema-only recovery is still possible: run every file in `supabase/migrations/` in order (`0001` through `0022`) against a fresh project via `supabase db push` or the SQL Editor.
2. **Data is unrecoverable** unless it can be reconstructed from a secondary source:
   - Google Sheets (`GOOGLE_SHEETS_INTEGRATION.md`) holds a best-effort secondary copy of Enquiries, Workshop Registrations, and Project Requests — check the "Ordift Studios Operations" spreadsheet for whatever rows synced successfully.
   - `sheet_sync_failures` and `email_send_failures` (if the primary Supabase write itself failed, these would be empty for that row — they only capture *secondary*-system failures, not primary data).
   - Auth users (`auth.users`) have no secondary copy anywhere — a lost `auth.users` table means every account must re-register from scratch.
3. Notify affected users if real client/model/vendor data was lost — this is a business/legal decision for you, not something to handle unilaterally.

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
- **Manual backups (§2):** must be run by a human with the database connection string — recommend assigning this to a specific person/cadence once decided, since nothing currently does it automatically.
- **Decision to upgrade to Supabase Pro** (enabling automatic backups + optional PITR): a billing decision, already flagged and deliberately left to you (see `MILESTONES.md` Phase E) — this document doesn't change that; it makes the cost of *not* deciding more concrete now that PITR's exact price ($100/mo add-on) is confirmed.
- **Incident response order of operations:** (1) stop further damage (pause the affected Vercel deployment or Supabase project if actively being exploited), (2) assess what's actually lost, (3) restore per §3–§6 above, (4) validate per §7, (5) document per §7's last item.
