import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { authorizeWithSuperAdminOverride, FINANCE_CAPABILITIES } from "@/lib/organization/authority";
import { createEngagement } from "@/lib/payables/engagements";
import { isSupportedCurrency } from "@/lib/payments/currency";
import { SERVICE_FAMILIES } from "./config";
import { resolveAssignmentEligibility } from "./admin";
import { loadConflicts, firmConflicts } from "./conflicts";
import { cancelSlotEngagement } from "./commitmentEstablish";
import { canRespondToOffer, canSendOffer, toCrewJobView, validateInstructions, validateOfferInput, OFFER_OPEN_REQUEST_STATUSES, type CrewJobView } from "./crewOfferRules";
import { notifyCrew } from "./crewNotifications";
import { equipmentLabel } from "./quotationSnapshot";

// Crew offers and the crew member's own response. Built on the existing
// slot (proposed / assigned / declined), the per-person engagement (agreed
// compensation) and the shared notification table. A person becomes
// Assigned ONLY by accepting in the portal; an administrator can offer,
// withdraw and release, never accept or decline on someone's behalf.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const SLOT_ENTITY = "crew_support_slot";

async function loadSlot(slotId: string) {
  const admin = createAdminClient();
  const { data: slot } = await admin
    .from("crew_support_slots")
    .select("id, request_id, requirement_id, slot_number, status, assignee_profile_id, offer_amount, offer_currency, offer_message, offered_at, offered_by, crew_accepted_at, crew_response_at, crew_response_note, crew_instructions")
    .eq("id", slotId)
    .maybeSingle();
  if (!slot) return null;
  const [{ data: request }, { data: requirement }] = await Promise.all([
    admin.from("crew_support_requests").select("id, reference_number, status, is_test, project_name, project_type, service_family, service_details, start_date, end_date, call_time, finish_time, location, urgency, on_site_contact").eq("id", slot.request_id).maybeSingle(),
    admin.from("crew_support_requirements").select("role_label, responsibilities, operational_title_id").eq("id", slot.requirement_id).maybeSingle(),
  ]);
  if (!request || !requirement) return null;
  return { slot, request, requirement };
}

const dateText = (r: { start_date: unknown; end_date: unknown }) => (r.start_date === r.end_date ? String(r.start_date) : `${r.start_date} → ${r.end_date}`);

// ------------------------------------------------------------- staff side
export async function sendCrewOffer(params: { slotId: string; assigneeProfileId: string; amount: number; currency: string; message: string; overrideReason: string | null; actorUserId: string }): Promise<Result<{ warnings: string[]; suppressedTest: boolean }>> {
  const input = validateOfferInput({ amount: params.amount, currency: params.currency, message: params.message });
  if (!input.ok) return { ok: false, error: input.reason };
  if (!(await isSupportedCurrency(params.currency))) return { ok: false, error: `“${params.currency}” is not a supported currency.` };
  const ctx = await loadSlot(params.slotId);
  if (!ctx) return { ok: false, error: "Crew slot not found." };
  const { slot, request, requirement } = ctx;
  const gate = canSendOffer({ slotStatus: slot.status as string, requestStatus: request.status as string });
  if (!gate.ok) return { ok: false, error: gate.reason };
  const isTest = Boolean(request.is_test);

  // The offered compensation becomes the engagement's agreed amount on
  // acceptance, so the person making the offer must hold finance authority.
  if (!isTest) {
    const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.payeeAdminister);
    if (!auth.ok) return { ok: false, error: "Offering compensation needs finance (payee administration) authority. Ask a finance administrator, or a Super Admin." };
  }

  const eligibility = await resolveAssignmentEligibility({ requestId: request.id as string, requirementId: slot.requirement_id as string, profileId: params.assigneeProfileId, overrideReason: params.overrideReason });
  if (!eligibility.ok) return { ok: false, error: eligibility.error };

  const warnings: string[] = [];
  const conflicts = (await loadConflicts([params.assigneeProfileId], { start: request.start_date as string, end: request.end_date as string }, request.id as string, isTest)).get(params.assigneeProfileId) ?? [];
  if (conflicts.length) warnings.push(`${firmConflicts(conflicts).length ? "Conflict" : "Possible clash"}: ${conflicts.map((c) => c.label).join("; ")}. Nobody is reserved by an offer, but check before relying on them.`);

  const now = new Date().toISOString();
  const { data: updated, error } = await createAdminClient()
    .from("crew_support_slots")
    .update({
      status: "proposed", assignee_profile_id: params.assigneeProfileId, assigned_by: params.actorUserId, assigned_at: null,
      offer_amount: params.amount, offer_currency: params.currency, offer_message: params.message.trim() || null, offered_at: now, offered_by: params.actorUserId,
      crew_response_at: null, crew_response_note: null, crew_accepted_at: null, crew_accepted_via: null, crew_accepted_recorded_by: null, crew_acceptance_note: null,
      assignment_override_reason: eligibility.override, assignment_override_by: eligibility.override ? params.actorUserId : null, assignment_override_at: eligibility.override ? now : null,
      updated_at: now,
    })
    .eq("id", params.slotId).in("status", ["unfilled", "declined", "released"]).select("id");
  if (error || !updated?.length) return { ok: false, error: "The slot changed while sending — refresh and try again." };

  await logActivity({ actorUserId: params.actorUserId, action: "crew_support.crew_offer_sent", entityType: "crew_support_request", entityId: request.id as string, metadata: { slotId: params.slotId, assigneeProfileId: params.assigneeProfileId, role: requirement.role_label, offerAmount: params.amount, offerCurrency: params.currency, ...(eligibility.override ? { override: true, overrideReason: eligibility.override } : {}), suppressedTest: isTest } });

  await notifyCrew({ requestId: request.id as string, eventKey: `crew_offer:${params.slotId}:${now}`, template: "crew_offer", vars: { slotId: params.slotId, reference: request.reference_number as string, role: requirement.role_label as string, date: dateText(request) }, recipientProfileId: params.assigneeProfileId, isTest, triggeredBy: params.actorUserId });
  return { ok: true, warnings, suppressedTest: isTest };
}

// Withdraws a pending offer, or releases a person who had accepted (their
// draft engagement is cancelled first; if that can't be done the release is
// refused so an engagement never points at the wrong person).
export async function withdrawOrReleaseSlot(params: { slotId: string; reason: string; actorUserId: string }): Promise<Result<{ wasAccepted: boolean }>> {
  const ctx = await loadSlot(params.slotId);
  if (!ctx) return { ok: false, error: "Crew slot not found." };
  const { slot, request, requirement } = ctx;
  if (!(OFFER_OPEN_REQUEST_STATUSES as readonly string[]).includes(request.status as string)) return { ok: false, error: ["confirmed", "in_production", "completed"].includes(request.status as string) ? "This request is confirmed — crew engagements and payables now exist, so crew can't be changed here. Cancel the request through management instead." : "This request is closed." };
  if (!["proposed", "assigned", "declined"].includes(slot.status as string)) return { ok: false, error: "There is nothing to withdraw on this slot." };
  const wasAccepted = slot.status === "assigned";
  if (wasAccepted && params.reason.trim().length < 5) return { ok: false, error: "Say why a crew member who accepted is being released." };

  if (wasAccepted) {
    const cancelled = await cancelSlotEngagement({ slotId: params.slotId, actorUserId: params.actorUserId, reason: params.reason.trim() || "Released" });
    if (!cancelled.ok) return { ok: false, error: cancelled.error };
  }
  const now = new Date().toISOString();
  const { data: cleared, error } = await createAdminClient()
    .from("crew_support_slots")
    .update({
      status: "unfilled", assignee_profile_id: null, note: params.reason.trim() || null, assigned_by: params.actorUserId, assigned_at: null,
      offer_amount: null, offer_currency: null, offer_message: null, offered_at: null, offered_by: null,
      crew_response_at: null, crew_response_note: null, crew_accepted_at: null, crew_accepted_via: null, crew_accepted_recorded_by: null, crew_acceptance_note: null, crew_instructions: null,
      assignment_override_reason: null, assignment_override_by: null, assignment_override_at: null, updated_at: now,
    })
    .eq("id", params.slotId).eq("status", slot.status as string).select("id");
  if (error || !cleared?.length) return { ok: false, error: "The slot changed — refresh and try again." };

  await logActivity({ actorUserId: params.actorUserId, action: wasAccepted ? "crew_support.crew_released" : "crew_support.crew_offer_withdrawn", entityType: "crew_support_request", entityId: request.id as string, metadata: { slotId: params.slotId, previousAssigneeProfileId: slot.assignee_profile_id, previousStatus: slot.status, reason: params.reason.trim() || null } });
  if (slot.status === "proposed" && slot.assignee_profile_id) {
    await notifyCrew({ requestId: request.id as string, eventKey: `crew_offer_withdrawn:${params.slotId}:${slot.offered_at}`, template: "crew_offer_withdrawn", vars: { slotId: params.slotId, reference: request.reference_number as string, role: requirement.role_label as string, date: dateText(request) }, recipientProfileId: slot.assignee_profile_id as string, isTest: Boolean(request.is_test), triggeredBy: params.actorUserId });
  }
  return { ok: true, wasAccepted };
}

export async function setCrewInstructions(params: { slotId: string; text: string; actorUserId: string }): Promise<Result> {
  const v = validateInstructions(params.text);
  if (!v.ok) return { ok: false, error: v.reason };
  const ctx = await loadSlot(params.slotId);
  if (!ctx) return { ok: false, error: "Crew slot not found." };
  if (["declined", "cancelled", "completed"].includes(ctx.request.status as string)) return { ok: false, error: "This request is closed." };
  if (!["proposed", "assigned"].includes(ctx.slot.status as string)) return { ok: false, error: "Instructions are for a person who has been offered or has accepted the job." };
  const { error } = await createAdminClient().from("crew_support_slots").update({ crew_instructions: params.text.trim() || null, updated_at: new Date().toISOString() }).eq("id", params.slotId);
  if (error) return { ok: false, error: "Could not save the instructions." };
  await logActivity({ actorUserId: params.actorUserId, action: "crew_support.crew_instructions_set", entityType: "crew_support_request", entityId: ctx.request.id as string, metadata: { slotId: params.slotId } });
  return { ok: true };
}

// -------------------------------------------------------------- crew side
// The crew member's own acceptance/decline. The only way a slot becomes
// Assigned. Everything is re-checked on the server: ownership, that the
// offer is still open, and (on accept) that they are not double-booked.
export async function respondToCrewOffer(params: { slotId: string; userId: string; response: "accept" | "decline"; note: string }): Promise<Result<{ state: "accepted" | "declined" }>> {
  const ctx = await loadSlot(params.slotId);
  const unavailable = { ok: false, error: "This offer isn't available." } as const;
  if (!ctx) return unavailable;
  const { slot, request, requirement } = ctx;
  const gate = canRespondToOffer({ userId: params.userId, assigneeProfileId: (slot.assignee_profile_id as string | null) ?? null, slotStatus: slot.status as string, requestStatus: request.status as string });
  if (!gate.ok) return { ok: false, error: gate.reason };
  const admin = createAdminClient();
  const isTest = Boolean(request.is_test);
  const note = params.note.trim().slice(0, 500);
  const now = new Date().toISOString();

  if (params.response === "decline") {
    const { data, error } = await admin.from("crew_support_slots").update({ status: "declined", crew_response_at: now, crew_response_note: note || null, updated_at: now }).eq("id", params.slotId).eq("status", "proposed").eq("assignee_profile_id", params.userId).select("id");
    if (error || !data?.length) return { ok: false, error: "This offer is no longer open." };
    await logActivity({ actorUserId: params.userId, action: "crew_support.crew_offer_declined", entityType: "crew_support_request", entityId: request.id as string, metadata: { slotId: params.slotId, note: note || null, via: "portal" } });
    return { ok: true, state: "declined" };
  }

  // Accept: the person must still be free (firm commitments only).
  const mine = (await loadConflicts([params.userId], { start: request.start_date as string, end: request.end_date as string }, request.id as string, isTest)).get(params.userId) ?? [];
  const firm = firmConflicts(mine);
  if (firm.length) return { ok: false, error: `You already have a commitment on these dates (${firm.map((c) => c.label).join("; ")}). Please contact Ordift rather than accepting.` };

  // Compensation is recorded on the person's engagement ONLY now that they
  // have agreed. Created on behalf of the administrator who made the offer
  // (whose finance authority was checked when they sent it).
  let engagementId: string | null = null;
  let createdNow = false;
  if (!isTest) {
    const { data: existing } = await admin.from("engagements").select("id").eq("entity_type", SLOT_ENTITY).eq("entity_id", params.slotId).neq("status", "cancelled").maybeSingle();
    if (existing) engagementId = existing.id as string;
    else {
      const created = await createEngagement({
        payeeProfileId: params.userId, operationalTitleId: (requirement.operational_title_id as string | null) ?? null,
        roleNote: `Crew Support ${request.reference_number} — ${requirement.role_label}`, entityType: SLOT_ENTITY, entityId: params.slotId,
        currency: slot.offer_currency as string, agreedAmount: Number(slot.offer_amount), startsAt: request.start_date as string, endsAt: request.end_date as string,
        notes: "Accepted by the crew member in the portal.", actorUserId: slot.offered_by as string, suppressNotification: true,
      });
      if (!created.ok) {
        console.error("[crew-support] engagement creation on acceptance failed", created.error);
        return { ok: false, error: "We couldn't record your acceptance because the payment arrangement couldn't be set up. Please contact Ordift — nothing has been accepted." };
      }
      engagementId = created.id;
      createdNow = true;
    }
  }

  const { data, error } = await admin
    .from("crew_support_slots")
    .update({ status: "assigned", assigned_at: now, crew_accepted_at: now, crew_accepted_via: "portal", crew_accepted_recorded_by: params.userId, crew_acceptance_note: note || null, crew_response_at: now, crew_response_note: note || null, updated_at: now })
    .eq("id", params.slotId).eq("status", "proposed").eq("assignee_profile_id", params.userId).select("id");
  if (error || !data?.length) {
    // The offer closed while we were accepting: don't leave an orphan draft engagement behind.
    if (createdNow) await cancelSlotEngagement({ slotId: params.slotId, actorUserId: slot.offered_by as string, reason: "Offer closed during acceptance" });
    return { ok: false, error: "This offer is no longer open." };
  }
  await logActivity({ actorUserId: params.userId, action: "crew_support.crew_offer_accepted", entityType: "crew_support_request", entityId: request.id as string, metadata: { slotId: params.slotId, via: "portal", engagementId, offerAmount: slot.offer_amount, offerCurrency: slot.offer_currency, suppressedTest: isTest } });
  return { ok: true, state: "accepted" };
}

async function jobViews(rows: { id: string }[], userId: string): Promise<CrewJobView[]> {
  const out: CrewJobView[] = [];
  const admin = createAdminClient();
  for (const r of rows) {
    const ctx = await loadSlot(r.id);
    if (!ctx || ctx.slot.assignee_profile_id !== userId) continue;
    const family = SERVICE_FAMILIES.find((f) => f.value === String(ctx.request.service_family));
    let engagementId: string | null = null;
    if (ctx.slot.status === "assigned") {
      const { data: e } = await admin.from("engagements").select("id").eq("entity_type", SLOT_ENTITY).eq("entity_id", r.id).neq("status", "cancelled").maybeSingle();
      engagementId = (e?.id as string | undefined) ?? null;
    }
    out.push(toCrewJobView({
      slot: ctx.slot as never, request: ctx.request as never, role: ctx.requirement.role_label as string, responsibilities: (ctx.requirement.responsibilities as string | null) ?? null,
      serviceLabel: `Creative Crew Support — ${family?.label ?? String(ctx.request.service_family)}`, equipment: equipmentLabel(ctx.request as Record<string, unknown>), engagementId,
    }));
  }
  return out;
}

export async function listMyCrewJobs(userId: string): Promise<CrewJobView[]> {
  const { data } = await createAdminClient().from("crew_support_slots").select("id").eq("assignee_profile_id", userId).in("status", ["proposed", "assigned"]).order("updated_at", { ascending: false });
  return jobViews(data ?? [], userId);
}

export async function getMyCrewJob(slotId: string, userId: string): Promise<CrewJobView | null> {
  return (await jobViews([{ id: slotId }], userId))[0] ?? null;
}

export async function userHasCrewJobs(userId: string): Promise<boolean> {
  const { count } = await createAdminClient().from("crew_support_slots").select("id", { count: "exact", head: true }).eq("assignee_profile_id", userId).in("status", ["proposed", "assigned"]);
  return (count ?? 0) > 0;
}

// The assignment details shown on the crew member's own engagement page —
// only for an engagement they own that came from a Crew Support slot, and
// only once they have accepted.
export async function getCrewAssignmentForEngagement(engagementId: string, userId: string): Promise<CrewJobView | null> {
  const { data: e } = await createAdminClient().from("engagements").select("entity_type, entity_id, payee_profile_id").eq("id", engagementId).maybeSingle();
  if (!e || e.entity_type !== SLOT_ENTITY || e.payee_profile_id !== userId) return null;
  const job = await getMyCrewJob(e.entity_id as string, userId);
  return job && job.state === "accepted" ? job : null;
}
