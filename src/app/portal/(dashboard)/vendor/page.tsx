import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/portal/roles";
import { createClient } from "@/lib/supabase/server";
import { listMyEngagements } from "@/lib/portal/engagementPortalData";

export const metadata: Metadata = {
  title: "Vendor — Ordift Studios Portal",
  robots: { index: false, follow: false },
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending Review",
  active: "Active",
  inactive: "Inactive",
};

// Phase H.1/H.2 (2026-09-04) — replaces the prior placeholder-only
// page with the real, shared engagement/compensation surface (same
// listMyEngagements() the collaborator dashboard uses — engagement
// ownership, not role, is what scopes this data). Deliberately no
// Files module here (Section 6: "Do not expose contractor-specific
// creative workflow modules unless the vendor engagement actually
// needs them") — a true company-level vendor's engagements link
// through to the same shared detail page, which still only shows
// Files if the vendor's own account happens to also be the
// engagement's payee and files exist; nothing here manufactures a
// vendor-specific upload workflow.
export default async function VendorPortalPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const [{ data: profile }, engagements] = await Promise.all([
    user ? supabase.from("vendor_profiles").select("company_name, status").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    user ? listMyEngagements(user.id) : Promise.resolve([]),
  ]);
  const activeEngagements = engagements.filter((e) => !["completed", "cancelled"].includes(e.status));

  return (
    <div className="space-y-10">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
          Vendor / Partner
        </p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
          {profile?.company_name || "My Account"}
        </h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2">
          {profile ? STATUS_LABELS[profile.status] ?? profile.status : "Not yet set up"}
        </p>
      </div>

      <section>
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-4">Engagements</h2>
        {activeEngagements.length === 0 ? (
          <div className="bg-white border border-black/10 rounded-2xl p-8">
            <p className="font-sans text-body-small text-ordift-ink-muted">
              No active engagements yet. Ordift Studios will coordinate directly with you when there&apos;s work to assign.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {activeEngagements.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/portal/collaborator/engagement/${e.id}`}
                  className="block bg-white border border-black/10 rounded-2xl p-6 hover:border-ordift-gold transition-colors"
                >
                  <p className="font-sans text-body-small text-ordift-ink font-medium">
                    {e.operationalTitleName ?? "Engagement"} {e.engagementTypeName ? `· ${e.engagementTypeName}` : ""}
                  </p>
                  <p className="font-sans text-caption text-ordift-ink-muted mt-1">
                    Status: {e.status} {e.agreedAmount ? `· ${e.currency ?? ""} ${e.agreedAmount}` : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
