import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, hasRole } from "@/lib/portal/roles";
import { contentRepository } from "@/lib/content";
import { legalPagesApproved, formsSendingEnabled, isStaging } from "@/lib/shared/env";

export const metadata: Metadata = {
  title: "Settings — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full font-sans text-caption font-semibold ${
        ok ? "bg-ordift-gold/20 text-ordift-gold-pressed" : "bg-black/10 text-ordift-ink-muted"
      }`}
    >
      {label}
    </span>
  );
}

export default async function AdminSettingsPage() {
  const user = await getCurrentUser();
  if (!user || !hasRole(user, "admin")) redirect("/admin/overview");

  const siteSettings = await contentRepository.getSiteSettings();

  return (
    <div className="space-y-10">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
          Admin
        </p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
          Settings
        </h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Read-only status. Each item links to where it&apos;s actually changed.
        </p>
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-5">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Legal &amp; Forms</h2>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-sans text-body-small text-ordift-ink font-medium">Legal Pages Approved</p>
            <p className="font-sans text-caption text-ordift-ink-muted">
              Gates whether legal page content is published. Changed via Vercel env var + deploy —
              deliberately not instant.
            </p>
          </div>
          <StatusPill ok={legalPagesApproved()} label={legalPagesApproved() ? "Approved" : "Not Approved"} />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-sans text-body-small text-ordift-ink font-medium">Forms Sending Enabled</p>
            <p className="font-sans text-caption text-ordift-ink-muted">
              Gates real email delivery for enquiries/bookings. Changed via Vercel env var + deploy.
            </p>
          </div>
          <StatusPill ok={formsSendingEnabled()} label={formsSendingEnabled() ? "Enabled" : "Disabled"} />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-sans text-body-small text-ordift-ink font-medium">Environment</p>
            <p className="font-sans text-caption text-ordift-ink-muted">Current deployment environment.</p>
          </div>
          <StatusPill ok={!isStaging()} label={isStaging() ? "Staging" : "Production"} />
        </div>

        <Link
          href="/admin/flags"
          className="inline-block font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4"
        >
          Manage business-level feature flags →
        </Link>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Website Settings</h2>
        <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Site Name</p>
        <p className="font-sans text-body-small text-ordift-ink">{siteSettings.siteName}</p>
        <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted pt-2">
          Contact Email
        </p>
        <p className="font-sans text-body-small text-ordift-ink">{siteSettings.contactEmail}</p>
        <Link
          href="/studio/structure/siteSettings"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4 pt-2"
        >
          Edit in Studio →
        </Link>
      </section>
    </div>
  );
}
