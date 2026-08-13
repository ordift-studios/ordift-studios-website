# Disaster Recovery Procedure

**Last audited:** 2026-07-30, directly against the live Supabase and Vercel dashboards (not from memory or a prior note) — see §1 for what was actually checked and how.
**Re-stress-tested:** 2026-08-10 (Workstream I → H, `PRODUCT_ROADMAP.md`'s dependency-ordered plan). This pass asked "does this document still describe what would actually happen if Production broke today, and what breaks it as soon as tomorrow" — not just "does the text still read correctly." Findings below; no content was rewritten to match staging's more advanced schema, because this document is specifically about **Production**, and Production has not moved since the 2026-07-30 audit (confirmed against `PAYSTACK_PRODUCTION_HANDOVER.md` §2, itself actively maintained this same session: Production is still on migration `0022`; migrations 0023–0025 remain pending promotion, gated on your explicit go-ahead).

**The one finding that matters most: this document has no built-in trigger for its own staleness.** The moment migrations 0023–0025 are promoted to Production (Workflow engine, Payments schema, and — critically — the first-ever Supabase Storage bucket), every number and claim in §2.5, §4, and §7 below goes stale **on that exact day**, not gradually. See the callout in §4 and the new item added to `PAYSTACK_PRODUCTION_HANDOVER.md`'s own promotion checklist, so this isn't the fourth time a known gap quietly rots before being caught (same pattern TD-014 already names for secret rotation).

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

**The real risk in plain terms:** if the production database is corrupted, has data accidentally deleted, or the project is lost, the *schema* is always recoverable (every table/column/function/grant exists as SQL in `supabase/migrations/*.sql`, replayable against a fresh project), but the *rows* are only recoverable as of the most recent manual export. **A first manual backup was taken and verified 2026-07-30** (§2.5) — real row-level recoverability now exists as of that timestamp, but it degrades every day the weekly cadence in §2.1 isn't actually followed. This is not a new finding — it was flagged 2026-07-27 in `MILESTONES.md` (Phase E) as a pending owner decision — this audit confirms it is still true as of today and adds the PITR pricing detail and the Storage/ownership confirmation that weren't previously verified directly.

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

### 2.5 First backup — completed 2026-07-30

The very first manual production backup was taken and verified 2026-07-30, closing the "no row-level recoverability" gap named in §1:

- **File:** `ordift-production-20260730-043436.dump`, 377 KB, custom format (`pg_dump -F c`), via the Session Pooler connection.
- **Verification performed:** file non-empty; `pg_restore --list` independently re-run and confirmed structurally valid — 683 total TOC entries, all 26 `public.*` tables present with both schema and data entries (`businesses`, `profiles`, `roles`, `user_roles`, `enquiries`, `workshop_registrations`, `model_profiles`, `vendor_profiles`, `staff_details`, `enquiry_notes`, `feature_flags`, `activity_log`, `deliverable_categories`, `deliverables`, `request_types`, `project_requests`, `operational_titles`, `engagement_types`, `project_assignments`, `project_updates`, `record_sequences`, `sheet_sync_failures`, `grades`, `member_number_classifications`, `member_numbers`, `email_send_failures`).
- **Not yet performed this round:** the row-count sanity check against the admin dashboard's own counts (§2.3 step 3), and a full restore-into-a-scratch-project rehearsal (§3) — both worth doing before this is treated as a fully rehearsed recovery path, not just a valid file.
- **Stored:** `~/ordift-backups/` on the operator's Mac, outside the git repository, with `backup-log.txt` in the same folder per §2.4's logging guidance above. Not yet moved to a separate cloud storage location with independent access control — recommended as the next hardening step per §2.4.
- **A troubleshooting note for future backups:** the first attempt produced a silent 0-byte file because the database password contained special characters that broke the connection URI's parsing. The working fix — percent-encoding the password via a `read -s` prompt piped through `urllib.parse.quote` rather than typing it directly into the command — avoids both the parsing failure and leaving the password in shell history; worth reusing verbatim for the next backup unless the password changes.

## 3. Database Restoration Procedure

**If a manual `pg_dump` backup exists (the expected case, per the §2 schedule):**
1. Create a fresh Supabase project (or use an existing empty one) — same region (Central EU / Frankfurt) to keep latency characteristics consistent.
2. `pg_restore --no-owner --no-privileges -d "postgresql://..." ordift-production-YYYYMMDD.dump`
3. Re-run any migrations newer than the dump's date in order (check `supabase/migrations/` filenames against the dump's date — the dump only captures schema/data as of when it was taken, so a migration applied after that date won't be in it).
4. **Verify the restore before treating it as done** — see §3.1 below.
5. Proceed to §7 (full post-recovery validation).

**If no backup exists or the most recent one is unusably old (should not happen if §2's schedule is followed — treat this branch as the failure case, not the plan):**
1. Schema-only recovery is still possible: run every file in `supabase/migrations/` in order, all the way through the highest-numbered one present, against a fresh project via `supabase db push` or the SQL Editor. (Deliberately phrased without a hardcoded endpoint number — the same staleness problem flagged in §4 for the Storage bucket applies here too, since Production's actual migration level moves independently of when this document was last read. Cross-check the true current count for whichever environment you're recovering via `supabase migration list` rather than trusting a number written down here.)
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

**Not applicable to Production today** — confirmed accurate as of this 2026-08-10 review: no Supabase Storage buckets exist on the Production project. All media is served by Sanity (a separate CDN-backed system with its own dataset versioning, outside this document's scope).

**This is about to change, and it's not the speculative "future feature" this section originally anticipated.** Migration `0024` (Payments) — already built, verified on staging, and next in `PAYSTACK_PRODUCTION_HANDOVER.md`'s promotion queue — creates a real, private `payment-proofs` bucket (bank-transfer proof-of-payment uploads, up to 8MB each, image/PDF). **Storage buckets are not captured by `pg_dump` at all** — the backup procedure in §2 only covers `public.*` tables. The moment `0024` reaches Production, this document's backup coverage has a real gap the day it opens, not a hypothetical one: uploaded proof-of-payment files would have zero backup coverage under the current §2 strategy.

**Decision (2026-08-10): APPROVED — Option A now, automatic transition to Option B at `0024` promotion.** Until migration `0024` is actually promoted to Production, the `payment-proofs` bucket doesn't exist there and there is nothing to back up — the risk is explicitly accepted for this interim period on the reasoning that financial correctness never depends on the proof file itself (every amount, reference, submission, and review fact lives in the `payments` row; the file is dispute-resolution evidence, re-requestable from the client if ever lost).

**The moment `0024` is promoted, Option B becomes mandatory, not optional:** a `supabase storage` object listing/download step for the `payment-proofs` bucket must be added to the §2.1 backup routine, performed in the **same operational sitting** as the fresh post-promotion database backup §7a of `PRODUCTION_READINESS_RECONCILIATION.md` already requires — one combined backup event (database dump + Storage export, back to back, same session), not two separately-scheduled ones. See `PRODUCTION_READINESS_RECONCILIATION.md`'s pre-migration execution brief for the exact combined procedure.

**Option C (automated sync to separate cloud storage, e.g. R2) is explicitly deferred, not adopted at this stage** — recorded as a future option to revisit only if transaction volume, audit/dispute frequency, or the operational burden of manual exports materially increases. Not pre-built speculatively.

## 5. Environment Variable Recovery

- **Source of truth:** Vercel Project Settings → Environment Variables, per environment (Production/Preview/Development).
- **Critical gap:** variables flagged **"Sensitive"** in Vercel are write-only by design — once set, `vercel env pull`, the dashboard, and the API can never read the value back (this was the root cause of an extended RESEND_API_KEY debugging session earlier in this project — see `MILESTONES.md`). **If a Sensitive variable's real value is lost, it must be regenerated at the source** (e.g., a new Resend API key, a new Supabase secret key) — there is no recovery path for the old value.
- **Recommendation:** maintain your own secure, encrypted copy (password manager, not a plaintext file) of every Sensitive-flagged production value at the moment it's set, specifically because Vercel cannot ever show it to you again.
- **Non-Sensitive variables** (most of them) remain readable via `vercel env pull` or the dashboard at any time — no special recovery action needed for those.
- **Full current variable list:** `.env.example` documents every variable this app uses and why; use it as the checklist when rebuilding an environment from scratch.
- **Blast-radius reference (added 2026-08-10):** `WORKSTREAM_I_SECURITY_REREVIEW.md` §6 catalogs every distinct credential this app depends on — env var name, referencing file(s), and blast radius if leaked — built during the security re-review for exactly this kind of recovery-prioritization use. The single highest-stakes one to protect a password-manager copy of: `PAYSTACK_SECRET_KEY` (full Paystack API access including refunds, and the same key that signs/verifies webhooks) — it's also, per that same review, currently missing a documented example in `.env.example` history prior to this session, so double-check a real password-manager copy actually exists for it, not just an assumption that it does.

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

- [ ] Production PostgREST introspection (`GET /rest/v1/`) enumerates all expected tables — compare against `supabase/migrations/*.sql`'s actual `create table public.*` statements for whatever the current migration level is (not a hardcoded count here — see §3's note on why a written-down number goes stale independently of this document).
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

**2026-08-10 stress-test note, resolved:** this review checked whether trigger #1 might already have silently fired without the Pro upgrade following it — the exact failure mode this section warns against. Initial CLI checks (`vercel env ls production`) were inconclusive: the variable is Sensitive-flagged, so both the CLI and the Vercel dashboard's own Edit panel show it blank regardless of its real value — confirmed directly by the account owner checking the dashboard (2026-08-10), same ambiguity as this session's Sentry DSN investigation. **Resolved instead via existing session-history documentation, not a live read:** `MILESTONES.md`'s "`FORMS_SENDING_ENABLED` turned on in production — 2026-07-30" entry gives a detailed, first-hand account — your written approval, a specific deployment (`dpl_DXkWvce6RrxrdAQBVfZUzX7MAkwC`, `READY`), and real verification evidence (7 real Resend sends via the `verify-send` diagnostic, a real write/read-back/cleanup against the live Google Sheet via `verify-write`) — independently corroborated by `FINAL_LAUNCH_CERTIFICATION.md`'s same deployment ID, with `PRODUCTION_HARDENING_REPORT.md` confirming the variable was still unset immediately beforehand. No document anywhere records it being turned off since. **Conclusion: trigger #1 very likely fired 2026-07-30 and the Supabase Pro-plan upgrade decision is likely overdue.** The one contradicting signal — the project task list's "Milestone 0.3: Enable production form delivery" still showing pending — is judged the stale outlier, consistent with the same task-list staleness pattern already found and corrected elsewhere this session (Workstreams C, H, I). This is documentary evidence of a past verified state, not a live re-check of today's value — treat with that caveat, but act on it rather than continue treating the trigger as unfired.

**Decision (2026-08-10): APPROVED — upgrade to Pro before launch, base tier only.** The Production Supabase project will be upgraded from Free to Pro's base tier ($25/month) immediately before the Production migration/go-live sequence (bundled with the fresh backup §7a of `PRODUCTION_READINESS_RECONCILIATION.md` already calls for at that same moment) — not upgraded today, not deferred past that point. **The PITR add-on ($100/month on top of Pro) is explicitly not being enabled at this stage** — the base Pro tier's automated backups already close the specific gap this trigger names (no automated backup coverage on Free); PITR is a separate future decision, not bundled into this one. Full reasoning: `PRODUCTION_READINESS_RECONCILIATION.md`'s decision brief for Action #1.

**Executed (2026-08-10): upgrade completed.** The account owner confirmed via the Supabase organization dashboard that the Production project now shows "PRO — Current plan." This closes TD-008's core gap (automated backup coverage). PITR remains off, as decided. A read-only post-upgrade preflight (CLI linkage check, `migration list` reconciliation, `db push --dry-run --include-all` preview) followed and is recorded in `PRODUCTION_READINESS_RECONCILIATION.md` §10.4 — no restore rehearsal has been performed yet, which remains the next open item in this document's §9/§7a sequencing.
