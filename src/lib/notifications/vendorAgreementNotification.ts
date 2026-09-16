import { createAdminClient } from "@/lib/supabase/admin";
import { escapeHtml, wrap, SERIF, SANS, NAVY, GOLD, INK_MUTED } from "@/lib/enquiry/emailTemplates";
import { dispatchNotification } from "./dispatch";
import { siteUrl } from "@/lib/shared/env";

// OS-LGL-009 Vendor & Supplier Framework Agreement implementation
// phase (2026-09-15), Part 10 — reuses the exact same pattern as
// engagementNotification.ts (the one, real, production-proven email
// pipeline: dispatchNotification() -> sendEmail() -> Resend). No new
// provider, no SMS/WhatsApp, no separate notification platform.
//
// Deliberately narrow scope for this phase: only the two events with a
// real, already-built trigger point are implemented —
// "document_reviewed" (reviewVendorDocument(), vendorDocuments.ts) and
// "framework_ready_for_signature" (issueVendorFrameworkAgreement(),
// vendorAgreementIssuance.ts's successful "sent" transition). Work
// Order issuance/Variation-requiring-action notifications are
// deliberately NOT wired here — Work Order/Variation ISSUANCE (as
// opposed to draft creation, which is built) does not exist yet, so
// there is no genuine trigger point to notify from without inventing
// one. See the architecture report for this explicit scope boundary.

// Backlog Phase 1 Item 3 (2026-09-16) — audited existing coverage
// first (document_approved/rejected, framework_ready_for_signature)
// before adding these three. Invitation/account-setup is already
// covered by Supabase Auth's own inviteUserByEmail() (inviteCollaboratorAction()),
// engagement/Work Order assignment and payment-status are already
// covered generically for every payee (including vendors) by
// engagementNotification.ts — neither needed anything new here.
export type VendorAgreementNotificationEvent =
  | "document_approved"
  | "document_rejected"
  | "framework_ready_for_signature"
  | "document_received"
  | "onboarding_started"
  | "onboarding_completed"
  | "work_order_ready_for_signature";

const EVENT_COPY: Record<VendorAgreementNotificationEvent, { subject: string; heading: string; body: string }> = {
  document_approved: {
    subject: "Document Approved — Ordift Studios",
    heading: "Your document has been reviewed and approved",
    body: "Ordift Studios has reviewed and approved a document you submitted. Sign in to your Vendor Portal for details.",
  },
  document_rejected: {
    subject: "Document Requires Attention — Ordift Studios",
    heading: "A document you submitted needs attention",
    body: "Ordift Studios has reviewed a document you submitted and it was not accepted. Sign in to your Vendor Portal for details.",
  },
  framework_ready_for_signature: {
    subject: "Vendor & Supplier Framework Agreement Ready — Ordift Studios",
    heading: "Your Framework Agreement is ready for review and signature",
    body: "Ordift Studios has issued your Vendor & Supplier Framework Agreement. Please review and sign it using the secure link in the separate agreement email you received, or sign in to your Vendor Portal for status.",
  },
  document_received: {
    subject: "Document Received — Ordift Studios",
    heading: "We've received your document",
    body: "Ordift Studios has received the document you submitted. It is now under review — sign in to your Vendor Portal for status.",
  },
  onboarding_started: {
    subject: "Vendor Onboarding Started — Ordift Studios",
    heading: "Your Vendor onboarding has started",
    body: "Ordift Studios has started your Vendor onboarding. Sign in to your Vendor Portal to see what's needed next.",
  },
  onboarding_completed: {
    subject: "Vendor Onboarding Complete — Ordift Studios",
    heading: "Your Vendor onboarding is complete",
    body: "Ordift Studios has confirmed your Vendor onboarding is complete. Sign in to your Vendor Portal for details.",
  },
  work_order_ready_for_signature: {
    subject: "Vendor Work Order Ready — Ordift Studios",
    heading: "A Work Order is ready for your review and signature",
    body: "Ordift Studios has issued a Vendor Work Order under your Framework Agreement. Please review and sign it using the secure link in the separate Work Order email you received, or sign in to your Vendor Portal for status.",
  },
};

// Exported for testing — same convention as buildEmail() in
// engagementNotification.ts: a pure render function.
export function buildVendorAgreementNotificationEmail(event: VendorAgreementNotificationEvent): { subject: string; html: string; text: string } {
  const copy = EVENT_COPY[event];
  const portalUrl = `${siteUrl()}/portal/vendor`;
  const html = wrap(
    `
    <p style="margin:0 0 4px;font-family:${SANS};font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${GOLD};">Ordift Studios</p>
    <h1 style="margin:0 0 20px;font-family:${SERIF};font-size:24px;color:${NAVY};font-weight:normal;">${escapeHtml(copy.heading)}</h1>
    <p style="margin:0 0 20px;font-family:${SANS};font-size:14px;color:${INK_MUTED};">${escapeHtml(copy.body)}</p>
    <table role="presentation" width="100%" style="margin-bottom:8px;">
      <tr><td align="center">
        <a href="${portalUrl}" style="display:inline-block;padding:12px 28px;background:${GOLD};color:${NAVY};font-family:${SANS};font-size:14px;font-weight:600;text-decoration:none;border-radius:999px;">Open Your Vendor Portal</a>
      </td></tr>
    </table>`,
    "Ordift Studios"
  );
  const text = `${copy.heading}\n\n${copy.body}\n\nOpen your Vendor Portal: ${portalUrl}`;
  return { subject: copy.subject, html, text };
}

// Fire-and-forget by design, same as sendEngagementNotification() —
// never throws, never blocks the mutation it follows.
export async function sendVendorAgreementNotification(params: { vendorProfileId: string; event: VendorAgreementNotificationEvent }): Promise<{ sent: boolean }> {
  try {
    const admin = createAdminClient();
    const { data: authUser } = await admin.auth.admin.getUserById(params.vendorProfileId);
    const email = authUser?.user?.email;
    if (!email) return { sent: false };

    const { subject, html, text } = buildVendorAgreementNotificationEmail(params.event);
    const result = await dispatchNotification({
      channels: ["email"],
      email: { to: email, subject, html, text, logPrefix: "[notifications]", emailType: `vendor-agreement-${params.event}`, referenceNumber: params.vendorProfileId },
    });
    return { sent: result.email?.ok === true };
  } catch (err) {
    console.error("[notifications] sendVendorAgreementNotification threw", params.vendorProfileId, params.event, err);
    return { sent: false };
  }
}
