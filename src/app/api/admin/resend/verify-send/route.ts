import { NextResponse } from "next/server";
import { Resend } from "resend";
import { requireSuperAdminApiUser } from "@/lib/admin/apiAuth";
import { buildAcknowledgementEmail, buildAdminNotificationEmail } from "@/lib/enquiry/emailTemplates";
import type { EnquiryRecord } from "@/lib/enquiry/storage";
import {
  buildRegistrationAcknowledgementEmail,
  buildRegistrationAdminNotificationEmail,
} from "@/lib/workshops/registrationEmailTemplates";
import type { WorkshopRegistrationRecord } from "@/lib/workshops/registrationStorage";

// Super Admin-only, one-shot verification action — same precedent as
// /api/admin/google-sheets/verify-write. Proves the production
// RESEND_API_KEY actually authenticates and sends by calling Resend
// directly from inside the running deployment, the only place that can
// read a Vercel "Sensitive" environment variable's real value — the
// CLI/dashboard/`vercel env pull` cannot, by design.
//
// Exercises the real template builders for every email-producing form
// (Contact Enquiry, Workshop Registration — Project Requests have no
// email step at all, see PRODUCTION_READINESS_REPORT.md) with
// clearly-marked QA data, so this proves template rendering as well as
// delivery, not just that *an* email can be sent. Every send goes to
// EMAIL_ADMIN_NOTIFICATION_TO only — never to a fabricated external
// address — so nothing reaches a real third party.
//
// Deliberately bypasses productionSendingEnabled()/FORMS_SENDING_ENABLED
// on purpose: this route's whole point is verifying the credential and
// templates on demand, independent of whether public-form sending is
// turned on yet. It is never called from any visitor-facing path.
export async function POST() {
  const user = await requireSuperAdminApiUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM_ADDRESS;
  const to = process.env.EMAIL_ADMIN_NOTIFICATION_TO;

  if (!apiKey || !from || !to) {
    return NextResponse.json(
      {
        ok: false,
        error: "not-configured",
        detail: {
          RESEND_API_KEY: Boolean(apiKey),
          EMAIL_FROM_ADDRESS: Boolean(from),
          EMAIL_ADMIN_NOTIFICATION_TO: Boolean(to),
        },
      },
      { status: 503 }
    );
  }

  const now = new Date().toISOString();
  const resend = new Resend(apiKey);
  const fromAddr: string = from;
  const toAddr: string = to;
  const results: Record<string, { ok: boolean; resendId?: string; detail?: string }> = {};

  async function send(label: string, subject: string, html: string, text: string) {
    try {
      const result = await resend.emails.send({
        from: fromAddr,
        to: toAddr,
        subject: `[QA VERIFY] ${subject}`,
        html,
        text,
      });
      if (result.error) {
        results[label] = { ok: false, detail: result.error.message };
      } else {
        results[label] = { ok: true, resendId: result.data?.id };
      }
    } catch (err) {
      results[label] = { ok: false, detail: err instanceof Error ? err.message : "unknown-error" };
    }
  }

  // 1. Generic credential check — proves auth works even if every
  // template below happens to fail for an unrelated reason.
  await send(
    "credentialCheck",
    "Resend production verification (safe to ignore)",
    "",
    `Verification send triggered by ${user.email} at ${now}. Confirms RESEND_API_KEY authenticates and the send path works. No action needed.`
  );

  // 2. Contact Enquiry — acknowledgement (visitor-facing) + admin notification
  const enquiryRecord: EnquiryRecord = {
    service: "photography",
    projectType: "Editorial shoot",
    projectLocation: "Accra, Ghana",
    description: "QA verification enquiry — auto-generated to confirm template rendering. Safe to ignore.",
    referenceLink: "",
    timeframe: "Flexible",
    budgetRange: "",
    fullName: "QA Verification",
    companyName: "",
    email: to,
    phone: "+233000000000",
    country: "Ghana",
    hearAboutUs: "",
    consent: true,
    marketingConsent: false,
    sourcePage: "/api/admin/resend/verify-send",
    idempotencyKey: "",
    website: "",
    referenceNumber: `QA-VERIFY-${Date.now()}`,
    submittedAt: now,
    environment: "production",
  };
  {
    const ack = buildAcknowledgementEmail(enquiryRecord);
    await send("enquiryAcknowledgement", ack.subject, ack.html, ack.text);
    const admin = buildAdminNotificationEmail(enquiryRecord);
    await send("enquiryAdminNotification", admin.subject, admin.html, admin.text);
  }

  // 3. Workshop Registration — acknowledgement + admin notification
  const workshopRecord: WorkshopRegistrationRecord = {
    workshopSlug: "qa-verify-workshop",
    fullName: "QA Verification",
    email: to,
    phone: "+233000000000",
    country: "Ghana",
    experienceLevel: "all-levels",
    consent: true,
    idempotencyKey: "",
    website: "",
    registrationReference: `QA-VERIFY-${Date.now()}`,
    workshopId: "00000000-0000-0000-0000-000000000000",
    workshopTitle: "QA Verification Workshop",
    registrationDate: now,
    registrationStatus: "Registered",
    waitingListPosition: null,
    paymentStatus: "Not Required",
    environment: "production",
  };
  {
    const ack = buildRegistrationAcknowledgementEmail(workshopRecord);
    await send("workshopAcknowledgement", ack.subject, ack.html, ack.text);
    const admin = buildRegistrationAdminNotificationEmail(workshopRecord);
    await send("workshopAdminNotification", admin.subject, admin.html, admin.text);
  }

  // Project Requests have no email notification path in this codebase
  // (src/app/portal/(dashboard)/client/projects/[kind]/[id]/requests/actions.ts
  // only writes to Supabase and syncs to Google Sheets) — nothing to
  // verify here; recorded explicitly so this isn't silently skipped.
  results.projectRequestEmail = { ok: true, detail: "not-applicable — no email step exists for this form" };

  const allOk = Object.values(results).every((r) => r.ok);
  return NextResponse.json({ ok: allOk, results, verifiedBy: user.email, verifiedAt: now });
}
