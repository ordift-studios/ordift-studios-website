import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { listPendingLeaveRequestsAcrossStaff } from "@/lib/organization/leaveRequests";
import { listLeaveTypes } from "@/lib/organization/leaveTypes";
import { listActiveStaffRoster } from "@/lib/organization/hrDashboard";
import { LeaveWorkspace } from "./LeaveWorkspace";

export const metadata: Metadata = {
  title: "Leave — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Ordift Studios Compliance/COMP-SYS-1, Phase B5 Step 2 (2026-09-14) —
// the Leave workspace: the one fully end-to-end HR subsystem in this
// UI phase's first increment. "GH" is the only jurisdiction this
// entire engagement covers (Ghana HR/Employment Controlled Package
// v1.0) — never invented, the literal scope of every controlled
// document behind this system.
export default async function LeaveWorkspacePage() {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) redirect("/admin/overview");

  const [pendingRequests, leaveTypes, staffRoster] = await Promise.all([
    listPendingLeaveRequestsAcrossStaff(),
    listLeaveTypes("GH"),
    listActiveStaffRoster(),
  ]);

  const leaveTypeNamesById = Object.fromEntries(leaveTypes.map((t) => [t.id, t.name]));
  const leaveTypeOptions = leaveTypes.map((t) => ({ id: t.id, name: t.name }));
  const staffOptions = staffRoster.map((s) => ({ id: s.profileId, name: s.fullName ?? "(no name on record)" }));

  return (
    <div>
      <div className="mb-8">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · People · Time &amp; Leave</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Leave</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          OS-HR-GH-002&rsquo;s leave engine — decide requests still awaiting review, and create a person&rsquo;s leave balance for a
          type/year before their first request against it can be approved.
        </p>
      </div>

      <LeaveWorkspace pendingRequests={pendingRequests} leaveTypeNamesById={leaveTypeNamesById} staffOptions={staffOptions} leaveTypeOptions={leaveTypeOptions} />
    </div>
  );
}
