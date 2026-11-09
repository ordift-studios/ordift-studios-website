"use server";

import { getCurrentUser } from "@/lib/portal/roles";
import { searchClientsForStaff, type LookupResult } from "@/lib/enquiry/staffClientLookup";

// Read-only. The signed-in user is resolved here and the service re-checks that they are staff or admin; it audits and rate-limits every call.
export async function searchClientsAction(query: string): Promise<LookupResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You must be signed in." };
  return searchClientsForStaff({ actorUserId: user.id, query: String(query ?? "") });
}
