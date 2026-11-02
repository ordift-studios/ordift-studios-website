// PURE decision logic for authority tickets (no server, no framework imports) so it can be tested directly and shared. See authorityTicket.ts for the explanation.
import { purposeNeedsSecondFactor } from "@/lib/auth/stepUp";

export type TicketResult = { ok: true } | { ok: false; error: string };
export type Why = "no_session" | "database_not_ready" | "second_factor" | "one_time_link" | "not_authorised" | "error";
const MESSAGES: Record<Why, string> = {
  no_session: "Your sign-in could not be confirmed. Sign in again and retry.",
  database_not_ready: "The confirmation step is not available yet. Nothing was changed.",
  second_factor: "This action needs a recent second-factor confirmation. Enter the code from your authenticator app and retry.",
  one_time_link: "Sign in with your password to confirm this action.",
  not_authorised: "Your authority could not be confirmed for this action.",
  error: "Your authority could not be confirmed for this action.",
};

export type TicketTransport = (purpose: string, target: string) => Promise<{ ok: true } | { ok: false; why: Why }>;

// Reads the database's refusal into one of a few reasons. Pure, so the real decision logic below can be tested with any transport.
export function classifyTicketError(error: { code?: string; message?: string }): Why {
  const m = error.message ?? "";
  if (error.code === "PGRST202" || error.code === "42883" || /could not find the function|does not exist/i.test(m)) return "database_not_ready";
  if (/one-time-link/i.test(m)) return "one_time_link";                          // checked first: its message also contains the words "second factor"
  if (/second-factor|second factor/i.test(m)) return "second_factor";
  if (/authorised|authorized|only the Founder/i.test(m)) return "not_authorised";
  return "error";
}

// The decision, separated from the transport so it is the very code the isolated-database tests run.
export async function decideTicket(transport: TicketTransport, enabled: boolean, purpose: string, target: string): Promise<TicketResult> {
  const irreversible = purposeNeedsSecondFactor(purpose);
  if (!enabled && !irreversible) return { ok: true };
  const r = await transport(purpose, target).catch((): { ok: false; why: Why } => ({ ok: false, why: "error" }));
  if (r.ok) return { ok: true };
  if (irreversible) return { ok: false, error: MESSAGES[r.why] };
  // ordinary action: never blocked here. Only the kind of action and the reason are logged (no identity, no token).
  console.warn("[authority-ticket] no ticket for an ordinary action; the database decides", { purpose, why: r.why });
  return { ok: true };
}

