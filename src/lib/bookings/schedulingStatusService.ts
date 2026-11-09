import { createAdminClient } from "@/lib/supabase/admin";
import { bookingFlagOn } from "./rules";
import { clientSchedulingLabel, schedulingStatus, type SchedulingStatus } from "./paymentStagePolicy";

// Derived "Paid — scheduling pending" status (read-only; no writes). Server only. Returns null while booking confirmation is off,
// when the booking tables are not there (Production today), or when nothing needs saying. A read failure NEVER invents a status.
export async function loadSchedulingStatus(
  e: { id: string; crmStage: string; paymentStatus: string | null; amountPaid: number | null; commercialIntent?: string | null },
  env: Record<string, string | undefined> = process.env,
): Promise<SchedulingStatus | null> {
  if (!bookingFlagOn(env)) return null;
  try {
    const { data, error } = await createAdminClient().from("enquiry_booking_confirmations").select("kind").eq("enquiry_id", e.id).order("version", { ascending: false }).limit(1).maybeSingle();
    if (error) return null;
    const hasLiveBooking = Boolean(data) && (data as { kind: string }).kind !== "cancelled";
    return schedulingStatus({ flagOn: true, crmStage: e.crmStage, paymentStatus: e.paymentStatus, amountPaid: e.amountPaid, hasLiveBooking, commercialIntent: e.commercialIntent });
  } catch { return null; }
}

// Overlay the derived label on dashboard cards (client wording). Cards for projects with nothing to add are returned unchanged.
export async function withSchedulingLabels<C extends { id: string; statusLabel: string }>(
  cards: C[],
  enquiries: { id: string; crmStage: string; paymentStatus: string | null; amountPaid: number | null }[],
  env: Record<string, string | undefined> = process.env,
): Promise<C[]> {
  if (!bookingFlagOn(env) || cards.length === 0) return cards;
  const byId = new Map(enquiries.map((e) => [e.id, e]));
  return Promise.all(cards.map(async (c) => {
    const e = byId.get(c.id); if (!e) return c;
    const s = await loadSchedulingStatus(e, env);
    return s ? { ...c, statusLabel: clientSchedulingLabel(s) } : c;
  }));
}
