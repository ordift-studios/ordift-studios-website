"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManageCrewSupport } from "@/lib/crewSupport/permissions";
import { completeAcceptance, completeIssue, discardCrewSupportQuotationDraft, issueCrewSupportQuotation, markQuotationReady, prepareCrewSupportQuotation, recordStaffAcceptance, returnQuotationToDraft, saveCrewSupportQuotationDraft } from "@/lib/crewSupport/quotation";
import { retryNotificationEvent } from "@/lib/crewSupport/notifications";
import type { EditableLine } from "@/lib/crewSupport/quotationRules";
import { actionFail, actionOk, runAction, type ActionState } from "@/lib/shared/actionState";

async function authorize() {
  const user = await getCurrentUser();
  return canManageCrewSupport(user) && user ? user : null;
}
const DENIED = "You don't have permission to manage Crew Support quotations.";
function refresh(requestId: string) {
  revalidatePath(`/admin/crew-support/${requestId}`);
  revalidatePath("/admin/crew-support");
  revalidatePath("/admin/enquiries");
}
function done(message: string, warnings?: string[]): ActionState {
  return actionOk(warnings?.length ? `${message} Note: ${warnings.join(" ")}` : message);
}

export async function prepareQuotationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await authorize();
  if (!user) return actionFail(DENIED);
  const requestId = String(formData.get("requestId") ?? "");
  const marketSlug = String(formData.get("marketSlug") ?? "");
  if (!requestId || !marketSlug) return actionFail("Choose a pricing market first.");
  return runAction(async () => {
    const r = await prepareCrewSupportQuotation({ requestId, marketSlug, actorUserId: user.id });
    if (!r.ok) return actionFail(r.error);
    refresh(requestId);
    return done("Quotation draft prepared. Review the lines, then mark it ready.", r.warnings);
  }, "prepare quotation");
}

export async function saveQuotationDraftAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await authorize();
  if (!user) return actionFail(DENIED);
  const quotationId = String(formData.get("quotationId") ?? "");
  const requestId = String(formData.get("requestId") ?? "");
  let lines: EditableLine[];
  try {
    const raw = JSON.parse(String(formData.get("lines") ?? "[]")) as Record<string, unknown>[];
    lines = raw.map((l) => ({
      requirementId: (l.requirementId as string | null) || null,
      serviceItem: String(l.serviceItem ?? ""),
      description: String(l.description ?? ""),
      quantity: Number(l.quantity),
      unitBasis: String(l.unitBasis ?? "item"),
      sellingRate: Number(l.sellingRate),
      discountPercent: l.discountPercent === "" || l.discountPercent == null ? null : Number(l.discountPercent),
      taxPercent: l.taxPercent === "" || l.taxPercent == null ? null : Number(l.taxPercent),
      governedUnitPrice: l.governedUnitPrice == null ? null : Number(l.governedUnitPrice),
      adjustmentReason: String(l.adjustmentReason ?? ""),
      sourceReference: (l.sourceReference as string | null) || null,
    }));
  } catch {
    return actionFail("The quotation lines couldn't be read. Please reload the page.");
  }
  return runAction(async () => {
    const r = await saveCrewSupportQuotationDraft({
      quotationId, lines, validUntil: String(formData.get("validUntil") ?? "") || null, terms: String(formData.get("terms") ?? "") || null,
      internalNotes: String(formData.get("internalNotes") ?? "") || null, fxCurrency: String(formData.get("fxCurrency") ?? "") || null, actorUserId: user.id,
    });
    if (!r.ok) return actionFail(r.error);
    refresh(requestId);
    return actionOk("Draft saved.");
  }, "save quotation draft");
}

function simple(name: string, fn: (id: string, userId: string) => Promise<{ ok: true; warnings?: string[] } | { ok: false; error: string }>, message: string) {
  return async (_prev: ActionState, formData: FormData): Promise<ActionState> => {
    const user = await authorize();
    if (!user) return actionFail(DENIED);
    const quotationId = String(formData.get("quotationId") ?? "");
    const requestId = String(formData.get("requestId") ?? "");
    if (!quotationId) return actionFail("Nothing to update.");
    return runAction(async () => {
      const r = await fn(quotationId, user.id);
      if (!r.ok) return actionFail(r.error);
      if (requestId) refresh(requestId);
      return done(message, r.warnings);
    }, name);
  };
}

export const markQuotationReadyAction = simple("mark ready", (id, u) => markQuotationReady({ quotationId: id, actorUserId: u }), "Quotation marked ready for issue.");
export const returnQuotationToDraftAction = simple("return to draft", (id, u) => returnQuotationToDraft({ quotationId: id, actorUserId: u }), "Returned to draft.");
export const discardQuotationDraftAction = simple("discard draft", (id, u) => discardCrewSupportQuotationDraft({ quotationId: id, actorUserId: u }), "Draft discarded.");
export const issueQuotationAction = simple("issue quotation", (id, u) => issueCrewSupportQuotation({ quotationId: id, actorUserId: u }), "Quotation issued. The request, enquiry and client notification have been updated.");
export const completeIssueAction = simple("complete issue", (id, u) => completeIssue({ quotationId: id, actorUserId: u }), "Synchronisation completed.");
export const completeAcceptanceAction = simple("complete acceptance", (id, u) => completeAcceptance({ quotationId: id, actorUserId: u }), "Acceptance completed: amount due, request status and notification are up to date.");

export async function recordAcceptanceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await authorize();
  if (!user) return actionFail(DENIED);
  const quotationId = String(formData.get("quotationId") ?? "");
  const requestId = String(formData.get("requestId") ?? "");
  return runAction(async () => {
    const r = await recordStaffAcceptance({
      quotationId, channel: String(formData.get("channel") ?? ""), evidence: String(formData.get("evidence") ?? ""), acceptedByName: String(formData.get("acceptedByName") ?? ""), receivedAt: String(formData.get("receivedAt") ?? ""), actorUserId: user.id,
    });
    if (!r.ok) return actionFail(r.error);
    refresh(requestId);
    return done("Acceptance recorded on the client's behalf. The amount due is now set from this quotation.", r.warnings);
  }, "record acceptance");
}

export async function retryNotificationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await authorize();
  if (!user) return actionFail(DENIED);
  const eventId = String(formData.get("eventId") ?? "");
  const requestId = String(formData.get("requestId") ?? "");
  return runAction(async () => {
    const r = await retryNotificationEvent({ eventId, actorUserId: user.id });
    if (!r.ok) return actionFail(r.error);
    if (requestId) refresh(requestId);
    return actionOk("Notification sent.");
  }, "retry notification");
}
