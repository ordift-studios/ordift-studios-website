import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { createEngagementPayable, setEngagementStatus } from "@/lib/payables/engagements";
import { getCommitmentSnapshot } from "./commitmentData";

// Crew commitments — built ONLY on the existing finance/work records:
//   per-person   engagements (agreed compensation, currency, who/when),
//                created when the crew member ACCEPTS their offer
//   payable      payment_obligations via createEngagementPayable()
// Crew do NOT get access to the client's project workspace: their scoped
// view is their own assignment page and engagement (crewOffers.ts).
// No Crew Support payout table exists or is created. The client selling
// price lives on the quotation and is never read here.
//
// QA/test requests never create engagements, payables, assignments or crew
// emails: createEngagement notifies the crew member for real and a payable
// is a real financial obligation. Their acceptance is still recorded (and
// the would-be compensation audited) so the workflow can be exercised.

const SLOT_ENTITY = "crew_support_slot";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

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
export async function establishCommitments(params: { requestId: string; actorUserId: string | null }): Promise<Result<{ warnings: string[]; created: { engagements: number; payables: number }; suppressedTest: boolean }>> {
  const snapshot = await getCommitmentSnapshot(params.requestId);
  if (!snapshot) return { ok: false, error: "Request not found." };
  if (snapshot.status !== "confirmed") return { ok: false, error: "Commitments are only established for a confirmed request." };
  const warnings: string[] = [];
  const created = { engagements: 0, payables: 0 };

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

    const { data: fresh } = await admin.from("engagements").select("payment_obligation_id").eq("id", engagement.id).maybeSingle();
    if (!fresh?.payment_obligation_id) {
      const p = await createEngagementPayable({ engagementId: engagement.id, description: `Crew Support ${snapshot.reference} — ${slot.roleLabel}`, actorUserId: params.actorUserId });
      if (p.ok) created.payables += 1; else warnings.push(`${slot.label}: payable not created (${p.error}).`);
    }
  }

  await logActivity({ actorUserId: params.actorUserId, action: "crew_support.commitments_established", entityType: "crew_support_request", entityId: params.requestId, metadata: { reference: snapshot.reference, created, warnings } });
  return { ok: true, warnings, created, suppressedTest: false };
}

// ------------------------------------------------- unwind on cancel/decline
// When a request that already has crew commitments is cancelled or
// declined, undo what is SAFE to undo and flag the rest — never delete:
//   - a crew engagement with no payable is cancelled (history kept)
//   - an engagement that already has a payable (or finished work) is left
//     exactly as it is and reported for Finance to resolve; money owed to
//     crew is never silently dropped
//   - the client's receivable (amount due + accepted quotation) is NOT
//     touched: any cancellation fee, refund or write-off is a deliberate
//     finance decision recorded through the existing payment controls.
// Idempotent; test records have nothing to unwind.
export async function unwindCommitments(params: { requestId: string; actorUserId: string | null; reason: string }): Promise<Result<{ warnings: string[]; cancelledEngagements: number }>> {
  const snapshot = await getCommitmentSnapshot(params.requestId);
  if (!snapshot) return { ok: false, error: "Request not found." };
  const warnings: string[] = [];
  let cancelledEngagements = 0;
  if (snapshot.isTest) return { ok: true, warnings, cancelledEngagements };
  const admin = createAdminClient();

  for (const slot of snapshot.slots) {
    const e = slot.engagement;
    if (!e) continue;
    const { data: row } = await admin.from("engagements").select("payment_obligation_id").eq("id", e.id).maybeSingle();
    if (row?.payment_obligation_id) { warnings.push(`${slot.label}: a crew payable exists — Finance must review it (cancel or settle). The engagement was left as is.`); continue; }
    if (e.status === "completed") { warnings.push(`${slot.label}: the engagement is already completed and was left as is.`); continue; }
    if (!params.actorUserId) { warnings.push(`${slot.label}: engagement not cancelled (no signed-in administrator).`); continue; }
    const r = await setEngagementStatus({ engagementId: e.id, status: "cancelled", actorUserId: params.actorUserId });
    if (r.ok) cancelledEngagements += 1; else warnings.push(`${slot.label}: engagement not cancelled (${r.error}).`);
  }

  await logActivity({ actorUserId: params.actorUserId, action: "crew_support.commitments_unwound", entityType: "crew_support_request", entityId: params.requestId, metadata: { reference: snapshot.reference, reason: params.reason, cancelledEngagements, warnings, receivableUntouched: true } });
  return { ok: true, warnings, cancelledEngagements };
}
