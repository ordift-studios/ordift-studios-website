import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/portal/roles";
import { createClient } from "@/lib/supabase/server";
import { listMyEngagements } from "@/lib/portal/engagementPortalData";

export const metadata: Metadata = {
  title: "My Profile — Ordift Studios Portal",
  robots: { index: false, follow: false },
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending Review",
  active: "Active",
  inactive: "Inactive",
};

// Phase H.1/H.2 (2026-09-04) — Section 7: replaces the placeholder-only
// page with a real shared surface (bookings/compensation via the same
// engagement data every other relationship reads). Talent Management's
// full booking/application/portfolio platform remains out of scope —
// this shows real bookings if any exist, and a professional empty
// state if not, never an invented feature.
export default async function ModelPortalPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const [{ data: profile }, engagements] = await Promise.all([
    user ? supabase.from("model_profiles").select("status").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    user ? listMyEngagements(user.id) : Promise.resolve([]),
  ]);
  const activeEngagements = engagements.filter((e) => !["completed", "cancelled"].includes(e.status));

  return (
    <div className="space-y-10">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
          Talent
        </p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
          My Profile
        </h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2">
          {profile ? STATUS_LABELS[profile.status] ?? profile.status : "Not yet set up"}
        </p>
      </div>

      <section>
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-4">Bookings</h2>
        {activeEngagements.length === 0 ? (
          <div className="bg-white border border-black/10 rounded-2xl p-8">
            <p className="font-sans text-body-small text-ordift-ink-muted">
              No active bookings yet. Ordift Studios manages your representation directly and will reach out when
              there&apos;s a booking to confirm.
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
                    {e.operationalTitleName ?? "Booking"} {e.engagementTypeName ? `· ${e.engagementTypeName}` : ""}
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
