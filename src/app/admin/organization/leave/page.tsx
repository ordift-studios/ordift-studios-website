import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";
import { listPendingLeaveRequestsForReviewer, canManageLeave } from "@/lib/organization/leaveRequests";
import { listLeaveTypes } from "@/lib/organization/leaveTypes";
import { listActiveStaffRoster } from "@/lib/organization/hrDashboard";
import { getPlanningAllocationSummary, listLeaveBiddingWindows, LEAVE_BIDDING_HALVES } from "@/lib/organization/leaveBidding";
import { listSwapsAwaitingReviewerDecisionFor } from "@/lib/organization/leaveSwap";
import { LeaveWorkspace } from "./LeaveWorkspace";

export const metadata: Metadata = {
  title: "Leave — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Ordift Studios Compliance/COMP-SYS-1, Phase B5 Step 2 (2026-09-14) —
// the Leave workspace. Extended 2026-09-15 for manager-scoped review
// (a genuine direct manager with no broader HR tier now reaches this
// same page and sees only their own reports' pending items — see
// listPendingLeaveRequestsForReviewer()/listSwapsAwaitingReviewerDecisionFor(),
// authority.ts's hasManagerialAuthorityOver()), plus Leave Bidding
// window configuration and Leave Swap review. Access is now any
// authenticated staff/admin — the real narrowing happens per-query,
// not at this coarse page gate, exactly matching how every reviewer-
// scoped function underneath it is independently authorized.
// "GH" remains hardcoded ONLY for the pre-existing org-wide leave-type
// catalog used by the "Create a Leave Balance" HR form below — this
// entire engagement covers Ghana only today, and generalizing that
// specific pre-existing form is not required to deliver Leave Bidding/
// Swap correctly (unlike the employee-facing jurisdiction resolution,
// which this same phase fixed to resolve live, never hardcoded).
export default async function LeaveWorkspacePage() {
  const user = await getCurrentUser();
  if (!user || !isStaffOrAdmin(user)) redirect("/admin/overview");

  const canManageWindowsAndBalances = await canManageLeave(user.id);
  const currentYear = new Date().getUTCFullYear();

  const [pendingRequests, leaveTypes, staffRoster, pendingSwaps, windows] = await Promise.all([
    listPendingLeaveRequestsForReviewer(user.id),
    listLeaveTypes("GH"),
    listActiveStaffRoster(),
    listSwapsAwaitingReviewerDecisionFor(user.id),
    listLeaveBiddingWindows("GH", currentYear),
  ]);

  // Per-pending-bid draw-forward context — computed only for rows
  // actually tagged H1/H2, and only for the reviewer's OWN scoped
  // queue (never the whole org) to keep this proportionate.
  const biddingContextByRequestId = new Map<string, { drawForwardRequired: boolean; drawForwardAllowed: boolean }>();
  for (const r of pendingRequests) {
    if (!r.halfAllocation) continue;
    const leaveYear = new Date(r.startDate).getFullYear();
    const window = windows.find((w) => w.half === r.halfAllocation && w.leaveYear === leaveYear);
    if (!window) continue;
    const summary = await getPlanningAllocationSummary({ profileId: r.profileId, jurisdiction: "GH", leaveYear, half: r.halfAllocation as "H1" | "H2" });
    biddingContextByRequestId.set(r.id, { drawForwardRequired: summary.remainingDays < 0, drawForwardAllowed: window.drawForwardAllowed });
  }

  const leaveTypeNamesById = Object.fromEntries(leaveTypes.map((t) => [t.id, t.name]));
  const leaveTypeOptions = leaveTypes.map((t) => ({ id: t.id, name: t.name }));
  const staffOptions = staffRoster.map((s) => ({ id: s.profileId, name: s.fullName ?? "(no name on record)" }));

  return (
    <div>
      <div className="mb-8">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · People · Time &amp; Leave</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Leave</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          {canManageWindowsAndBalances
            ? "OS-HR-GH-002's leave engine — decide requests still awaiting review across the organization, configure Leave Bidding windows, and create a person's leave balance for a type/year."
            : "Requests, bids, and swaps awaiting your decision as a direct manager."}
        </p>
      </div>

      <LeaveWorkspace
        pendingRequests={pendingRequests}
        leaveTypeNamesById={leaveTypeNamesById}
        biddingContextByRequestId={Object.fromEntries(biddingContextByRequestId)}
        pendingSwaps={pendingSwaps}
        windows={windows}
        currentYear={currentYear}
        halves={LEAVE_BIDDING_HALVES}
        staffOptions={staffOptions}
        leaveTypeOptions={leaveTypeOptions}
        canManageWindowsAndBalances={canManageWindowsAndBalances}
      />
    </div>
  );
}
