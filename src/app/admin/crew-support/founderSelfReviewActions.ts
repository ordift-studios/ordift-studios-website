"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManageCrewSupport } from "@/lib/crewSupport/permissions";
import { closeFounderException, declareAndApplyReview, declareAndRelease, issueViewerUrl, openFounderException } from "@/lib/crewSupport/founderSelfReview";
import { decisionSummary, type FileOutcome } from "@/lib/crewSupport/fileReview";
import type { SelfReviewDecision } from "@/lib/crewSupport/founderSelfReviewRules";

// ORDIFT-POL-FSR-001 actions. Each one re-derives who the caller is and whether the exception applies to them on the
// server; nothing the browser sends (ids' properties, "viewed" flags, counts) is trusted. These never email a client.

async function actor() {
  const user = await getCurrentUser();
  return user && canManageCrewSupport(user) ? user : null;
}
const DENIED = "You don't have permission to do that.";
function refresh(requestId: string, engagementId?: string) {
  if (requestId) revalidatePath(`/admin/crew-support/${requestId}`);
  if (engagementId) revalidatePath(`/admin/payables/engagements/${engagementId}/media`);
}

export async function openFounderExceptionAction(input: { requestId: string; engagementId: string; justification: string; acknowledged: boolean }): Promise<{ ok: boolean; message: string }> {
  const user = await actor();
  if (!user) return { ok: false, message: DENIED };
  try {
    const r = await openFounderException({ user, engagementId: String(input.engagementId), justification: String(input.justification ?? ""), acknowledged: input.acknowledged === true });
    if (!r.ok) return { ok: false, message: r.error };
    refresh(input.requestId, input.engagementId);
    return { ok: true, message: "The Founder self-review exception is open for this engagement. Open each image in the viewer, then decide." };
  } catch (error) {
    console.error("[action] open founder exception failed", error);
    return { ok: false, message: "Something went wrong and nothing was opened. Please try again." };
  }
}

export async function closeFounderExceptionAction(input: { requestId: string; engagementId: string; exceptionId: string; reason: string }): Promise<{ ok: boolean; message: string }> {
  const user = await actor();
  if (!user) return { ok: false, message: DENIED };
  try {
    const r = await closeFounderException({ user, exceptionId: String(input.exceptionId), reason: String(input.reason ?? "") });
    if (!r.ok) return { ok: false, message: r.error };
    refresh(input.requestId, input.engagementId);
    return { ok: true, message: "The exception is closed. Everything recorded under it stays on record." };
  } catch (error) {
    console.error("[action] close founder exception failed", error);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}

// Issues the viewer link for ONE image and records, server-side, that it was opened for this exception.
export async function founderViewerUrlAction(input: { exceptionId: string; fileId: string }): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const user = await actor();
  if (!user) return { ok: false, error: DENIED };
  try {
    return await issueViewerUrl({ user, exceptionId: String(input.exceptionId), fileId: String(input.fileId) });
  } catch (error) {
    console.error("[action] founder viewer url failed", error);
    return { ok: false, error: "Could not open the image." };
  }
}

type Batch = { ok: boolean; message: string; outcomes: FileOutcome[] };

export async function founderSelfReviewDecideAction(input: { requestId: string; engagementId: string; exceptionId: string; decisions: Record<string, SelfReviewDecision>; note: string; reviewConfirmed: boolean; typedCount: unknown }): Promise<Batch> {
  const user = await actor();
  if (!user) return { ok: false, message: DENIED, outcomes: [] };
  try {
    const r = await declareAndApplyReview({ user, exceptionId: String(input.exceptionId), decisions: input.decisions ?? {}, note: String(input.note ?? ""), reviewConfirmed: input.reviewConfirmed === true, typedCount: input.typedCount });
    if (!r.ok) return { ok: false, message: r.error, outcomes: [] };
    refresh(input.requestId, input.engagementId);
    const decisions = Object.values(input.decisions ?? {});
    const single = decisions.length > 0 && decisions.every((d) => d === decisions[0]) ? decisions[0] : null;
    return { ok: r.declaration.status === "completed", message: single ? `${decisionSummary(single, r.outcomes).message} ${r.declaration.status === "completed" ? "" : r.declaration.message}`.trim() : r.declaration.message, outcomes: r.outcomes };
  } catch (error) {
    console.error("[action] founder self-review decision failed", error);
    return { ok: false, message: "Something went wrong. Some decisions may have been recorded — refresh to see each image's current status.", outcomes: [] };
  }
}

export async function founderSelfReleaseAction(input: { requestId: string; engagementId: string; exceptionId: string; fileIds: string[]; releaseSetConfirmed: boolean; typedCount: unknown }): Promise<Batch> {
  const user = await actor();
  if (!user) return { ok: false, message: DENIED, outcomes: [] };
  try {
    const r = await declareAndRelease({ user, exceptionId: String(input.exceptionId), fileIds: (input.fileIds ?? []).map(String), releaseSetConfirmed: input.releaseSetConfirmed === true, typedCount: input.typedCount });
    if (!r.ok) return { ok: false, message: r.error, outcomes: [] };
    refresh(input.requestId, input.engagementId);
    return { ok: r.declaration.status === "completed", message: `${r.declaration.message} No email was sent; the client email is a separate step.`, outcomes: r.outcomes };
  } catch (error) {
    console.error("[action] founder self-release failed", error);
    return { ok: false, message: "Something went wrong. Some images may have been released — refresh to see each image's current status.", outcomes: [] };
  }
}
