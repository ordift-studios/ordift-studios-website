import { getEnquiryByIdForUser } from "@/lib/portal/data";
import { logActivityAsSystem } from "@/lib/admin/activityLog";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { escapeHtml } from "@/lib/enquiry/emailTemplates";
import { sendEmail } from "@/lib/shared/email/dispatch";
import { DELIVERY_ACTIONS, DELIVERY_LABELS, RATING_ACTION, type DeliveryEvent, type DeliveryKind } from "@/lib/portal/clientDelivery";

// Server-only data access for the client's delivery tools (download all, confirm delivery, rate experience).
// Access always starts from the client's OWN enquiry (row-level security + an explicit owner check); only files that are
// RELEASED, published to that client as a deliverable and not purged are ever returned. Nothing here changes a request,
// engagement, payable, file, retention or backup state.

export type ReleasedFile = {
  fileId: string;
  title: string;
  categoryLabel: string;
  filename: string;
  bucket: string;
  path: string;
  sizeBytes: number;
  publishedAt: string;
};

export type ReleasedContext = {
  enquiryId: string;
  reference: string;
  clientName: string | null;
  files: ReleasedFile[];
};

export async function getReleasedContext(enquiryId: string, userId: string): Promise<ReleasedContext | null> {
  const owner = await getEnquiryByIdForUser(enquiryId, userId);
  if (!owner) return null;

  // Row-level security: the client can read only the deliverables published to them.
  const supabase = await createClient();
  const { data: deliverables, error } = await supabase
    .from("deliverables")
    .select("title, project_file_id, published_at, deliverable_categories(label)")
    .eq("entity_type", "enquiry")
    .eq("entity_id", enquiryId)
    .not("project_file_id", "is", null)
    .order("published_at", { ascending: true });
  if (error) {
    console.error("[portal] failed to load released deliverables", error.message);
    return { enquiryId, reference: owner.referenceNumber ?? enquiryId, clientName: owner.fullName ?? null, files: [] };
  }
  const ids = (deliverables ?? []).map((d) => d.project_file_id as string);
  if (ids.length === 0) return { enquiryId, reference: owner.referenceNumber ?? enquiryId, clientName: owner.fullName ?? null, files: [] };

  // Only files that are still released and not purged (never private, declined or removed files).
  const admin = createAdminClient();
  const { data: files } = await admin
    .from("project_files")
    .select("id, original_filename, storage_bucket, storage_path, size_bytes, release_status, purged_at")
    .in("id", ids)
    .eq("release_status", "released")
    .is("purged_at", null);
  const byId = new Map((files ?? []).map((f) => [f.id as string, f]));

  const out: ReleasedFile[] = [];
  for (const d of deliverables ?? []) {
    const f = byId.get(d.project_file_id as string);
    if (!f) continue;
    out.push({
      fileId: f.id as string,
      title: (d.title as string) ?? (f.original_filename as string),
      categoryLabel: (d.deliverable_categories as unknown as { label: string } | null)?.label ?? "Photographs",
      filename: f.original_filename as string,
      bucket: f.storage_bucket as string,
      path: f.storage_path as string,
      sizeBytes: Number(f.size_bytes ?? 0),
      publishedAt: d.published_at as string,
    });
  }
  return { enquiryId, reference: owner.referenceNumber ?? enquiryId, clientName: owner.fullName ?? null, files: out };
}

export async function getDeliveryEvents(enquiryId: string): Promise<DeliveryEvent[]> {
  const { data } = await createAdminClient()
    .from("activity_log")
    .select("action, created_at, metadata")
    .eq("entity_id", enquiryId)
    .in("action", Object.values(DELIVERY_ACTIONS))
    .order("created_at", { ascending: true });
  return (data ?? []).map((r) => {
    const m = (r.metadata ?? {}) as { batch?: string; remarks?: string | null };
    return { action: r.action as string, at: r.created_at as string, batch: m.batch ?? null, remarks: m.remarks ?? null };
  });
}

export async function getLatestRating(enquiryId: string): Promise<{ at: string; batch: string | null } | null> {
  const { data } = await createAdminClient()
    .from("activity_log")
    .select("created_at, metadata")
    .eq("entity_id", enquiryId)
    .eq("action", RATING_ACTION)
    .order("created_at", { ascending: false })
    .limit(1);
  const row = data?.[0];
  if (!row) return null;
  return { at: row.created_at as string, batch: ((row.metadata ?? {}) as { batch?: string }).batch ?? null };
}

export async function getRatingFingerprints(enquiryId: string): Promise<string[]> {
  const { data } = await createAdminClient().from("activity_log").select("metadata").eq("entity_id", enquiryId).eq("action", RATING_ACTION);
  return (data ?? []).map((r) => String(((r.metadata ?? {}) as { fingerprint?: string }).fingerprint ?? ""));
}

// The crew request and the assigned professional behind this enquiry (so feedback is recorded against the real job).
export async function getJobForEnquiry(enquiryId: string): Promise<{ requestId: string | null; professionalProfileId: string | null }> {
  const admin = createAdminClient();
  const { data: request } = await admin.from("crew_support_requests").select("id").eq("enquiry_id", enquiryId).maybeSingle();
  if (!request) return { requestId: null, professionalProfileId: null };
  const { data: slot } = await admin.from("crew_support_slots").select("assignee_profile_id").eq("request_id", request.id as string).eq("status", "assigned").limit(1).maybeSingle();
  return { requestId: request.id as string, professionalProfileId: (slot?.assignee_profile_id as string | null) ?? null };
}

export async function recordClientEvent(params: { userId: string; action: string; enquiryId: string; metadata: Record<string, unknown> }): Promise<void> {
  await logActivityAsSystem({ actorUserId: params.userId, action: params.action, entityType: "enquiry", entityId: params.enquiryId, metadata: params.metadata });
}

// One short message to Ordift's administrator (never to the client). Callers de-duplicate before calling, so each distinct
// confirmation produces at most one message. The OUTCOME is always recorded as an audited event
// (client_delivery.admin_notification) so the internal dashboard can show whether the email was handed over, not sent or failed -
// a failed or unconfigured email never hides the client's response itself.
export type NotifyKind = DeliveryKind | "rating";
const NOTIFY_TEXT: Record<NotifyKind, string> = { ...DELIVERY_LABELS, rating: "submitted experience feedback" };

export async function notifyAdminOfClientDelivery(params: {
  kind: NotifyKind;
  reference: string;
  clientName: string | null;
  requestId: string | null;
  enquiryId?: string;
  batch?: string | null;
  fileCount: number;
  remarks: string | null;
  detail?: string | null;
}): Promise<{ ok: boolean; mode?: string; error?: string }> {
  let outcome: { ok: boolean; mode?: string; error?: string };
  try {
    const to = process.env.EMAIL_ADMIN_NOTIFICATION_TO;
    if (!to) {
      console.error("[client-delivery] EMAIL_ADMIN_NOTIFICATION_TO is not set — the response is recorded in the activity log only");
      outcome = { ok: false, error: "admin recipient not configured" };
    } else {
      const who = params.clientName?.trim() || "The client";
      const what = NOTIFY_TEXT[params.kind];
      const site = process.env.NEXT_PUBLIC_SITE_URL || "https://ordiftstudios.com";
      const link = params.requestId ? `${site}/admin/crew-support/${params.requestId}` : `${site}/admin`;
      const subject = `${params.reference}: ${who} ${what}`;
      const note = params.remarks ? `\nTheir note: ${params.remarks}` : "";
      const extra = params.detail ? `\n${params.detail}` : "";
      const text = `${who} has ${what} for ${params.reference} (${params.fileCount} released file${params.fileCount === 1 ? "" : "s"}).${extra}${note}\n\nSee it under “Client Acceptance & Feedback”: ${link}\n\nThis is a record only. It does not close the request, complete the engagement or change any payable or file.`;
      const html = `<p>${escapeHtml(who)} has ${escapeHtml(what)} for <strong>${escapeHtml(params.reference)}</strong> (${params.fileCount} released file${params.fileCount === 1 ? "" : "s"}).</p>${params.detail ? `<p>${escapeHtml(params.detail)}</p>` : ""}${params.remarks ? `<p>Their note: ${escapeHtml(params.remarks)}</p>` : ""}<p><a href="${escapeHtml(link)}">Open “Client Acceptance &amp; Feedback”</a></p><p style="color:#666">This is a record only. It does not close the request, complete the engagement or change any payable or file.</p>`;
      const result = await sendEmail({ to, subject, html, text, logPrefix: "[client-delivery]", emailType: `client-delivery-${params.kind}`, referenceNumber: params.reference });
      outcome = result.ok ? { ok: true, mode: result.mode } : { ok: false, error: result.error };
    }
  } catch (error) {
    console.error("[client-delivery] admin notification failed", error);
    outcome = { ok: false, error: error instanceof Error ? error.message.slice(0, 120) : "unexpected error" };
  }
  if (params.enquiryId) {
    try {
      await logActivityAsSystem({
        actorUserId: null,
        action: "client_delivery.admin_notification",
        entityType: "enquiry",
        entityId: params.enquiryId,
        metadata: { kind: params.kind, batch: params.batch ?? null, ok: outcome.ok, mode: outcome.mode ?? null, error: outcome.error ?? null },
      });
    } catch (error) {
      console.error("[client-delivery] could not record the notification outcome", error);
    }
  }
  return outcome;
}
