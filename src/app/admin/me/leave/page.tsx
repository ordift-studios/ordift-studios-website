import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";
import { getLeaveBalance, listLeaveRequestsForProfile } from "@/lib/organization/leaveRequests";
import { listLeaveTypes } from "@/lib/organization/leaveTypes";
import { MyLeaveWorkspace } from "./MyLeaveWorkspace";

export const metadata: Metadata = {
  title: "My Leave — Ordift Studios",
  robots: { index: false, follow: false },
};

// Ordift Studios Compliance/COMP-SYS-1, Phase B5 Step 13 (2026-09-14) —
// the first Employee Self-Service surface: My Leave. Grouped under the
// existing /admin nav (the same portal every staff member already
// lands in — see /admin/layout.tsx's NAV_ITEMS for "staff" ->
// "/admin"), not a disconnected app. Every read/write here is always
// scoped to the CURRENT user's own id — never a profileId taken from
// the request. "GH" is the only jurisdiction this engagement covers.
export default async function MyLeavePage() {
  const user = await getCurrentUser();
  if (!user || !isStaffOrAdmin(user)) redirect("/admin/overview");

  const leaveTypes = await listLeaveTypes("GH");
  const currentYear = new Date().getUTCFullYear();

  const [balanceRows, requests] = await Promise.all([
    Promise.all(leaveTypes.map((t) => getLeaveBalance(user.id, t.id, currentYear))),
    listLeaveRequestsForProfile(user.id),
  ]);

  const leaveTypeNameById = new Map(leaveTypes.map((t) => [t.id, t.name]));
  const balances = balanceRows
    .map((b, i) => (b ? { leaveTypeId: b.leaveTypeId, leaveTypeName: leaveTypes[i].name, entitlementDays: b.entitlementDays, carriedOverDays: b.carriedOverDays, usedDays: b.usedDays, remainingDays: b.remainingDays } : null))
    .filter((b): b is NonNullable<typeof b> => b !== null);

  const requestViews = requests.map((r) => ({
    id: r.id,
    leaveTypeName: leaveTypeNameById.get(r.leaveTypeId) ?? "Unknown type",
    startDate: r.startDate,
    endDate: r.endDate,
    daysRequested: r.daysRequested,
    halfAllocation: r.halfAllocation,
    status: r.status,
    reason: r.reason,
    alternativeStartDate: r.alternativeStartDate,
    alternativeEndDate: r.alternativeEndDate,
    decisionNotes: r.decisionNotes,
  }));

  const leaveTypeOptions = leaveTypes.map((t) => ({ id: t.id, name: t.name, requiresCertificate: t.requiresCertificate }));

  return (
    <div>
      <div className="mb-8">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">My Workspace</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">My Leave</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Your leave balances and requests. A zero balance is shown truthfully — if something looks wrong, contact HR rather
          than resubmitting.
        </p>
      </div>

      <MyLeaveWorkspace balances={balances} requests={requestViews} leaveTypeOptions={leaveTypeOptions} />
    </div>
  );
}
