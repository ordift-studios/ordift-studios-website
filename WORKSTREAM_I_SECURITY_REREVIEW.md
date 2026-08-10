# Ordift Studios — Workstream I: Security Hardening Re-Review

**Status:** Complete except one deferred step (§7). All code fixes verified (typecheck/lint/build/test) and deployed to staging Preview. RLS migration written but not yet applied to any environment — blocked by the safety classifier even when linked to staging; needs to be run manually (exact steps in §7).
**Date:** 2026-08-10
**Scope:** `PRODUCT_ROADMAP.md`'s Version 1.0.5 Workstream I — "Re-challenge every layer: authentication, authorization, RLS, API protection, rate limiting, secrets management, environment variables, logging, audit trails — a skeptical second look, not a first pass," plus TD-014's secrets-inventory scope.
**Method:** three independent, read-only investigation passes (auth/RLS, API protection/rate limiting/webhooks, secrets/logging/audit trail), each required file:line evidence for every claim and an explicit PASS/NEEDS-FIX verdict per area rather than a general impression. Findings were cross-checked against each other where scopes overlapped (the bank-transfer finding below was independently surfaced by two separate passes).

No Production code, Production environment variables, Production Supabase, or Paystack Live configuration were touched at any point in this workstream.

---

## Summary

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | Bank-transfer `PUT` handler trusted client-supplied entity ID and amount, no ownership check | High | **Fixed** |
| 2 | `bank_accounts`/`currencies`/`exchange_rates`/`payment_country_config` writable by plain `staff` via direct table access | High | **Fixed** (migration written, not yet applied — see §7) |
| 3 | `staff_details` (incl. confidential `grade_id`) writable by plain `staff` via direct table access | Medium | **Fixed** (same migration) |
| 4 | Rate limiting missing on login, signup, forgot-password, project-request, checkout initiation, bank-transfer initiation | Medium | **Fixed** |
| 5 | `forgot-password` had no CAPTCHA at all (not even a rendered widget) | Medium | **Fixed** |
| 6 | `workflow_statuses` collaborator self-update could forge status/reviewer fields on own row | Low (audit-integrity only) | **Fixed** (same migration) |
| 7 | Report-email and portfolio-asset-upload actions had no audit-log entry | Low | **Fixed** |
| 8 | `PAYSTACK_SECRET_KEY` undocumented in `.env.example` | Low (documentation) | **Fixed** |
| 9 | File uploads trust declared MIME type, no magic-byte content sniffing | Low | **Not fixed — logged as new tech debt (§8)** |

Everything else reviewed — authentication flows, server-side capability gating across every admin action and API route, the Paystack webhook's HMAC/replay/idempotency handling, gateway checkout's amount/ownership resolution, and the rest of the 26-migration RLS surface — passed with no issues found. See §1–§6 for the reviewed-and-clean areas in detail.

---

## 1. Authentication & Authorization — PASS

Supabase SSR session handling (`src/lib/supabase/middleware.ts`) correctly revalidates via `getUser()`, not a JWT-only `getSession()`; expired/invalid sessions redirect to login on every protected path. No server action or API route trusts a client-supplied identity — every privileged mutation re-derives the actor via `getCurrentUser()`. Every exported action across all 11 `src/app/admin/**/actions.ts` files and all 12 `src/app/api/**` routes was enumerated individually and confirmed to call an appropriate capability gate before touching the database — role-escalation protections (blocking a non-super-admin from granting `admin`/`super_admin`, blocking the last-super-admin removal) and tiered capability checks (e.g. `manage_project_amount` narrower than plain staff access) were also confirmed correct.

## 2. Row Level Security — Findings fixed, rest PASS

Full enumeration of all 26 migrations' tables confirmed RLS enabled and policies present everywhere, `anon` granted zero table access anywhere in the schema, and every `SECURITY DEFINER` function schema-qualified with `search_path=''`. Three gaps found, all in the same shape (a policy grants a broader role than the app layer's own capability model intends) and all fixed together in migration `0027_security_rereview_rls_hardening.sql`:

- **`bank_accounts`/`currencies`/`exchange_rates`/`payment_country_config`** — writable by any plain `staff` account (the base grant to `authenticated` combined with a policy checking `is_staff_or_admin()`, which covers staff too as of migration 0026), while `src/lib/payments/paymentPermissions.ts` scopes `manage_bank_accounts`/`manage_currencies` to admin/super_admin only. No app UI reaches this today for plain staff — the gap was only reachable via direct table/PostgREST access — but `bank_accounts` holds live wire-transfer details and `exchange_rates` directly prices every checkout, so the policy itself needed to match intent regardless of current UI reach.
- **`staff_details`** — same shape; migration 0017's own code comment already flagged this as "narrower at the app layer than the existing staff-wide update grant" when it added the confidential `grade_id` column.
- **`workflow_statuses`** collaborator self-update policy's `WITH CHECK` only re-verified row ownership, not status or workflow access — a contractor could set `status`/`reviewed_by`/`reviewed_at` on their own draft row, forging a self-approval in the audit trail. Confirmed low real-world severity (Sanity's own `status` field, not this table, is the actual publish source of truth per `src/lib/admin/portfolioWorkflow.ts`), but tightened since this table exists specifically as an audit record.

Migration `0027` adds `private.is_admin_or_super_admin()` (staff explicitly excluded) and narrows the affected policies to use it. No new capability concept — RLS now matches intent already expressed in code and prior migration comments.

## 3. API Protection, Webhooks & Payment Input Validation

**Webhook (`src/app/api/payments/webhook/paystack/route.ts`) — PASS.** HMAC-SHA512 verified with `crypto.timingSafeEqual`, not a timing-vulnerable `===`. Fails closed with 401 on signature failure. Replay window (5 min) and Redis-backed atomic idempotency (`SET NX EX 86400`, fails closed on store unavailability — a deliberate, documented departure from the general-purpose idempotency helper's fail-open behavior, given the stakes) are layered, not redundant. Gateway-reported amount/currency re-validated against the server-locked value at checkout with a small tolerance; a mismatch fails the payment rather than silently accepting it.

**Gateway checkout (`checkoutService.ts`) — PASS.** `resolveEntityAmounts()` uses the session-scoped RLS-bound client, so an entity the caller doesn't own resolves to nothing. `resolveAmountToCharge()` never trusts a client-supplied amount for `full`/`balance` (always server-computed), and bounds `deposit`/`partial` against the actual remaining balance, rejecting rather than clamping an over-claim.

**Bank-transfer initiation (`PUT /api/payments/bank-transfer/proof`) — was the one exception, now fixed.** This route didn't inherit the discipline above: no check that the client-supplied `entityId` belonged to the caller, and the client-supplied `amountUsd` was inserted directly (a `!body.amountUsd` falsy check even let a negative amount through). An authenticated attacker could create a `pending` bank-transfer payment row against *any other client's* enquiry/workshop registration, with an arbitrary amount, then legitimately attach a proof file to it via the (already-correct) `POST` handler — polluting another client's payment-review queue with an attacker-controlled claim. Fixed by exporting and reusing `checkoutService.ts`'s own `resolveEntityAmounts()`/`resolveAmountToCharge()` instead of duplicating divergent logic, plus adding the rate limiting this route was also missing.

**File uploads (portfolio assets, bank-transfer proofs) — PASS with a minor gap logged, not fixed.** Both routes correctly enforce auth/capability gating, server-side size limits, and a server-side MIME-type allow-list (not just a client `accept` hint). Neither does magic-byte content sniffing — a spoofed `Content-Type` on a real upload would currently pass. Logged as new tech debt rather than fixed now (§8) — narrow-audience (super-admin-only for portfolio assets) and not a live exploitation path found during this review, but worth closing.

## 4. Rate Limiting — Findings fixed

Only the original Contact Enquiry and Workshop Registration endpoints called `checkRateLimit`. Everything built since — login, signup, forgot-password, the client Requests tab, gateway checkout initiation, and bank-transfer initiation — bypassed it entirely. Fixed by adding a `getClientIp()` helper (`src/lib/shared/rateLimit.ts`) for Server Actions, which don't receive a `NextRequest` the way Route Handlers do, and wiring `checkRateLimit` into all six, keyed by IP for anonymous actions and by `user.id` for authenticated ones.

## 5. CAPTCHA (Cloudflare Turnstile) — Finding fixed

`login`, `signup`, Contact Enquiry, and Workshop Registration all correctly call `verifyTurnstileToken()` server-side (not just rendering the widget). `forgot-password` had neither — not "widget without server check," but no CAPTCHA presence at all on either side, despite being an anonymous form that triggers a real email send. Fixed with the same widget + server-verification pattern as `login`/`signup`.

## 6. Secrets, Environment Variables, Logging, Audit Trail — PASS, two minor gaps fixed

No hardcoded secrets found anywhere in `src/` (checked for live/test key prefixes, JWT-shaped literals, literal `Authorization` headers, and long hex/base64 literals assigned to credential-looking variable names). `.env.example` contains only placeholders, confirmed never to have held a real value at any point in git history. Every env-file variant is gitignored and confirmed never actually committed (`git log --all --diff-filter=A`). Logging is disciplined — 166 non-test `console.*` calls reviewed, consistently logging error messages/scalars, never full request/user/payment objects; the one exception (full email bodies logged in non-production test mode, gated off in real production sends) is by design and staging-only.

Audit trail (`src/lib/admin/activityLog.ts`, the platform-wide Audit Identity Standard) correctly covers every privileged mutation checked — payment approval/rejection, exchange-rate changes, portfolio publish/delete, role grants/revokes, member-number reassignment, project assignments, lookups/deliverables CRUD, booking/enquiry changes, and the webhook's own system-actor logging. Two gaps found and fixed: `emailReportAction` (exports client/payment PII via email) and the portfolio-asset upload route (no "who uploaded this" record) now both call `logActivity()`.

## 7. Deferred — one manual step required

Migration `0027_security_rereview_rls_hardening.sql` is written, committed, and pushed, but **not yet applied to any database.** `supabase db push` was blocked by Claude Code's own safety classifier even while linked to the staging project (`omtmxvsjmlrnbtxiesqn`, confirmed via `supabase/.temp/project-ref` immediately before and after the attempt) — this mirrors the same restriction encountered earlier in this engagement for direct Production writes, but is applying uniformly to the command regardless of which project is actually linked. No workaround was attempted, per the tool's own guidance.

**Two ways to apply it — either works:**

1. **From your own terminal** (fastest): with the Supabase CLI linked to the staging project, run `supabase db push` from the repo root. It will detect and apply exactly migration `0027` (all prior migrations already match).
2. **Via Supabase's SQL Editor** (no CLI needed): open the staging project's SQL Editor and paste the full contents of `supabase/migrations/0027_security_rereview_rls_hardening.sql`, then run it. The migration is idempotent-safe to inspect before running (it only creates one new function and replaces a small number of named policies via `drop policy if exists` + `create policy`).

Until this runs, the RLS gaps in §2 remain open at the database layer even though the migration fixing them exists in the repo — the application-layer fixes (bank-transfer ownership check, rate limiting, etc.) are all live regardless, since those don't depend on this migration.

## 8. New tech debt logged (not blocking)

- **File upload content-type sniffing** (§3) — added to `TECHNICAL_DEBT_REGISTER.md` as a new low-severity item.
- **`Redis rate-limiter fails open on outage`** (`src/lib/shared/rateLimit.ts`) — pre-existing, documented in-code, confirmed reasonable for this scale during this review; noted here for completeness, not a new finding.

## 9. Not re-litigated

Consistent with "skeptical second look, not a first pass": prior audit documents (`PHASE_4_PRODUCTION_AUDIT_REPORT.md`, `PAYMENT_SECURITY_REVIEW.md`, `INDEPENDENT_PLATFORM_AUDIT_2026-08-05.md`) were checked for overlap before starting, and this review re-verified their claims against current code (which has changed substantially since — Portfolio Management, Payments, and the Audit Identity Standard were all added afterward) rather than assuming they still held or re-deriving already-settled conclusions from scratch.
