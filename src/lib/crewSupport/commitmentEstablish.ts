import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { authorizeWithSuperAdminOverride, FINANCE_CAPABILITIES } from "@/lib/organization/authority";
import { createEngagement, createEngagementPayable, setEngagementStatus } from "@/lib/payables/engagements";
import { assignUserToProject } from "@/lib/admin/projectAssignments";
import { accessExpiryFor, validateCrewAcceptanceInput } from "./commitmentRules";
import { getCommitmentSnapshot } from "./commitmentData";

// Crew commitments — built ONLY on the existing finance/work records:
//   per-person   engagements (agreed compensation, currency, who/when)
//   payable      payment_obligations via createEngagementPayable()
//   access       project_assignments (collaborator workspace)
// No Crew Support payout table exists or is created. The client selling
// price lives on the quotation and is never read here.
//
// QA/test requests never create engagements, payables, assignments or crew
// emails: createEngagement notifies the crew member for real and a payable
// is a real financial obligation. Their acceptance is still recorded (and
// the would-be compensation audited) so the workflow can be exercised.

const SLOT_ENTITY = "crew_support_slot";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

// ------------------------------------------------- record crew acceptance
// Staff records that the assigned person AGREED to the job, with the
// compensation Ordift agreed to pay them. The slot keeps the operational
// fact (accepted, when, how, by whom); the money lives on the engagement.
export async function recordCrewAcceptance(params: { slotId: string; amount: number; currency: string; note: string; actorUserId: string }): Promise<Result<{ suppressedTest?: boolean; alreadyRecorded?: boolean }>> {
  const input = validateCrewAcceptanceInput({ amount: params.amount, currency: params.currency, note: params.note });
  if (!input.ok) return { ok: false, error: input.reason };

  const admin = createAdminClient();
  const { data: slot } = await admin.from("crew_support_slots").select("id, request_id, requirement_id, status, assignee_profile_id, crew_accepted_at").eq("id", params.slotId).maybeSingle();
  if (!slot) return { ok: false, error: "Crew slot not found." };
  if (slot.status !== "assigned" || !slot.assignee_profile_id) return { ok: false, error: "Assign a person to this slot first — acceptance is recorded for an assigned person." };

  const { data: request } = await admin.from("crew_support_requests").select("id, reference_number, status, is_test, start_date, end_date, enquiry_id").eq("id", slot.request_id).maybeSingle();
  if (!request) return { ok: false, error: "Request not found." };
  if (["declined", "cancelled", "confirmed"].includes(request.status as string)) return { ok: false, error: "This request is closed or already confirmed — crew acceptance can no longer be changed." };

  const { data: requirement } = await admin.from("crew_support_requirements").select("role_label, operational_title_id").eq("id", slot.requirement_id).maybeSingle();
  const roleLabel = (requirement?.role_label as string | undefined) ?? "Crew";
  const isTest = Boolean(request.is_test);

  let engagementId: string | null = null;
  if (!isTest) {
    const authorized = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.payeeAdminister);
    if (!authorized.ok) return { ok: false, error: "Recording crew compensation needs finance (payee administration) authority. Ask a finance administrator, or a Super Admin." };

    const { data: existing } = await admin.from("engagements").select("id, payee_profile_id, agreed_amount, currency, status").eq("entity_type", SLOT_ENTITY).eq("entity_id", params.slotId).neq("status", "cancelled").maybeSingle();
    if (existing) {
      const same = existing.payee_profile_id === slot.assignee_profile_id && Number(existing.agreed_amount) === params.amount && existing.currency === params.currency;
      if (same && slot.crew_accepted_at) return { ok: true, alreadyRecorded: true };
      if (existing.status !== "draft") return { ok: false, error: "This crew member's engagement is already active — change compensation through the engagement, not here." };
      const { error } = await admin.from("engagements").update({ payee_profile_id: slot.assignee_profile_id, agreed_amount: params.amount, currency: params.currency, notes: params.note.trim() }).eq("id", existing.id);
      if (error) return { ok: false, error: "Could not update the agreed compensation. Please try again." };
      engagementId = existing.id as string;
    } else {
      const created = await createEngagement({
        payeeProfileId: slot.assignee_profile_id as string,
        operationalTitleId: (requirement?.operational_title_id as string | null) ?? null,
        roleNote: `Crew Support ${request.reference_number} — ${roleLabel}`,
        entityType: SLOT_ENTITY,
        entityId: params.slotId,
        currency: params.currency,
        agreedAmount: params.amount,
        startsAt: request.start_date as string,
        endsAt: request.end_date as string,
        notes: params.note.trim(),
        actorUserId: params.actorUserId,
      });
      if (!created.ok) return { ok: false, error: created.error };
      engagementId = created.id;
    }
  }

  const { data: marked, error } = await admin
    .from("crew_support_slots")
    .update({ crew_accepted_at: new Date().toISOString(), crew_accepted_via: "staff_recorded", crew_accepted_recorded_by: params.actorUserId, crew_acceptance_note: params.note.trim(), updated_at: new Date().toISOString() })
    .eq("id", params.slotId).eq("status", "assigned").eq("assignee_profile_id", slot.assignee_profile_id as string)
    .select("id");
  if (error || !marked?.length) return { ok: false, error: "The slot changed while recording — refresh and try again." };

  await logActivity({
    actorUserId: params.actorUserId,
    action: "crew_support.crew_accepted",
    entityType: "crew_support_request",
    entityId: request.id as string,
    metadata: { slotId: params.slotId, assigneeProfileId: slot.assignee_profile_id, role: roleLabel, agreedAmount: params.amount, currency: params.currency, note: params.note.trim(), engagementId, via: "staff_recorded", suppressedTest: isTest, summary: isTest ? "QA/test record: acceptance recorded; engagement, payable and crew email suppressed" : "Crew acceptance and agreed compensation recorded" },
  });
  return { ok: true, suppressedTest: isTest };
}

// Cancels the (draft) engagement behind a slot when the person assigned
// to it changes. Called BEFORE the slot is updated; a failure aborts the
// slot change so an engagement is never left pointing at the wrong person.
export async function cancelSlotEngagement(params: { slotId: string; actorUserId: string; reason: string }): Promise<Result<{ cancelled: boolean }>> {
  const admin = createAdminClient();
  const { data: eng } = await admin.from("engagements").select("id, status, payment_obligation_id").eq("entity_type", SLOT_ENTITY).eq("entity_id", params.slotId).neq("status", "cancelled").maybeSingle();
  if (!eng) return { ok: true, cancelled: false };
  if (eng.payment_obligation_id || eng.status !== "draft") return { ok: false, error: "This crew member's engagement is already active or has a payable, so the slot can't be changed here." };
  const r = await setEngagementStatus({ engagementId: eng.id as string, status: "cancelled", actorUserId: params.actorUserId });
  if (!r.ok) return { ok: false, error: r.error };
  await logActivity({ actorUserId: params.actorUserId, action: "crew_support.engagement_cancelled", entityType: "engagement", entityId: eng.id as string, metadata: { slotId: params.slotId, reason: params.reason } });
  return { ok: true, cancelled: true };
}

// ------------------------------------------------ establish commitments
// Runs when a request becomes Confirmed (and can be re-run safely). Every
// step first checks whether it already happened, so a retry never creates
// a second engagement, assignment or payable:
//   1. engagement   draft -> engagement_active
//   2. assignment   project_assignments row (skipped if one exists at all,
//                   so an admin's removal is respected)
//   3. payable      createEngagementPayable() — starts pending_approval;
//                   creating or approving it never moves money
export async function establishCommitments(params: { requestId: string; actorUserId: string | null }): Promise<Result<{ warnings: string[]; created: { engagements: number; assignments: number; payables: number }; suppressedTest: boolean }>> {
  const snapshot = await getCommitmentSnapshot(params.requestId);
  if (!snapshot) return { ok: false, error: "Request not found." };
  if (snapshot.status !== "confirmed") return { ok: false, error: "Commitments are only established for a confirmed request." };
  const warnings: string[] = [];
  const created = { engagements: 0, assignments: 0, payables: 0 };

  if (snapshot.isTest) {
    await logActivity({ actorUserId: params.actorUserId, action: "crew_support.commitments_suppressed_test", entityType: "crew_support_request", entityId: params.requestId, metadata: { reference: snapshot.reference, wouldCreate: snapshot.slots.filter((s) => s.status === "assigned").map((s) => s.label), summary: "QA/test record: no engagements, project assignments, payables or crew emails were created" } });
    return { ok: true, warnings, created, suppressedTest: true };
  }
  if (!params.actorUserId) return { ok: false, error: "A signed-in administrator is required to establish crew engagements and payables." };
  const admin = createAdminClient();

  for (const slot of snapshot.slots.filter((s) => s.status === "assigned" && s.assigneeProfileId && s.crewAccepted)) {
    const engagement = slot.engagement;
    if (!engagement) { warnings.push(`${slot.label}: no engagement is recorded — record the crew acceptance and compensation first.`); continue; }

    if (engagement.status === "draft") {
      const r = await setEngagementStatus({ engagementId: engagement.id, status: "engagement_active", actorUserId: params.actorUserId });
      if (r.ok) created.engagements += 1; else warnings.push(`${slot.label}: could not activate the engagement (${r.error}).`);
    }

    const { data: existingAssignment } = await admin.from("project_assignments").select("id").eq("user_id", slot.assigneeProfileId as string).eq("entity_type", "enquiry").eq("entity_id", await enquiryIdFor(params.requestId)).maybeSingle();
    if (!existingAssignment) {
      const a = await assignUserToProject({ userId: slot.assigneeProfileId as string, entityType: "enquiry", entityId: await enquiryIdFor(params.requestId), assignedBy: params.actorUserId, roleNote: `Crew Support ${snapshot.reference} — ${slot.roleLabel}`, accessExpiresAt: accessExpiryFor(snapshot.endDate) });
      if (a.ok) created.assignments += 1; else warnings.push(`${slot.label}: could not grant project access (${a.error}).`);
    }

    const { data: fresh } = await admin.from("engagements").select("payment_obligation_id").eq("id", engagement.id).maybeSingle();
    if (!fresh?.payment_obligation_id) {
      const p = await createEngagementPayable({ engagementId: engagement.id, description: `Crew Support ${snapshot.reference} — ${slot.roleLabel}`, actorUserId: params.actorUserId });
      if (p.ok) created.payables += 1; else warnings.push(`${slot.label}: payable not created (${p.error}).`);
    }
  }

  await logActivity({ actorUserId: params.actorUserId, action: "crew_support.commitments_established", entityType: "crew_support_request", entityId: params.requestId, metadata: { reference: snapshot.reference, created, warnings } });
  return { ok: true, warnings, created, suppressedTest: false };
}

async function enquiryIdFor(requestId: string): Promise<string> {
  const { data } = await createAdminClient().from("crew_support_requests").select("enquiry_id").eq("id", requestId).maybeSingle();
  return (data?.enquiry_id as string) ?? "";
}
