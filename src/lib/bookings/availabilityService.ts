import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, hasRole, isStaffOrAdmin, isSuperAdmin } from "@/lib/portal/roles";
import { listOverridePool } from "@/lib/crewSupport/candidates";
import { bookingFlagOn, type Segment } from "./rules";
import { previewConflicts } from "./service";
import { assessAvailability, projectConflicts, STATE_LABEL, type AvailabilityAssessment, type AvailabilityState, type AvailabilityVerification, type ViewConflict } from "./availability";

// AVAILABILITY CHECK BEFORE QUOTING - server side (LOCAL build; flag BOOKING_CONFIRMATION_ENABLED, default off). Staff and admins who handle enquiries may run it; it is NOT a
// Super Admin power. It reads the booking schedule through the SAME conflict function the confirmation uses, records that a check was made (an audit entry, no booking and no
// hold), and returns what the viewer may see. It creates no booking, reservation, payment, quotation or email, and it never marks anything confirmed.
const CLOSED = ["declined", "closed"];
type Fail = { ok: false; error: string };
export const AVAILABILITY_ACTION = "enquiry.availability_checked";

export type AvailabilityResult = { ok: true; state: AvailabilityState; headline: string; reasons: string[]; conflicts: ViewConflict[]; verificationAccepted: boolean; checkedAt: string; notReservation: true } | Fail;
export type PanelPerson = { id: string; name: string };
export type LatestCheck = { state: AvailabilityState; label: string; at: string; byLabel: string | null; start: string | null; stale: boolean; assigneeId: string | null };
export type AvailabilityPanelData = { people: PanelPerson[]; latest: LatestCheck | null; seeReferences: boolean };

const STALE_AFTER_MS = 7 * 86_400_000;

export async function runAvailabilityCheck(params: { actorUserId: string; enquiryId: string; assigneeId: string | null; segments: Segment[]; verification: AvailabilityVerification | null }, env: Record<string, string | undefined> = process.env): Promise<AvailabilityResult> {
  if (!bookingFlagOn(env)) return { ok: false, error: "Availability checks use the booking schedule, which is not switched on." };
  const user = await getCurrentUser();
  if (!user || user.id !== params.actorUserId || !isStaffOrAdmin(user)) return { ok: false, error: "Not authorised to check availability." };
  const admin = createAdminClient();
  const { data: enq } = await admin.from("enquiries").select("id, crm_stage").eq("id", params.enquiryId).maybeSingle();
  if (!enq) return { ok: false, error: "Enquiry not found." };
  if (CLOSED.includes(String(enq.crm_stage))) return { ok: false, error: "This enquiry is closed." };
  if (String(enq.crm_stage) === "booked") return { ok: false, error: "This enquiry is already booked. Use the Booking panel to change it." };
  if (params.assigneeId) {
    const pool = await listOverridePool([]);
    if (!pool.some((p) => p.profileId === params.assigneeId)) return { ok: false, error: "Choose the person from the list of active team members." };
  }
  const today = new Date().toISOString().slice(0, 10);
  const conflicts = params.segments.length > 0 && params.assigneeId ? await previewConflicts({ assigneeId: params.assigneeId, segments: params.segments, excludeEnquiryId: params.enquiryId }, env) : params.assigneeId ? [] : null;
  const a: AvailabilityAssessment = assessAvailability({ assigneeId: params.assigneeId, segments: params.segments, conflicts, verification: params.verification, today });
  // the record that a check was made: strict, so nothing is shown that was not recorded. It is NOT a booking and holds nothing.
  const ver = a.verificationAccepted && params.verification ? { method: params.verification.method, reference: params.verification.reference.trim(), verifiedOn: params.verification.verifiedOn } : null;
  const { error } = await admin.from("activity_log").insert({
    actor_user_id: user.id, action: AVAILABILITY_ACTION, entity_type: "enquiry", entity_id: params.enquiryId,
    metadata: { state: a.state, assigneeId: params.assigneeId, window: params.segments.map((s) => ({ startsAt: s.startsAt, endsAt: s.endsAt, timezone: s.timezone, kind: s.kind })), firmConflicts: a.firm.length, possibleClashes: a.soft.length, verification: ver, notReservation: true, recheckedAtConfirmation: true },
  });
  if (error) { console.error("[availability] audit write failed", error.message); return { ok: false, error: "The check could not be recorded, so nothing is shown. Try again." }; }
  const seeReferences = hasRole(user, "admin") || isSuperAdmin(user);
  return { ok: true, state: a.state, headline: a.headline, reasons: a.reasons, conflicts: projectConflicts([...a.firm, ...a.soft], seeReferences), verificationAccepted: a.verificationAccepted, checkedAt: new Date().toISOString(), notReservation: true };
}

export async function loadLatestAvailabilityCheck(enquiryId: string): Promise<LatestCheck | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("activity_log").select("actor_user_id, metadata, created_at").eq("action", AVAILABILITY_ACTION).eq("entity_id", enquiryId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  const m = (data.metadata ?? {}) as { state?: AvailabilityState; assigneeId?: string | null; window?: { startsAt?: string }[] };
  if (!m.state || !(m.state in STATE_LABEL)) return null;
  let byLabel: string | null = null;
  if (data.actor_user_id) { const { data: p } = await admin.from("profiles").select("member_number").eq("id", data.actor_user_id as string).maybeSingle(); byLabel = (p?.member_number as string | null) ? `member ${p!.member_number}` : null; }   // audit identity standard
  const at = data.created_at as string;
  return { state: m.state, label: STATE_LABEL[m.state], at, byLabel, start: m.window?.[0]?.startsAt ?? null, stale: Date.now() - Date.parse(at) > STALE_AFTER_MS, assigneeId: m.assigneeId ?? null };
}

// Null (nothing rendered, nothing read) unless the flag is on, the viewer is staff or admin, and the enquiry is still open and not booked.
export async function loadAvailabilityPanel(enquiryId: string, env: Record<string, string | undefined> = process.env): Promise<AvailabilityPanelData | null> {
  if (!bookingFlagOn(env)) return null;
  const user = await getCurrentUser();
  if (!user || !isStaffOrAdmin(user)) return null;
  const admin = createAdminClient();
  const { data: enq } = await admin.from("enquiries").select("crm_stage").eq("id", enquiryId).maybeSingle();
  if (!enq || [...CLOSED, "booked"].includes(String(enq.crm_stage))) return null;
  const [pool, latest] = await Promise.all([listOverridePool([]), loadLatestAvailabilityCheck(enquiryId)]);
  return { people: pool.map((p) => ({ id: p.profileId, name: p.name })), latest, seeReferences: hasRole(user, "admin") || isSuperAdmin(user) };
}
