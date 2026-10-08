import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { SERVICE_FAMILIES } from "./config";
import { runNotification } from "./notificationFlow";
import { buildClientEmail, isClientFacingTemplate, type ClientTemplate, type ClientTemplateVars } from "./notificationConfig";
import { buildCrewEmail, isCrewTemplate, type CrewTemplateVars } from "./crewNotifications";

// Client-facing Crew Support notifications (Phase 2). Idempotent via the
// unique (request_id, event_key) row: the claim insert either wins (we
// send) or loses (already recorded — never send again). TEST/QA requests
// are recorded but never delivered externally. A failed send is recorded
// and retryable; it never affects the status change that triggered it.

export type NotifyResult = { outcome: "sent" | "logged" | "failed" | "suppressed_test" | "already_recorded" | "skipped"; detail?: string };

function serviceLabel(family: string): string {
  const f = SERVICE_FAMILIES.find((x) => x.value === family)?.label ?? family;
  return `Creative Crew Support — ${f}`;
}

async function loadRequest(requestId: string) {
  const { data } = await createAdminClient()
    .from("crew_support_requests")
    .select("id, reference_number, requester_name, requester_email, project_name, service_family, enquiry_id, is_test")
    .eq("id", requestId)
    .maybeSingle();
  return data;
}

export async function notifyCrewSupportEvent(params: {
  requestId: string;
  eventKey: string;
  template: ClientTemplate;
  extraVars?: Partial<ClientTemplateVars>;
  triggeredBy: string | null;
}): Promise<NotifyResult> {
  try {
    const request = await loadRequest(params.requestId);
    if (!request) return { outcome: "skipped", detail: "request not found" };
    const admin = createAdminClient();

    const vars: ClientTemplateVars = {
      firstName: (request.requester_name as string).split(" ")[0] || (request.requester_name as string),
      reference: request.reference_number as string,
      projectName: request.project_name as string,
      serviceLabel: serviceLabel(request.service_family as string),
      enquiryId: request.enquiry_id as string,
      ...params.extraVars,
    };
    const email = buildClientEmail(params.template, vars);

    let claimId: string | null = null;
    const outcome = await runNotification(Boolean(request.is_test), {
      claim: async () => {
        const { data, error } = await admin
          .from("crew_support_notification_events")
          .insert({ request_id: params.requestId, event_key: params.eventKey, template: params.template, recipient_email: request.requester_email, subject: email.subject, body_text: email.text, template_vars: vars, status: "pending", triggered_by: params.triggeredBy })
          .select("id")
          .single();
        if (error || !data) {
          if (error?.code === "23505") return "duplicate";
          console.error("[crew-support] notification claim failed", error?.message);
          return "error";
        }
        claimId = data.id as string;
        return "claimed";
      },
      record: async (status, extra) => {
        await admin.from("crew_support_notification_events").update({ status, attempts: extra.attempts ?? 0, error: extra.error ?? null, updated_at: new Date().toISOString() }).eq("id", claimId);
        await logActivity({ actorUserId: params.triggeredBy, action: "crew_support.notification", entityType: "crew_support_request", entityId: params.requestId, metadata: { eventKey: params.eventKey, template: params.template, status } });
      },
      send: async () => {
        const result = await dispatchNotification({
          channels: ["email"],
          email: { to: request.requester_email as string, subject: email.subject, html: email.html, text: email.text, logPrefix: "[crew-support]", emailType: `crew-support-${params.template}`, referenceNumber: request.reference_number as string },
        });
        return result.email;
      },
      logTestSuppressed: () => console.log(`[crew-support] [test-record, not delivered] would send "${email.subject}" to ${request.requester_email}\n${email.text}\n`),
    });
    return { outcome };
  } catch (error) {
    console.error("[crew-support] notifyCrewSupportEvent threw", params.eventKey, error);
    return { outcome: "failed", detail: "unexpected error" };
  }
}

export type NotificationEventRow = { id: string; eventKey: string; template: string; recipientEmail: string; subject: string | null; status: string; attempts: number; error: string | null; createdAt: string };

export async function listNotificationEvents(requestId: string): Promise<NotificationEventRow[]> {
  const { data } = await createAdminClient().from("crew_support_notification_events").select("id, event_key, template, recipient_email, subject, status, attempts, error, created_at").eq("request_id", requestId).order("created_at", { ascending: false });
  return (data ?? []).map((r) => ({ id: r.id as string, eventKey: r.event_key as string, template: r.template as string, recipientEmail: r.recipient_email as string, subject: (r.subject as string | null) ?? null, status: r.status as string, attempts: Number(r.attempts), error: (r.error as string | null) ?? null, createdAt: r.created_at as string }));
}

// Authorized retry of a FAILED client notification only. Re-renders from
// the stored client-safe variables; never retries suppressed/sent rows.
export async function retryNotificationEvent(params: { eventId: string; actorUserId: string }): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: row } = await admin.from("crew_support_notification_events").select("id, request_id, event_key, template, recipient_email, template_vars, status, attempts").eq("id", params.eventId).maybeSingle();
  if (!row) return { ok: false, error: "Notification not found." };
  if (row.status !== "failed") return { ok: false, error: "Only a failed notification can be retried." };
  if (!isClientFacingTemplate(row.template as string) && !isCrewTemplate(row.template as string)) return { ok: false, error: "Unknown notification template." };
  const request = await loadRequest(row.request_id as string);
  if (!request) return { ok: false, error: "Request not found." };
  if (request.is_test) return { ok: false, error: "This is a test record — notifications are never delivered." };

  const email = isCrewTemplate(row.template as string) ? buildCrewEmail(row.template as never, row.template_vars as CrewTemplateVars) : buildClientEmail(row.template as ClientTemplate, row.template_vars as ClientTemplateVars);
  const result = await dispatchNotification({ channels: ["email"], email: { to: row.recipient_email as string, subject: email.subject, html: email.html, text: email.text, logPrefix: "[crew-support]", emailType: `crew-support-${row.template}`, referenceNumber: request.reference_number as string } });
  const sent = result.email;
  const status = !sent ? "failed" : sent.ok ? (sent.mode === "sent" ? "sent" : "logged") : "failed";
  await admin.from("crew_support_notification_events").update({ status, attempts: Number(row.attempts) + (sent?.attempts ?? 1), error: sent && !sent.ok ? sent.error : null, updated_at: new Date().toISOString() }).eq("id", params.eventId);
  await logActivity({ actorUserId: params.actorUserId, action: "crew_support.notification_retry", entityType: "crew_support_request", entityId: row.request_id as string, metadata: { eventKey: row.event_key, status } });
  return status === "failed" ? { ok: false, error: "The retry failed again. See the notification log." } : { ok: true, status };
}

