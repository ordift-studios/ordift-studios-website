import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { getOnboardingDocumentsOverview } from "@/lib/organization/onboardingDocumentsOverview";
import { OnboardingDocumentsWorkspace } from "./OnboardingDocumentsWorkspace";

export const metadata: Metadata = {
  title: "Onboarding Documents — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// HR Onboarding Documents (Task 2, 2026-09-17) — an OPERATIONAL surface
// over the existing universal onboarding-document architecture, not a
// second legal-document database. Legal & Governance (/admin/legal)
// remains the source/control system for the documents themselves; this
// page only shows who is currently onboarding and how ready their real
// documents/agreement are, reusing getOnboardingDocumentsOverview()
// (onboardingDocumentsOverview.ts), which itself reuses
// listResolvedRequirements()/checkEmployeeAgreementReadiness() — never
// a duplicated computation.
export default async function OnboardingDocumentsPage() {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) redirect("/admin/overview");

  const rows = await getOnboardingDocumentsOverview();

  return (
    <div>
      <div className="mb-8">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · HR</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Onboarding Documents</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Everyone currently onboarding, and their real document/agreement readiness — reusing the same
          classification-driven requirement catalog and Employee Employment Agreement gate every individual
          onboarding workspace already uses.
        </p>
      </div>

      <OnboardingDocumentsWorkspace rows={rows} />
    </div>
  );
}
