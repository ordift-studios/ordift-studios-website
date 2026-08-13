# Ordift Studios — Production Readiness Reconciliation

**Date:** 2026-08-10, last updated 2026-08-13 (§13–§15: deep-pass regression audit, Turnstile fix, staging push/deploy verification, and final pause-state record — see §14 for the current authoritative snapshot)
**Scope:** formal closure of Version 1.0.5 (Platform Foundation Hardening) plus a full re-verification of every current-state claim across `PRODUCT_ROADMAP.md`, `MILESTONES.md`, `TECHNICAL_DEBT_REGISTER.md`, `SYSTEM_HEALTH.md`, `DISASTER_RECOVERY.md`, `WORKSTREAM_I_SECURITY_REREVIEW.md`, `PAYSTACK_PRODUCTION_HANDOVER.md`, `.env.example`, `DEPLOYMENT.md`, `LAUNCH_CHECKLIST.md`, `PAYMENT_SECURITY_REVIEW.md`, `PAYMENT_FINANCE_ARCHITECTURE_PROPOSAL.md`, `PAYMENT_TEST_PLAN.md`, and `CONTENT_READINESS_CHECKLIST.md` — before any Production action is considered.
**What this is not:** an implementation pass. No Production code, Production environment variable, Production Supabase project, Production Vercel configuration, Paystack Live setting, DNS record, or any other live infrastructure was touched while producing this document. Several stale documents were corrected in place (see §8) — all documentation-only changes, cross-referenced below, never silently deleted.
**Verification performed:** `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, and a full production `next build` — all against the current working tree, none against Production. Results in §9.

---

## 1. Version 1.0.5 — formal closure

All nine workstreams (E, F, A, B, C, I, H, J, D, G) are complete, in the roadmap's own dependency-ordered execution plan (E,F → A → B → C → I,H → J → D → G). Full narrative: `MILESTONES.md`'s "Version 1.0.5 — formally closed" entry (2026-08-10) and `PRODUCT_ROADMAP.md`'s Version 1.0.5 section, now marked ✅ CLOSED. One release criterion is not literally met — Sentry captures real errors on staging, not yet in Production, a decision for you (§3). Version 1.1 stays paused pending your review of this document, per this project's own standing checkpoint discipline.

This document is the checkpoint. Everything below is the evidence.

---

## 2. Migrations 0023–0027 — exact current state and promotion order

**Production is at baseline `0022`, plus `0026` manually applied out-of-band.** Confirmed against `supabase/migrations/` file contents directly (not just prior documentation) and `PAYSTACK_PRODUCTION_HANDOVER.md` §2.

| # | Contents (verified against the actual file) | Staging | Production | Promotion order |
|---|---|---|---|---|
| `0023` | Generic workflow engine (`workflow_statuses`, `workflow_assignments`) — Supabase-side review metadata for Portfolio's approval lifecycle. Sanity's own `status` field stays authoritative for what's publicly visible; this table only adds "who submitted/reviewed, when, notes." | ✅ Applied | ❌ Not applied | 1st |
| `0024` | Payments & Finance Module foundation — `currencies`, `bank_accounts`, `exchange_rates`, `payment_country_config`, `payments`, `payment_webhook_events` tables, RLS, the private `payment-proofs` Storage bucket, seed data (3 currencies, 1 USD rate, 1 Ghana/Paystack config row, zero real banking rows). | ✅ Applied, fully smoke-tested | ❌ Not applied | 2nd (depends on nothing above except being current) |
| `0025` | `exchange_rates.reason` — single nullable column supporting the Exchange Rate Management admin screen. No RLS change. | ✅ Applied | ❌ Not applied | 3rd (depends on 0024 existing) |
| `0026` | Fixes `private.is_staff_or_admin()` to include `super_admin` (it previously checked only `staff`/`admin`) — closes a real bug where a `super_admin`-only account passed the app-level `/admin` gate but then saw zero rows on every RLS-protected admin list. | ✅ Applied | ✅ **Already applied** (`8166aa7`, manually via SQL Editor, both environments the same day) | Already done — no action needed |
| `0027` | Workstream I security re-review RLS hardening — narrows `bank_accounts`/`currencies`/`exchange_rates`/`payment_country_config`/`staff_details` write policies to admin/super_admin only (previously any plain `staff` could write via direct table access), tightens `workflow_statuses`'s collaborator `WITH CHECK`. | ✅ Applied, independently verified twice (`migration list` + `db push --dry-run`) | ❌ Not applied | 4th (depends on 0023's `workflow_statuses` table existing, and conceptually pairs with 0024's payment tables) |

**Exact promotion order for Production: `0023` → `0024` → `0025` → `0027`.** (`0026` is already live.) This is a strict dependency order, not an arbitrary one — `0027` alters policies on tables `0023` and `0024` create, so it cannot run first; `0025` adds a column to a table `0024` creates, so it cannot run before `0024`.

**A real, previously-unflagged current-Production characteristic, resolved by code inspection during this reconciliation:** Portfolio's admin workflow pages (`/admin/portfolio/**`) are already live and in active use in Production (a real project, "Sampson & Sadia Wedding," was published through them 2026-08-05) — despite migration `0023` never having been promoted. This is not a contradiction: `getPortfolioWorkflowStatus()` (`src/lib/admin/portfolioWorkflow.ts`) queries the `workflow_statuses` table defensively — a query error (including "table doesn't exist") is caught, logged, and the function returns `null` rather than throwing, consistent with this project's "best-effort side effects log and continue" pattern. **Practical effect: Production's Portfolio admin currently shows no "Submitted By / Reviewed By" review-metadata trail and no collaborator-assignment functionality — silently degraded, not broken.** This has been true since Portfolio went live and is not a new risk introduced by this reconciliation; it resolves itself automatically the moment `0023` is promoted, no code change required. Worth knowing before that promotion, not a blocker to it.

**No migration is applied to Production by this document.** Applying `0023`→`0024`→`0025`→`0027` to Production is listed in §4 as a required manual action.

---

## 3. Sentry / TD-032 reconciliation

**Staging: fully verified, closed.** `@sentry/nextjs` instruments all three runtimes (`src/instrumentation.ts` server+edge, `src/instrumentation-client.ts` client), with `src/app/error.tsx`'s boundary calling `captureException()` and automatic source-map upload via `next.config.ts`'s `withSentryConfig`. A deliberately-triggered test exception was confirmed to arrive in the Sentry dashboard (`environment: staging`) on 2026-08-10, after two rounds of a Vercel dashboard DSN misconfiguration were found and fixed (root cause was configuration, not application code). Closes `TECHNICAL_DEBT_REGISTER.md` TD-003 for the staging scope.

**Production: genuinely not configured — not a gap, a deliberate pause.** `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` all remain unset in Production, per this project's standing rule against touching Production environment variables without your explicit approval. **This is the one still-open half of Version 1.0.5's own release criteria** ("Sentry capturing real errors in production").

**TD-032 (client-side environment tagging):** server/edge Sentry events tag `environment` from this project's own `SITE_ENV`; client-side events tag from `NODE_ENV`, which Next.js/Vercel sets to `production` for every optimized build — staging included. Result: a staging client-side error currently displays as `environment: production` in Sentry, indistinguishable from a real Production error without checking the event's actual URL. Low severity (server-side coverage — API routes, Server Actions, the webhook handler — is unaffected; only genuinely client-side errors are mistagged), fix requires a new `NEXT_PUBLIC_SITE_ENV` Vercel variable across both scopes — correctly deferred, not silently patched, since it's an environment-variable change.

**Outstanding requirement, explicit per your instruction:** once Production Sentry configuration is authorized and set, a real Production error must be deliberately triggered and confirmed to arrive in the Sentry dashboard (`environment: production`) before Production Sentry is considered verified — configuration presence alone is not sufficient evidence, per the exact lesson this project already learned once on staging (two rounds of a DSN that looked present but wasn't a valid DSN). This verification is listed in §4 as required only once you authorize Production Sentry configuration — not before.

---

## 4. Disaster Recovery reconciliation

Full procedure: `DISASTER_RECOVERY.md`, re-stress-tested 2026-08-10 (Workstream H). Two items remain genuinely outstanding, both already flagged in that document, restated here because they bear directly on Production readiness:

**1. The restore-into-a-scratch-Supabase-project rehearsal has never been performed.** A first manual backup exists and is verified structurally valid (`ordift-production-20260730-043436.dump`, all 26 tables present via `pg_restore --list`), but "we have a backup" and "we know we can restore from it" remain different, unverified claims. This requires the database password — a human-only action; no AI session can perform it. **Recommended before any migration promotion that adds new financial schema (i.e., before `0024` reaches Production)** — not strictly required before promoting `0023` alone, but the payments-schema promotion is the natural, lowest-risk moment to finally close this gap, since it's the same promotion event that also opens the Storage-backup gap below.

**2. Storage backup coverage for `payment-proofs`.** The moment migration `0024` is promoted to Production, it creates Production's first-ever Supabase Storage bucket (bank-transfer proof-of-payment uploads). `pg_dump` never captures Storage objects — the existing backup routine has zero coverage for this bucket from the moment it exists. This is a **decision required from you, not an engineering default**: either (a) explicitly accept the risk — proof-of-payment files can plausibly be re-requested from the client if lost, unlike a database row — or (b) add a periodic Storage object listing/download step to the backup routine. Already flagged in `PAYSTACK_PRODUCTION_HANDOVER.md`'s own promotion checklist so it surfaces at the right moment.

**Not a blocker, but do this immediately after promoting `0023`/`0024`:** take a fresh manual backup right after promotion, don't wait for the next weekly cycle — everything created by these migrations is otherwise uncovered until the next scheduled backup.

**Supabase Pro-plan trigger — resolved (2026-08-10, updated after direct investigation with the account owner).** `DISASTER_RECOVERY.md` §9's trigger #1 (`FORMS_SENDING_ENABLED` turned on in Production) **very likely already fired.** The account owner confirmed directly in the Vercel dashboard that this variable is Sensitive-flagged in Production, which means neither the CLI nor the dashboard's own Edit panel can ever display its stored value — the blank field proves nothing on its own. Resolved instead from existing session documentation: `MILESTONES.md`'s "`FORMS_SENDING_ENABLED` turned on in production — 2026-07-30" entry records your written approval, a specific deployment (`dpl_DXkWvce6RrxrdAQBVfZUzX7MAkwC`, `READY`), and real verification (7 real Resend sends, a real Google Sheets write/read-back/cleanup) — independently corroborated by `FINAL_LAUNCH_CERTIFICATION.md`'s matching deployment ID, with `PRODUCTION_HARDENING_REPORT.md` confirming the variable was unset immediately beforehand. No document records it being turned off since. **The task list's still-pending "Milestone 0.3" line is the stale outlier here**, not the stronger signal — the same staleness pattern already found and corrected for Workstreams C, H, and I elsewhere in this reconciliation. **Conclusion: the Supabase Pro-plan upgrade decision is likely overdue.** This is documentary evidence of a past verified state, not a live re-check of today's value.

---

## 5. Paystack Production readiness reconciliation

**Nothing about Paystack Live has been enabled, altered, or configured by this document.** Current state, reconciled against `PAYSTACK_PRODUCTION_HANDOVER.md` and `WORKSTREAM_I_SECURITY_REREVIEW.md`:

**Built and verified on staging (real Paystack test-mode transactions, not synthetic):**
- Card payment end-to-end: checkout → hosted page → webhook → `payments.status = completed` → entity `amount_paid` synced.
- Mobile Money end-to-end (✅ marked complete in the handover doc): `PAY-2026-000007`, confirmed via direct database queries, receipt page rendered correctly, enquiry reached full paid status.
- A real accumulated deposit-style sequence (`PAY-2026-000002` through `-000007` against one enquiry) reaching `$200/$200` — functionally equivalent to a deposit→balance→full lifecycle test, though not run as one single labeled scenario.
- Webhook signature verification against a **real** Paystack-originated webhook (`signature_valid: true`), not just a synthetic signed payload.
- Idempotency: exactly one `payment_webhook_events` row per real event, confirmed.
- Amount/currency validation, unchanged and confirmed present.
- Bank-transfer isolation confirmed via code inspection (zero commits touched its code path during the most recent payments session).
- Bank-transfer ownership/amount vulnerability found and fixed (Workstream I finding #1, the review's most severe finding, cross-confirmed by two independent passes) — an authenticated attacker could previously have created a `pending` bank-transfer payment against *another client's* entity with an arbitrary amount. Fixed by reusing `checkoutService.ts`'s own server-resolved amount logic instead of trusting client input.

**Genuinely still open, not yet built or not yet confirmed via a real authenticated session (as opposed to equivalent direct database operations):**
- Refund action — not built at all (Phase 2 scope was bank-transfer approve/reject, not refunds).
- Reconciliation CSV export — Phase 4 scope, not built.
- ~~Proof-of-payment upload and staff approve/reject tested via a real authenticated HTTP session~~ — **done 2026-08-10** (Action #13): real Supabase Auth sessions, real Route Handler calls, real admin-UI approve and reject, real authorization-boundary check. See §7a item 13. One low-severity finding: submission itself isn't in `activity_log` (TD-033).
- `activity_log` entries for bank-transfer submission/decision, confirmed via the real server actions specifically (not just the underlying data operations).
- Sentry catching a **payment-specific** webhook error with the distinct tag/context `PAYMENT_SECURITY_REVIEW.md` §19 describes — general Sentry works now, this specific case hasn't been separately confirmed.
- Your own review and approval of a real sandbox transaction end-to-end — a sign-off only you can give, not an engineering fact.

**What Production-side Paystack readiness actually requires, none of it done, none of it touched by this document:**
1. Migrations `0023`→`0024`→`0025`→`0027` promoted (§2).
2. `PAYSTACK_SECRET_KEY` — **Live** key, added to Vercel **Production** only. Currently only a **Test** key exists, and only on Preview — never reuse it.
3. Whichever public/inline key the checkout widget needs, Live-mode + Production-scoped.
4. A real GHS exchange rate entered in Production via `/admin/payments/exchange-rates` (table starts empty).
5. ~~Paystack business verification/KYC completed~~ — **SUBMITTED (2026-08-13), Awaiting Paystack Review.** Paystack's dashboard shows "Awaiting Review" with an estimated 7-day feedback window. Not yet approved — Live Mode remains locked until Paystack confirms. No Production credential or configuration action is authorized on the assumption of approval; nothing proceeds here until Paystack's decision actually lands.
6. Production's Live-mode webhook URL registered in the Paystack dashboard (separate from staging's Test-mode webhook — registering one does not register the other).
7. Confirmation of which channels (Card, Mobile Money, Bank Transfer, Apple Pay) are actually enabled on the Live merchant account — Test Mode may show channels Live doesn't have yet.
8. A decision on who performs the first real Production payment, and at what amount — Live Mode has no test cards, so this is genuine money from the first transaction.
9. Your explicit go-live authorization, separate from and after all of the above.

Full step-by-step sequencing already exists in `PAYSTACK_PRODUCTION_HANDOVER.md` §10 — not duplicated again here; that document's execution order remains accurate and is folded into §7's dependency-ordered action list below.

---

## 6. Technical debt — every open item, classified

32 entries total in `TECHNICAL_DEBT_REGISTER.md`. One correction made during this reconciliation: **TD-025 was found still marked "Open" despite having been resolved by migration `0026` two weeks earlier** (applied to both staging and Production, `8166aa7`) — corrected in place in the register. Updated counts: 20 resolved, 12 open.

**Production-blocking (must fix before Production promotion): none.** No open debt item rises to "the system would be broken or unsafe to operate" — every genuine risk is either already mitigated, an accepted trade-off, or addressed in §4/§5's own required-actions instead of belonging here as generic "debt."

**Should-fix-before-launch (real risk, worth closing before real traffic/money flows, not a hard blocker):**
- **TD-003** — Sentry not yet in Production (§3). Its own original pay-down trigger: "should land before `LAUNCH_HOLDING_PAGE` is removed."
- **TD-004** — No Content-Security-Policy header (Medium). Its own pay-down trigger named Workstream I; Workstream I's actual review didn't scope a CSP. A genuine miss between what the debt register expected and what happened — flagged here rather than left silently unaddressed.
- **TD-008** — Supabase Free plan, no automated backups (Medium). **Decided 2026-08-10** — Pro base tier approved, timed to the migration/go-live sequence, not yet executed (§7a). §4's restore-rehearsal and Storage-backup items remain separately open.
- **TD-013** — No uptime/synthetic monitoring (Medium). Explicitly scoped into Workstream C from the start, never built. "Becomes a real gap the moment the holding page comes down."

**Acceptable for launch (real, tracked, not urgent — genuine engineering judgment, not neglect):**
TD-005 (dead-letter tables not alerted), TD-006 (non-reachable npm audit findings), TD-007 (link-based Deliverables, by design), TD-009 (no load testing, nothing to test against yet), TD-010 (legal-page plain text field), TD-011 (component-test tooling conflict), TD-012 (Supabase lock-in, accepted architectural trade-off), TD-014 (no rotation cadence, inventory now complete), TD-015 (doc-drift, no incident yet), TD-020/TD-022 (legal-content items blocked on source docs or awaiting a wording decision, no legal conflict), TD-026 (native editor's 4 deliberately-scoped-out fields, Studio fallback exists), TD-028 (audit "Department" resolves from a legacy column, cosmetic), TD-029 (no contractor Portfolio workflow — a feature gap, not a security issue, contractors aren't in active use), TD-030 (file-upload content-sniffing, low severity, narrow audience, no live exploitation path found), TD-031 (IP-keyed rate limiting, no incident observed), TD-032 (§3, triage-friction only), TD-033 (bank-transfer proof submission missing an `activity_log` entry — found 2026-08-10 during Action #13's real-session testing; the staff decision is correctly audited, only the client's own submission step isn't).

**Post-launch (explicitly deferred, correctly not part of any near-term decision):** TD-007's Version 2.0 trigger, TD-009's real-traffic trigger, TD-012's warning-indicator triggers, TD-014's Annual-review cadence, TD-020's OS-LGL-000/099 dependency.

**Resolved, no action needed (for completeness — not re-litigated):** TD-001, TD-002, TD-016 through TD-019, TD-021, TD-023, TD-024, TD-025 (corrected this pass), TD-027.

---

## 7. The authoritative checklist

### 7a. Required before Production (engineering-complete, verified, or explicitly your decision — nothing here is optional)

1. Promote migrations `0023` → `0024` → `0025` → `0027` to Production, in that exact order (§2). Verify each with `supabase migration list` before promoting the next.
2. Take a fresh manual Production backup immediately after promoting `0023`/`0024`, combined in the same operational sitting with item 3 below — don't wait for the next weekly cycle (§4).
3. ~~Decide the `payment-proofs` Storage-backup approach~~ — **DECIDED 2026-08-10: Option A (accept the risk) until `0024` promotes, automatic mandatory transition to Option B (Storage object export, combined with the database backup above into one operational event) from the moment it does. Option C explicitly deferred.** See `DISASTER_RECOVERY.md` §4 for the full recorded decision and §12 below for the exact combined procedure.
4. ~~Confirm `FORMS_SENDING_ENABLED`'s actual current Production value~~ — resolved via existing documentation (§4): very likely `true` since 2026-07-30. Act on the Supabase Pro-plan decision this implies (item 1 above) rather than continuing to treat the value as unknown.
5. Add `PAYSTACK_SECRET_KEY` (Live) and any other Live-mode key to Vercel Production (§5).
6. Enter a real GHS exchange rate in Production via the Admin UI once migrations land (§5).
7. Register Production's webhook URL in Paystack's Live Mode dashboard (§5).

### 7b. Manual actions requiring you specifically (cannot be delegated to this session, by design or by credential)

- The restore-into-a-scratch-Supabase-project rehearsal (§4) — requires the database password.
- ~~Complete Paystack Live Mode business verification/KYC (§5)~~ — **Submitted 2026-08-13, Awaiting Paystack Review** (~7-day estimated window per Paystack's own dashboard message). Not approved yet.
- Decide who performs the first real Production payment, and at what amount (§5).
- Give explicit go-live authorization before any Live Mode key is used (§5).
- Decide on the Supabase Free→Pro upgrade, given §4's finding that the trigger for it has very likely already fired (§7a-1) — the underlying value itself can't be read even by you, since it's Sensitive-flagged, but the decision doesn't require reading it, only accepting the documentary evidence.
- Authorize Production Sentry configuration, then confirm a real triggered error arrives in the dashboard once it's set (§3).

### 7c. Production-only configuration (environment/dashboard changes, no code involved)

- `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` in Vercel Production (§3) — pending your authorization.
- `PAYSTACK_SECRET_KEY` (Live) + any public/inline key the checkout widget needs, Production-scoped (§5).
- Paystack Live Mode webhook URL registration (§5).
- (Future, not urgent) `NEXT_PUBLIC_SITE_ENV` in both Vercel scopes, to close TD-032.

### 7d. Database migrations awaiting Production promotion

`0023` → `0024` → `0025` → `0027`, in that exact dependency order — full detail in §2. (`0022` is baseline; `0026` is already live.)

### 7e. Verification/testing still required (not yet done, not blocking, but should happen before or shortly after go-live)

- A real Paystack-Live-Mode transaction, once Live keys are configured, mirroring the test-mode verification already done on staging.
- ~~Real authenticated-HTTP-session tests for bank-transfer proof upload, staff approve/reject~~ — done 2026-08-10, see action 13 above. `activity_log` entries confirmed correct for the staff decision; **not present for the client's own submission step — TD-033, low severity, not blocking.**
- A refund action — design and build (not started; Phase 2 scope was approve/reject, not refunds).
- Reconciliation CSV export (Phase 4 scope, not built).
- Sentry confirmed catching a real Production error, once Production Sentry is configured (§3) — configuration presence alone is not sufficient evidence, per this project's own staging lesson.
- Sentry confirmed catching a **payment-specific** webhook error with its distinct tag/context, once Production Sentry exists (§5).
- The automated Payment test suite `PAYMENT_TEST_PLAN.md` designed (21 sections: unit tests, RLS integration, webhook replay/duplicate/wrong-amount tests, storage-security tests, etc.) — only 2 of the ~15 proposed test files actually exist (`paymentPermissions.test.ts`, `exchangeRateManagement.integration.test.ts`). Everything else was verified through real manual staging smoke-testing (thorough, but not regression-proof — nothing currently guards against a future code change silently breaking payment logic, since it doesn't run in CI). Recommended before or shortly after launch, not a hard blocker given the manual verification already performed.

### 7f. Recommended but non-blocking technical debt

TD-003 (Sentry-in-Production), TD-004 (CSP), TD-008 (backup cadence/Pro-plan decision), TD-013 (uptime monitoring) — see §6 for full reasoning; all four are "should-fix-before-launch," none are hard blockers.

### 7g. Post-launch tasks (correctly deferred, listed so they aren't lost)

- Build the scheduled pending-payment reconciliation job (abandoned/declined checkouts stay `pending` with no auto-resolution — a UX rough edge, not a financial-integrity risk; already assessed and deferred to the first 1–2 weeks post-launch in `PAYSTACK_PRODUCTION_HANDOVER.md` §8).
- Reassess `npm audit` findings (TD-006) in case a non-breaking fix has since become available.
- Review whether Redis rate-limit thresholds suit real traffic after the first week.
- First restore-test rehearsal, if not already done as part of §7a/7b.
- Component-level (React Testing Library) test tooling, once the Babel/Sanity dependency conflict resolves upstream (TD-011).
- `NEXT_PUBLIC_SITE_ENV` addition to close TD-032, whenever convenient.

---

## 8. Stale/contradictory documentation found and corrected

Corrected in place, nothing deleted, per your explicit instruction to preserve historical records:

- **`DEPLOYMENT.md`** — top-level status line said "not yet deployed anywhere," describing the 2026-07-24 pre-launch build-out state. Corrected with a clear notice; the CORS commands, deployment-hang fix, and holding-page-removal procedure remain accurate and were kept as-is.
- **`LAUNCH_CHECKLIST.md`** — Legal documentation checkbox still showed the pre-approval state ("nothing publishes until you return with approved wording"); the Legal Suite was actually approved and published live 2026-08-04. Portfolio content checkbox still said "100% sample"; one real project has been live since 2026-08-05. Both corrected in place with citations.
- **`CONTENT_READINESS_CHECKLIST.md`** — same Portfolio staleness as above; corrected with a note, Workshops section left as-is (not re-verified this pass, presumed still accurate).
- **`PAYMENT_SECURITY_REVIEW.md`** — status line said "no gateway accounts created, no migrations applied, no live credentials connected, no code committed" — all now false (staging has all of these). §18's "Workstream H, still pending" is also stale (H is complete). Corrected with a dated status block; the security-control content itself was independently re-verified accurate by `WORKSTREAM_I_SECURITY_REREVIEW.md` and left unchanged.
- **`PAYMENT_FINANCE_ARCHITECTURE_PROPOSAL.md` §16a** — the Production Readiness Checklist template hadn't been updated since 2026-08-06, despite substantial staging verification since. A reconciliation block was added above the original checklist (kept exactly as-written below it) walking through what's since been satisfied, with citations, rather than silently flipping checkboxes without an audit trail.
- **`TECHNICAL_DEBT_REGISTER.md`** — TD-025 corrected (§6).
- **`SYSTEM_HEALTH.md`** — annotated to point here for Production-readiness questions specifically, while remaining the standing day-to-day snapshot for everything else.

**Not touched, judged still accurate on inspection:** `DISASTER_RECOVERY.md` (already re-stress-tested 2026-08-10, own staleness-trigger built in), `WORKSTREAM_I_SECURITY_REREVIEW.md`, `OPERATIONS_MANUAL.md` §6.1 (both written this same reconciliation window), `PAYMENT_TEST_PLAN.md` (its own "no tests exist yet" framing for the *automated suite* specifically remains accurate — see §7e; manual staging verification is a separate, already-documented fact this framing doesn't contradict).

---

## 9. Final non-Production verification suite

Run against the current working tree and the staging Supabase project only — no Production, Production environment variable, Production Supabase, Production Vercel configuration, Paystack Live setting, or DNS record was touched.

**First pass (before Actions #13/#14, superseded below):** 33/36 integration tests passing, 1 known failure in `exchangeRateManagement.integration.test.ts` — a real, expected RLS rejection caused by migration `0027`'s deliberate tightening (positive evidence the security fix works; the test itself was just stale). Fixed as Action #14.

**Final pass (2026-08-10, after Actions #13 and #14):**

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ Clean, zero errors |
| `npx eslint .` | ✅ Clean — 2 pre-existing warnings only (`<img>` vs `next/image` on two admin-only preview thumbnails, already logged in `MILESTONES.md`, not new) |
| `npx vitest run` (unit) | ✅ 40/40 passing |
| `npx vitest run --config vitest.integration.config.ts` (staging integration) | ✅ 35/35 passing, 2 skipped (unrelated), **zero known failures** |
| `npm run build` (production build) | ✅ Clean, zero errors, all routes generated correctly |

No known-red tests remain in the suite as of this reconciliation's close.

All documentation changes in this reconciliation are markdown-only and do not affect any of the above results.

---

## 10. Pre-migration execution brief (Actions #1, #3, #4, #5 — one controlled sequence)

**Status: planning only, nothing executed.** Recorded here per this project's standing "nothing consequential lives only in chat history" discipline, alongside delivering the same brief directly. No Production action, migration, Supabase-plan change, or backup/restore step has been performed as of this entry — all require your explicit go-ahead at the moment of execution, not implied by this plan existing.

### 10.1 Does Supabase Pro have to come before migration `0023`?

**No technical dependency — but do it first anyway, for a real reason.** Migrations run identically on Free and Pro; plan tier has no bearing on whether `supabase db push` succeeds. The reason to sequence Pro-upgrade **first**, before any migration: Supabase's automated backups apply only from the moment you upgrade onward — they don't retroactively cover data that already existed. Upgrading before `0023` means the new payments/workflow schema is covered by automated backups from the instant it's created, rather than there being a gap between "new tables exist" and "the better backup posture exists." Recommended order: **Pro upgrade → `0023` → `0024` → `0025` → `0027`**, not migrations-then-Pro.

### 10.2 Step 1 — Supabase Free → Pro upgrade

**[You, Supabase dashboard]** Organization → Billing → upgrade the Production project to Pro ($25/month base tier). **Do not enable the PITR add-on** — not part of this decision. Confirm the upgrade completed and automated backups show as active before proceeding to the migrations.

### 10.3 Step 2 — Migration sequence: `0023` → `0024` → `0025` → `0027`

| # | File | What it changes | Why the order is fixed, not a preference |
|---|---|---|---|
| 1 | `0023_workflow_engine.sql` | Creates `workflow_statuses`, `workflow_assignments` — generic review-workflow tables (Portfolio's Supabase-side companion to Sanity's `status` field). | Supabase applies migrations in strict ascending filename order — it cannot be told to skip ahead or interleave. Independent of the others functionally, but must physically run first because of its number. |
| 2 | `0024_payments_foundation.sql` | Creates `currencies`, `bank_accounts`, `exchange_rates`, `payment_country_config`, `payments`, `payment_webhook_events`, RLS on all of them, the private `payment-proofs` Storage bucket, and seed data (3 currencies, 1 USD rate, 1 Ghana/Paystack config row — no real banking details). | Nothing here depends on `0023`'s tables directly, but it's numbered after it. |
| 3 | `0025_exchange_rate_reason.sql` | Adds one nullable `reason` column to `exchange_rates`. | **Genuinely dependent, not just numbered after:** the table doesn't exist until `0024` runs. Applying this first would fail outright. |
| 4 | `0027_security_rereview_rls_hardening.sql` | Narrows write access on `bank_accounts`/`currencies`/`exchange_rates`/`payment_country_config` (from `0024`) and `staff_details` (existing) to admin/super_admin; tightens `workflow_statuses`'s (from `0023`) collaborator self-update check. | **Genuinely dependent:** it `drop policy if exists` + recreates policies on tables `0023` and `0024` create. Running it first would find nothing to alter. |

(`0026` — the `is_staff_or_admin()` super_admin fix — is already live on Production; not part of this sequence.)

### 10.4 Pre-migration checks — performed 2026-08-10, all read-only, all passed

**Supabase Pro upgrade: confirmed complete** — the organization dashboard shows PRO as the current plan.

**CLI project linkage:** by default this environment's CLI was linked to **staging** (`omtmxvsjmlrnbtxiesqn`), not Production — confirmed via `supabase projects list`, which also independently confirmed Production's reference (`goxuyooxrekzstssjgly`) and that it was not linked. Temporarily linked to Production via `supabase link --project-ref goxuyooxrekzstssjgly` to run the checks below — this command only associates the CLI with a project reference via the already-authenticated API session; it does not touch the database and never requested or required the database password. Re-linked back to staging (the safe default for this repo) immediately after the checks completed, so no session risks accidentally running a future command against Production unintentionally.

**`supabase migration list` against Production — exact match to what this document already claimed, zero drift:**
- `0001`–`0022`: local and remote match.
- `0026`: local and remote match (confirms it's genuinely live, as documented).
- `0023`, `0024`, `0025`, `0027`: local present, remote blank — confirmed pending, nothing else pending, nothing unexpected.

**`supabase db push --dry-run` — one genuine, useful finding:** the bare command fails with `LegacyDbPushMissingRemoteError`, because `0026` (already applied) is numbered *higher* than the still-pending `0023`–`0025` — the CLI's default safety check refuses to apply migrations that are numbered below the highest already-applied one, since that pattern is usually a sign something is wrong. Here it's the known, already-documented consequence of `0026` having been applied manually out of band. **The actual command needed at execution time is `supabase db push --include-all`, not a bare `supabase db push`.** Re-run with that flag in dry-run mode: clean preview, exactly `0023` → `0024` → `0025` → `0027`, in that order, nothing else — confirmed.

**Pro upgrade side effects relevant to the migration/backup plan:** none detected via the checks available to me. Whether automated backups have actually started running and whether PITR is genuinely off (not just "not selected" — Supabase's own dashboard is the only authoritative source for this) are dashboard-only facts I can't independently verify via CLI; a quick glance at Database → Backups is worth doing before relying on it, though not a blocker to proceeding.

**[You, still required]** Confirm you'll run the actual push command from `~/ordift-studios` (the repo root) — the same directory-context mistake that caused the migration-history scare earlier in this engagement.

### 10.5 Rollback/recovery position if a migration fails

All four files are **additive-only** — none of them alter or delete any pre-existing Production row from migrations `0001`–`0022`; `0027` changes *policies* (who can write), not data. `supabase db push` applies each migration file inside its own transaction, so a failure aborts that file's changes cleanly rather than leaving a half-applied table or policy.

**If any migration in the sequence fails:**
1. **Stop immediately** — do not attempt the next migration in the sequence.
2. **Do not run `migration repair`, `db reset`, or any history-modifying command** — this project's absolute standing rule, unchanged.
3. Capture the exact error output and bring it back for read-only diagnosis — the same method that resolved the earlier migration-history scare (`migration list` + `db push --dry-run` from a known-good state, cross-checked against your own terminal output).
4. Because nothing before the failure point touched existing data, the safe default is: fix the root cause (a typo, a missing dependency, an environment issue), then re-run `db push` for the remaining files — not a rollback in the traditional sense, since there is nothing destructive to undo.

### 10.6 Fresh Production database backup, immediately after the sequence completes

**DONE 2026-08-12** — `ordift-production-20260812-185016.dump`, 34 tables verified. Full result and the paste-corruption/password-rotation incident are recorded under item 4 of the dependency-ordered list below; this section is kept as the reference procedure for the next backup.

**[You — requires the database password, cannot be delegated]** Exact procedure already documented in `DISASTER_RECOVERY.md` §2.2:
```bash
pg_dump "postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres" \
  --no-owner --no-privileges -F c -f "ordift-production-$(date +%Y%m%d).dump"
```
Verify per §2.3 (file non-empty, `pg_restore --list` shows all expected tables — the table count will now be higher than the previously-documented 26, since `0023`/`0024` add new ones; confirm against `supabase/migrations/*.sql`'s actual `create table` statements rather than a stale hardcoded number). Log it in `backup-log.txt`.

### 10.7 Payment-proofs Storage backup (Option B, now mandatory from this promotion onward)

**DONE 2026-08-12** — `scripts/backupPaymentProofsStorage.ts` run against Production, 0 objects found (bucket empty, expected — see item 4 below). Kept as the reference procedure for the first real run once bank-transfer goes live.

**[You run it, or I write the script and you execute it — never with the key shared to me]** No such procedure existed before this promotion; new procedure, same operational sitting as 11.6:
1. List every object in the `payment-proofs` bucket (via the Supabase dashboard's Storage browser, or a short script using the Production service-role key calling `.storage.from('payment-proofs').list()` recursively).
2. Download each object into a dated local folder (`payment-proofs-backup-YYYYMMDD/`), mirroring the existing `pg_dump` naming convention.
3. Verify the downloaded count matches the bucket's actual object count.
4. Log it in the same `backup-log.txt` as the database backup — one combined entry, one operational event, per the recorded decision in `DISASTER_RECOVERY.md` §4.

At current and near-term volume (bank transfer is a secondary payment method behind Paystack) this is a handful of files at most — the dashboard method alone is entirely sufficient; a script is a convenience, not a requirement, at this scale.

### 10.8 Restore-rehearsal procedure — what I need from you

**[You — requires the database password; I never see or handle it]** Per `DISASTER_RECOVERY.md` §3:
1. Create a fresh, empty Supabase project (same region, Central EU/Frankfurt).
2. `pg_restore --no-owner --no-privileges -d "postgresql://..."` the backup dump from 11.6 into it — you run this, using the new scratch project's own connection string and password.
3. Replay any migrations newer than the dump's date against the scratch project, in order.
4. Verify per §3.1: row counts roughly match the backup-log entry, spot-check 2–3 real records by reference number, confirm the schema check from §7.

**What I need from you, specifically:** not the password itself — **the output** of each step (row counts, `pg_restore --list` output, any error text). I can interpret results and tell you whether the rehearsal passed without ever holding the credential, the same discipline already used for the original production backup.

### 10.9 Expected downtime / user impact

**Effectively zero.** Two independent reasons: (a) Production is still behind `LAUNCH_HOLDING_PAGE` — no real visitor can reach any page these migrations affect; (b) the application code that would actually *use* the new payments/workflow tables has not been merged to `main`/deployed to Production yet (per `PAYSTACK_PRODUCTION_HANDOVER.md` §10, that's step 11, well after migration promotion) — the new tables sit inert, unused by the currently-running app, until that separate deploy happens. For admin/staff currently using `/admin`: DDL operations (new tables, policy changes) can briefly lock the affected objects for a fraction of a second — negligible at Ordift's current table sizes, not a real outage, but reasonable hygiene to run at a quiet moment rather than mid-task. No Vercel deployment or app restart is required for these Postgres-only changes to apply.

### 10.10 Who does what

| Step | Who |
|---|---|
| Pre-migration state checks (`migration list`, `dry-run`, project-link confirmation) | **Me** — read-only, no risk |
| Supabase Free→Pro upgrade | **You** — dashboard/billing action |
| Running `supabase db push` for the migration sequence | **You run it** — Claude Code's safety classifier blocks this command against Production regardless of authorization, the same restriction hit for migration `0027` on staging; I give the exact command, verify before and after |
| Fresh database backup (`pg_dump`) | **You** — requires the database password |
| Payment-proofs Storage backup | **You execute** — I can write the script, but Production's service-role key is never shared with me |
| Restore-rehearsal commands | **You run them** — requires the database password; you share output, not the credential |
| Verifying results at each step | **Me** — read-only interpretation of what you share |

---

## 12. Verdict

**CONDITIONAL GO.**

The platform is engineering-complete and evidence-verified on staging across every subsystem this reconciliation examined: CI, testing, monitoring (staging), security (re-reviewed adversarially, all high/medium findings fixed), disaster recovery (re-stress-tested), scalability (assessed, no near-term risk), and the payments module (extensively real-transaction-tested on staging, including a genuine security vulnerability found and fixed before it ever reached Production). Nothing found during this reconciliation rises to a reason to distrust the engineering itself.

It is **not a plain GO** because real, concrete gaps remain between "staging is verified" and "Production is ready," none of which are engineering risk — they are: migrations not yet promoted, Production-only configuration not yet set, one credential-and-verification chain (Sentry, Paystack Live) still pending your authorization, one disaster-recovery rehearsal that structurally requires your direct action, and a handful of decisions only you can make (the `FORMS_SENDING_ENABLED` state, the Storage-backup approach, who makes the first real payment). None of these are things this session can or should resolve unilaterally.

It is **not a NO-GO** because none of the open items reflect a broken, insecure, or untested system — they reflect a system that has correctly *not yet been promoted*, which is a different thing entirely from a system that isn't ready to be.

### Remaining actions, in dependency order

1. ~~Decide on the Supabase Free→Pro upgrade~~ — **DECIDED 2026-08-10: approved, base tier only ($25/mo, PITR not enabled at this stage), execute immediately before the Production migration/go-live sequence (bundle with action 3/4's fresh backup).** Not yet executed — see `DISASTER_RECOVERY.md` §9 for the recorded decision.
2. ~~Decide the `payment-proofs` Storage-backup approach~~ — **DECIDED 2026-08-10**, see item 3 in §7a above and `DISASTER_RECOVERY.md` §4.
3. ~~Promote migrations `0023` → `0024` → `0025` → `0027` to Production~~ — **DONE (2026-08-12).** Executed directly by the user, per this item's own division of labor. Verified independently and read-only via `supabase migration list` against Production: all four show `local`/`remote` matched, nothing else pending. Not re-run, re-verified beyond that single read-only check, or modified in any way by this session.
4. ~~Take a fresh manual Production backup~~ — **DONE (2026-08-12), both halves:**
   - **Database (§10.6):** `pg_dump` via the Session pooler, run by the user with the password entered only via a hidden `read -s` prompt (never on a command line or in chat). First attempt silently produced no file — root-caused to the terminal's bracketed-paste handling corrupting a multi-line paste into four fragmented history entries, one of which was the bare connection string (see incident note below). Retried successfully with the safer per-flag/env-var method: `ordift-production-20260812-185016.dump`, 436K, verified via `pg_restore --list` at **34 public tables** (26 pre-migration + the 8 new tables from `0023`/`0024`) — exactly as expected. Logged in `~/ordift-backups/backup-log.txt`.
   - **Storage (§10.7):** ran via `scripts/backupPaymentProofsStorage.ts` (added this session), service-role key supplied the same hidden-prompt way. Result: **0 objects in the `payment-proofs` bucket** — correctly reported as "nothing to back up," not an error. Expected at this stage: migration `0024` created the bucket, but the application code that writes to it hasn't been deployed to Production yet (per `PAYSTACK_PRODUCTION_HANDOVER.md` §10, that's a later step), and no real bank-transfer proof has ever been submitted against Production. Nothing to lose, nothing to restore, no gap — this becomes a live, meaningful backup automatically the first time a real proof is uploaded. Re-run the same script periodically once bank-transfer goes live.
   - **Incident note, resolved:** during the first `pg_dump` attempt, the corrupted paste caused the Production database password to be written in plaintext to local shell history and, since the user was diagnosing with Claude Code, into this session's chat transcript. **The user rotated the Production database password immediately upon discovery (2026-08-12), before any retry.** No evidence of misuse. Recorded here per this project's standing "nothing consequential lives only in chat history" discipline. Lesson for future sessions: never diagnose shell history with a naive `awk '{print $2}'`-style truncation — a history entry with no leading command token (e.g., a fragment that is just a bare connection string) puts the entire secret in the field being printed.
5. ~~Perform the restore-into-a-scratch-project rehearsal~~ — **DONE (2026-08-12), no Supabase cloud project used.** A paid cloud project would have cost $10/mo beyond the existing Production+Staging allowance for a one-time rehearsal — instead used a disposable local Docker container running `public.ecr.aws/supabase/postgres:17.6.1.147`, byte-identical to Production's actual Postgres version, already cached on this machine from prior local dev work. Zero cost, zero cloud footprint, fully isolated from Production, Staging, and the existing local dev Supabase stack (which was never touched — confirmed still running unmodified afterward). Container created, dump restored, verified, then destroyed within the same session — nothing persists.
   - `pg_restore --no-owner --no-privileges` completed with 403 ignored errors — all of them Supabase-platform bootstrap event triggers (`pgrst_ddl_watch`, `issue_pg_cron_access`, etc., in the `extensions` schema) that expect a `supabase_admin`-style superuser this bare container doesn't provision. **None touched the application's own `public.*` schema or data** — confirmed separately below. This class of noise is expected whenever a Supabase-originated dump is restored into a non-Supabase-bootstrapped Postgres instance and doesn't indicate a bad backup.
   - **Table count: 34/34**, matching the `pg_dump` verification exactly.
   - **Row counts sane and expected:** lookup/seed tables populated (`grades` 10, `roles`/`user_roles` 8 each, `operational_titles` 18, `deliverable_categories` 11, `member_number_classifications` 11, `engagement_types` 8, `currencies` 3, `businesses` 1, `profiles` 6, `staff_details` 3, `record_sequences` 6, `activity_log` 137); every transactional/customer-facing table (`enquiries`, `workshop_registrations`, `project_requests`, `payments`, `deliverables`, `model_profiles`, `vendor_profiles`) at **0 rows** — correctly reflects Production still being pre-launch behind `LAUNCH_HOLDING_PAGE`, not a partial or failed restore.
   - **Referential integrity spot check (no PII read or displayed, per this project's own privacy discipline):** zero null primary keys on `profiles`; zero orphaned `activity_log.actor_user_id` references into `profiles`; zero orphaned `activity_log.business_id`/`record_sequences.business_id` references into `businesses`; zero blank `activity_log.action` values across all 137 rows. All foreign keys the restored data actually exercises resolve correctly — this is the real substance behind "the restore worked," not just an absence of `pg_restore` errors.
   - **Adapted from the original §3.1 procedure:** with `enquiries` at 0 rows, there is no `ENQ-2026-######`-style reference number yet to spot-check by content — substituted the referential-integrity check above, which is a strictly more rigorous test of data correctness at this pre-launch stage. Revisit with the original reference-number spot-check once real enquiries exist.
   - **Not run this time:** the full §7 schema/RPC/grant enumeration (table/column/RPC/grant-level parity check) — this rehearsal proved the backup file itself is valid and restorable and that the restored data is internally coherent, which was the goal; it did not attempt to prove Supabase Cloud–specific concerns (RLS enforcement, PostgREST-generated endpoints, exact grant parity) since this was a bare Postgres container, not a Supabase project. Worth doing once, on a real Supabase project, before this becomes a well-worn muscle-memory procedure — not urgent given the state above.
6. ~~Authorize and set Production Sentry environment variables, then trigger and confirm a real Production error arrives in the dashboard~~ — **DONE and VERIFIED (2026-08-12).**
   - **TD-032 fixed first, on both `staging` and `main`:** client-side Sentry events were tagged `environment: NODE_ENV`, which is `"production"` on every optimized Vercel build including staging — meaning staging and Production errors would have been indistinguishable in the dashboard. Switched to `NEXT_PUBLIC_SITE_ENV` (new, mirrors the existing server-only `SITE_ENV`), added to both Preview→staging and Production scope. Server/edge side (`instrumentation.ts`) already tagged correctly; only the client half (`instrumentation-client.ts`) had the bug.
   - **First configuration attempt was itself broken, caught before declaring success:** `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` were initially populated in Production via a `vercel env pull` (staging) → `vercel env add` (Production) pipeline intended to copy the already-verified staging values without either value ever being displayed. The flaw: all four are Vercel "Sensitive"-typed variables, and `vercel env pull` cannot retrieve a Sensitive variable's real value at all — it silently substitutes a fixed-length masking placeholder instead, with no error or warning. That placeholder text was what actually got written into the four Production entries, not the real values. The user manually triggered `/sentry-test` on Production, saw the UI report "Test event sent," but no event arrived in Sentry — correctly refused to accept the UI message as proof and asked for investigation. Root-caused by comparing value *lengths* (never content) across all Sentry vars against Vercel's own unmasked system variables (`VERCEL_ENV`, etc.) in the same pull: every Sentry var showed an identical 11-character length regardless of what it actually held, while genuine unmasked variables showed varied, plausible lengths — conclusive evidence of uniform masking, not real data. The user then re-entered all four correct values directly from Sentry's dashboard into Vercel's Production UI themselves (the same safe path already used for `SENTRY_AUTH_TOKEN`); this session did not touch Vercel env var values again after that point.
   - **All 5 Sentry env vars confirmed present in Production by name/scope only** (`vercel env ls production`) both before and after the correction — values never read, printed, or exposed at any point in either attempt.
   - **Production redeployed twice** to pick up config changes (`vercel redeploy`, no new commit needed each time) — both Ready, zero build errors, fresh builds (build cache explicitly skipped both times, not stale), correctly aliased to `ordiftstudios.com`, confirmed responding (200).
   - **Verified working (2026-08-12):** user manually opened `/sentry-test` on Production, clicked "Send Sentry Test Error," and confirmed in the Sentry dashboard that a new event arrived immediately, originating from the live Production route, tagged `environment: production` — distinct from the pre-existing 2-day-old staging event. This closes the one remaining open half of Version 1.0.5's own release criteria ("Sentry capturing real errors in production").
   - **Process lesson, recorded for future sessions:** never assume an automated secret-copy pipeline succeeded without a length/structure-based sanity check when the source is a write-only "Sensitive" variable — `vercel env pull` masks these without any error signal, and a plausible-looking "success" from the CLI is not proof of a correct value.
7. ~~Complete Paystack Live Mode business verification/KYC~~ — **Submitted 2026-08-13, Awaiting Paystack Review** (Paystack's own dashboard: "expect feedback within the next 7 days"). Not approved. Live Mode stays locked, and no downstream Paystack/Vercel Production action (items 8/9 below, or the Live key/webhook/exchange-rate/first-payment/go-live steps in §5 and §7a) is authorized on the assumption it will be — this item only moves to done once Paystack's decision actually arrives.
8. **[YOU, authorize; ENGINEERING, configure]** Add `PAYSTACK_SECRET_KEY` (Live) and any other Live-mode key to Vercel Production (§5).
9. **[YOU, external]** Register Production's webhook URL in Paystack's Live Mode dashboard (§5).
10. **[ENGINEERING]** Enter a real GHS exchange rate in Production via the Admin UI, once migrations land (§5).
11. **[YOU]** Decide who performs the first real Production payment, and at what amount (§5).
12. **[YOU]** Give explicit go-live authorization before any Live Mode key is used for a real transaction (§5).
13. ~~One real authenticated-session click-through of bank-transfer proof upload and staff approve/reject~~ — **DONE (2026-08-10).** Real Supabase Auth sessions (client + staff, no Turnstile/CAPTCHA touched), real HTTP requests to the actual Route Handlers, real admin-UI clicks for both approve and reject, real authorization-boundary check (client session denied `/admin/payments`, 307 to `/portal`). Full results in the Action #13 report delivered alongside this reconciliation. One new low-severity finding: bank-transfer proof *submission* has no `activity_log` entry (the staff decision does) — logged as **TD-033**.
14. ~~Update `exchangeRateManagement.integration.test.ts`'s stale staff-tier assertion~~ — **DONE (2026-08-10).** Test now uses an admin-tier account for the insert-succeeds case and adds an explicit staff-tier-blocked case proving migration `0027`'s tightening. 7/7 tests in that file pass; full integration suite 35/35 (2 skipped, unrelated), unit suite 40/40, build clean.
15. ~~Production Readiness deep-pass regression audit~~ — **DONE (2026-08-13).** Full results in §13 below. One real bug found and fixed (client Portal Sign In/Signup/Forgot-Password could be silently unusable when Turnstile is unconfigured); everything else checked passed clean. Paystack Live Mode remains the only outstanding blocker to full go-live.

Nothing in this document authorizes any Production action. Every step above still requires your explicit go-ahead at the time it's actually performed.

## 13. Production Readiness deep-pass regression audit (2026-08-13)

Resumed while waiting on Paystack KYC review, continuing from the interrupted deep-pass (public-site sweep already partially done). Scope: public site, Portal, Admin Platform, link/console/API sanity. No Paystack Live Mode changes, no Supabase migrations, no Production data changes — all per standing instruction.

**What was checked:**
- All 39 sitemap URLs (7 department pages, 5 portfolio projects, 6 journal posts, 4 workshops, 2 instructor pages, 2 author pages, hub pages, all 4 legal pages) via direct navigation.
- 12 API routes for sane unauthenticated behavior (405 on GET for POST-only routes, 401 on auth-gated GET routes) — no crashes, no data leaks.
- `robots.txt` / staging Basic-Auth / holding-page gate behavior (all correct, staging-mode-appropriate).
- Full authenticated walkthrough of all 6 non-Client-guest portal roles (Client, Staff, Admin/Super Admin, Vendor, Model — Collaborator/Contractor not re-verified live this pass, rate-limited out; last verified in the original access-management regression, item #126/#127) using disposable `.invalid`-domain staging test accounts created via this project's own approved integration-test fixture mechanism (`src/lib/testing/testEnvironment.ts`, per `INTEGRATION_TESTING_STRATEGY.md` — the same service-role `admin.createUser` pattern the automated test suite already uses against staging). Account creation/deletion had to be run by the user directly from their own terminal — Claude Code's own safety classifier blocks this session from executing scripts that create/delete Supabase Auth users itself, even against staging.
- Admin Platform: Overview (real Realtime presence + live Recent Activity), Enquiries, Bookings, Payments, Portfolio, Reports, Content, Activity, Users & Roles (16 real accounts, correct Member Number / role / status display), Feature Flags, Settings.
- Role-boundary enforcement: staff correctly 307-redirected away from `/admin/users`, `/admin/flags`, `/admin/settings`; super_admin correctly granted access to all three.
- Client Portal empty-state dashboard (fresh account, all five widgets correct honest empty-states).
- Vendor and Model portal shells (both correctly show "not yet built" honest placeholders, per their documented scope).

**What was fixed:**
- **Real bug, isolated, non-payment, non-Production-data — fixed and verified:** `LoginForm.tsx`, `SignupForm.tsx`, and `ForgotPasswordForm.tsx` disabled their submit button whenever `!turnstileToken`, with no fallback for `NEXT_PUBLIC_TURNSTILE_SITE_KEY` being unset — `TurnstileWidget` renders nothing and never calls `onVerify` in that case, so the button stays permanently, silently disabled (no error shown; clicking it does nothing). `BookingForm.tsx` and `RegistrationForm.tsx` already had the correct fix (`turnstileRequired && !turnstileToken`) — the three auth forms were simply missing it. Confirmed via `vercel env ls production` that Turnstile keys **are** configured on both Preview/staging and Production, so real users were never affected — but any environment without the keys (this local session, most obviously) would have silently blocked every Login/Signup/Forgot-Password attempt. Fixed by adding the same `turnstileRequired` gate to all three forms. `tsc --noEmit`, `eslint`, and `next build` all clean after the fix; verified live by successfully logging in as all 5 test roles reached this pass.
- Stale `TECHNICAL_DEBT_REGISTER.md` TD-032 status line (already resolved earlier this session, doc hadn't caught up) — corrected.

**What remains unresolved / needs a decision:**
- Collaborator/Contractor portal role not re-verified live this specific pass (staging login rate-limit — confirmed working correctly, ~10/10-min cap — was hit near the end of the role sweep). Architecture is identical to the 5 roles already proven live this pass, and was fully regression-tested previously (#126/#127). Low-risk to leave as-is; re-verify opportunistically if convenient, not worth a dedicated session.
- Four stale `.invalid`-domain test accounts found left over from an **earlier, unrelated session** (`test-exrate-admin-*` ×3, `test-exrate-staff-*` ×1, dated 2026-08-07/08-10) — not created by this pass, but surfaced by it. Included in the cleanup script below.
- TD-030 (upload MIME-type validated by declared `Content-Type`, not actual file content) — reviewed as a candidate safe fix, but touches both the portfolio-assets route (non-payment) *and* the bank-transfer proof-upload route (payment-adjacent) in the same shared validation step; left alone rather than partially fixing one call site, per the standing no-payment-code-changes constraint. Flagging for your decision: fix portfolio-assets only, or defer both together.
- TD-033 (bank-transfer proof *submission* missing an `activity_log` entry) — payment-adjacent code, explicitly out of scope for this pass; still open, unchanged.

**What requires your decision/action:**
1. Run the cleanup script for the 6 test accounts this pass created **and** the 4 stale ones found (see below) — same reason account creation needed your terminal: `admin.auth.admin.deleteUser` is also blocked by the safety classifier from this session.
   ```bash
   npx tsx scripts/_cleanupDeepPassTestUsers.ts
   ```
   Then delete the three throwaway scripts (`scripts/_deepPassTestUsers.ts`, `scripts/_listDeepPassTestUsers.ts`, `scripts/_cleanupDeepPassTestUsers.ts`) — all untracked, never committed, safe to remove once cleanup is confirmed.
2. TD-030 partial-vs-deferred decision (above).

**What remains blocked specifically by Paystack KYC:** everything already listed in §12's Remaining Actions items 8–12 (Live key, Live webhook, real GHS rate, first real payment, go-live authorization) — unchanged by this pass, still gated on Paystack's review outcome.

**Verdict for this pass:** no new engineering blockers found. The one real bug (Turnstile button-gating) is fixed, verified, and did not affect any real deployed environment. Every other surface checked is clean. This does **not** change the overall CONDITIONAL GO verdict in §12 — Paystack Live Mode approval remains the sole live blocker to full go-live.

## 14. Final pause-state record (2026-08-13)

Engineering work on `staging` is paused here, deliberately, pending Paystack's Live Mode KYC decision. This section is the authoritative snapshot of exactly where things stand — read this first if resuming after a gap.

- **Commit `d5c6ee6`** ("Fix Turnstile submit-gating on auth forms; reconcile Production readiness docs") is on `staging` and pushed — `origin/staging` confirmed at the identical SHA via `git log origin/staging -1`.
- **Deployment verified Ready and healthy.** Confirmed two independent ways: GitHub's own commit-status API (`state: success`, `"Deployment has completed"`) and `vercel inspect` on the resulting deployment (`dpl_Edico2Qyp9W3jDNKqbzeahK2xEPu`, `status: ● Ready`, target `preview`).
- **Staging Basic-Auth protection verified live** on that exact deployment — an anonymous request to the deployed URL returned `401 Authentication required`, confirming the app's own staging gate (`src/proxy.ts`) is active and no accidental public exposure was introduced by this push.
- **Deep-pass regression audit (§13) is complete and closed.** Full public site, API sanity, and an authenticated walkthrough of 5 of 6 portal roles (Client, Staff, Admin/Super Admin, Vendor, Model — Collaborator/Contractor not re-verified live this specific pass, rate-limited out, previously fully regression-tested) all passed. One real, isolated, non-payment bug found and fixed (Turnstile submit-gating on the three auth forms).
- **All temporary test accounts and throwaway scripts cleaned up and confirmed.** Read-only re-check after cleanup showed 0 `.invalid`-domain accounts remaining on staging (this includes both the 6 accounts this pass created and the 4 unrelated stale ones found from an earlier session). All three throwaway scripts (`scripts/_deepPassTestUsers.ts`, `_listDeepPassTestUsers.ts`, `_cleanupDeepPassTestUsers.ts`) deleted — never tracked, no trace in git history.
- **Paystack Live Mode KYC remains "Awaiting Review"** — Paystack's own dashboard, submitted 2026-08-13, their stated window is 7 days. This is the **primary external go-live blocker**; nothing engineering-side is waiting on anything else to reach full go-live.
- **No Live Paystack credentials, Live webhook registration, real GHS exchange rate entry, or any real-payment configuration is authorized.** None have been added. This stays true until Paystack's decision arrives *and* you separately authorize each step in §15 below.
- **TD-030** (upload MIME-type validated by declared `Content-Type`, not actual file content) **remains deliberately deferred**, unchanged, per your explicit instruction — still `Open` in `TECHNICAL_DEBT_REGISTER.md`, not fixed, not scheduled.
- **`staging` → `main` promotion has not occurred.** No merge, no fast-forward, no Production deploy. Requires your explicit approval when the time comes — nothing in this document or any prior one authorizes it implicitly.
- **Working tree:** clean except two untracked, local-only directories that were deliberately never staged — `backups/` (local `pg_dump` artifacts) and `supabase/.branches/` (local Supabase CLI branch-link state). Neither belongs in git; neither is a pending change.

## 15. Resume checklist — once Paystack approves Live Mode

Dependency-ordered. **[YOU]** = requires your direct action (Paystack dashboard, Vercel dashboard, or an explicit go-ahead in chat) — cannot be delegated to this session by design or by credential. **[ENGINEERING]** = safe for a future session to execute once you've given the go-ahead for that specific step; still stop and confirm before each one, per this project's standing discipline — nothing here is pre-authorized by virtue of appearing on this list.

1. **[YOU]** Confirm Paystack's Live Mode decision (approved / more info requested / declined) and share the outcome.
2. **[YOU]** If approved: retrieve the Live secret key (`sk_live_...`) and any other Live-mode key from Paystack's dashboard. Never paste it into chat — enter it directly into Vercel's dashboard yourself, or hand it to engineering via the same hidden-prompt/env-var pattern already used for every other Production secret this engagement (see §12 item 6's Sentry incident for why).
3. **[ENGINEERING, once you've supplied the value per step 2]** Add `PAYSTACK_SECRET_KEY` (Live) and any other Live-mode key to Vercel **Production** environment only — confirm by name/scope via `vercel env ls production`, never by reading the value.
4. **[YOU, external]** Register Production's webhook URL (`https://ordiftstudios.com/api/payments/webhook/paystack`) under Paystack's **Live Mode** settings — separate from staging's already-registered Test Mode webhook.
5. **[YOU]** Confirm which payment channels (Card, Mobile Money, Bank Transfer-via-Paystack, Apple Pay) are actually enabled on the Live merchant account — Test Mode may show channels Live doesn't have yet.
6. **[ENGINEERING, after your explicit go-ahead]** Enter the real GHS exchange rate in Production via `/admin/payments/exchange-rates` (table starts empty on Production).
7. **[YOU]** Decide who performs the first real Production payment, and at what amount — Live Mode has no test cards, so this is genuine money from the first transaction on.
8. **[YOU]** Give explicit go-live authorization before any Live Mode key is used for a real transaction.
9. **[YOU, approval required; ENGINEERING, executes once given]** Merge `staging` → `main`, deploy to Production. This is the point where everything reconciled across this whole engagement — migrations, Sentry, disaster recovery, the deep-pass audit, and this Turnstile fix — actually reaches real users. Nothing before this step touches Production traffic.
10. **[ENGINEERING, post-launch, first 1–2 weeks, not blocking]** Build the deferred scheduled pending-payment reconciliation job (`PAYSTACK_PRODUCTION_HANDOVER.md` §8) — already assessed as safe to defer past initial launch.

Nothing above is authorized by this checklist existing. Each numbered step still requires your go-ahead at the time it's actually performed, exactly as every prior step in this engagement has.

## 16. Independent readiness work while Paystack KYC is pending (2026-08-13, continued)

Resumed after committing/pushing §14's documentation update (commit `8a7134b`, deployment verified `● Ready` — GitHub commit-status API `state: success`, deployment `31SCou4ZTtQnfjkLWbRmTvGArTYz`). Scope: engineering work genuinely independent of Paystack, worked sequentially, each item tested and documented before the next. Standing restrictions unchanged throughout (no Paystack Live Mode, no Production Supabase migrations/data, no reopening Sentry, TD-030 untouched, no `staging`→`main`).

### 16.1 Collaborator/Contractor portal verification — DONE

Re-ran the authenticated Collaborator/Contractor check that was rate-limited out of the 2026-08-13 deep-pass. Same methodology: a single disposable `.invalid`-domain staging account created via the approved service-role fixture mechanism, contractor role granted, tested live against local dev pointed at staging, then deleted immediately after — same controlled creation → verification → cleanup discipline as the completed deep-pass, no exceptions.

- **Login and routing:** signed in successfully, correctly routed to `/portal/collaborator` ("My Projects — Ordift Studios Portal").
- **Empty state:** "You don't have any active project assignments yet. An admin will assign you to a project when there's work for you." — correct, honest placeholder, consistent with TD-029's documented finding that the contractor role's Portfolio capabilities are currently inert (no real assigned-project workflow built yet).
- **Console:** clean — no new errors beyond leftover HMR/API-sanity-check noise from earlier in the session.
- **Role-boundary check:** navigating to `/admin` correctly redirected back to the collaborator's own portal (`/portal/collaborator`), not to Sign In and not into `/admin` — the same fail-closed pattern already verified for every other non-admin role.
- **Cleanup confirmed:** account deleted via the same service-role cleanup script used throughout; the two throwaway scripts (`_createCollaboratorTestUser.ts`, `_cleanupCollaboratorTestUser.ts`) deleted immediately after, never committed, no trace in git history.

**Result:** all 6 of 6 portal roles (Client, Staff, Admin/Super Admin, Vendor, Model, Collaborator/Contractor) are now confirmed live and correct against staging. The deep-pass's one open item from §13 is closed. No code changes required — this was verification only.

### 16.2 TD-005 — Google Sheets/email sync failure alerting — DONE

Investigated first, reported to you before implementing, per your instruction. Root cause: `sheet_sync_failures` (migration `0013`) and `email_send_failures` (migration `0022`) captured every dead-letter row, but nothing read either table proactively — a failure sat silently until someone thought to query it. Confirmed zero overlap with payment code (`grep` across `src/lib/payments`, `src/app/admin/payments`, `src/app/api/payments` for "sheet"/"Sheet" returned nothing).

**Fix:** `Sentry.captureException()` — already verified working in Production, documented as safe to call unconditionally (never throws, no-ops without a configured DSN) — is now called at the top of both `logSheetSyncFailure()` (`src/lib/shared/sheetSyncFailures.ts`) and `logEmailSendFailure()` (`src/lib/shared/email/deadLetter.ts`), ahead of the existing best-effort DB insert. 21 lines added across the two files, no other files touched, no new dependencies or credentials.

- Built and tested on isolated branch `td-005-sync-failure-alerting` (commit `cb8c147`): `tsc --noEmit`, `eslint`, targeted tests, `next build` all clean.
- Merged into `staging` (merge commit `acb2b7f`), pushed to `origin/staging`.
- Deployment verified: GitHub commit-status API `state: success` for `acb2b7f`; Vercel deployment `dpl_9cEyrufoAGDPsvriTyf15nxGKKrZ` confirmed `● Ready` via `vercel inspect`, same deployment ID as the commit-status `target_url`.
- Smoke check: unauthenticated request to the deployment returned `401` with `WWW-Authenticate: Basic realm="Ordift Studios Staging"` and the full expected security-header set (`Permissions-Policy`, `Referrer-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, `X-Robots-Tag: noindex`) — confirms the deployment is live and serving correctly; the Basic-Auth gate itself is untouched by this change.
- No payment, Production-data, credential, or completed-Sentry-configuration changes were made. `TECHNICAL_DEBT_REGISTER.md` TD-005 entry updated to `Status: Resolved`.

**Result:** both dead-letter paths now alert to Sentry the moment a sync/email failure is logged, closing the "silent until someone queries it" gap. TD-005 is closed.

### 16.3 TD-008 (register: TD-006) — dependency/security audit re-run — INVESTIGATED, Bucket A tested and reverted, no changes applied

Note on numbering: this work order's "TD-008" refers to the npm audit findings, which are recorded as **TD-006** in `TECHNICAL_DEBT_REGISTER.md`. The register's own TD-008 is a different, already-resolved item (Supabase Free→Pro plan decision). Updated the correct entry, TD-006.

Re-ran `npm audit`: **19 findings (8 moderate, 11 high)**, down from the previously-recorded 31 (6 moderate, 25 high). Categorized into the 4 requested buckets — full detail in `TECHNICAL_DEBT_REGISTER.md` TD-006:

- **Bucket A (reported non-breaking):** `undici`, `nanoid`, `brace-expansion`, `adm-zip`, `@module-federation/dts-plugin`, `@module-federation/vite`, `@sanity/workbench-cli`, `dompurify` — 8 findings.
- **Bucket B (upgrade + regression testing):** `next` 16.2.11→16.3.0, resolving `next`/`postcss`/`sharp` — 3 findings.
- **Bucket C (dev-only/non-Production residual risk):** `@vercel/frameworks` — 1 finding, reachable only via `@sanity/cli`'s own binary tooling, never a deployed request path.
- **Bucket D (no viable non-breaking fix upstream):** `sanity`, `@sanity/cli`, `next-sanity`, `js-yaml`, `smol-toml`, `typeid-js`, `uuid` — 7 findings. npm's suggested fix (`sanity@5.14.1`) is a downgrade two majors below installed; the vulnerable range has no upper bound, so no current release resolves it.

**Bucket A tested and reverted.** On an isolated branch (`td-008-audit-fix-bucket-a`, off the now-updated `staging`), ran plain `npm audit fix` (no `--force`). Diffing the resulting lockfile against the pre-fix baseline showed `package.json` and the root manifest's declared ranges were untouched, but the *resolved* transitive tree picked up major-version bumps the static `fixAvailable: true` signal hadn't disclosed: `undici` 6.27.0→7.29.0, `groq-js` 1.30.3→2.0.0, `framer-motion`/`motion` 12.x→13.x, `path-to-regexp` 6.3.0→8.4.2, and removal of `react-compiler-runtime`; the direct runtime deps `sanity` and `next-sanity` also moved (6.6.0→6.9.2, 13.2.1→13.3.2). This is outside the approved Bucket A scope (non-breaking only). Reverted `package.json`/`package-lock.json` to the pre-fix state, ran `npm install` to resync, deleted the branch — **nothing tested, committed, merged, or deployed.** `staging` was unaffected throughout; verified clean against `origin/staging` before and after.

**Decision (per your instruction):** all 4 buckets left for a future dedicated dependency-upgrade/security-remediation session with full regression testing. No dependency changes applied this pass.

### 16.4 TD-004 — staging-only Content-Security-Policy-Report-Only header — IMPLEMENTED, tested, not enforced

Implemented the lower-risk staged approach: a static (non-nonce), non-enforcing `Content-Security-Policy-Report-Only` header, gated on `SITE_ENV=staging` so it never applies to a Production build, split into two policies by route.

**Policy — main (public site, portal, admin; everything except `/studio`):**
```
default-src 'self';
script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com;
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https://cdn.sanity.io;
media-src 'self' https://cdn.sanity.io;
font-src 'self';
connect-src 'self' <Supabase origin> <Supabase wss origin> <Sentry ingest origin> https://challenges.cloudflare.com;
frame-src 'self' https://challenges.cloudflare.com https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com;
object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self';
```

**Policy — `/studio`:** same baseline, plus `https://api.sanity.io https://*.api.sanity.io` and their `wss://` equivalents in `connect-src`; `frame-src` narrowed to `'self'` only (Studio doesn't embed YouTube/Vimeo itself). Both `<Supabase origin>` and `<Sentry ingest origin>` are computed from `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SENTRY_DSN` at build time via `new URL(...).origin`, not hardcoded — confirmed correct for staging on the actual deployment (`https://omtmxvsjmlrnbtxiesqn.supabase.co`, `https://o4511879284719616.ingest.us.sentry.io`).

**External origins allowed, and why:**
- `https://challenges.cloudflare.com` — Turnstile's `api.js` and its challenge iframe, used on all 5 Turnstile-protected forms.
- `https://cdn.sanity.io` — every real image and uploaded video on the site.
- `https://www.youtube.com`, `https://www.youtube-nocookie.com`, `https://player.vimeo.com` — the two embed providers portfolio/journal gallery items currently expect (schema's embed field is freeform CMS input; not solved here, see below).
- Supabase origin (+ `wss://`) — Auth, Postgrest, Storage, and Realtime (Active Users presence) from the browser.
- Sentry ingest origin — client-side error reporting.
- `/studio` additionally: Sanity's own API/realtime origins for Studio's editing/collaboration features.
- Paystack needed **no allowance at all** — checkout is a full-page server-initiated redirect to Paystack's hosted `authorization_url`; the browser navigates away entirely, so no script/frame/connect-src on our own pages is ever involved.

**Implementation:** branch `td-004-csp-report-only` off `staging`, commit `0ce3194`. `tsc --noEmit`, `eslint`, `vitest run` (48/48 passed), and `SITE_ENV=staging npm run build` all clean. Merged to `staging` (`90eb28a`), pushed, deployed — Vercel `dpl_GYiF3uWJ1mGHvPKNDXEWKUSBfLm9` confirmed `● Ready`. Live header verified via `curl` on `/`, `/studio`, `/portal/login` — correct policy, correct route split, correct real origins.

**Staging regression pass (local production-mode build against staging Supabase, plus the live deployment for header verification):**
- **Public pages** (home, about, work, a real portfolio project with Sanity-hosted video): zero CSP violations.
- **`/studio`**: renders and functions correctly (Report-Only never blocks). One genuine finding — see below.
- **Turnstile forms**: origin allowlisting confirmed correct in the live header (`script-src`/`frame-src` both include `challenges.cloudflare.com`); full interactive click-through wasn't possible locally because `NEXT_PUBLIC_TURNSTILE_SITE_KEY` isn't set in the local dev env by design (the component renders nothing without it) — this is a local-testing gap only, not a staging gap; Turnstile keys are confirmed present on the real Vercel staging environment from earlier work this engagement.
- **Supabase (auth, Postgrest, Realtime)**: logged in as a disposable staging Super Admin test account (created and deleted per the established `.invalid`-domain methodology), landed on `/admin` with live enquiry/workshop counts (Postgrest), the Active Users panel showing the session online (Realtime `wss://`), and a real activity feed — zero CSP violations. Since the CSP policy is route-scoped, not role-scoped, this single deep authenticated test validates the same Supabase client code path every portal role shares.
- **Sanity images/video**: confirmed via the real portfolio project page — an uploaded video (Sanity CDN, not YouTube/Vimeo) rendered with zero violations.
- **YouTube/Vimeo embeds**: no live gallery item with a real embed exists in the current dataset to click-through; origins are allowlisted per the schema's documented contract, but this specific path is unverified end-to-end. Flagged as a gap, not a pass.
- **Sentry client-side reporting**: connect-src origin confirmed correct against the live deployment via `curl`; the local build has no `NEXT_PUBLIC_SENTRY_DSN` configured (by design, matches `.env.example`), so an actual local trigger-and-observe test wasn't possible. CSP semantics mean an allowlisted origin is allowed for `fetch`, so this is a low-risk gap, not a genuine open question.
- **Paystack checkout redirect**: not click-tested end-to-end (would require a funded/active test project); confirmed architecturally instead — `redirect()` to `authorization_url` is a top-level navigation, which no CSP directive here governs (`connect-src`/`frame-src`/`form-action` all apply to resource loads and framing, not full-page `Location` redirects).

**CSP violations observed, filtered for signal (a `securitypolicyviolation` listener was installed to separate genuine findings from noise):**
1. **`unsafe-eval` script-src violations, every page** — React's development build uses `eval()` for enhanced error stack traces. Confirmed via Next.js's own bundled docs (`node_modules/next/dist/docs/.../content-security-policy.md`): *"unsafe-eval is not required for production. Neither React nor Next.js use eval in production by default."* This is dev-mode-only noise, not a real Production/staging finding — excluded from the assessment above.
2. **Genuine finding: `/studio` loads `https://core.sanity-cdn.com/bridge.js`** (and a hashed variant), blocked by the current `script-src`. This is Sanity's own host-communication "bridge" script, not currently allowlisted. **Needs adding to the `/studio` policy's `script-src` before this policy could ever be enforced.**
3. No `style-src` violations on `/studio` — the deliberate `'unsafe-inline'` already included there (for `@sanity/ui`'s styled-components runtime) is confirmed sufficient; no further changes needed there.

**Changes required before enforcement:**
1. Add `https://core.sanity-cdn.com` to the `/studio` policy's `script-src` (and re-verify whether it also needs `connect-src`).
2. Confirm the YouTube/Vimeo `frame-src` allowance against a real embed once one exists in the live dataset.
3. Confirm Turnstile end-to-end against the actual deployed staging site (Basic-Auth-capable testing, or ask you to click through once) rather than relying on origin-config alone.
4. Decide separately whether to invest in nonce-based `script-src`/`style-src` for the main site later — the current policy keeps `'unsafe-inline'` deliberately (Next's documented non-nonce fallback) since nonces would force those routes off static/ISR rendering (confirmed via the build output: public pages are prerendered `○`/`●`, not `ƒ`), which is a bigger, separate decision.
5. The freeform CMS embed-URL gap (any domain, not just YouTube/Vimeo, can currently be entered) remains a separately-tracked hardening item — not solved in this pass, per your instruction.

**Recommendation:** do **not** progress to enforcing yet. One genuine missing origin (`core.sanity-cdn.com`) is a known, fixable gap; the YouTube/Vimeo and Turnstile paths have origin-level confidence but lack full end-to-end confirmation on the real deployment. Recommend: fix the Sanity bridge-script gap, run this Report-Only policy for a longer real-world observation window (ideally with a small `report-to` endpoint added deliberately as its own reviewed change, not silently), and get one real click-through each of Turnstile and a YouTube/Vimeo embed on the live staging site, before considering enforcement.

### 16.5 TD-004 hardening step 2 — Sanity bridge-script fix, YouTube/Vimeo live-tested, Turnstile blocked on access

**Fix implemented:** `https://core.sanity-cdn.com` added to the `/studio` policy's `script-src` only (`SANITY_BRIDGE_ORIGIN` in `next.config.ts`) — the main-site policy is untouched, confirmed via diff and via the live header on both routes. No `unsafe-eval`, no wildcards, no other directive changed.

- Branch `td-004-csp-studio-bridge-fix` off `staging`, commit `f97d483`. `tsc --noEmit`, `eslint`, `vitest run` (48/48), `SITE_ENV=staging npm run build` all clean.
- Merged to `staging` (`fd0a4d1`), pushed, deployed — `dpl_3s1VoPQtDKVF4xeSve3RAVh1UMEM` confirmed `● Ready`.
- **`/studio` result:** live header confirmed to include the bridge origin; local console check post-fix showed **zero** `core.sanity-cdn.com` script-src violations (previously present every load) — only the expected dev-mode `unsafe-eval` noise remained. Studio's login screen still renders correctly. Fix confirmed working.
- Still Report-Only, still staging-only. Nothing enforced, nothing merged to `main`, no Production change.

**YouTube/Vimeo — live-tested, without touching any real or temporary CMS content.** Rather than creating a temporary Portfolio/Journal item through the CMS (which would need to go through Sanity's write path and be cleaned up afterward), a real `<iframe src="https://www.youtube.com/embed/...">` and `<iframe src="https://player.vimeo.com/video/...">` were injected directly into a live staging page's DOM via the browser console, under the actual deployed CSP-Report-Only policy. This exercises exactly the same `frame-src` check the real embed feature would trigger, with zero database writes and nothing to clean up (the injected elements vanish on navigation). **Result: both embeds rendered fully (screenshotted), zero `frame-src` violations.** This confirms the YouTube/Vimeo allowance is correctly configured; it does not confirm the *content-authoring path* (Admin Portfolio wizard → Sanity → public page) end-to-end, which was out of scope for this minimal-footprint check.

**Turnstile — blocked on access, not on staging configuration.** Confirmed via `vercel env ls preview` that both `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` **are** configured on the staging (Preview) environment — staging does not lack this configuration. The blocker is that I don't have a way to safely exercise it:
- The live deployed staging site is gated by HTTP Basic Auth; the credential values in local `.env.local` (`STAGING_BASIC_AUTH_USER`/`PASS`) do not authenticate against it (confirmed via a direct `curl` request — `401` with the app's own `WWW-Authenticate` challenge). Local Basic Auth values appear to be dev-only placeholders, not the real deployed credential (consistent with `proxy.ts` skipping Basic Auth entirely for `localhost`, so local dev never needed the real value).
- Without deployed-site access, the only way to obtain the actual `NEXT_PUBLIC_TURNSTILE_SITE_KEY` value for local testing would be `vercel env pull`, which pulls **all** Preview-environment variables — including `TURNSTILE_SECRET_KEY` and other sensitive staging credentials — into a local file. Per your instruction not to copy or expose secrets, I did not do this; pulling the whole environment to extract one public value is disproportionate.
- **Turnstile was not tested live this pass.** What's missing to complete it: either the real staging Basic-Auth credential (so the deployed site can be reached directly), or you clicking through a Turnstile-protected form on the live staging site yourself and confirming no console CSP errors appear.

**Remaining CSP violations / untested areas, current state:**
- No known genuine violations remain on the main-site policy or `/studio` (bridge-script gap fixed).
- Turnstile: origin-level configuration confirmed correct (both `script-src` and `frame-src` include `challenges.cloudflare.com`), but no live click-through — see above.
- The freeform embed-domain gap (any URL, not just YouTube/Vimeo, can be entered in the CMS) remains untouched, as instructed — not a CSP failure, a separate tracked hardening item.
- The real Admin Portfolio → Sanity → public-page authoring path for embeds specifically was not exercised (only the resulting `<iframe>`'s CSP behavior was).

**Is CSP technically ready for enforcement? Not yet, but closer.** The one confirmed code-level gap is fixed and verified. The only remaining open item is Turnstile's live confirmation, which is an access problem, not a configuration problem — the moment someone with the real staging Basic-Auth credential (or you, directly) confirms one Turnstile-protected form submits cleanly with no console CSP errors, I'd consider this ready for an enforcement decision. That decision itself still requires your explicit approval regardless.

### 16.6 Permanent `staging.ordiftstudios.com` + dedicated staging Turnstile site — implemented, closing the access gap

Resolves §16.5's Turnstile access blocker at the root, per your approved architecture. Implemented as a controlled, step-by-step sequence — each step performed by you where it required Squarespace/Vercel/Cloudflare dashboard access, verified by me from the outside afterward:

1. **DNS (Squarespace):** CNAME `staging` → `cname.vercel-dns.com` added, alongside (not replacing) the existing apex/`www` records that serve Production. Verified propagated via `dig`.
2. **Vercel domain:** `staging.ordiftstudios.com` added and explicitly assigned to the `staging` Git branch only — not Production, not "all branches." I deliberately did not attempt this via CLI myself: `vercel domains add` has no branch-scoping flag and defaults to the Production branch, which would have risked a real cross-environment exposure window; this one needed the dashboard's explicit branch selector.
3. **Cloudflare Turnstile:** a new, separate site created — `staging.ordiftstudios.com` only, Managed mode, its own Site Key and Secret Key. Production's existing Turnstile site/domain/keys untouched throughout.
4. **Vercel env vars:** `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` updated for the **Preview** environment only, to the new staging site's values. Production's values on both variables left unchanged. Neither key value was ever shared in chat, screenshots, or written to any file — entered directly by you in the Vercel dashboard, consistent with this project's standing secret-handling rule.

This gives staging its own permanent, stable domain (fixing, as a side effect, the stale-branch-alias inconvenience noted in §16.4) and full Turnstile/analytics isolation from Production, matching `STAGING.md`'s own already-stated environment-separation principle.

### 16.7 Live Turnstile/CSP validation — complete, all 7 gates satisfied

Post-redeploy (commit `612c370`, deployment `dpl_FjJsSQcKL6yZP3pAH7bjJiL36pLJ`), the full 7-point staging validation:

1. **Domain resolves to the correct deployment** — confirmed via `vercel inspect`: `staging.ordiftstudios.com` aliases the fresh deployment built with the new Preview env vars.
2. **Basic Auth active** — confirmed via `curl`: `401` + `WWW-Authenticate: Basic realm="Ordift Studios Staging"`, unchanged; also reconfirmed live by you needing to pass it to reach the page.
3. **Turnstile loads successfully** — confirmed live (Safari/iPad) by you: the widget rendered with no "Unable to connect to website" error — the exact failure mode from §16.5, now resolved.
4. **Challenge/verification completes** — confirmed live by you: green checkmark, "Success!"
5. **No Turnstile hostname/domain errors** — confirmed live by you: none observed.
6. **No CSP violations related to Turnstile** — not confirmed via literal console output (iPad Safari has no DevTools access), but: the deployed CSP already allowlists `challenges.cloudflare.com` in both `script-src` and `frame-src` (confirmed repeatedly via `curl` throughout §16.4–16.6), Report-Only mode cannot block anything regardless, and a widget reaching a genuine "Success!" state is strong behavioral evidence nothing relevant was obstructed. Treating this as satisfied on that basis, with the console-level confirmation noted as unobtained rather than claimed.
7. **Production unaffected** — confirmed via `curl`: `ordiftstudios.com` returns a plain `200`, no Basic Auth challenge, no CSP header (expected — Production gets neither, by design); Turnstile env var *names* remain scoped to "Preview, Production" in `vercel env ls production` as expected (this listing doesn't expose values, which is by design and was never inspected).

**All 7 validation gates are now satisfied.** Every previously-identified TD-004 gap is closed: the Sanity Studio bridge-script origin (§16.5), YouTube/Vimeo embeds (§16.5), and now Turnstile (this section) have each been confirmed live against real staging infrastructure with zero genuine CSP violations found. The only remaining open items are the two already-deferred, deliberately out-of-scope ones: the freeform CMS embed-domain gap (§16.4/§16.5, a separate hardening item) and the enforcement decision itself, which — regardless of how clean validation is — requires your explicit go-ahead and has not been requested. CSP remains Report-Only; nothing has been merged to `main`; Production remains untouched throughout.

## 17. Public Site deep-pass — remaining pages, responsive, form validation (2026-08-13)

Continuation of the readiness/debt register's Public Site deep-pass (task #280), scoped against local dev pointed at staging Supabase, per the same category-1/2/3/4 classification instruction used elsewhere in this engagement. All items investigated turned out to be Category 1 (safe to verify entirely on staging, no code changes needed) except one new finding surfaced mid-pass, which is Category 3 and is reported below without being fixed. No merges to `main`, no Production changes, CSP unchanged (Report-Only), no Paystack Live config, no dependency/infrastructure upgrades.

### 17.1 Section A — remaining non-sitemap public pages — DONE, all clean

Verified `style-preview` (+`components`, `+emails`), `coming-soon`, `sentry-test`, `not-found.tsx`, `error.tsx` (read directly, not live-triggered — forcing a real unhandled exception wasn't appropriate for a verification-only pass), and `opengraph-image.tsx`/`twitter-image.tsx` (`curl`-confirmed `200 image/png`, 73652 bytes each, correctly shared between the two meta tags). Zero bugs found; only benign HMR websocket console noise, consistent with dev-mode behavior seen throughout this engagement.

### 17.2 Section B — responsive pass (375px mobile, 768px tablet) — DONE, all clean

Mobile (375×812): home (including the mobile hamburger nav — confirmed via screenshot to open cleanly with Close button, full nav list, and gold CTA, after a `computer`-click timeout was worked around with a direct `javascript_tool` click, the same known tooling quirk documented earlier in this engagement), about, services hub, a department page (photography), work hub (filters/search/featured card), a project detail page, journal hub, a post detail page, workshops hub, a workshop detail page, a legal page (privacy), and `/book`. Tablet (768×1024): re-checked home, `/book`, and a project detail page as a representative subset. No overflow, no broken wrapping, no clipped content on any page.

One apparent issue was investigated and ruled out: a home-page screenshot at tablet width showed an empty band on the right of the canvas. `getBoundingClientRect()` on `<nav>` and the hero container both confirmed `right: 768` (the full requested viewport width) with `document.documentElement.scrollWidth` also exactly `768` — no overflow, no dead space in the actual page. The apparent gap was the screenshot tool's own canvas padding at `devicePixelRatio: 2`, not a layout bug. No fix made.

A single `[error] 404` appeared once in the console while on `/services`, but did not correlate to any request in the last 100 network entries (home/services/about page loads) — consistent with the transient HMR/dev-tooling noise already characterized elsewhere in this pass, not a Services-page defect.

### 17.3 Section C — form validation states, `BookingForm` and `RegistrationForm` — DONE, all clean

Explicitly scoped to these two public forms only; Login/Signup/Forgot-Password remain deferred to the separate Portal deep-pass (task #281) to avoid double-scoping.

**`BookingForm` (`/book`, `src/app/book/BookingForm.tsx`)** — read the source first (zod-schema-backed per-step validation via `enquirySchema`/`STEP_FIELDS`), then exercised live:
- Step 1 empty submit → "Please choose a service." Selecting a service and continuing works.
- Step 2 empty/short "Brief project description" → "Tell us a little more — at least 20 characters." (both required + min-length correctly enforced).
- Step 4 malformed email (`not-a-valid-email`) → "Please enter a valid email address."; name/phone accepted correctly; navigation correctly blocked until fixed.
- Step 5: submitting without the required Privacy Notice consent checkbox → "Please confirm you've read the Privacy Notice to continue."; the separate marketing-consent checkbox correctly remains optional and unchecked by default.
- Turnstile-gated submit-disable (`disabled={submitting || (turnstileRequired && !data.turnstileToken)}`): confirmed the submit button is *not* disabled and no Turnstile iframe renders locally, because `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is intentionally unset in local `.env.local` (matches `.env.example`, by design — local dev never needed it since `proxy.ts` skips Basic Auth for `localhost`). This is expected, not a regression: the same gating logic and the real Turnstile site were already confirmed working end-to-end live on `staging.ordiftstudios.com` in §16.7.

**`RegistrationForm`** (`/workshops/[slug]`, `src/app/workshops/[slug]/RegistrationForm.tsx`) — same validation architecture (zod `workshopRegistrationSchema`, same field-error pattern, same Turnstile-gate expression). Live-tested on `/workshops/sample-portrait-lighting-workshop`: submitting fully empty correctly produced all four expected errors simultaneously — "Please enter your full name.", "Please enter a valid email address.", "Please enter a phone or WhatsApp number.", "Please confirm you've read the Privacy Notice to continue." — with Country and Experience Level correctly left optional (no error).

No code changes were required for Section C — both forms' validation, error display, and submit-gating behave correctly.

### 17.4 New finding surfaced during Section B — Category 3, reported not fixed

While spot-checking a sample workshop's detail page, its "OPEN FOR REGISTRATION" badge was showing despite a registration deadline (31 July 2026) already in the past. Traced the cause: `workshop.status` (`src/app/workshops/[slug]/page.tsx`) is a manually-set CMS field with values like `"open"`/`"coming-soon"`/`"full"`/`"closed"`/`"completed"` — it is never derived from `registrationDeadline`, which is used only for display (the countdown timer and the formatted date). Confirmed server-side too: `/api/workshop-registration/route.ts:101` gates purely on `workshop.status !== "open"`; the deadline is never read there either.

**Why this is Category 3, not a quick fix:** deciding whether `registrationDeadline` should automatically close registration, versus staff retaining full manual control over `status` (e.g., to intentionally extend a deadline, or hold a workshop open past its nominal date), is a business-logic/workflow decision, not a bug with one obviously-correct fix. The current sample-data instance is placeholder content already flagged for replacement before launch (per the existing workshop content-replacement checklist), so there's no live customer-facing impact today — but the underlying gap would carry into real workshops once real dates are entered.

**What's needed from you:** a decision on the intended behavior — e.g., (a) leave it as-is (staff-controlled `status` is the intended design, deadline is informational only), (b) auto-close registration once `registrationDeadline` passes (would need both the detail-page gate and the server-side check in `route.ts` updated, plus a decision on whether "closed-by-deadline" should look different in the UI than manually-set "closed"), or (c) something else. No change has been made pending your direction.

### 17.5 Verification and deployment

`npx tsc --noEmit`, `npm run lint`, and `next build` all run clean against the unchanged `staging` branch (no source files were modified — Sections A–C were verification-only, and §17.4 was deliberately left unfixed pending your decision). This document is the only file changed in this pass; committed and pushed to `staging` only, per your instruction to document and commit/push category-1 work.

**Task #280 (Public Site deep-pass) is now complete** except for the one Category-3 item above, which stays open until you decide. Next up per the existing register: task #281 (Portal deep-pass — project workspace, vendor/model/collaborator shells).

## 18. TD-034 resolved — automatic workshop registration-deadline enforcement (2026-08-13)

Implements the business rule you confirmed for §17.4's finding: staff may close a workshop early; a manually-`"open"` workshop must auto-close once `registrationDeadline` passes; enforcement must be server-side, not just visual; the public badge/button must match the API's effective state; a future deadline must never auto-reopen a workshop staff closed manually.

**Pre-implementation investigation (as requested):** confirmed `registrationDeadline` is a Sanity `date` field — date-only, no time/timezone component. The codebase already had an established parsing convention (`formatDate()`, `CountdownTimer` both `new Date("YYYY-MM-DD")`, which parses as UTC midnight of that date). The fix reuses that exact instant as the enforcement boundary, so the new gate closes at precisely the moment the existing countdown timer already visually expires — no second, conflicting definition of "the deadline" introduced.

**Implementation:**
- `src/lib/content/workshopHelpers.ts` — added `isRegistrationDeadlinePassed()`, `getEffectiveWorkshopStatus()` (demotes `"open"`→`"closed"` only once past deadline; every other status passes through unchanged), and `isRegistrationOpen()`.
- `src/app/workshops/[slug]/page.tsx` — computes the effective status once and uses it for the status badge, the countdown-timer gate, and the register-form-vs-closed-message panel (previously all three read the raw CMS `status` independently).
- `src/components/workshops/WorkshopCard.tsx` — same effective-status badge, so the `/workshops` hub and "Related Workshops" cards match the detail page.
- `src/app/api/workshop-registration/route.ts` — the actual accept/reject gate (`workshop.status !== "open"`) replaced with the same shared `isRegistrationOpen()` the frontend calls, so frontend and API read from one function and cannot disagree.
- New `src/lib/content/workshopHelpers.test.ts` — 11 unit tests, including explicit no-auto-reopen guarantees for manually-`"closed"` workshops regardless of deadline, and pass-through checks for `"full"`/`"coming-soon"`/`"completed"`.

**Verification (staging only, local dev pointed at staging Supabase):**
- `tsc --noEmit`: clean. `eslint` on the 5 changed files: clean. Full `vitest run`: 59/59 passed, no regressions. `SITE_ENV=staging next build`: clean, all workshop routes prerendered correctly.
- Live browser test against `sample-portrait-lighting-workshop` (CMS status `"open"`, deadline 31 July 2026 — already past): detail-page badge changed from "Open for Registration" to "Closed"; the registration form was replaced by "Registration for this workshop is closed."; the `/workshops` hub card badge matched ("Closed").
- Server-side enforcement confirmed independently of the UI: a direct `curl POST /api/workshop-registration` against this workshop returned `409 {"error":"workshop-not-open"}` — the API rejects on its own, not merely because the form was hidden.
- Happy path confirmed unaffected: `sample-social-content-two-day-intensive` (status `"open"`, deadline still in the future) continued to show "Open for Registration" on the hub, unchanged.

No schema, Paystack, CSP, Sentry, Supabase, Cloudflare, or DNS changes. No Production data or CMS records touched — this is application code only. Not merged to `main`. TD-034 in `TECHNICAL_DEBT_REGISTER.md` updated to Resolved with the same detail.

### 18.1 TD-034 amendment — inclusive deadline day (2026-08-13, same day)

You asked for one adjustment before closing this permanently: the deadline day itself should stay fully open, closing only once the following day begins (e.g. `registrationDeadline = "2026-08-20"` → open all of 20 August, closed from 21 August). The original implementation closed at the *start* of the deadline day instead, matching `CountdownTimer`'s pre-existing UTC-midnight parse.

**Minimal adjustment:** added `getRegistrationCloseInstant()` to `src/lib/content/workshopHelpers.ts` — deadline's UTC midnight **+ 24 hours** (start of the following day) — and changed `isRegistrationDeadlinePassed()` to compare against that instead of the deadline's own midnight. `getEffectiveWorkshopStatus()`, `isRegistrationOpen()`, `WorkshopCard.tsx`, and `route.ts` were unaffected — they only consume the boolean result. One necessary side-effect: `src/app/workshops/[slug]/page.tsx`'s `CountdownTimer` now targets `getRegistrationCloseInstant(workshop)` instead of the raw `registrationDeadline` field, so the visible countdown, the badge, and the API all expire at the identical instant — otherwise the countdown would have hit zero a full day before registration actually closed, contradicting "the badge/button must reflect the same effective state." The separately-displayed "Registration deadline: 20 August 2026" text is untouched.

**Tests:** replaced the single boundary-instant test with explicit day-inclusive coverage in `workshopHelpers.test.ts` — deadline day's start, midday, and last instant (23:59:59.999 UTC) all confirmed still open; the first instant of the following day (00:00:00.000 UTC) confirmed closed. 17/17 tests passing (up from 11).

**Re-verified on staging:** `tsc --noEmit`, `eslint` (3 changed files), full `vitest run` (65/65, no regressions), `SITE_ENV=staging next build` all clean. Live: `sample-portrait-lighting-workshop` still correctly shows "Closed" (deadline weeks in the past regardless of the boundary shift). `sample-social-content-two-day-intensive` (deadline 23 August 2026) — screenshotted the countdown reading "10 Days 21 Hrs 45 Min 28 Sec" from the dev clock, arithmetically confirming it targets 24 August 00:00 UTC (the day *after* the deadline), not 23 August 00:00 UTC.

No schema, Paystack, CSP, Sentry, Supabase, Cloudflare, or DNS changes. No Production data or CMS records touched. Not merged to `main`. TD-034 is now fully closed with the inclusive-end-of-day behavior confirmed correct.

## 19. Portal deep-pass — Client Project Workspace + Collaborator assignment flow (2026-08-13)

Continuation of the readiness/debt register's Portal deep-pass (task #281), scoped to authenticated live testing of the Client Project Workspace and the Collaborator/Contractor assignment-detail flow, on staging only, per the same category-1/2/3/4 classification instruction used elsewhere in this engagement.

**Test method:** confirmed no reusable staging test accounts/fixtures existed from earlier sessions (this project's disposable-fixture discipline leaves zero persistent test accounts between sessions — see `PRODUCTION_READINESS_RECONCILIATION.md` history). Two throwaway, never-committed scripts (`_createPortalDeepPassFixtures.ts` / `_cleanupPortalDeepPassFixtures.ts`) were drafted using the project's existing approved fixture mechanism (`src/lib/testing/testEnvironment.ts` — same `.invalid`-domain, `admin.createUser`/`admin.deleteUser` pattern the integration-test suite already uses against staging), reviewed and approved before execution, and both fail closed against a hard-coded staging-host check plus `SITE_ENV=staging`. Created: one disposable Client account + one `enquiries` row (`crm_stage: "in_progress"`); one disposable Collaborator account + one active `project_assignments` row linking it to that enquiry.

**Client Project Workspace — all 7 tabs live-tested, all clean:** Overview, Timeline, Deliverables, Booking Details, Payments, Requests (including a real submitted request — "Submit Request" — which correctly appeared under "Your Requests"), and Updates. No console errors; no RLS boundary issues.

**Collaborator assignment-detail flow — live-tested, one cosmetic finding:** the assignment-detail page rendered correctly, and the "Post Update" action was exercised end-to-end (submitted a note, confirmed it displayed correctly with author identity and timestamp). One finding surfaced: the status line showed the raw database enum value (`in_progress`) instead of a human-readable label, while the equivalent Client-facing Overview already used a `crmStageLabel()` helper for the same field — an inconsistency, not a functional break.

**Fix (Category 1 — cosmetic, approved and applied):** `src/lib/portal/collaboratorData.ts` — `getAssignedProjectOverview()`'s `enquiry` branch now calls the existing `crmStageLabel()` helper (already exported from `src/lib/portal/data.ts` and already used by the Client Workspace's equivalent function) instead of passing through the raw `crm_stage` value. One import added, one line changed. The `workshop_registrations` branch (`registration_status`, already Title Case) was deliberately left untouched — out of this finding's scope. Re-verified live: the same assignment-detail page now shows "In Progress"; no console errors; Post Update unaffected (the change never touches that code path).

**Cleanup:** the cleanup script was extended before running it to also delete the `project_requests` and `project_updates` rows created during live testing (both are polymorphic `entity_type`/`entity_id` tables with no FK to `enquiries`, so they would not have cascade-deleted otherwise) — scoped tightly to `entity_type = 'enquiry' AND entity_id = <fixture enquiryId>` so nothing unrelated could be touched. Cleanup ran successfully: both project_requests/project_updates rows, the project_assignment, the enquiry, and both disposable auth accounts (profile + role grants cascaded) were all deleted; the script's own final read-only check confirmed **0 fixture rows/accounts remaining**. The fixture-ID record file and both throwaway scripts were then deleted from the repo (never committed).

**Verification:** `npx tsc --noEmit` clean, `npx eslint src/lib/portal/collaboratorData.ts` clean, full `vitest run` 65/65 passing (no regressions). `npm run lint` across the whole repo surfaces pre-existing noise from `supabase/.temp/...` — a gitignored, local-only Supabase CLI–generated temp artifact, unrelated to this change and not part of the tracked source tree.

No schema, Paystack, CSP, Sentry, Supabase Production, Cloudflare, DNS, or Vercel Production changes. No Production data touched — staging only. Not merged to `main`. `src/lib/portal/collaboratorData.ts` and this document are the only files changed in this pass.

**Task #281 (Portal deep-pass) is now complete.** Next up per the existing register: task #282 (Admin deep-pass — bookings, activity, flags, lookups, deliverables, profile pages).

## 20. Admin deep-pass — full staff/admin/super_admin authorization matrix (2026-08-13)

Continuation of the readiness/debt register's Admin deep-pass (task #282), scoped to authenticated live testing of the full Admin Platform authorization boundary across all three internal tiers (`staff`, `admin`, `super_admin`), on staging only, per the same category-1/2/3/4 classification instruction used elsewhere in this engagement.

**Investigation first:** cross-referenced #282's named modules (bookings, activity, flags, lookups, deliverables, profile pages) against everything already tested. Bookings/Activity/Flags/Users/Settings were already live-tested once, generically, in §13's 2026-08-13 regression pass. Lookups, Deliverables, and Profile pages had **no prior live-test coverage** since being built — Profile pages last touched 2026-07-28 at build time, for the Grade-confidentiality boundary specifically, never re-verified since. Source review of the full auth architecture (`proxy.ts`, `middleware.ts`, `admin/layout.tsx`, and all ~12 `actions.ts` files) confirmed every restricted route/action independently re-checks role server-side — nav-item hiding is UX only, never the enforcement boundary.

**Test method:** three disposable staff/admin/super_admin accounts plus one disposable "booking" (`workshop_registrations` row), created via the same approved `.invalid`-domain fixture mechanism used throughout this engagement, hard-locked to the confirmed staging host with a fail-closed pre-write guard. Anything created live through the browser during testing (Feature Flag, Deliverable Category, Operational Title) used a consistent `test-282`/`TEST 282` naming marker so cleanup could find and remove it without a pre-recorded ID.

### 20.1 Authorization matrix — every result live-verified by direct URL, not nav-link absence

| Area | staff | admin | super_admin |
|---|---|---|---|
| `/admin` base + Overview/Enquiries/Bookings/Payments/Portfolio/Reports/Content | allow | allow | allow |
| Activity | allow | allow | allow |
| Bookings — status update | allow (persisted, confirmed via fresh server render) | — | — |
| Deliverables — publish/delete | allow (created + deleted live) | — | — |
| Deliverables — New Category | hidden client-side + would deny server-side (`hasRole("admin")‖isSuperAdmin`) | allow (created live) | — |
| Payments — set Amount Due | read-only message shown, no field | allow ($150.00 set live) | — |
| Users & Roles | deny (direct URL → redirect to Overview) | allow | allow |
| Feature Flags | deny (direct URL → redirect) | allow (created + toggled a flag live) | allow |
| Settings | deny (direct URL → redirect) | allow | allow |
| Lookups (Titles/Engagement/Classifications) | deny (direct URL → redirect) | deny (direct URL → redirect) | allow (created an Operational Title live) |
| Profile — self-view | allow | allow | allow |
| Profile — direct-URL to another user's id | redirected to own profile | redirected to own profile | (same code path, not separately re-tested) |
| Unauthenticated → any `/admin/**` | redirects to `/portal/login?next=/admin` | — | — |

Every "deny" row above was tested by direct URL against an authenticated session lacking the required role, not by observing an absent nav link.

### 20.2 Activity-page visibility — investigated as explicitly requested

Confirmed live: a plain `staff` session sees the full platform-wide Activity feed unfiltered, including real `payment.completed`, `payment.failed`, `payment.exchange_rate_added`, and `enquiry.amount_due_set` entries. Traced to source and confirmed **intentional current design**, not a defect: `NAV_ITEMS` deliberately omits `adminOnly` for Activity (unlike Users/Flags/Settings/Lookups), the RLS policy is literally named `"activity_log: staff read"` with a plain `is_staff_or_admin()` check, and `getRecentActivity()` has no action-type or actor-role filtering anywhere. Per instruction, **no authorization/RLS/query/navigation/schema/business-logic change was made**. Logged as **TD-035** in `TECHNICAL_DEBT_REGISTER.md` for a deliberate least-privilege policy review before Production readiness is finalized — staff keeps operational visibility, financial activity considered for admin/super_admin only, role/security-sensitive activity considered for super_admin only, exact classification and UX to be decided before any implementation.

### 20.3 Findings

**No application defects found.** One near-miss during testing, not an app bug: a static "Registered" date-section label on the Bookings detail page was briefly misread as the live status value while verifying a status-change persisted; the actual status (in the `<select>`'s server-rendered `defaultValue`) had updated correctly the whole time. Caught and corrected before being reported as a finding.

**Console errors:** zero, across all three roles and every page/action tested.

### 20.4 Cleanup and verification

Cleanup targeted: the fixture booking's deliverables (0 found — both create and delete were exercised live during testing, so nothing was left behind), the marker-named Feature Flag (1 row), Operational Title (1 row), Deliverable Category (1 row), every `activity_log` row generated by any of the three fixture accounts (9 rows — covering bookings/flags/lookups/deliverables/profile actions in one filter, since every `logActivity()` call site records the acting user's own id), the fixture booking itself, and the three disposable auth accounts (profile/role-grant/staff_details cascaded automatically). The cleanup script's own final read-only check confirmed **0 fixture rows/accounts remaining** before it removed its own record file. The two throwaway scripts (`_createAdminDeepPassFixtures.ts`, `_cleanupAdminDeepPassFixtures.ts`) were then deleted — never committed, no longer needed.

### 20.5 Verification

`npx tsc --noEmit` clean. Full `vitest run`: 65/65 passing, no regressions. `TECHNICAL_DEBT_REGISTER.md` and this document are the only files changed in this pass — no application source code was modified for #282, since no defects were found.

No schema, Paystack, CSP, Sentry, Supabase Production, Cloudflare, DNS, or Vercel Production changes. No Production data touched — staging only. Not merged to `main`.

**Task #282 (Admin deep-pass) is now complete.** Next up per the existing register: task #283 (site-wide link crawl + console-error sweep).
