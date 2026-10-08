"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { canManageCrewSupport } from "@/lib/crewSupport/permissions";
import { establishCommitments } from "@/lib/crewSupport/commitmentEstablish";
import { cancelConfirmedRequest, markRequestAsTest, reevaluateAgreementStage, resolveCancellationReview, setAgreementRequired } from "@/lib/crewSupport/commitment";
import { isManagementUser } from "@/lib/crewSupport/management";
import { actionFail, actionOk, runAction, type ActionState } from "@/lib/shared/actionState";

async function authorize() {
  const user = await getCurrentUser();
  return canManageCrewSupport(user) && user ? user : null;
}
const DENIED = "You don't have permission to manage Crew Support requests.";
function refresh(requestId: string) {
  revalidatePath(`/admin/crew-support/${requestId}`);
  revalidatePath("/admin/crew-support");
  revalidatePath("/admin/enquiries");
}
function withWarnings(message: string, warnings?: string[]): ActionState {
  return actionOk(warnings?.length ? `${message} Note: ${warnings.join(" ")}` : message);
}

export async function setAgreementRequiredAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await authorize();
  if (!user) return actionFail(DENIED);
  const requestId = String(formData.get("requestId") ?? "");
  const required = String(formData.get("required") ?? "") === "true";
  return runAction(async () => {
    const r = await setAgreementRequired({ requestId, required, reason: String(formData.get("reason") ?? ""), actorUserId: user.id });
    if (!r.ok) return actionFail(r.error);
    refresh(requestId);
    return withWarnings(required ? "A separate agreement is now required for this request." : "No separate agreement is required — the accepted quotation and its terms are the contract.", r.warnings);
  }, "agreement requirement");
}

export async function reevaluateAgreementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await authorize();
  if (!user) return actionFail(DENIED);
  const requestId = String(formData.get("requestId") ?? "");
  return runAction(async () => {
    const r = await reevaluateAgreementStage({ requestId, actorUserId: user.id });
    if (!r.ok) return actionFail(r.error);
    refresh(requestId);
    return actionOk("Agreement status re-checked.");
  }, "re-check agreement");
}

export async function completeConfirmationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await authorize();
  if (!user) return actionFail(DENIED);
  const requestId = String(formData.get("requestId") ?? "");
  return runAction(async () => {
    const r = await establishCommitments({ requestId, actorUserId: user.id });
    if (!r.ok) return actionFail(r.error);
    refresh(requestId);
    if (r.suppressedTest) return actionOk("QA/test record: no engagements, payables or crew emails were created.");
    return withWarnings(`Commitments are in place (new this run: ${r.created.engagements} engagement activations, ${r.created.payables} payables).`, r.warnings);
  }, "complete confirmation");
}

export async function markAsTestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user)) return actionFail("Only a Super Admin can mark a request as a QA/test record.");
  const requestId = String(formData.get("requestId") ?? "");
  return runAction(async () => {
    const r = await markRequestAsTest({ requestId, reason: String(formData.get("reason") ?? ""), actorUserId: user.id });
    if (!r.ok) return actionFail(r.error);
    refresh(requestId);
    return actionOk("Marked as a QA/test record. No client or crew emails, engagements or payables will be created from it.");
  }, "mark as test");
}

export async function cancelConfirmedRequestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await authorize();
  if (!user) return actionFail(DENIED);
  if (!(await isManagementUser(user))) return actionFail("Only authorised management (Super Admin or an executive administrator) can cancel a confirmed request.");
  const requestId = String(formData.get("requestId") ?? "");
  return runAction(async () => {
    const r = await cancelConfirmedRequest({ requestId, reason: String(formData.get("reason") ?? ""), actorUserId: user.id });
    if (!r.ok) return actionFail(r.error);
    refresh(requestId);
    return withWarnings("Request cancelled. A financial review is now pending — nothing was refunded or written off automatically.", r.warnings);
  }, "cancel confirmed request");
}

export async function resolveCancellationReviewAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await authorize();
  if (!user) return actionFail(DENIED);
  const requestId = String(formData.get("requestId") ?? "");
  return runAction(async () => {
    const r = await resolveCancellationReview({ requestId, note: String(formData.get("note") ?? ""), actorUserId: user.id });
    if (!r.ok) return actionFail(r.error);
    refresh(requestId);
    return actionOk("Financial review recorded.");
  }, "resolve cancellation review");
}
