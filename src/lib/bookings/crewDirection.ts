import { createAdminClient } from "@/lib/supabase/admin";
import { bookingFlagOn } from "./rules";

// THE REVERSE DIRECTION (booking -> Crew Support): confirmed ORDINARY bookings of a person, so that Crew Support candidate lists, offers, rescheduling and the confirmation gate see them as firm commitments.
// Inert while BOOKING_CONFIRMATION_ENABLED is off (nothing is read), and inert where the booking tables do not exist (Production today). Read-only. Server-only.
export type ConfirmedBooking = { id: string; reference: string; assigneeId: string; enquiryId: string; segments: { startsAt: string; endsAt: string; timezone: string }[] };

const missingRelation = (e: { code?: string; message?: string } | null) => Boolean(e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|could not find the table/i.test(e.message ?? "")));

export async function loadConfirmedBookingsForPeople(profileIds: string[], env: Record<string, string | undefined> = process.env): Promise<ConfirmedBooking[]> {
  if (!bookingFlagOn(env) || profileIds.length === 0) return [];
  const db = createAdminClient();
  const mine = await db.from("enquiry_booking_confirmations").select("id, enquiry_id, version, kind, assigned_profile_id").in("assigned_profile_id", profileIds).neq("kind", "cancelled");
  if (mine.error) { if (missingRelation(mine.error)) return []; throw new Error(mine.error.message); }
  const rows = (mine.data ?? []) as { id: string; enquiry_id: string; version: number; kind: string; assigned_profile_id: string }[];
  if (rows.length === 0) return [];
  const enquiryIds = [...new Set(rows.map((r) => r.enquiry_id))];
  // a booking is current only if it is the LATEST version for its enquiry (a later change or cancellation supersedes it)
  const all = await db.from("enquiry_booking_confirmations").select("enquiry_id, version").in("enquiry_id", enquiryIds);
  if (all.error) throw new Error(all.error.message);
  const latest = new Map<string, number>();
  for (const r of (all.data ?? []) as { enquiry_id: string; version: number }[]) latest.set(r.enquiry_id, Math.max(latest.get(r.enquiry_id) ?? 0, r.version));
  const current = rows.filter((r) => latest.get(r.enquiry_id) === r.version);
  if (current.length === 0) return [];
  const [segs, enqs] = await Promise.all([
    db.from("enquiry_booking_segments").select("confirmation_id, starts_at, ends_at, timezone").in("confirmation_id", current.map((c) => c.id)),
    db.from("enquiries").select("id, reference_number").in("id", [...new Set(current.map((c) => c.enquiry_id))]),
  ]);
  if (segs.error) throw new Error(segs.error.message);
  if (enqs.error) throw new Error(enqs.error.message);
  const ref = new Map(((enqs.data ?? []) as { id: string; reference_number: string }[]).map((e) => [e.id, e.reference_number]));
  const byConf = new Map<string, { startsAt: string; endsAt: string; timezone: string }[]>();
  for (const s of (segs.data ?? []) as { confirmation_id: string; starts_at: string; ends_at: string; timezone: string }[]) byConf.set(s.confirmation_id, [...(byConf.get(s.confirmation_id) ?? []), { startsAt: s.starts_at, endsAt: s.ends_at, timezone: s.timezone }]);
  return current.map((c) => ({ id: c.id, reference: ref.get(c.enquiry_id) ?? "a booking", assigneeId: c.assigned_profile_id, enquiryId: c.enquiry_id, segments: byConf.get(c.id) ?? [] }));
}
