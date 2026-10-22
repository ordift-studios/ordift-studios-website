"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { actionFail, actionOk, runAction, type ActionState } from "@/lib/shared/actionState";
import {
  batchHash,
  cleanText,
  COMMENT_MAX,
  DELIVERY_ACTIONS,
  parseDeliveryKind,
  parseRatings,
  RATING_ACTION,
  REMARKS_MAX,
} from "@/lib/portal/clientDelivery";
import {
  getDeliveryEvents,
  getJobForEnquiry,
  getRatingFingerprints,
  getReleasedContext,
  notifyAdminOfClientDelivery,
  recordClientEvent,
} from "@/lib/portal/clientDeliveryData";
import { createHash } from "node:crypto";

// The client's own confirmation of a delivery and the optional rating. These only RECORD what the client said (as audited
// events with their own history). They never close the request, complete the engagement, change a payable, delete or archive
// files, confirm a backup or trigger cleanup, and they never email the client.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function confirmDeliveryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("Please sign in again to continue.");
  const enquiryId = str(formData, "enquiryId");
  const kind = parseDeliveryKind(str(formData, "kind"));
  if (!UUID.test(enquiryId) || !kind) return actionFail("Something was missing from that request. Please refresh the page and try again.");
  const remarks = cleanText(formData.get("remarks"), REMARKS_MAX);

  return runAction(async () => {
    const ctx = await getReleasedContext(enquiryId, user.id);
    if (!ctx || ctx.files.length === 0) return actionFail("We couldn't find released photographs for this project.");
    const batch = batchHash(ctx.files.map((f) => f.fileId));

    // The same confirmation of the same set of files (with the same note) is recorded once.
    const events = await getDeliveryEvents(enquiryId);
    const action = DELIVERY_ACTIONS[kind];
    if (events.some((e) => e.action === action && e.batch === batch && (e.remarks ?? "") === remarks)) {
      return actionOk("Thank you — this is already recorded.");
    }

    const job = await getJobForEnquiry(enquiryId);
    await recordClientEvent({
      userId: user.id,
      action,
      enquiryId,
      metadata: {
        reference: ctx.reference,
        requestId: job.requestId,
        batch,
        fileCount: ctx.files.length,
        fileIds: ctx.files.slice(0, 200).map((f) => f.fileId),
        remarks: remarks || null,
        previousCorrectionRequests: events.filter((e) => e.action === DELIVERY_ACTIONS.corrections).length,
      },
    });
    await notifyAdminOfClientDelivery({ kind, reference: ctx.reference, clientName: ctx.clientName, requestId: job.requestId, enquiryId, batch, fileCount: ctx.files.length, remarks: remarks || null });
    revalidatePath(`/portal/client/projects/enquiry/${enquiryId}/deliverables`);

    return actionOk(
      kind === "receipt"
        ? "Thank you — we've recorded that you received your photographs."
        : kind === "accept"
          ? "Thank you — we've recorded that you reviewed and accepted your delivery."
          : "Thank you — we've recorded your request. Our team will be in touch about the corrections."
    );
  }, "client delivery confirmation");
}

export async function submitRatingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("Please sign in again to continue.");
  const enquiryId = str(formData, "enquiryId");
  if (!UUID.test(enquiryId)) return actionFail("Something was missing from that request. Please refresh the page and try again.");
  const parsed = parseRatings((k) => formData.get(k));
  if (!parsed.ok) return actionFail(parsed.error);
  const comment = cleanText(formData.get("comment"), COMMENT_MAX);

  return runAction(async () => {
    const ctx = await getReleasedContext(enquiryId, user.id);
    if (!ctx || ctx.files.length === 0) return actionFail("We couldn't find this project's delivery.");
    const batch = batchHash(ctx.files.map((f) => f.fileId));
    const fingerprint = createHash("sha256").update(JSON.stringify([parsed.ratings, comment, batch])).digest("hex").slice(0, 16);
    if ((await getRatingFingerprints(enquiryId)).includes(fingerprint)) return actionOk("Thank you — your feedback is already recorded.");

    const job = await getJobForEnquiry(enquiryId);
    // Recorded against the real project, service and assigned professional, for internal reporting. Never published, and never
    // visible to other clients.
    await recordClientEvent({
      userId: user.id,
      action: RATING_ACTION,
      enquiryId,
      metadata: {
        reference: ctx.reference,
        requestId: job.requestId,
        service: "crew-support",
        professionalProfileId: job.professionalProfileId,
        scale: "1-10 (1 very poor, 5 average, 10 excellent)",
        ratings: parsed.ratings,
        comment: comment || null,
        batch,
        fingerprint,
      },
    });
    await notifyAdminOfClientDelivery({
      kind: "rating",
      reference: ctx.reference,
      clientName: ctx.clientName,
      requestId: job.requestId,
      enquiryId,
      batch,
      fileCount: ctx.files.length,
      remarks: comment || null,
      detail: `Ratings (1-10): ${Object.entries(parsed.ratings).map(([k, v]) => `${k} ${v}`).join(", ")}`,
    });
    revalidatePath(`/portal/client/projects/enquiry/${enquiryId}/deliverables`);
    return actionOk("Thank you for your feedback — it helps us improve.");
  }, "client experience rating");
}
