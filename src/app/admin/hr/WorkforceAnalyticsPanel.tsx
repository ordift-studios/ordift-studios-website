"use client";

import { useMemo, useState } from "react";

// I. Workforce Analytics + J. Filtering (2026-09-16) — a department
// filter over the SAME active-roster rows the server-side breakdown is
// built from (hrCommandCentre.ts's summarizeWorkforceAnalytics), so the
// unfiltered "All Departments" totals always agree with the server
// numbers exactly. Filtering only narrows which rows count — no second
// data source.
export type ActiveWorkforceRow = { departmentName: string | null; engagementTypeName: string | null };

function tally(rows: ActiveWorkforceRow[], pick: (r: ActiveWorkforceRow) => string | null, fallback: string): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const label = pick(r) ?? fallback;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

export function WorkforceAnalyticsPanel({ activeUsers }: { activeUsers: ActiveWorkforceRow[] }) {
  const [department, setDepartment] = useState("");
  const departments = useMemo(
    () => [...new Set(activeUsers.map((u) => u.departmentName).filter((d): d is string => Boolean(d)))].sort(),
    [activeUsers]
  );
  const filtered = useMemo(
    () => (department ? activeUsers.filter((u) => u.departmentName === department) : activeUsers),
    [activeUsers, department]
  );
  const byDepartment = useMemo(() => tally(filtered, (r) => r.departmentName, "Unassigned"), [filtered]);
  const byEngagementType = useMemo(() => tally(filtered, (r) => r.engagementTypeName, "Unclassified"), [filtered]);

  return (
    <div className="rounded-xl border border-black/10 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Workforce Analytics</h2>
        <select
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-caption bg-white"
        >
          <option value="">All Departments ({activeUsers.length})</option>
          {departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted mb-2">By Department</p>
          <ul className="space-y-1.5">
            {byDepartment.map((row) => (
              <li key={row.label} className="flex items-center justify-between gap-3">
                <span className="font-sans text-body-small text-ordift-ink">{row.label}</span>
                <span className="font-sans text-body-small font-semibold text-ordift-ink tabular-nums">{row.count}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted mb-2">By Engagement Type</p>
          <ul className="space-y-1.5">
            {byEngagementType.map((row) => (
              <li key={row.label} className="flex items-center justify-between gap-3">
                <span className="font-sans text-body-small text-ordift-ink">{row.label}</span>
                <span className="font-sans text-body-small font-semibold text-ordift-ink tabular-nums">{row.count}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
