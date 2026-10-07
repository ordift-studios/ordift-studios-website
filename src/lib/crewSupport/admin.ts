import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import type { CrewSupportStatus, SlotStatus } from "./config";
import { validateSlotChange, validateStatusChange, type SlotLike } from "./rules";
import { getStatusContext } from "./commitmentData";
import { cancelSlotEngagement, establishCommitments } from "./commitmentEstablish";
import { clearsCrewAcceptance } from "./commitmentRules";
import { ENQUIRY_STAGE_SYNC, type CrewSyncEvent } from "./enquirySync";
import { STATUS_NOTIFICATIONS } from "./notificationConfig";
import { notifyCrewSupportEvent } from "./notifications";
import { loadCandidatesForRequirements } from "./candidates";

// Server-only reads/writes for the internal Creative Crew Support
// workflow. Callers MUST have checked canManageCrewSupport() — this
// module uses the admin client and does not re-check. Staff-only data
// (assignee identities) never reaches any public route.

export type CrewSupportListRow = {
  id: string;
  referenceNumber: string;
  status: CrewSupportStatus;
  requesterName: string;
  requesterCompany: string | null;
  leadCompany: string | null;
  serviceFamily: string;
  projectName: string;
  startDate: string;
  endDate: string;
  location: string;
  urgency: string;
  submittedAt: string;
  slotsTotal: number;
  slotsAssigned: number;
  isTest: boolean;
};

export async function listCrewSupportRequests(status?: string): Promise<CrewSupportListRow[]> {
  const admin = createAdminClient();
  let query = admin
    .from("crew_support_requests")
    .select("id, reference_number, status, requester_name, requester_company, lead_company, service_family, project_name, start_date, end_date, location, urgency, submitted_at, is_test")
    .order("submitted_at", { ascending: false })
    .limit(200);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) {
    console.error("[crew-support] failed to list requests", error.message);
    return [];
  }
  const ids = (data ?? []).map((r) => r.id as string);
  const counts = new Map<string, { total: number; assigned: number }>();
  if (ids.length) {
    const { data: slots } = await admin.from("crew_support_slots").select("request_id, status").in("request_id", ids);
    for (const s of slots ?? []) {
      const c = counts.get(s.request_id as string) ?? { total: 0, assigned: 0 };
      c.total += 1;
      if (s.status === "assigned") c.assigned += 1;
      counts.set(s.request_id as string, c);
    }
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    referenceNumber: r.reference_number as string,
    status: r.status as CrewSupportStatus,
    requesterName: r.requester_name as string,
    requesterCompany: (r.requester_company as string | null) ?? null,
    leadCompany: (r.lead_company as string | null) ?? null,
    serviceFamily: r.service_family as string,
    projectName: r.project_name as string,
    startDate: r.start_date as string,
    endDate: r.end_date as string,
    location: r.location as string,
    urgency: r.urgency as string,
    submittedAt: r.submitted_at as string,
    slotsTotal: counts.get(r.id as string)?.total ?? 0,
    slotsAssigned: counts.get(r.id as string)?.assigned ?? 0,
    isTest: Boolean(r.is_test),
  }));
}

export type CrewSupportDetail = {
  request: Record<string, unknown> & { id: string; status: CrewSupportStatus; enquiry_id: string };
  requirements: { id: string; operational_title_id: string | null; role_label: string; custom_role: string | null; quantity: number; responsibilities: string | null }[];
  slots: { id: string; requirement_id: string; slot_number: number; status: SlotStatus; assignee_profile_id: string | null; assigneeName: string | null; note: string | null }[];
};

export async function getCrewSupportDetail(id: string): Promise<CrewSupportDetail | null> {
  const admin = createAdminClient();
  const { data: request, error } = await admin.from("crew_support_requests").select("*").eq("id", id).maybeSingle();
  if (error || !request) return null;
  const [{ data: requirements }, { data: slots }] = await Promise.all([
    admin.from("crew_support_requirements").select("id, operational_title_id, role_label, custom_role, quantity, responsibilities").eq("request_id", id).order("sort_order"),
    admin.from("crew_support_slots").select("id, requirement_id, slot_number, status, assignee_profile_id, note").eq("request_id", id).order("slot_number"),
  ]);
  const profileIds = [...new Set((slots ?? []).map((s) => s.assignee_profile_id as string | null).filter((p): p is string => Boolean(p)))];
  const names = new Map<string, string>();
  if (profileIds.length) {
    const { data: profiles } = await admin.from("profiles").select("id, full_name").in("id", profileIds);
    for (const p of profiles ?? []) names.set(p.id as string, (p.full_name as string | null) ?? "Unnamed profile");
  }
  return {
    request: request as CrewSupportDetail["request"],
    requirements: (requirements ?? []) as CrewSupportDetail["requirements"],
    slots: (slots ?? []).map((s) => ({
      id: s.id as string,
      requirement_id: s.requirement_id as string,
      slot_number: s.slot_number as number,
      status: s.status as SlotStatus,
      assignee_profile_id: (s.assignee_profile_id as string | null) ?? null,
      assigneeName: s.assignee_profile_id ? names.get(s.assignee_profile_id as string) ?? null : null,
      note: (s.note as string | null) ?? null,
    })),
  };
}

// One-way CRM sync (explicit mapping in enquirySync.ts). Atomic
// conditional update so a repeat call is a no-op; best-effort and logged.
export async function syncEnquiryStage(params: { enquiryId: string; event: CrewSyncEvent; actorUserId: string | null; requestId: string }): Promise<void> {
  const rule = ENQUIRY_STAGE_SYNC[params.event];
  if (!rule.to) return;
  const { data, error } = await createAdminClient().from("enquiries").update({ crm_stage: rule.to }).eq("id", params.enquiryId).in("crm_stage", rule.from).select("id");
  if (error) {
    console.error("[crew-support] enquiry stage sync failed", params.event, error.message);
    return;
  }
  if (data?.length) {
    await logActivity({ actorUserId: params.actorUserId, action: "enquiry.stage_change", entityType: "enquiry", entityId: params.enquiryId, metadata: { stage: rule.to, source: "crew_support", event: params.event, requestId: params.requestId } });
  }
}

// The single place a Crew Support status is written. `automatic` marks a
// transition caused by a real event (quote issued/accepted) rather than a
// person choosing from the dropdown; both are attributed and audited.
export async function commitCrewSupportStatus(params: { requestId: string; from: CrewSupportStatus; to: CrewSupportStatus; actorUserId: string | null; automatic: boolean; reason?: string }): Promise<{ ok: true; warnings?: string[] } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("crew_support_requests").update({ status: params.to, updated_at: new Date().toISOString() }).eq("id", params.requestId).eq("status", params.from).select("id, reference_number, enquiry_id");
  if (error) return { ok: false, error: "Could not update the status. Please try again." };
  if (!data?.length) return { ok: false, error: "The request changed while you were editing — refresh and try again." };
  await logActivity({ actorUserId: params.actorUserId, action: "crew_support.status_changed", entityType: "crew_support_request", entityId: params.requestId, metadata: { from: params.from, to: params.to, reference: data[0].reference_number, automatic: params.automatic, reason: params.reason ?? null } });

  // Coordinated side effects — never allowed to undo or fail the committed status.
  const warnings: string[] = [];
  try {
    const enquiryId = data[0].enquiry_id as string;
    const event: CrewSyncEvent | null = params.to === "under_review" ? "under_review" : params.to === "declined" ? "declined" : params.to === "cancelled" ? "cancelled" : params.to === "confirmed" ? "confirmed" : null;
    if (event) await syncEnquiryStage({ enquiryId, event, actorUserId: params.actorUserId, requestId: params.requestId });
    const template = STATUS_NOTIFICATIONS[params.to];
    if (template) await notifyCrewSupportEvent({ requestId: params.requestId, eventKey: `status:${params.to}`, template, triggeredBy: params.actorUserId });
    // Confirmed is the hard-commitment point: engagements, project access
    // and crew payables are established here (idempotently; test records
    // are suppressed inside).
    if (params.to === "confirmed") {
      const established = await establishCommitments({ requestId: params.requestId, actorUserId: params.actorUserId });
      if (!established.ok) warnings.push(`Crew commitments: ${established.error}`);
      else warnings.push(...established.warnings);
    }
  } catch (sideEffectError) {
    console.error("[crew-support] status side effects failed", params.to, sideEffectError);
    warnings.push("Some follow-up steps failed — use “Complete confirmation” on this request to retry them.");
  }
  return { ok: true, warnings };
}

export async function setCrewSupportStatus(params: { requestId: string; to: CrewSupportStatus; actorUserId: string }): Promise<{ ok: true; warnings?: string[] } | { ok: false; error: string }> {
  const detail = await getCrewSupportDetail(params.requestId);
  if (!detail) return { ok: false, error: "Request not found." };
  const slots: SlotLike[] = detail.slots.map((s) => ({ status: s.status, assigneeProfileId: s.assignee_profile_id }));
  const check = validateStatusChange(detail.request.status, params.to, slots, await getStatusContext(params.requestId));
  if (!check.ok) return { ok: false, error: check.reason };
  return commitCrewSupportStatus({ requestId: params.requestId, from: detail.request.status, to: params.to, actorUserId: params.actorUserId, automatic: false });
}

export async function setCrewSupportSlot(params: {
  slotId: string;
  status: SlotStatus;
  assigneeProfileId: string | null;
  note: string | null;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: slot, error: slotError } = await admin.from("crew_support_slots").select("id, request_id, requirement_id, status, assignee_profile_id").eq("id", params.slotId).maybeSingle();
  if (slotError || !slot) return { ok: false, error: "Crew slot not found." };
  const { data: request } = await admin.from("crew_support_requests").select("status, reference_number").eq("id", slot.request_id).maybeSingle();
  if (!request) return { ok: false, error: "Request not found." };

  const clearsAssignee = params.status === "unfilled";
  const assignee = clearsAssignee ? null : params.assigneeProfileId;
  const check = validateSlotChange({ requestStatus: request.status as CrewSupportStatus, status: params.status, assigneeProfileId: assignee });
  if (!check.ok) return { ok: false, error: check.reason };

  // Server-side eligibility: a crafted form cannot propose/assign someone
  // who lacks a matching capability for this role.
  if (assignee && (params.status === "proposed" || params.status === "assigned")) {
    const eligible = await isEligibleAssignee({ requestId: slot.request_id as string, requirementId: slot.requirement_id as string, profileId: assignee });
    if (!eligible) return { ok: false, error: "This person has no matching, active capability for this role. Add or verify the capability first (Crew Support → Capabilities)." };
  }

  // Crew acceptance belongs to ONE person in the assigned state. Changing
  // the person or the status clears it, and the draft engagement carrying
  // their compensation is cancelled first (aborting this change if that
  // can't be done) so an engagement never points at the wrong person.
  const clears = clearsCrewAcceptance({ previousAssigneeId: (slot.assignee_profile_id as string | null) ?? null, previousStatus: slot.status as string, nextAssigneeId: assignee, nextStatus: params.status });
  if (clears && slot.status === "assigned") {
    const cancelled = await cancelSlotEngagement({ slotId: params.slotId, actorUserId: params.actorUserId, reason: `Slot changed to ${params.status}` });
    if (!cancelled.ok) return { ok: false, error: cancelled.error };
  }

  const { error } = await admin
    .from("crew_support_slots")
    .update({
      status: params.status,
      assignee_profile_id: assignee,
      note: params.note,
      assigned_by: params.actorUserId,
      assigned_at: params.status === "assigned" || params.status === "proposed" ? new Date().toISOString() : null,
      ...(clears ? { crew_accepted_at: null, crew_accepted_via: null, crew_accepted_recorded_by: null, crew_acceptance_note: null } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.slotId);
  if (error) return { ok: false, error: "Could not update this crew slot. Please try again." };

  await logActivity({
    actorUserId: params.actorUserId,
    action: "crew_support.slot_updated",
    entityType: "crew_support_request",
    entityId: slot.request_id as string,
    metadata: { slotId: params.slotId, from: slot.status, to: params.status, assigneeProfileId: assignee, reference: request.reference_number },
  });
  return { ok: true };
}

async function isEligibleAssignee(params: { requestId: string; requirementId: string; profileId: string }): Promise<boolean> {
  const admin = createAdminClient();
  const [{ data: request }, { data: requirement }] = await Promise.all([
    admin.from("crew_support_requests").select("start_date, end_date, is_test").eq("id", params.requestId).maybeSingle(),
    admin.from("crew_support_requirements").select("id, operational_title_id").eq("id", params.requirementId).maybeSingle(),
  ]);
  if (!request || !requirement) return false;
  const result = await loadCandidatesForRequirements({
    requestId: params.requestId,
    isTest: Boolean(request.is_test),
    range: { start: request.start_date as string, end: request.end_date as string },
    requirements: [{ id: requirement.id as string, operationalTitleId: (requirement.operational_title_id as string | null) ?? null }],
  });
  return result[requirement.id as string]?.candidates.some((c) => c.profileId === params.profileId) ?? false;
}
