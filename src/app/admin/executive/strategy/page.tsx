import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { isExecutiveAdmin, STRATEGY_CAPABILITIES } from "@/lib/organization/authority";

export const metadata: Metadata = {
  title: "Strategy — Executive — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// ARCHITECT's jurisdiction hub — an honest gap report, not a fabricated
// dashboard. No strategic-planning/initiative table or workflow exists
// anywhere in Production. The approved capability taxonomy
// (STRATEGY_CAPABILITIES, Phase 3.4) is already defined and ready for
// when real functionality is built — nothing here pretends otherwise.
export default async function ExecutiveStrategyPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/overview");
  const superAdmin = isSuperAdmin(user);
  if (!superAdmin && !(await isExecutiveAdmin(user.id))) redirect("/admin/executive");

  return (
    <div className="space-y-6">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · Executive</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">ARCHITECT · Strategy</h1>
      </div>
      <div className="rounded-xl border border-black/10 bg-white p-6 max-w-2xl">
        <p className="font-sans text-body-small text-ordift-ink">
          No Strategy functionality exists in Production yet — no strategic-planning, initiative, or long-range
          planning table or workflow has been built. This is reported honestly rather than represented with
          placeholder metrics or fabricated data.
        </p>
        <p className="font-sans text-caption text-ordift-ink-muted mt-4">
          The approved capability taxonomy is already defined and dormant, ready to wire up once real functionality
          is built: {Object.values(STRATEGY_CAPABILITIES).join(", ")}.
        </p>
      </div>
    </div>
  );
}
