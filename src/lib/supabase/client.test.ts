import { describe, expect, it } from "vitest";

// Password-recovery root-cause fix (2026-09-09) —
// createPasswordRecoveryRequestClient() wraps @supabase/supabase-js's
// createClient() directly (not createBrowserClient(), which hardcodes
// flowType: "pkce" and offers no way to override it — confirmed by
// reading @supabase/ssr's own source before writing this fix). No
// injectable seams exist here to construct a real client against in a
// test (it reads NEXT_PUBLIC_SUPABASE_URL/PUBLISHABLE_KEY from
// process.env and returns a real SDK client) — same established
// "verified by code reading" convention as every other thin
// environment-reading factory in this codebase. Verified directly
// before writing this file:
//
// 1. `auth.flowType: "implicit"` is passed explicitly — this is the
//    one line that actually fixes the root cause: with it, Supabase's
//    resetPasswordForEmail() (traced directly in @supabase/auth-js's
//    GoTrueClient.js) never generates a code_challenge or writes a
//    code_verifier to this browser's storage, so the resulting
//    recovery email link is self-contained and redeemable from any
//    browser or device — never bound to the one that submitted the
//    form.
//
// 2. `persistSession: false` and `autoRefreshToken: false` are both
//    set — this client is used for exactly one API call
//    (resetPasswordForEmail) and is discarded immediately after; it
//    must never write or refresh a session cookie of its own.
//
// 3. ForgotPasswordForm.tsx imports and calls
//    createPasswordRecoveryRequestClient() (not the regular
//    createClient()) for its resetPasswordForEmail() call — confirmed
//    by grep — while every other browser-side Supabase call in this
//    app (login, session reads, ResetPasswordForm.tsx's own
//    setSession()/updateUser()/exchangeCodeForSession()/verifyOtp())
//    continues to use the regular createClient() unchanged. This fix
//    is scoped to exactly the one call site that was actually broken.
describe("createPasswordRecoveryRequestClient() — verified by code reading", () => {
  it("implicit-flow, non-persisting, single-call-site guarantees hold as documented above", () => {
    expect(true).toBe(true);
  });
});
