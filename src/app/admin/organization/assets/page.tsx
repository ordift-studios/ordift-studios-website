import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { listCompanyAssets } from "@/lib/organization/assets";
import { listActiveStaffRoster } from "@/lib/organization/hrDashboard";
import { AssetsWorkspace } from "./AssetsWorkspace";

export const metadata: Metadata = {
  title: "Assets & Equipment — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Ordift Studios Compliance/COMP-SYS-1, Phase B5 Step 6 (2026-09-14) —
// the company asset registry, OS-HR-GH-005 section 4. Cross-staff, so
// it gets a standalone page like Leave/Attendance/Employee Relations;
// an individual person's assignments and incident reports live on the
// Employee Profile page instead. Loss/damage always routes to a
// determination (and, where warranted, an investigation) — this page
// never offers a direct-to-deduction control.
export default async function AssetsWorkspacePage() {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) redirect("/admin/overview");

  const [assets, staffRoster] = await Promise.all([listCompanyAssets(), listActiveStaffRoster()]);
  const staffOptions = staffRoster.map((s) => ({ id: s.profileId, name: s.fullName ?? "(no name on record)" }));

  return (
    <div>
      <div className="mb-8">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · People · Assets</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Assets &amp; Equipment</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          OS-HR-GH-005&rsquo;s asset registry — register company assets, assign them to staff, and track status. Individual
          assignments, acknowledgements, and incident reports for a specific person are on their Employee Profile page.
        </p>
      </div>

      <AssetsWorkspace assets={assets} staffOptions={staffOptions} />
    </div>
  );
}
