import type { Metadata } from "next";
import { buildAcknowledgementEmail, buildAdminNotificationEmail } from "@/lib/enquiry/emailTemplates";
import type { EnquiryRecord } from "@/lib/enquiry/storage";

export const metadata: Metadata = {
  title: "Email Preview — Ordift Studios (internal)",
  robots: { index: false, follow: false },
};

const sampleRecord: EnquiryRecord = {
  service: "photography",
  projectType: "Product photography for a new skincare line",
  projectLocation: "Accra, Ghana",
  description:
    "We're launching a new skincare line in September and need clean, editorial product photography for the website and social launch — around 15-20 SKUs.",
  referenceLink: "https://pinterest.com/example-moodboard",
  timeframe: "Late August 2026",
  budgetRange: "standard",
  fullName: "Ama Boateng",
  companyName: "Lumé Skincare",
  email: "ama@example.com",
  phone: "+233 24 000 0000",
  country: "Ghana",
  hearAboutUs: "Instagram",
  consent: true,
  marketingConsent: true,
  sourcePage: "/services/photography",
  idempotencyKey: "",
  website: "",
  referenceNumber: "ORD-20260723-0417",
  submittedAt: new Date().toISOString(),
  environment: "staging",
};

export default function EmailPreviewPage() {
  const ack = buildAcknowledgementEmail(sampleRecord);
  const admin = buildAdminNotificationEmail(sampleRecord);

  return (
    <main className="min-h-screen bg-white px-4 py-10 sm:px-8">
      <div className="max-w-5xl mx-auto">
        <p className="text-xs uppercase tracking-[0.2em] text-ordift-gold-pressed mb-3">
          Internal review — not part of the public site
        </p>
        <h1 className="text-2xl font-semibold text-ordift-ink mb-2">
          Email preview
        </h1>
        <p className="text-sm text-ordift-ink-muted mb-10 max-w-2xl">
          Rendered from a sample submission using the real templates in{" "}
          <code>src/lib/enquiry/emailTemplates.ts</code>. Email-safe font
          stacks (Georgia / system sans) stand in for Fraunces/Inter,
          since custom web fonts aren&apos;t reliably supported across
          email clients.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          <div>
            <h2 className="text-sm font-semibold text-ordift-ink mb-1">
              1. Acknowledgement email (to the sender)
            </h2>
            <p className="text-xs text-ordift-ink-muted mb-3">
              Subject: {ack.subject}
            </p>
            <iframe
              title="Acknowledgement email preview"
              srcDoc={ack.html}
              className="w-full border border-black/10 rounded-lg"
              style={{ height: "620px" }}
            />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-ordift-ink mb-1">
              2. Admin notification (internal)
            </h2>
            <p className="text-xs text-ordift-ink-muted mb-3">
              Subject: {admin.subject}
            </p>
            <iframe
              title="Admin notification email preview"
              srcDoc={admin.html}
              className="w-full border border-black/10 rounded-lg"
              style={{ height: "780px" }}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
