"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { transitionAgreementStatus } from "@/lib/legal/agreementEngine";
import { isValidAgreementLifecycleTransition, type AgreementLifecycleStatus } from "@/lib/legal/agreementLifecycle";
import { issueEmployeeEmploymentAgreement } from "@/lib/legal/agreementIssuance";

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
// approved_for_issue. Real issuance (approved_for_issue -> sent) is a
// separate action below — issueAgreementForSignatureAction — since it
// is not a plain status flip: it composes/hashes/stores the immutable
// issuance artifact and delivers real signatory access links before
// the status itself ever moves, via issueEmployeeEmploymentAgreement()
// (agreementIssuance.ts, Phase B7 Step 7, 2026-09-15).
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

// Real issuance bridge (2026-09-15) — reuses
// issueEmployeeEmploymentAgreement() end to end: composes and hashes
// the immutable issued artifact, uploads it, attaches the acting Super
// Admin as the employer signatory, creates the signature request,
// generates and emails each signatory's real access link, and only
// then moves the agreement approved_for_issue -> sent. A failure at
// any step leaves the agreement genuinely still approved_for_issue —
// this action never marks anything sent/signed/executed itself.
export type IssueAgreementActionState = { ok: true } | { ok: false; error: string; step?: string } | null;

export async function issueAgreementForSignatureAction(
  _prev: IssueAgreementActionState,
  formData: FormData
): Promise<IssueAgreementActionState> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isSuperAdmin(currentUser)) return { ok: false, error: "Not authorized." };

  const agreementId = String(formData.get("agreementId") ?? "").trim();
  if (!agreementId) return { ok: false, error: "Invalid request." };

  const result = await issueEmployeeEmploymentAgreement({ agreementId, actorUserId: currentUser.id });
  if (!result.ok) return { ok: false, error: result.error, step: result.step };

  revalidatePath(`/admin/organization/agreements/${agreementId}`);
  return { ok: true };
}
