import { createAdminClient } from "@/lib/supabase/admin";
import { escapeHtml, wrap, SERIF, SANS, NAVY, GOLD, INK_MUTED } from "@/lib/enquiry/emailTemplates";
import { dispatchNotification } from "./dispatch";
import { siteUrl } from "@/lib/shared/env";

// Phase H.1/H.2 (2026-09-04) — the first real use of the extension
// point resolveNewBookingRecipients() left unused (its own comment: "so
// that future change is additive here, not a rewrite"). This is a
// smaller problem than that function solves, though: an engagement has
// exactly one recipient (its own payee_profile_id), not a set of
// internal admins to resolve — so this module doesn't extend
// recipients.ts, it's a parallel, single-recipient notification using
// the same dispatchNotification()/sendEmail() → Resend path, matching
// this codebase's one, real, production-proven email pipeline. No new
// provider, no SMS, no WhatsApp.

export type EngagementNotificationEvent = "assignment_created" | "work_approved" | "payment_completed" | "backup_required" | "feedback_posted";

const EVENT_COPY: Record<EngagementNotificationEvent, { subject: string; heading: string; body: string }> = {
  assignment_created: {
    subject: "New Assignment — Ordift Studios",
    heading: "You have a new assignment",
    body: "Ordift Studios has assigned you a new engagement. Sign in to your portal to see the brief, due date, and agreed compensation.",
  },
  work_approved: {
    subject: "Work Approved — Ordift Studios",
    heading: "Your submitted work has been approved",
    body: "Ordift Studios has approved the work you submitted. Sign in to your portal for details.",
  },
  payment_completed: {
    subject: "Payment Completed — Ordift Studios",
    heading: "Your payment has been recorded",
    body: "Ordift Studios has recorded your payment as completed. Sign in to your portal to view the details.",
  },
  backup_required: {
    subject: "Media Backup Required — Ordift Studios",
    heading: "Project media needs to be backed up",
    body: "A completed engagement has temporary project media awaiting external backup confirmation before its grace period begins.",
  },
  feedback_posted: {
    subject: "New Feedback — Ordift Studios",
    heading: "New feedback on your assignment",
    body: "Ordift Studios has posted an update on your assignment. Sign in to your portal to read it.",
  },
};

function buildEmail(event: EngagementNotificationEvent, engagementId: string): { subject: string; html: string; text: string } {
  const copy = EVENT_COPY[event];
  const portalUrl = `${siteUrl()}/portal/collaborator/engagement/${engagementId}`;
  const html = wrap(
    `
    <p style="margin:0 0 4px;font-family:${SANS};font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${GOLD};">Ordift Studios</p>
    <h1 style="margin:0 0 20px;font-family:${SERIF};font-size:24px;color:${NAVY};font-weight:normal;">${escapeHtml(copy.heading)}</h1>
    <p style="margin:0 0 20px;font-family:${SANS};font-size:14px;color:${INK_MUTED};">${escapeHtml(copy.body)}</p>
    <table role="presentation" width="100%" style="margin-bottom:8px;">
      <tr><td align="center">
        <a href="${portalUrl}" style="display:inline-block;padding:12px 28px;background:${GOLD};color:${NAVY};font-family:${SANS};font-size:14px;font-weight:600;text-decoration:none;border-radius:999px;">Open Your Portal</a>
      </td></tr>
    </table>`,
    "Ordift Studios"
  );
  const text = `${copy.heading}\n\n${copy.body}\n\nOpen your portal: ${portalUrl}`;
  return { subject: copy.subject, html, text };
}

// Fire-and-forget by design, same as sendNewBookingNotification() —
// never throws, never blocks the mutation it follows. Avoids an email
// storm by design too: this is only ever called once per real state
// transition (not on every read), and each call sends to exactly one
// recipient (the engagement's own payee), never a broadcast list.
export async function sendEngagementNotification(params: { engagementId: string; event: EngagementNotificationEvent }): Promise<{ sent: boolean }> {
  try {
    const admin = createAdminClient();
    const { data: engagement } = await admin.from("engagements").select("payee_profile_id").eq("id", params.engagementId).maybeSingle();
    if (!engagement?.payee_profile_id) return { sent: false };

    const { data: authUser } = await admin.auth.admin.getUserById(engagement.payee_profile_id);
    const email = authUser?.user?.email;
    if (!email) return { sent: false };

    const { subject, html, text } = buildEmail(params.event, params.engagementId);
    const result = await dispatchNotification({
      channels: ["email"],
      email: { to: email, subject, html, text, logPrefix: "[notifications]", emailType: `engagement-${params.event}`, referenceNumber: params.engagementId },
    });
    return { sent: result.email?.ok === true };
  } catch (err) {
    console.error("[notifications] sendEngagementNotification threw", params.engagementId, params.event, err);
    return { sent: false };
  }
}
