import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { getPulseSourceAdminDetail } from "@/lib/content/sanity/pulseAdmin";
import { SourceEditForm } from "./SourceEditForm";

export const metadata: Metadata = { title: "Pulse Source — Ordift Studios Admin", robots: { index: false, follow: false } };

export default async function AdminPulseSourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) redirect("/admin/overview");

  const { id } = await params;
  const source = await getPulseSourceAdminDetail(id);
  if (!source) notFound();

  return (
    <div>
      <Link href="/admin/pulse/sources" className="font-sans text-caption text-ordift-ink-muted hover:text-ordift-ink">
        ← Back to Pulse Sources
      </Link>
      <div className="mt-4 mb-6">
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink">{source.name}</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-1">
          {source.sourceType}
          {source.feedUrl && (
            <>
              {" · "}
              <a href={source.feedUrl} target="_blank" rel="noopener noreferrer" className="text-ordift-gold-pressed underline underline-offset-4">
                feed
              </a>
            </>
          )}
          {source.termsUrl && (
            <>
              {" · "}
              <a href={source.termsUrl} target="_blank" rel="noopener noreferrer" className="text-ordift-gold-pressed underline underline-offset-4">
                terms
              </a>
            </>
          )}
        </p>
        {source.licenseNotes && <p className="font-sans text-body-small text-ordift-ink-muted mt-3 max-w-xl">{source.licenseNotes}</p>}
      </div>

      <SourceEditForm source={source} />
    </div>
  );
}
