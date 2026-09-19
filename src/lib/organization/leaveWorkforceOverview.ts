import { listUsersWithRoles } from "@/lib/portal/adminData";
import { resolveEmployeeLeaveJurisdiction, listLeaveTypes } from "@/lib/organization/leaveTypes";
import { getLeaveBalance, listLeaveRequestsForProfile } from "@/lib/organization/leaveRequests";

// Leave Workforce Balance Overview (Task 8, 2026-09-18) — an
// HR/Super-Admin-only aggregate view over the SAME leave
// entitlement/balance/request engine My Workspace's own Leave summary
// already reads per person (getLeaveBalance(), resolveEmployeeLeaveJurisdiction(),
// listLeaveTypes()) — never a second leave ledger. Scoped to `staff`
// role holders only (Task 14's own explicit rule: employee headcount,
// and by extension leave entitlement, must never count Vendors/
// Suppliers as employees).

const PENDING_LEAVE_STATUSES = new Set(["submitted", "under_review", "alternative_proposed"]);

export type WorkforceLeaveBalanceRow = {
  profileId: string;
  fullName: string | null;
  avatarUrl: string | null;
  avatarFocalX: number;
  avatarFocalY: number;
  memberNumber: string | null;
  departmentName: string | null;
  employmentStatus: string | null;
  leaveTypeId: string;
  leaveTypeName: string;
  leaveYear: number;
  entitlementDays: number;
  usedDays: number;
  pendingDays: number;
  remainingDays: number;
};

export async function listWorkforceLeaveBalances(leaveYear: number): Promise<WorkforceLeaveBalanceRow[]> {
  const usersResult = await listUsersWithRoles();
  if (!usersResult.ok) return [];

  const activeStaff = usersResult.users.filter((u) => u.roles.includes("staff") && u.accessStatus === "active");

  const rows = await Promise.all(
    activeStaff.map(async (u) => {
      const jurisdiction = await resolveEmployeeLeaveJurisdiction(u.id);
      if (!jurisdiction) return [];
      const [leaveTypes, requests] = await Promise.all([listLeaveTypes(jurisdiction), listLeaveRequestsForProfile(u.id)]);
      const pendingDaysByType = new Map<string, number>();
      for (const r of requests) {
        if (!PENDING_LEAVE_STATUSES.has(r.status)) continue;
        pendingDaysByType.set(r.leaveTypeId, (pendingDaysByType.get(r.leaveTypeId) ?? 0) + r.daysRequested);
      }

      const balances = await Promise.all(
        leaveTypes.map(async (t): Promise<WorkforceLeaveBalanceRow | null> => {
          const balance = await getLeaveBalance(u.id, t.id, leaveYear);
          if (!balance) return null;
          return {
            profileId: u.id,
            fullName: u.fullName,
            avatarUrl: u.avatarUrl,
            avatarFocalX: u.avatarFocalX,
            avatarFocalY: u.avatarFocalY,
            memberNumber: u.memberNumber,
            departmentName: u.departmentName,
            employmentStatus: u.employmentStatus,
            leaveTypeId: t.id,
            leaveTypeName: t.name,
            leaveYear,
            entitlementDays: balance.entitlementDays + balance.carriedOverDays + balance.protectedCarriedOverDays,
            usedDays: balance.usedDays,
            pendingDays: pendingDaysByType.get(t.id) ?? 0,
            remainingDays: balance.remainingDays,
          };
        })
      );
      return balances.filter((b): b is WorkforceLeaveBalanceRow => b !== null);
    })
  );

  return rows.flat().sort((a, b) => (a.fullName ?? "").localeCompare(b.fullName ?? ""));
}
