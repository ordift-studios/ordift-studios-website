import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { loadFounderApprovalView } from "@/lib/legal/founderApprovalActions";
import FounderApprovalPanel from "./FounderApprovalPanel";

export const metadata: Metadata = { title: "Founder approval — Ordift Studios Admin", robots: { index: false, follow: false } };

// Super Admin only. The Founder records their own approval here after a telephone consultation with counsel. Activation, publication and issue are separate acts elsewhere.
export default async function FounderApprovalPage({ params }: { params: Promise<{ versionId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user)) redirect("/admin/overview");
  const { versionId } = await params;
  const view = await loadFounderApprovalView(versionId, user.id);
  if (!view.found) notFound();
  return (
    <div className="space-y-6">
      <div>
        <a href="/admin/legal#versions" className="font-sans text-caption text-ordift-gold-pressed underline">← Legal &amp; Governance</a>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mt-3 mb-2">Admin · Super Admin</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Founder approval on counsel&apos;s advice</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">{view.code} version {view.target.version}. Record your own approval after your telephone consultation with counsel.</p>
      </div>
      <FounderApprovalPanel view={view} />
    </div>
  );
}
