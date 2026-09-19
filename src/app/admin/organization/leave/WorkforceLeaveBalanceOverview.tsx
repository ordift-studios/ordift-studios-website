"use client";

import { useMemo, useState } from "react";
import type { WorkforceLeaveBalanceRow } from "@/lib/organization/leaveWorkforceOverview";

// Task 8 (2026-09-18) — client-side filter over the already-fetched
// rows, matching the same pattern established across this codebase
// (PeopleDirectory.tsx, OnboardingDocumentsWorkspace.tsx) rather than
// a second data fetch on filter change.

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

function Avatar({ row }: { row: WorkforceLeaveBalanceRow }) {
  if (row.avatarUrl) {
    return (
      <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 bg-ordift-navy-950">
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary Storage URL */}
        <img src={row.avatarUrl} alt="" className="w-full h-full object-cover" style={{ objectPosition: `${row.avatarFocalX}% ${row.avatarFocalY}%` }} />
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded-full bg-ordift-navy-950 text-white flex items-center justify-center font-sans text-[0.65rem] font-semibold shrink-0">
      {initials(row.fullName)}
    </div>
  );
}

export function WorkforceLeaveBalanceOverview({ rows, leaveYear }: { rows: WorkforceLeaveBalanceRow[]; leaveYear: number }) {
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [leaveTypeFilter, setLeaveTypeFilter] = useState("");

  const departments = useMemo(() => [...new Set(rows.map((r) => r.departmentName).filter((d): d is string => Boolean(d)))].sort(), [rows]);
  const leaveTypes = useMemo(() => [...new Map(rows.map((r) => [r.leaveTypeId, r.leaveTypeName])).entries()], [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (departmentFilter && r.departmentName !== departmentFilter) return false;
      if (leaveTypeFilter && r.leaveTypeId !== leaveTypeFilter) return false;
      return true;
    });
  }, [rows, departmentFilter, leaveTypeFilter]);

  return (
    <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Workforce Leave Balances — {leaveYear}</h2>
        <div className="flex flex-wrap gap-2">
          <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-caption bg-white">
            <option value="">Any department</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <select value={leaveTypeFilter} onChange={(e) => setLeaveTypeFilter(e.target.value)} className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-caption bg-white">
            <option value="">Any leave type</option>
            {leaveTypes.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="font-sans text-body-small text-ordift-ink-muted">No leave balances recorded yet for {leaveYear}.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-black/10">
                <th className="px-3 py-2 font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Employee</th>
                <th className="px-3 py-2 font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Department</th>
                <th className="px-3 py-2 font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Status</th>
                <th className="px-3 py-2 font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Leave Type</th>
                <th className="px-3 py-2 font-sans text-caption uppercase tracking-wide text-ordift-ink-muted text-right">Entitlement</th>
                <th className="px-3 py-2 font-sans text-caption uppercase tracking-wide text-ordift-ink-muted text-right">Used</th>
                <th className="px-3 py-2 font-sans text-caption uppercase tracking-wide text-ordift-ink-muted text-right">Pending</th>
                <th className="px-3 py-2 font-sans text-caption uppercase tracking-wide text-ordift-ink-muted text-right">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={`${r.profileId}-${r.leaveTypeId}`} className="border-b border-black/5 last:border-0">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar row={r} />
                      <div>
                        <p className="font-sans text-body-small text-ordift-ink">{r.fullName ?? "(no name on record)"}</p>
                        <p className="font-sans text-[0.65rem] text-ordift-ink-muted">{r.memberNumber ?? "—"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-sans text-body-small text-ordift-ink-muted">{r.departmentName ?? "—"}</td>
                  <td className="px-3 py-2 font-sans text-body-small text-ordift-ink-muted">{r.employmentStatus ?? "—"}</td>
                  <td className="px-3 py-2 font-sans text-body-small text-ordift-ink">{r.leaveTypeName}</td>
                  <td className="px-3 py-2 font-sans text-body-small text-ordift-ink tabular-nums text-right">{r.entitlementDays}</td>
                  <td className="px-3 py-2 font-sans text-body-small text-ordift-ink-muted tabular-nums text-right">{r.usedDays}</td>
                  <td className="px-3 py-2 font-sans text-body-small text-ordift-ink-muted tabular-nums text-right">{r.pendingDays > 0 ? r.pendingDays : "—"}</td>
                  <td className="px-3 py-2 font-sans text-body-small font-semibold text-ordift-ink tabular-nums text-right">{r.remainingDays}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
