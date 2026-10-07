import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import type { CrewSupportStatus } from "./config";
import { commitCrewSupportStatus } from "./admin";
import { getCommitmentSnapshot } from "./commitmentData";
import { statusAfterCommercialAcceptance, validateAgreementRequirementChange } from "./commitmentRules";

// Mutations for the commitment layer that need the status writer. Callers
// must have checked canManageCrewSupport() (and super-admin where noted).

type Result = { ok: true; warnings?: string[] } | { ok: false; error: string };

// Explicit admin decision: does this job need a separate signed agreement?
// Default is NO — the accepted quotation with its terms is the contract.
export async function setAgreementRequired(params: { requestId: string; required: boolean; reason: string; actorUserId: string }): Promise<Result> {
  const snapshot = await getCommitmentSnapshot(params.requestId);
  if (!snapshot) return { ok: false, error: "Request not found." };
  const check = validateAgreementRequirementChange({ required: params.required, reason: params.reason, requestStatus: snapshot.status });
  if (!check.ok) return { ok: false, error: check.reason };
  if (snapshot.agreementRequired === params.required && (!params.required || snapshot.agreementReason === params.reason.trim())) return { ok: true };

  const now = new Date().toISOString();
  const { error } = await createAdminClient()
    .from("crew_support_requests")
    .update(params.required
      ? { agreement_required: true, agreement_required_reason: params.reason.trim(), agreement_required_by: params.actorUserId, agreement_required_at: now, updated_at: now }
      : { agreement_required: false, agreement_required_reason: null, agreement_required_by: null, agreement_required_at: null, updated_at: now })
    .eq("id", params.requestId);
  if (error) return { ok: false, error: "Could not save the agreement requirement. Please try again." };
  await logActivity({ actorUserId: params.actorUserId, action: params.required ? "crew_support.agreement_required" : "crew_support.agreement_requirement_cleared", entityType: "crew_support_request", entityId: params.requestId, metadata: { reference: snapshot.reference, reason: params.required ? params.reason.trim() : null, previouslyRequired: snapshot.agreementRequired } });

  // Keep the stage honest: if the client has already accepted, the request
  // sits in agreement_pending exactly while a required agreement is open.
  const warnings: string[] = [];
  const after = await getCommitmentSnapshot(params.requestId);
  if (after && after.hasAcceptedQuotation) {
    const target = statusAfterCommercialAcceptance(after.agreementAssessment);
    const current = after.status as CrewSupportStatus;
    if ((current === "payment_pending" && target === "agreement_pending") || (current === "agreement_pending" && target === "payment_pending")) {
      const moved = await commitCrewSupportStatus({ requestId: params.requestId, from: current, to: target, actorUserId: params.actorUserId, automatic: true, reason: params.required ? "Agreement required" : "Agreement requirement cleared / satisfied" });
      if (!moved.ok) warnings.push(`Request status: ${moved.error}`);
    }
  }
  return { ok: true, warnings };
}

// Re-evaluates the agreement basis after something external changed (for
// example an agreement reached fully-executed in Legal). Idempotent: only
// moves agreement_pending -> payment_pending when the basis is now met.
export async function reevaluateAgreementStage(params: { requestId: string; actorUserId: string | null }): Promise<Result> {
  const snapshot = await getCommitmentSnapshot(params.requestId);
  if (!snapshot) return { ok: false, error: "Request not found." };
  if (snapshot.status === "agreement_pending" && snapshot.agreementAssessment.satisfied) {
    const moved = await commitCrewSupportStatus({ requestId: params.requestId, from: "agreement_pending", to: "payment_pending", actorUserId: params.actorUserId, automatic: true, reason: "Agreement basis satisfied" });
    if (!moved.ok) return moved;
  }
  return { ok: true };
}

// Marks a request (and its enquiry and unissued quotations) as QA/test.
// Test records never email clients or crew and never create engagements or
// payables. Super Admin only, one-way, and only BEFORE a quotation is
// issued — so a genuine client's issued quotation can never be re-labelled.
export async function markRequestAsTest(params: { requestId: string; reason: string; actorUserId: string }): Promise<Result> {
  if (params.reason.trim().length < 5) return { ok: false, error: "Say why this is a QA/test record." };
  const admin = createAdminClient();
  const { data: request } = await admin.from("crew_support_requests").select("id, reference_number, status, is_test, enquiry_id").eq("id", params.requestId).maybeSingle();
  if (!request) return { ok: false, error: "Request not found." };
  if (request.is_test) return { ok: true };
  if (!["received", "under_review", "availability_review", "quote_preparation"].includes(request.status as string)) return { ok: false, error: "A request can only be marked as a test record before its quotation is issued." };

  const now = new Date().toISOString();
  const { error } = await admin.from("crew_support_requests").update({ is_test: true, updated_at: now }).eq("id", params.requestId).eq("is_test", false);
  if (error) return { ok: false, error: "Could not mark the request as a test record." };
  await admin.from("enquiries").update({ is_test: true }).eq("id", request.enquiry_id as string);
  await admin.from("client_quotations").update({ is_test: true }).eq("crew_support_request_id", params.requestId).in("status", ["draft", "ready"]);
  await logActivity({ actorUserId: params.actorUserId, action: "crew_support.marked_test", entityType: "crew_support_request", entityId: params.requestId, metadata: { reference: request.reference_number, reason: params.reason.trim() } });
  return { ok: true };
}
