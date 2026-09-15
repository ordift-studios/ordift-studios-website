import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManageOnboarding } from "@/lib/organization/onboarding";
import { getStaffOnboardingByProfileId } from "@/lib/organization/onboarding";
import { listResolvedRequirements, listOnboardingRequirementOverrides } from "@/lib/organization/onboardingRequirements";
import { getVendorProfile } from "@/lib/vendors/vendorProfiles";
import { listVendorDocuments } from "@/lib/vendors/vendorDocuments";
import { getPayeeProfile } from "@/lib/payables/payeeProfiles";
import { createAdminClient } from "@/lib/supabase/admin";
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

  const [resolvedRequirements, overrides, documents, payeeProfile, { data: paymentInstructions }] = await Promise.all([
    onboarding ? listResolvedRequirements({ onboardingId: onboarding.id, profileId: vendorId, pipeline: onboarding.pipeline }) : Promise.resolve([]),
    onboarding ? listOnboardingRequirementOverrides(onboarding.id) : Promise.resolve([]),
    listVendorDocuments(vendorId, user.id),
    getPayeeProfile(vendorId),
    admin.from("payment_instructions").select("id, method, verification_status, is_default").eq("profile_id", vendorId),
  ]);

  const engagementType = staffDetails?.engagement_types as unknown as { slug: string; name: string } | null;

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
      </div>

      <VendorDetailWorkspace
        vendorId={vendorId}
        vendorProfile={vendorProfile}
        engagementTypeSlug={engagementType?.slug ?? null}
        engagementTypeName={engagementType?.name ?? null}
        onboarding={onboarding}
        resolvedRequirements={resolvedRequirements}
        overrides={overrides}
        documents={documents}
        payeeProfile={payeeProfile}
        paymentInstructions={paymentInstructions ?? []}
      />
    </div>
  );
}
