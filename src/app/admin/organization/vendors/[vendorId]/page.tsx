import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManageOnboarding } from "@/lib/organization/onboarding";
import { getStaffOnboardingByProfileId } from "@/lib/organization/onboarding";
import { listResolvedRequirements, listOnboardingRequirementOverrides } from "@/lib/organization/onboardingRequirements";
import { getVendorProfile } from "@/lib/vendors/vendorProfiles";
import { listVendorDocuments } from "@/lib/vendors/vendorDocuments";
import { getPayeeProfile } from "@/lib/payables/payeeProfiles";
import { listEmploymentJurisdictions } from "@/lib/portal/adminData";
import { createAdminClient } from "@/lib/supabase/admin";
import { listVendorAgreementFamily, listVendorWorkOrderVariations, summarizeCurrentEngagement, VENDOR_ENGAGEMENT_SUMMARY_LABEL } from "@/lib/legal/vendorAgreements";
import { listEmployingEntities } from "@/lib/organization/legalEntities";
import { isTerminalStage } from "@/lib/organization/onboardingStages";
import { VendorDetailWorkspace } from "./VendorDetailWorkspace";

export const metadata: Metadata = {
  title: "Vendor — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

export default async function VendorDetailPage({ params }: { params: Promise<{ vendorId: string }> }) {
  const { vendorId } = await params;
  const user = await getCurrentUser();
  if (!user || !(await canManageOnboarding(user.id))) redirect("/admin/organization");

  const admin = createAdminClient();
  const [{ data: profile }, { data: staffDetails }, vendorProfile, onboarding] = await Promise.all([
    admin.from("profiles").select("id, full_name, member_number").eq("id", vendorId).maybeSingle(),
    admin.from("staff_details").select("engagement_type_id, engagement_types(slug, name)").eq("id", vendorId).maybeSingle(),
    getVendorProfile(vendorId),
    getStaffOnboardingByProfileId(vendorId),
  ]);
  if (!profile) notFound();

  const [resolvedRequirements, overrides, documents, payeeProfile, { data: paymentInstructions }, jurisdictions, agreementFamily, employingEntities] = await Promise.all([
    onboarding ? listResolvedRequirements({ onboardingId: onboarding.id, profileId: vendorId, pipeline: onboarding.pipeline }) : Promise.resolve([]),
    onboarding ? listOnboardingRequirementOverrides(onboarding.id) : Promise.resolve([]),
    listVendorDocuments(vendorId, user.id),
    getPayeeProfile(vendorId),
    admin.from("payment_instructions").select("id, method, verification_status, is_default").eq("profile_id", vendorId),
    listEmploymentJurisdictions(),
    listVendorAgreementFamily(vendorId),
    listEmployingEntities(),
  ]);
  const { framework: frameworkAgreement, workOrders } = agreementFamily;
  const variationsByWorkOrderId = Object.fromEntries(
    await Promise.all(workOrders.map(async (wo) => [wo.id, await listVendorWorkOrderVariations(wo.id)] as const))
  );
  const jurisdictionOptions = jurisdictions.map((j) => ({ id: j.id, name: j.name }));
  // Vendor Profile Particulars (2026-09-15) — the Ordift Contracting
  // Entity field resolves/selects from this canonical, verified list
  // rather than free text (see FrameworkAgreementSection). active &&
  // verified only — never an entity whose registration facts haven't
  // been reviewed, and never a placeholder.
  const contractingEntityOptions = employingEntities
    .filter((e) => e.active && e.verificationStatus === "verified")
    .map((e) => ({ id: e.id, legalName: e.legalName ?? e.name, jurisdictionName: e.jurisdictionName }));

  const engagementType = staffDetails?.engagement_types as unknown as { slug: string; name: string } | null;

  // Vendor lifecycle reconciliation (2026-09-16) — three separate,
  // clearly-labeled states, never one conflated "Overall" status.
  // Onboarding, Vendor Approval, and Current Engagement are genuinely
  // independent: a vendor can be fully onboarded, Approved, and still
  // correctly show "No Current Engagement" — Ordift maintains an
  // Approved Vendor Pool before a real project exists.
  const onboardingSummary = onboarding
    ? onboarding.status === "completed" || isTerminalStage(onboarding.pipeline, onboarding.stage)
      ? "Complete"
      : `In progress — ${onboarding.stage.replace(/_/g, " ")}`
    : "Not started";
  const engagementSummary = VENDOR_ENGAGEMENT_SUMMARY_LABEL[summarizeCurrentEngagement(workOrders)];

  return (
    <div>
      <div className="mb-8">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · Vendors</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
          {vendorProfile?.companyName ?? profile.full_name ?? "Vendor"}
        </h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2">
          {profile.full_name} {profile.member_number ? `· ${profile.member_number}` : ""}
        </p>
        <div className="flex flex-wrap gap-2 mt-4">
          <span className="px-2.5 py-1 rounded-full font-sans text-caption bg-black/5 text-ordift-ink-muted whitespace-nowrap">
            Onboarding: {onboardingSummary}
          </span>
          <span className="px-2.5 py-1 rounded-full font-sans text-caption bg-amber-50 text-amber-900 whitespace-nowrap">
            Vendor Approval: {vendorProfile ? vendorProfile.status.replace(/_/g, " ") : "not recorded"}
          </span>
          <span className="px-2.5 py-1 rounded-full font-sans text-caption bg-blue-50 text-blue-900 whitespace-nowrap">
            Current Engagement: {engagementSummary}
          </span>
        </div>
      </div>

      <VendorDetailWorkspace
        vendorId={vendorId}
        vendorProfile={vendorProfile}
        engagementTypeSlug={engagementType?.slug ?? null}
        engagementTypeName={engagementType?.name ?? null}
        jurisdictionOptions={jurisdictionOptions}
        onboarding={onboarding}
        resolvedRequirements={resolvedRequirements}
        overrides={overrides}
        documents={documents}
        payeeProfile={payeeProfile}
        paymentInstructions={paymentInstructions ?? []}
        frameworkAgreement={frameworkAgreement}
        workOrders={workOrders}
        variationsByWorkOrderId={variationsByWorkOrderId}
        contractingEntityOptions={contractingEntityOptions}
      />
    </div>
  );
}
