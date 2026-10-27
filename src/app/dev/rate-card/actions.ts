"use server";

import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { buildDraftFromSellingRates } from "@/lib/pdf/rateCard/loaders";
import type { RateCardContent } from "@/lib/pdf/rateCard/types";

// LOCAL DEVELOPMENT ONLY (branch pdf-poc, never deployed). Read-only: loads a DRAFT from the existing selling-rate tables. Super Admin only; writes nothing.
export async function loadDraftFromSellingRatesAction(marketSlug: string): Promise<{ ok: true; draft: RateCardContent } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in." };
  if (!isSuperAdmin(user)) return { ok: false, error: "Only Super Admin may build a rate card draft." };
  return buildDraftFromSellingRates({ marketSlug, today: new Date().toISOString().slice(0, 10) });
}
