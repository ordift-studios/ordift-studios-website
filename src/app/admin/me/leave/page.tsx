import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";
import { getLeaveBalance, listLeaveRequestsForProfile } from "@/lib/organization/leaveRequests";
import { listLeaveTypes, resolveEmployeeLeaveJurisdiction } from "@/lib/organization/leaveTypes";
import { getPlanningAllocationSummary, LEAVE_BIDDING_HALVES } from "@/lib/organization/leaveBidding";
import { listLeaveSwapsForProfile, listSwapEligibleApprovedLeave } from "@/lib/organization/leaveSwap";
import { MyLeaveWorkspace } from "./MyLeaveWorkspace";

export const metadata: Metadata = {
  title: "My Leave — Ordift Studios",
  robots: { index: false, follow: false },
};

// Ordift Studios Compliance/COMP-SYS-1, Phase B5 Step 13 (2026-09-14) —
// the first Employee Self-Service surface: My Leave. Extended
// 2026-09-15 with Leave Bidding (real window/allocation data, not just
// the bare H1/H2 tag) and Leave Swap. Grouped under the existing
// /admin nav (the same portal every staff member already lands in —
// see /admin/layout.tsx's NAV_ITEMS for "staff" -> "/admin"), not a
// disconnected app. Every read/write here is always scoped to the
// CURRENT user's own id — never a profileId taken from the request.
// Jurisdiction is resolved live from this person's real current
// employment terms (resolveEmployeeLeaveJurisdiction()) — never
// hardcoded to "GH" — so a future non-Ghana employee sees their own
// jurisdiction's leave types/bidding rules without any code change.
export default async function MyLeavePage() {
  const user = await getCurrentUser();
  if (!user || !isStaffOrAdmin(user)) redirect("/admin/overview");

  const jurisdiction = await resolveEmployeeLeaveJurisdiction(user.id);
  if (!jurisdiction) {
    return (
      <div>
        <div className="mb-8">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">My Workspace</p>
          <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">My Leave</h1>
        </div>
        <p className="font-sans text-body-small text-ordift-ink-muted">
          Your employment jurisdiction has not yet been recorded, so leave types can&apos;t be resolved yet. Contact HR
          to complete this before leave can be requested.
        </p>
      </div>
    );
  }

  const leaveTypes = await listLeaveTypes(jurisdiction);
  const currentYear = new Date().getUTCFullYear();

  const [balanceRows, requests, biddingSummaries, ownSwaps, swapEligibleColleagueLeave] = await Promise.all([
    Promise.all(leaveTypes.map((t) => getLeaveBalance(user.id, t.id, currentYear))),
    listLeaveRequestsForProfile(user.id),
    Promise.all(LEAVE_BIDDING_HALVES.map((half) => getPlanningAllocationSummary({ profileId: user.id, jurisdiction, leaveYear: currentYear, half }))),
    listLeaveSwapsForProfile(user.id),
    listSwapEligibleApprovedLeave(user.id),
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

  // Own leave eligible to OFFER in a swap: approved, not superseded,
  // not already tied up in another live swap — computed by excluding
  // every OTHER profile from listSwapEligibleApprovedLeave and reusing
  // the exact same eligibility rule for consistency (never a second,
  // separately-maintained eligibility definition).
  const allSwapEligible = await listSwapEligibleApprovedLeave("__none__");
  const ownSwapEligibleLeave = allSwapEligible.filter((l) => l.profileId === user.id);

  const leaveTypeOptions = leaveTypes.map((t) => ({ id: t.id, name: t.name, requiresCertificate: t.requiresCertificate }));

  const biddingViews = biddingSummaries.map((s) => ({
    half: s.half,
    allocationDays: s.allocationDays,
    committedDays: s.committedDays,
    remainingDays: s.remainingDays,
    windowOpen: s.windowOpen,
    windowOpensAt: s.window?.windowOpensAt ?? null,
    windowClosesAt: s.window?.windowClosesAt ?? null,
  }));

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

      <MyLeaveWorkspace
        balances={balances}
        requests={requestViews}
        leaveTypeOptions={leaveTypeOptions}
        biddingWindows={biddingViews}
        ownSwapEligibleLeave={ownSwapEligibleLeave}
        swapEligibleColleagueLeave={swapEligibleColleagueLeave}
        swaps={ownSwaps.map((s) => ({ ...s, isInitiator: s.initiatorProfileId === user.id }))}
      />
    </div>
  );
}
