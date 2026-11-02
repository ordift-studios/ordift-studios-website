// Second-factor step-up rules for administrator actions that cannot be undone (erasure, log purge, retention-policy changes).
// PURE: no network, no secrets, no imports. The DATABASE is the authority (it reads the verified sign-in token when a confirmation ticket is requested, see migration 0185); this module only decides when the
// application should PROMPT, using the same rule, with a safety margin so a ticket requested straight after the prompt is still inside the database's window.
export const DB_SECOND_FACTOR_WINDOW_SECONDS = 900;                       // the database accepts a second factor completed in the last 15 minutes
export const PROMPT_MARGIN_SECONDS = 60;                                   // prompt again a minute early
export const SECOND_FACTOR_METHODS = ["totp", "webauthn"] as const;

export type AssuranceInfo = { currentLevel: string | null; nextLevel: string | null; methods: { method: string; timestamp: number }[] };
export type StepUpState = "ok" | "needs_code" | "needs_enrolment";

// The same kinds of action the database requires a second factor for (private.portfolio_ticket_min_aal).
export const purposeNeedsSecondFactor = (purpose: string): boolean => /^(erase_|purge_)/.test(purpose) || purpose === "retention_policy";

// Seconds since the most recent completed second factor in this session, or null if none.
export function secondFactorAgeSeconds(a: AssuranceInfo, nowSeconds: number): number | null {
  const times = a.methods.filter((m) => (SECOND_FACTOR_METHODS as readonly string[]).includes(m.method) && Number.isFinite(m.timestamp)).map((m) => m.timestamp);
  return times.length ? Math.max(0, nowSeconds - Math.max(...times)) : null;
}

export function stepUpState(a: AssuranceInfo | null, hasVerifiedFactor: boolean, nowSeconds: number): StepUpState {
  if (!hasVerifiedFactor) return "needs_enrolment";
  if (!a || a.currentLevel !== "aal2") return "needs_code";
  const age = secondFactorAgeSeconds(a, nowSeconds);
  return age !== null && age <= DB_SECOND_FACTOR_WINDOW_SECONDS - PROMPT_MARGIN_SECONDS ? "ok" : "needs_code";
}

// 6 digits, nothing else. Whitespace the authenticator app may add when copying is removed.
export const normaliseCode = (raw: string): string | null => { const c = raw.replace(/\s+/g, ""); return /^\d{6}$/.test(c) ? c : null; };
