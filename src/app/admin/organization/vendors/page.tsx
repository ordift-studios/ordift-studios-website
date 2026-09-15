import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManageOnboarding } from "@/lib/organization/onboarding";
import { listVendorWorkspaceRows } from "@/lib/vendors/vendorProfiles";
import { VendorsWorkspace } from "./VendorsWorkspace";

export const metadata: Metadata = {
  title: "Vendors — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Vendor Completion Phase (2026-09-15) — the dedicated Super
// Admin/operations.administer vendor-management surface the Vendor
// Readiness Audit found missing ("must not require normal operation
// through unrelated generic screens"). Same authorization tier as
// every other onboarding-management action (canManageOnboarding) —
// deliberately not narrowed to Super-Admin-only like Legal Entities,
// since standing up/progressing a vendor's onboarding is itself an
// onboarding action, already trusted to this tier everywhere else.
export default async function VendorsPage() {
  const user = await getCurrentUser();
  if (!user || !(await canManageOnboarding(user.id))) redirect("/admin/organization");

  const vendors = await listVendorWorkspaceRows(user.id);

  return (
    <div>
      <div className="mb-8">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · People &amp; Organization</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Vendors</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Every account holding the Vendor / Partner role — company profile, onboarding stage, onboarding requirements,
          documents, and payment readiness. New vendor accounts are created via Invite Collaborator or the Careers
          application &ldquo;Create/Invite as Vendor&rdquo; action, never from this page directly.
        </p>
      </div>

      <VendorsWorkspace vendors={vendors} />
    </div>
  );
}
