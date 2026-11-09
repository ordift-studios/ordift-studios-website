import { createAdminClient } from "@/lib/supabase/admin";
import { bookingFlagOn } from "./rules";
import { formatPlace, formatSession } from "./notificationContent";

// What a CLIENT may see of the booking record (read after the caller has already proved the client owns the enquiry): the confirmed schedule while it stands, or an honest "cancelled" note.
// Never the assigned person's identity, amounts, agreements or internal notes. Null while booking confirmation is off, with no record, or when the tables are absent.
export type ClientBookingView =
  | { state: "confirmed"; reference: string; version: number; sessions: { when: string; place: string; note: string | null }[] }
  | { state: "cancelled"; reference: string; version: number; final: boolean };

export async function loadClientBookingView(enquiryId: string, env: Record<string, string | undefined> = process.env): Promise<ClientBookingView | null> {
  if (!bookingFlagOn(env)) return null;
  try {
    const db = createAdminClient();
    let { data: c, error } = await db.from("enquiry_booking_confirmations").select("id, version, kind, cancellation_outcome").eq("enquiry_id", enquiryId).order("version", { ascending: false }).limit(1).maybeSingle();
    if (error) ({ data: c, error } = await db.from("enquiry_booking_confirmations").select("id, version, kind").eq("enquiry_id", enquiryId).order("version", { ascending: false }).limit(1).maybeSingle());   // outcome column absent
    if (error || !c) return null;
    const { data: e } = await db.from("enquiries").select("reference_number").eq("id", enquiryId).maybeSingle();
    const reference = (e as { reference_number: string } | null)?.reference_number ?? "";
    if (c.kind === "cancelled") return { state: "cancelled", reference, version: c.version as number, final: (c as { cancellation_outcome?: string | null }).cancellation_outcome === "final" };
    const { data: segs } = await db.from("enquiry_booking_segments").select("starts_at, ends_at, timezone, kind, location, platform, note").eq("confirmation_id", c.id as string).order("seq");
    return { state: "confirmed", reference, version: c.version as number, sessions: (segs ?? []).map((s) => ({
      when: formatSession({ startsAt: s.starts_at as string, endsAt: s.ends_at as string, timezone: s.timezone as string }),
      place: formatPlace({ kind: s.kind as "on_site" | "online" | "studio", location: s.location as string | null, platform: s.platform as string | null }), note: (s.note as string | null) ?? null })) };
  } catch { return null; }
}
