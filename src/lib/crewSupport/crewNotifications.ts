import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { escapeHtml, wrap, SERIF, SANS, NAVY, GOLD, INK_MUTED } from "@/lib/enquiry/emailTemplates";
import { siteUrl } from "@/lib/shared/env";
import { runNotification } from "./notificationFlow";

// Crew-facing Creative Crew Support emails. They go through the same
// idempotent claim-before-send table and the same TEST-record suppression
// as client emails (crew_support_notification_events), so a retry never
// double-sends and a QA/test request never emails a real person. The
// email is deliberately thin — role and date, plus a link to the signed-in
// portal. Compensation, venue and project details are shown ONLY after the
// recipient signs in, never in an email.

export type CrewTemplate = "crew_offer" | "crew_offer_withdrawn";
export const CREW_TEMPLATES: readonly CrewTemplate[] = ["crew_offer", "crew_offer_withdrawn"];
export function isCrewTemplate(value: string): value is CrewTemplate {
  return (CREW_TEMPLATES as readonly string[]).includes(value);
}

export type CrewTemplateVars = { slotId: string; reference: string; role: string; date: string };

export function crewJobUrl(slotId: string): string {
  return `${siteUrl()}/portal/crew-offers/${slotId}`;
}

export function buildCrewEmail(template: CrewTemplate, v: CrewTemplateVars): { subject: string; html: string; text: string } {
  const link = crewJobUrl(v.slotId);
  const copy =
    template === "crew_offer"
      ? { subject: `A Creative Crew Support job offer for you — ${v.reference}`, heading: "You've been offered a job.", body: `Ordift Studios has offered you a ${v.role} assignment on ${v.date}. Sign in to your portal to see the details and the compensation offered, then accept or decline there. Nothing is confirmed until you accept.`, action: "Review the offer" }
      : { subject: `Job offer withdrawn — ${v.reference}`, heading: "A job offer has been withdrawn.", body: `Ordift Studios has withdrawn the ${v.role} offer for ${v.date}. No action is needed from you.`, action: "" };
  const html = wrap(`
    <p style="margin:0 0 4px;font-family:${SANS};font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${GOLD};">Ordift Studios</p>
    <h1 style="margin:0 0 16px;font-family:${SERIF};font-size:24px;color:${NAVY};font-weight:normal;">${escapeHtml(copy.heading)}</h1>
    <p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:1.6;color:${NAVY};">${escapeHtml(copy.body)}</p>
    ${copy.action ? `<table role="presentation" width="100%" style="margin-bottom:20px;"><tr><td align="center"><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 28px;background:${GOLD};color:${NAVY};font-family:${SANS};font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">${escapeHtml(copy.action)}</a></td></tr></table>` : ""}
    <p style="margin:0;font-family:${SANS};font-size:12px;line-height:1.6;color:${INK_MUTED};">Reference ${escapeHtml(v.reference)}.</p>
  `);
  const text = [copy.heading, "", copy.body, copy.action ? `\n${copy.action}: ${link}` : "", `\nReference ${v.reference}.`].join("\n");
  return { subject: copy.subject, html, text };
}

async function profileEmail(profileId: string): Promise<string | null> {
  const { data } = await createAdminClient().auth.admin.getUserById(profileId);
  return data?.user?.email ?? null;
}

export async function notifyCrew(params: { requestId: string; eventKey: string; template: CrewTemplate; vars: CrewTemplateVars; recipientProfileId: string; isTest: boolean; triggeredBy: string | null }): Promise<{ outcome: string }> {
  try {
    const to = await profileEmail(params.recipientProfileId);
    if (!to) return { outcome: "skipped" };
    const admin = createAdminClient();
    const email = buildCrewEmail(params.template, params.vars);
    let claimId: string | null = null;
    const outcome = await runNotification(params.isTest, {
      claim: async () => {
        const { data, error } = await admin.from("crew_support_notification_events").insert({ request_id: params.requestId, event_key: params.eventKey, template: params.template, recipient_email: to, subject: email.subject, body_text: email.text, template_vars: params.vars, status: "pending", triggered_by: params.triggeredBy }).select("id").single();
        if (error || !data) {
          if (error?.code === "23505") return "duplicate";
          console.error("[crew-support] crew notification claim failed", error?.message);
          return "error";
        }
        claimId = data.id as string;
        return "claimed";
      },
      record: async (status, extra) => {
        await admin.from("crew_support_notification_events").update({ status, attempts: extra.attempts ?? 0, error: extra.error ?? null, updated_at: new Date().toISOString() }).eq("id", claimId);
        await logActivity({ actorUserId: params.triggeredBy, action: "crew_support.notification", entityType: "crew_support_request", entityId: params.requestId, metadata: { eventKey: params.eventKey, template: params.template, status, audience: "crew" } });
      },
      send: async () => (await dispatchNotification({ channels: ["email"], email: { to, subject: email.subject, html: email.html, text: email.text, logPrefix: "[crew-support]", emailType: `crew-support-${params.template}`, referenceNumber: params.vars.reference } })).email,
      logTestSuppressed: () => console.log(`[crew-support] [test-record, not delivered] would send crew email "${email.subject}" to ${to}`),
    });
    return { outcome };
  } catch (error) {
    console.error("[crew-support] notifyCrew threw", params.eventKey, error);
    return { outcome: "failed" };
  }
}
