"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { transitionAgreementStatus } from "@/lib/legal/agreementEngine";
import { isValidAgreementLifecycleTransition, type AgreementLifecycleStatus } from "@/lib/legal/agreementLifecycle";

// Founder-facing lifecycle bridge (2026-09-15) — Founder QA on
// ORD-AGR-2026-000004 found no Approve/Issue/Send/Execute controls
// anywhere on the review page. Investigation confirmed the canonical
// backend lifecycle (agreementLifecycle.ts's state machine,
// transitionAgreementStatus() in agreementEngine.ts) already exists
// and was simply never exposed to any UI for this agreement type. This
// reuses that exact existing function — no new status, no new
// lifecycle, no direct database patch, no bypass of its own
// authorization (GOVERNANCE_CAPABILITIES.contractAdminister via Super
// Admin override, checked inside transitionAgreementStatus() itself).
//
// Deliberately exposes ONLY the two transitions that are genuinely
// safe today: draft -> internal_review and internal_review ->
// approved_for_issue. Real issuance (approved_for_issue -> sent)
// requires recordIssuedDocumentHash() — a real rendered document
// artifact whose bytes get hashed — and no PDF/document-export
// pipeline exists anywhere in this codebase yet (confirmed by
// inspection; clientPortalAgreements.ts's own comment says the same
// for every other agreement type: "No real issued-artifact
// rendering/storage exists yet"). Building that is a separate,
// substantial piece of work, explicitly out of this narrow task's
// scope — the page instead truthfully reports CONFIGURATION REQUIRED
// once an agreement reaches approved_for_issue, rather than exposing a
// Send/Sign/Execute button that would fabricate a delivery that never
// actually happened.
export type AgreementLifecycleActionState = { ok: true; toStatus: AgreementLifecycleStatus } | { ok: false; error: string } | null;

export async function advanceAgreementLifecycleStatusAction(
  _prev: AgreementLifecycleActionState,
  formData: FormData
): Promise<AgreementLifecycleActionState> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isSuperAdmin(currentUser)) return { ok: false, error: "Not authorized." };

  const agreementId = String(formData.get("agreementId") ?? "").trim();
  const toStatus = String(formData.get("toStatus") ?? "").trim() as AgreementLifecycleStatus;
  const fromStatus = String(formData.get("fromStatus") ?? "").trim() as AgreementLifecycleStatus;
  if (!agreementId || !toStatus || !fromStatus) return { ok: false, error: "Invalid request." };

  // Only the two specific, genuinely safe forward transitions this UI
  // offers — re-checked here (not just trusted from the client) so a
  // crafted form submission can never request an arbitrary status this
  // page never intended to expose (e.g. skipping straight to
  // fully_executed). transitionAgreementStatus() itself independently
  // re-validates via isValidAgreementLifecycleTransition() regardless —
  // this is defense in depth, not the only guard.
  const ALLOWED_FROM_UI: Record<string, AgreementLifecycleStatus> = {
    draft: "internal_review",
    internal_review: "approved_for_issue",
  };
  if (ALLOWED_FROM_UI[fromStatus] !== toStatus) {
    return { ok: false, error: "This transition is not offered by this control." };
  }
  if (!isValidAgreementLifecycleTransition(fromStatus, toStatus)) {
    return { ok: false, error: `Cannot move an agreement from "${fromStatus}" to "${toStatus}".` };
  }

  const result = await transitionAgreementStatus({ agreementId, toStatus, actorUserId: currentUser.id });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/admin/organization/agreements/${agreementId}`);
  return { ok: true, toStatus };
}
