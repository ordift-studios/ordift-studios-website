import Link from "next/link";
import type { VendorWorkspaceRow } from "@/lib/vendors/vendorProfiles";

const STAGE_LABELS: Record<string, string> = {
  proposed: "Proposed",
  approved: "Approved",
  invited: "Invited",
  profile: "Profile",
  payment_setup: "Payment Setup",
  engagement_assigned: "Engagement Assigned",
  // "Onboarding Complete", never "Active" (2026-09-16 vendor lifecycle
  // reconciliation) — "Active" is reserved for the separate Vendor
  // Approval status (vendorProfileStatus, badge above) and this stage
  // reaching its end previously read as directly contradicting a
  // genuinely "Pending" approval status right next to it.
  active: "Onboarding Complete",
};

function VendorRow({ vendor }: { vendor: VendorWorkspaceRow }) {
  const notVendorSupplier = vendor.engagementTypeSlug && vendor.engagementTypeSlug !== "vendor_supplier";
  return (
    <li className="rounded-lg border border-black/10 bg-white p-4 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-sans text-body-small font-medium text-ordift-ink">
            <Link href={`/admin/organization/vendors/${vendor.profileId}`} className="underline underline-offset-4">
              {vendor.companyName ?? vendor.fullName ?? "Unnamed vendor"}
            </Link>
          </p>
          <p className="font-sans text-caption text-ordift-ink-muted">
            {vendor.fullName ?? "No account name"} {vendor.memberNumber ? `· ${vendor.memberNumber}` : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`px-2 py-0.5 rounded-full font-sans text-caption whitespace-nowrap ${vendor.vendorProfileStatus === "active" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
            Vendor Approval: {vendor.vendorProfileStatus ? vendor.vendorProfileStatus.replace(/_/g, " ") : "Company profile not recorded"}
          </span>
          {vendor.onboardingStage && (
            <span className="px-2 py-0.5 rounded-full font-sans text-caption whitespace-nowrap bg-black/5 text-ordift-ink-muted">
              Onboarding: {STAGE_LABELS[vendor.onboardingStage] ?? vendor.onboardingStage}
            </span>
          )}
        </div>
      </div>
      {!vendor.onboardingId && (
        <p className="font-sans text-caption text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          Onboarding not started — open this vendor to start it.
        </p>
      )}
      {notVendorSupplier && (
        <p className="font-sans text-caption text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          Engagement type is &ldquo;{vendor.engagementTypeSlug}&rdquo;, not vendor_supplier — vendor-specific onboarding
          requirements will not apply until this is corrected.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3 font-sans text-caption text-ordift-ink-muted">
        <span>{vendor.hasPayeeProfile ? "Payee profile set" : "No payee profile"}</span>
        <span>{vendor.hasPaymentInstructions ? "Payment destination configured" : "No payment destination"}</span>
        <Link href={`/admin/organization/vendors/${vendor.profileId}`} className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">
          Manage →
        </Link>
      </div>
    </li>
  );
}

export function VendorsWorkspace({ vendors }: { vendors: VendorWorkspaceRow[] }) {
  return (
    <section className="space-y-3">
      <h2 className="font-serif font-medium text-body text-ordift-ink">Vendors {vendors.length > 0 ? `(${vendors.length})` : ""}</h2>
      {vendors.length > 0 ? (
        <ul className="space-y-3">
          {vendors.map((v) => (
            <VendorRow key={v.profileId} vendor={v} />
          ))}
        </ul>
      ) : (
        <p className="font-sans text-body-small text-ordift-ink-muted">No accounts hold the Vendor / Partner role yet.</p>
      )}
    </section>
  );
}
