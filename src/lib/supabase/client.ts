import { createBrowserClient } from "@supabase/ssr";

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
