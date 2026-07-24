import type { Metadata } from "next";
import Link from "next/link";
import Button from "@/components/Button";
import { getCurrentUser } from "@/lib/portal/roles";
import { getEnquiriesForUser, crmStageLabel } from "@/lib/portal/data";

export const metadata: Metadata = {
  title: "My Bookings — Ordift Studios Portal",
  robots: { index: false, follow: false },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function ClientPortalPage() {
  const user = await getCurrentUser();
  const enquiries = user ? await getEnquiriesForUser(user.id) : [];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
            Client Portal
          </p>
          <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
            My Bookings
          </h1>
        </div>
        <Button href="/book" variant="dark">
          New Enquiry
        </Button>
      </div>

      {enquiries.length === 0 ? (
        <div className="bg-white border border-black/10 rounded-2xl p-10 text-center">
          <p className="font-sans text-body text-ordift-ink-muted max-w-md mx-auto mb-6">
            You haven&apos;t submitted an enquiry with this account yet. Once
            you do, it will appear here — including its status as we move
            it forward.
          </p>
          <Button href="/book" variant="primary">
            Start an Enquiry
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {enquiries.map((enquiry) => (
            <div
              key={enquiry.id}
              className="bg-white border border-black/10 rounded-2xl p-6 flex flex-wrap items-start justify-between gap-4"
            >
              <div>
                <p className="font-sans text-caption text-ordift-ink-muted uppercase tracking-wide mb-1">
                  {enquiry.referenceNumber}
                </p>
                <p className="font-serif text-body text-ordift-ink mb-1 capitalize">
                  {enquiry.service.replace(/-/g, " ")}
                </p>
                <p className="font-sans text-body-small text-ordift-ink-muted">
                  Submitted {formatDate(enquiry.submittedAt)}
                </p>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-ordift-offwhite font-sans text-body-small font-medium text-ordift-ink">
                  {crmStageLabel(enquiry.crmStage)}
                </span>
                {enquiry.paymentStatus && (
                  <p className="font-sans text-caption text-ordift-ink-muted mt-2">
                    Payment: {enquiry.paymentStatus}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="font-sans text-body-small text-ordift-ink-muted mt-8">
        Questions about a booking?{" "}
        <Link href="/contact" className="text-ordift-gold-pressed underline underline-offset-4">
          Contact us
        </Link>
        .
      </p>
    </div>
  );
}
