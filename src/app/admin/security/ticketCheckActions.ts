"use server";

import { getCurrentUser } from "@/lib/portal/roles";
import { isManagementUser } from "@/lib/crewSupport/management";
import { mintTicket } from "@/lib/portfolio/authorityTicket";

export type TicketCheckResult = { ok: boolean; message: string };

// "Check the confirmation path" for the Founder and executive administrators. It asks the database for a ticket from the caller's OWN signed-in session, for a target that no write can ever name
// ("ticket-check"), so the ticket can never be used for anything and simply expires after 90 seconds. It writes no permission record and performs no erasure. It records one expired ticket row.
// kind "ordinary": proves the signed-in session reaches the database and is accepted. kind "second_factor": additionally proves the recent second factor is recognised.
export async function checkTicketPath(kind: "ordinary" | "second_factor"): Promise<TicketCheckResult> {
  const user = await getCurrentUser();
  if (!user || !(await isManagementUser(user))) return { ok: false, message: "Only the Founder or an executive administrator can run this check." };
  const purpose = kind === "second_factor" ? "erase_record" : "declare_people";
  const r = await mintTicket(user, purpose, "ticket-check");
  if (r.ok) return { ok: true, message: kind === "second_factor" ? "Confirmed: your second factor was recognised. Nothing was changed." : "Confirmed: your sign-in was recognised. Nothing was changed." };
  const text: Record<string, string> = {
    no_session: "Your sign-in could not be confirmed. Sign in again and retry.",
    database_not_ready: "The confirmation step is not installed in the database yet.",
    second_factor: "Your session has no recent second factor. Complete the step above, then retry.",
    one_time_link: "This session was opened with a one-time link. Sign in with your password.",
    not_authorised: "Your account does not hold the authority needed.",
    error: "The check failed. Nothing was changed.",
  };
  return { ok: false, message: text[r.why] ?? text.error };
}
