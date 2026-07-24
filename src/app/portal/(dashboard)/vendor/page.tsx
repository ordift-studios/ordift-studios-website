import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/portal/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Vendor — Ordift Studios Portal",
  robots: { index: false, follow: false },
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending Review",
  active: "Active",
  inactive: "Inactive",
};

// Same scaffolding rationale as the Model portal: no vendor/partner
// collaboration workflow (briefs, shared assets, purchase orders) was
// defined before this milestone, so this shows real account status
// rather than inventing features that don't exist yet.
export default async function VendorPortalPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const { data: profile } = user
    ? await supabase
        .from("vendor_profiles")
        .select("company_name, status")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };

  return (
    <div>
      <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
        Vendor / Partner
      </p>
      <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink mb-8">
        {profile?.company_name || "My Account"}
      </h1>

      <div className="bg-white border border-black/10 rounded-2xl p-8">
        <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted mb-2">
          Status
        </p>
        <p className="font-serif text-body text-ordift-ink mb-6">
          {profile ? STATUS_LABELS[profile.status] ?? profile.status : "Not yet set up"}
        </p>
        <p className="font-sans text-body-small text-ordift-ink-muted max-w-xl">
          Vendor collaboration tools — shared briefs, deliverables, and
          purchase orders — are on the Ordift Studios roadmap and
          aren&apos;t built yet. Ordift Studios will coordinate directly
          with you in the meantime.
        </p>
      </div>
    </div>
  );
}
