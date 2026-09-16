import { escapeHtml, wrap, SERIF, SANS, NAVY, INK_MUTED } from "@/lib/enquiry/emailTemplates";
import { sendEmail } from "@/lib/shared/email/dispatch";

// Backlog Phase 5 (2026-09-16) — Recruitment applicant notifications.
// Audited first: no recruitment notification module existed at all;
// the only email an applicant ever received was Supabase Auth's own
// invite email, fired only once they're actually converted to a real
// account (inviteCollaboratorAction/convertApplicationToVendorAction).
// Applicants have no account for most of the review lifecycle, so this
// sends directly to the email address recorded on their own
// recruitment_applications row — never resolved via auth.admin.getUserById()
// the way every other notification module in this codebase does,
// because there is usually no account yet to resolve. Reuses the same
// sendEmail()/Resend pipeline; no new provider, no SMS/WhatsApp.
//
// Deliberately narrow: only the four status changes an applicant would
// genuinely want to know about (shortlisted/interview/accepted/rejected).
// "new"/"reviewing"/"archived" are internal review states, not
// applicant-facing events.

export type RecruitmentNotificationEvent = "shortlisted" | "interview" | "accepted" | "rejected";

const EVENT_COPY: Record<RecruitmentNotificationEvent, { subject: string; heading: string; body: string }> = {
  shortlisted: {
    subject: "Application Update — Ordift Studios",
    heading: "Your application has been shortlisted",
    body: "Thank you for applying to Ordift Studios. Your application has moved forward for further review. We'll be in touch with next steps.",
  },
  interview: {
    subject: "Interview Invitation — Ordift Studios",
    heading: "You're invited to interview",
    body: "Thank you for applying to Ordift Studios. We'd like to move forward with an interview. Someone from our team will reach out to schedule this.",
  },
  accepted: {
    subject: "Application Accepted — Ordift Studios",
    heading: "Congratulations — your application has been accepted",
    body: "Thank you for applying to Ordift Studios. We're pleased to move forward with you. You'll receive a separate invitation to set up your account.",
  },
  rejected: {
    subject: "Application Update — Ordift Studios",
    heading: "An update on your application",
    body: "Thank you for your interest in Ordift Studios and for taking the time to apply. We will not be moving forward with your application at this time. We wish you the best in your search.",
  },
};

export function buildRecruitmentNotificationEmail(event: RecruitmentNotificationEvent): { subject: string; html: string; text: string } {
  const copy = EVENT_COPY[event];
  const html = wrap(
    `
    <p style="margin:0 0 4px;font-family:${SANS};font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${NAVY};">Ordift Studios</p>
    <h1 style="margin:0 0 20px;font-family:${SERIF};font-size:24px;color:${NAVY};font-weight:normal;">${escapeHtml(copy.heading)}</h1>
    <p style="margin:0 0 20px;font-family:${SANS};font-size:14px;color:${INK_MUTED};">${escapeHtml(copy.body)}</p>`,
    "Ordift Studios"
  );
  const text = `${copy.heading}\n\n${copy.body}`;
  return { subject: copy.subject, html, text };
}

// Fire-and-forget by design, matching every other notification module
// in this codebase — a failure here never blocks or reverses the
// status change it follows.
export async function sendRecruitmentNotification(params: { applicantEmail: string; event: RecruitmentNotificationEvent; applicationId: string }): Promise<{ sent: boolean }> {
  try {
    const { subject, html, text } = buildRecruitmentNotificationEmail(params.event);
    const result = await sendEmail({
      to: params.applicantEmail,
      subject,
      html,
      text,
      logPrefix: "[notifications]",
      emailType: `recruitment-${params.event}`,
      referenceNumber: params.applicationId,
    });
    return { sent: result.ok };
  } catch (err) {
    console.error("[notifications] sendRecruitmentNotification threw", params.applicationId, params.event, err);
    return { sent: false };
  }
}
