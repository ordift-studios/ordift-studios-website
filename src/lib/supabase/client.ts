import { createBrowserClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Browser-side client — uses the publishable key (this project's new-
// system replacement for the legacy anon key), safe to expose. RLS
// governs what it can actually read/write, see supabase/migrations/.
//
// detectSessionInUrl: false (2026-08-16) — GoTrueClient defaults this to
// true, which makes it automatically parse the current URL and exchange
// any PKCE `code`/implicit tokens it finds the instant the client is
// constructed. ResetPasswordForm.tsx already does this exchange itself,
// explicitly and deliberately (it needs the exact result to decide
// which UI to show) — with auto-detection also enabled, the two raced
// to consume the same one-time code/verifier, and whichever call lost
// failed with AuthPKCECodeVerifierMissingError even though the verifier
// had been valid moments earlier. No other flow in this app depends on
// automatic URL session detection (confirmed 2026-08-16): the only
// other browser-client call sites are ForgotPasswordForm.tsx, which
// never has a code in its URL, and PresenceProvider.tsx, which uses the
// client for Realtime auth, not URL callbacks; there are no
// onAuthStateChange listeners anywhere expecting a session to appear
// automatically, and signup's email-confirmation link redirects to
// /portal/login, which already prompts for a manual sign-in.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { detectSessionInUrl: false } }
  );
}

// Root-cause fix (2026-09-09) — real Production password-recovery
// failure. createBrowserClient() above hardcodes flowType: "pkce"
// unconditionally — confirmed by reading @supabase/ssr's own source
// directly, it is a literal in createBrowserClient.js, not derived
// from any option this app passes. Traced the actual consequence
// directly in @supabase/auth-js's GoTrueClient.js: with flowType
// "pkce", resetPasswordForEmail() generates a code_challenge and
// WRITES its matching code_verifier into this SAME browser's own
// cookie storage (getCodeChallengeAndMethod()) before the request is
// even sent — and the emailed recovery link's `?code=` can only be
// redeemed by exchangeCodeForSession() finding that exact verifier
// again (_exchangeCodeForSession() reads it back and throws
// AuthPKCECodeVerifierMissingError immediately, before any network
// call, if it's missing).
//
// That is fundamentally incompatible with how a password-recovery
// email is actually opened: the link is read via email, on whatever
// browser or device the recipient happens to check their inbox from —
// there is no guarantee, and often no reason to expect, that it's the
// same browser that submitted the forgot-password form. This explains
// a genuinely 100%-reproducible failure (not a flaky/expiry one): a
// missing verifier is the deterministic, only possible outcome
// whenever the two aren't the same browser session, which in practice
// is most of the time for a real user.
//
// Fix: a separate, minimal, throwaway client used ONLY to call
// resetPasswordForEmail(), with flowType explicitly "implicit". With
// no code_challenge sent, Supabase issues a self-contained recovery
// link (`#access_token=...&refresh_token=...` fragment) that carries
// everything needed to establish the session directly — no locally-
// stored secret required at all, so it works from any browser or
// device, exactly the real-world case email links must support.
// persistSession/autoRefreshToken are both off deliberately: this
// client exists for exactly one API call and is discarded immediately
// after — it must never persist or refresh a session of its own.
// created via @supabase/supabase-js directly (not createBrowserClient)
// specifically so flowType can be overridden — createBrowserClient
// does not allow that, per the trace above.
export function createPasswordRecoveryRequestClient() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
