import { NextResponse } from "next/server";
import { requireSuperAdminApiUser } from "@/lib/admin/apiAuth";
import { sendEmailNow } from "@/lib/shared/email/dispatch";
import { buildAcknowledgementEmail, buildAdminNotificationEmail } from "@/lib/enquiry/emailTemplates";
import type { EnquiryRecord } from "@/lib/enquiry/storage";
import {
  buildRegistrationAcknowledgementEmail,
  buildRegistrationAdminNotificationEmail,
} from "@/lib/workshops/registrationEmailTemplates";
import type { WorkshopRegistrationRecord } from "@/lib/workshops/registrationStorage";
import {
  buildProjectRequestAcknowledgementEmail,
  buildProjectRequestAdminNotificationEmail,
} from "@/lib/projectRequests/emailTemplates";
import type { ProjectRequestRecord } from "@/lib/projectRequests/sheetsSync";

// Super Admin-only, one-shot verification action — same precedent as
// /api/admin/google-sheets/verify-write. Proves the production
// RESEND_API_KEY actually authenticates and sends by calling
// sendEmailNow() (src/lib/shared/email/dispatch.ts) from inside the
// running deployment — the only place that can read a Vercel
// "Sensitive" environment variable's real value; the CLI/dashboard/
// `vercel env pull` cannot, by design.
//
// Exercises the real template builders for every email-producing form
// (Contact Enquiry, Workshop Registration, Project Requests) with
// clearly-marked QA data, through the real send/retry/classification
// logic — so this proves template rendering, delivery, AND
// retry/classification wiring, not just that *an* email can be sent.
// Every send goes to EMAIL_ADMIN_NOTIFICATION_TO only — never to a
// fabricated external address — so nothing reaches a real third party.
//
// Deliberately calls sendEmailNow() rather than the gated sendEmail():
// this route's entire purpose is proving Resend actually works, so it
// must always attempt a real send regardless of FORMS_SENDING_ENABLED
// or environment — routing it through the gate would make every result
// report "logged" without ever touching Resend, silently defeating the
// verification (this happened once; see commit history).
export async function POST() {
  const user = await requireSuperAdminApiUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const adminTo = process.env.EMAIL_ADMIN_NOTIFICATION_TO;
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM_ADDRESS || !adminTo) {
    return NextResponse.json(
      {
        ok: false,
        error: "not-configured",
        detail: {
          RESEND_API_KEY: Boolean(process.env.RESEND_API_KEY),
          EMAIL_FROM_ADDRESS: Boolean(process.env.EMAIL_FROM_ADDRESS),
          EMAIL_ADMIN_NOTIFICATION_TO: Boolean(adminTo),
        },
      },
      { status: 503 }
    );
  }
  const to: string = adminTo;

  const now = new Date().toISOString();
  const results: Record<
    string,
    { ok: boolean; mode?: string; attempts?: number; detail?: string; permanent?: boolean }
  > = {};

  async function run(label: string, subject: string, html: string, text: string) {
    const result = await sendEmailNow({
      to,
      subject: `[QA VERIFY] ${subject}`,
      html,
      text,
      logPrefix: "[verify-send]",
      emailType: `verify-send-${label}`,
      referenceNumber: null,
    });
    results[label] = result.ok
      ? { ok: true, mode: result.mode, attempts: result.attempts }
      : { ok: false, detail: result.error, attempts: result.attempts, permanent: result.permanent };
  }

  // 1. Generic credential check
  await run(
    "credentialCheck",
    "Resend production verification (safe to ignore)",
    "",
    `Verification send triggered by ${user.email} at ${now}. Confirms RESEND_API_KEY authenticates and the send path works. No action needed.`
  );

  // 2. Contact Enquiry — acknowledgement + admin notification
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
    await run("enquiryAcknowledgement", ack.subject, ack.html, ack.text);
    const admin = buildAdminNotificationEmail(enquiryRecord);
    await run("enquiryAdminNotification", admin.subject, admin.html, admin.text);
  }

  // 3. Workshop Registration — acknowledgement + admin notification
  const workshopRecord: WorkshopRegistrationRecord = {
    workshopSlug: "qa-verify-workshop",
    firstName: "QA",
    surname: "Verification",
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
    amountDueUsd: null,
    environment: "production",
  };
  {
    const ack = buildRegistrationAcknowledgementEmail(workshopRecord);
    await run("workshopAcknowledgement", ack.subject, ack.html, ack.text);
    const admin = buildRegistrationAdminNotificationEmail(workshopRecord);
    await run("workshopAdminNotification", admin.subject, admin.html, admin.text);
  }

  // 4. Project Request — acknowledgement + admin notification
  const projectRequestRecord: ProjectRequestRecord = {
    referenceNumber: `QA-VERIFY-${Date.now()}`,
    requestTypeLabel: "QA Verification Request",
    relatedProjectReference: "ENQ-2026-000000",
    relatedProjectType: "Enquiry",
    clientName: "QA Verification",
    email: to,
    phone: "+233000000000",
    clientNotes: "Auto-generated to confirm template rendering. Safe to ignore.",
    createdAt: now,
  };
  {
    const ack = buildProjectRequestAcknowledgementEmail(projectRequestRecord);
    await run("projectRequestAcknowledgement", ack.subject, ack.html, ack.text);
    const admin = buildProjectRequestAdminNotificationEmail(projectRequestRecord);
    await run("projectRequestAdminNotification", admin.subject, admin.html, admin.text);
  }

  const allOk = Object.values(results).every((r) => r.ok);
  return NextResponse.json({ ok: allOk, results, verifiedBy: user.email, verifiedAt: now });
}
