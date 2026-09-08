// Password-recovery root-cause fix (2026-09-09) — pure, zero-import
// parsing logic extracted out of ResetPasswordForm.tsx so the "which
// recovery-link format is present" decision is independently, fully
// testable without any DOM/React rendering (this codebase has no
// React-component-testing infrastructure — see the doc-test convention
// used elsewhere — but this one narrow piece of logic doesn't need
// one). Recognizes all three formats Supabase can deliver a recovery
// link in: PKCE `?code=`, the `?token_hash=&type=recovery` form
// (verifyOtp), and the legacy implicit `#access_token=&refresh_token=`
// fragment. Never invents or repairs a malformed value — an
// unrecognized or incomplete combination is always `{ kind: "none" }`,
// which the caller treats as "invalid" rather than guessing.
export type RecoveryLinkParams =
  | { kind: "code"; code: string }
  | { kind: "token_hash"; tokenHash: string }
  | { kind: "fragment"; accessToken: string; refreshToken: string }
  | { kind: "none" };

export function parseRecoveryLink(search: string, hash: string): RecoveryLinkParams {
  const query = new URLSearchParams(search);

  const code = query.get("code");
  if (code) return { kind: "code", code };

  // Only "recovery" — this page exists exclusively for password
  // recovery, never signup/invite/magiclink/email_change confirmation,
  // even though a token_hash could in principle carry any of those
  // EmailOtpType values.
  const tokenHash = query.get("token_hash");
  const type = query.get("type");
  if (tokenHash && type === "recovery") return { kind: "token_hash", tokenHash };

  const fragment = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const accessToken = fragment.get("access_token");
  const refreshToken = fragment.get("refresh_token");
  if (accessToken && refreshToken) return { kind: "fragment", accessToken, refreshToken };

  return { kind: "none" };
}
