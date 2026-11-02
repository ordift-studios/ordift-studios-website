import { createClient } from "@/lib/supabase/server";
import type { CurrentUser } from "@/lib/portal/roles";
import { AUTHORITY_TICKETS_ENABLED } from "./authorityTicketGate";
import { decideTicket, classifyTicketError, type TicketResult, type Why } from "./authorityTicketCore";
export { AUTHORITY_TICKETS_ENABLED };

// Authority tickets. An administrator-attributed write to the permission tables, or a call to an erasure/purge function, first obtains a short-lived
// single-use ticket FROM THE ADMINISTRATOR'S OWN SIGNED-IN SESSION: the database reads the identity from the verified JWT, not from this server.
//
// The database is the authority; this module only obtains the ticket. Two kinds of action, deliberately different:
//  * ORDINARY actions (records, requests, reviews, holds, people): while AUTHORITY_TICKETS_ENABLED is false nothing is requested. When it is true a ticket is requested; if one cannot be obtained
//    for any reason (database not ready, session problem, network) the write is still attempted and the DATABASE decides: in its observe mode it succeeds, in its enforce mode it is refused. So this
//    module can never make an ordinary administrator write unavailable by itself, in any release order.
//  * IRREVERSIBLE actions (erasure, purge, retention policy; see purposeNeedsSecondFactor): a ticket is ALWAYS requested, whatever the switch says, and the action is refused here if none can be
//    obtained. The database requires a recent second factor for these in every mode.
export type { TicketResult };

// Ask the database for a ticket for exactly this action and record, from the visitor's own session. Ignores the switch: used directly by the "check the confirmation path" control.
export async function mintTicket(user: CurrentUser, purpose: string, target: string): Promise<{ ok: true } | { ok: false; why: Why }> {
  try {
    const supabase = await createClient();                                        // the visitor's own session (cookies), publishable key: "me", not the admin client
    const { data } = await supabase.auth.getUser();                               // verified with the Auth server, not read from the cookie
    if (!data.user || data.user.id !== user.id) return { ok: false, why: "no_session" };
    const { error } = await supabase.rpc("portfolio_authority_ticket", { p_purpose: purpose, p_target: target });
    return error ? { ok: false, why: classifyTicketError(error) } : { ok: true };
  } catch {
    return { ok: false, why: "error" };
  }
}

export const authorityTicket = (user: CurrentUser, purpose: string, target: string): Promise<TicketResult> =>
  decideTicket((p, t) => mintTicket(user, p, t), AUTHORITY_TICKETS_ENABLED, purpose, target);
