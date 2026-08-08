# Paystack Payments — Production Handover / Next-Session Checklist

**Status as of:** 2026-08-08 · **Branch:** `staging` @ `2394c81` (pushed, matches `origin/staging`)
**Production state:** untouched — no payments schema, no Paystack config, no code merged to `main`.

Paste this whole file into a fresh session to resume exactly here — no re-investigation needed.

---

## 1. Staging work completed (this session)

- `e5a1799` — Active Paystack transaction-verify reconciliation: `verifyTransaction()` on the provider, shared `gatewaySync.ts` (used by both the webhook and reconciliation), `reconcilePendingPayment.ts`, wired into the payment status page.
- `35de4f1` — Fixed `verifyTransaction()` silently swallowing non-ok Paystack API responses (now logs and resolves to `failed` instead of hanging).
- Both deployed live to staging (`ordift-studios-website-git-staging-ordift-studios.vercel.app`), typecheck/lint/build clean.
- (Earlier same session, already covered by prior handover context) `8166aa7` — fixed `private.is_staff_or_admin()` missing `super_admin`; applied to **both** staging and Production.

## 2. Migrations still needing Production promotion

Production is at **0022**. Needed, in order:
| Migration | Contents | Special handling |
|---|---|---|
| 0023 | Workflow engine tables (dependency, not payments-specific) | none |
| 0024 | Payments schema — `payments`, `payment_webhook_events`, RLS, storage bucket, seed data | none |
| 0025 | `exchange_rates.reason` column | none |
| **0026** | `is_staff_or_admin()` RLS fix | **Already manually applied to Production via SQL Editor this session and verified.** Do NOT blindly `supabase db push` — the migration tracker doesn't know it ran. Reconcile first (e.g. mark it applied in the tracker, or diff-check before pushing) so 0026 isn't silently skipped or double-run in a way that desyncs history. |

## 3. Production env vars/settings still required (no values below — set via Vercel dashboard directly)

- `PAYSTACK_SECRET_KEY` — **Live** key (`sk_live_...`), added to Vercel **Production** environment only. Currently only exists on Preview, and that copy is a **Test** key — never reuse it.
- Whichever public/inline key the checkout widget needs, Live-mode + Production-scoped.
- A real GHS exchange rate entered in Production's `exchange_rates` table via `/admin/payments/exchange-rates` after migrations land (table starts empty).

## 4. Paystack Dashboard — exact steps for Live Mode

1. Complete Paystack business verification/KYC to unlock Live Mode (external, longest lead time item).
2. Register Production's webhook URL under **Live Mode** settings: `https://<production-domain>/api/payments/webhook/paystack`. This is separate from staging's Test Mode webhook — registering one does not register the other.
3. Confirm which channels (Card, Mobile Money, Bank Transfer-via-Paystack, Apple Pay) are actually enabled on the Live merchant account — Test Mode may show channels Live doesn't have yet.

## 5. Supabase/Vercel configuration still required

- Apply migrations per §2.
- ~~Confirm whether Production sits behind Vercel Deployment Protection~~ — ✅ **checked 2026-08-08, empirically confirmed OFF.** `curl -I https://ordiftstudios.com/` returns a clean `HTTP 200` with normal app headers, no redirect to `vercel.com/sso-api`, no `WWW-Authenticate` challenge — the exact signature that *was* present when Preview's Deployment Protection was first discovered earlier in this engagement. Its absence here means Production has no Vercel-level auth wall; the Protection Bypass query-param pattern used for staging's webhook is **not needed** for Production's webhook. (Method: external HTTP check, not a direct dashboard read — conclusive by the same signature already validated once in this engagement, but a 10-second dashboard glance at Project Settings → Deployment Protection would make it a first-hand-read-too if you want belt-and-suspenders confirmation.)
- Cloudflare Turnstile is already live in Production for public forms — no new Turnstile work needed for payments (checkout isn't Turnstile-gated).

## 6. Confirmed working on staging (do not re-test unless something changes)

- Real Test Mode **Card** payment end-to-end: checkout → Paystack hosted page → webhook → `payments.status = completed` → `enquiries.amount_paid` synced correctly → account correctly linked to the paying customer (`PAY-2026-000002`).
- **Webhook signature verification** (HMAC-SHA512): confirmed `signature_valid: true` on a real event.
- **Idempotency**: confirmed exactly one `payment_webhook_events` row per real event — no duplicate processing.
- **Amount/currency validation**: confirmed present and unchanged (rejects any gateway-confirmed amount that doesn't match the locked checkout amount).
- **Declined/failed transaction handling**: after this session's fix, a genuinely-declined charge now resolves correctly instead of hanging at `pending` indefinitely.
- **Bank Transfer isolation**: confirmed via `git log` that zero commits this session touched the bank-transfer code path (`bank-transfer/proof/route.ts`, `admin/payments/actions.ts`, `bankAccounts.ts`); its balance-sync logic is a separate function, not shared with anything changed today. No regression risk. **Caveat:** this session verified isolation via code inspection only, not a fresh live click-through — the last live smoke test of Bank Transfer was earlier in the broader engagement (task-tracked complete), before this session's changes existed. If you want belt-and-suspenders confidence, one live Bank Transfer run on staging before Production is cheap insurance, not a requirement.

## 7. Mobile Money — ✅ COMPLETE (2026-08-08)

Verified end-to-end on staging, same rigor as Card: `PAY-2026-000007`, $50.00 (GHS 588.00), `channel: mobile_money`. Exactly one `charge.success` webhook, `signature_valid: true`, single event (idempotent). `enquiries.amount_paid` synced to $200.00 = `amount_due` (enquiry now fully paid, $0 balance). Receipt rendered correctly. Confirmed via direct DB queries, not just the UI. No further Mobile Money testing needed before launch.

**Note on the stale-pending-payment guard hit during this test:** the earlier abandoned/declined test attempts (`PAY-2026-000004`, `-000006`) had left a `pending` row that tripped `checkoutService.ts`'s duplicate-checkout guard, blocking a new "balance"-type checkout. Resolved using the **existing reconciliation mechanism already in the codebase** (no new code, no manual DB edits) — visited the payment's own `/payments/[id]/status` page directly (not linked from Payment History, so requires the direct URL), which triggered `reconcilePendingGatewayPayment()` and correctly resolved `PAY-2026-000004` to `failed` via a real Paystack verify call. `PAY-2026-000006` remains `pending` (harmless — different `payment_type`, doesn't block anything, contributes nothing to `amount_paid`). This confirms the reconciliation code from §1 works correctly when actually reachable — the only real gap is the missing UI link, already captured in §8.

## 8. Deferred: scheduled pending-payment reconciliation job

**Not required before launch.** Assessment: the gap (abandoned/pre-charge-declined checkouts stay `pending` with no auto-resolution) never affects money movement or balance accuracy — confirmed this session that stuck `pending` rows do not increment `amount_paid` or generate receipts. It's a UX rough edge, not a financial-integrity risk. Build in the first 1–2 weeks post-launch, not before — unless a future investigation surfaces a financial-integrity angle, in which case re-escalate.

Related, same fix would also close: Payment History list currently has no link/click-through on `pending` rows (only `completed` rows get a Receipt link) — this is *why* reconciliation wasn't reachable mid-session; not a blocker, just context for whoever builds the cron job.

## 9. Staging test data (do NOT delete now — just noted for later cleanup)

- Test payments `PAY-2026-000002` through `PAY-2026-000007` on enquiry `ENQ-2026-000017` (enquiry now shows fully paid, $200/$200).
- Test enquiry `ENQ-2026-000017` itself (linked to `ordiftmodels2@gmail.com`).
- One remaining orphaned `pending` row (`PAY-2026-000006`, $30, `payment_type: partial`) — safe as-is, confirmed not affecting accounting. `PAY-2026-000004` was resolved to `failed` on 2026-08-08 via the existing reconciliation mechanism (see §7), not deleted.

## 10. Recommended execution order, next session onward

Labeled by type — **[READ-ONLY]** = safe to just do; **[PRODUCTION]** = modifies Production in some way, **do not execute without your explicit go-ahead in that moment**, this document alone does not authorize it.

1. ~~Mobile Money live test on staging~~ — ✅ done (§7). Nothing to repeat.
2. **[READ-ONLY]** (optional) One live Bank Transfer click-through on staging, per the caveat in §6, if you want it before Production.
3. **[STOP — GET APPROVAL]** Everything from here on touches Production. Confirm with the user before starting any of steps 4–10.
4. **[PRODUCTION]** Reconcile migration 0026's tracking gap, then promote 0023 → 0024 → 0025 → 0026 (§2).
5. **[EXTERNAL, not code]** Complete Paystack Live Mode business verification (§4.1) — start early, likely the longest pole; can run in parallel with waiting on other approvals.
6. **[PRODUCTION]** Add `PAYSTACK_SECRET_KEY` (Live) + any other Live keys to Vercel Production env (§3).
7. **[PRODUCTION-ADJACENT, external]** Register Production webhook in Paystack Live Mode dashboard (§4.2).
8. ~~Confirm Vercel Deployment Protection status~~ — ✅ done 2026-08-08 (§5), confirmed OFF, no Production action needed here.
9. **[PRODUCTION]** Add a real GHS exchange rate in Production via Admin UI (§3).
10. **[DECISION, then real money]** Decide who performs the **first real Production payment** and at what amount — Live Mode has no test cards, so this is genuine money from the first transaction on.
11. **[PRODUCTION — the big one]** Merge `staging` → `main`, deploy to Production.
12. **[POST-LAUNCH, first 1–2 weeks]** Build the scheduled pending-payment reconciliation job (§8), which would also add the missing click-through link on `pending` Payment History rows.

**Nothing in this document authorizes any Production action.** Every step marked `[PRODUCTION]` above still requires your explicit go-ahead at the time, not implied by having read this checklist.
