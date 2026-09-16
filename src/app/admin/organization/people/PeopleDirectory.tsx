"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { AdminUserRow } from "@/lib/portal/adminData";

// People Directory (2026-09-16) — reuses listUsersWithRoles() exactly
// as /admin/users already does; this is a second VIEW over the same
// accounts, never a second source of truth. Photos reuse the SAME
// profiles.avatar_url/avatar_focal_x/avatar_focal_y columns Meet the
// Team reads (see getPublicTeamMembers.ts / MeetTheTeamCarousel.tsx) —
// never a second photo source, never a fabricated image. A person with
// no genuine photo on record always falls back to initials.
function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

function Avatar({
  name,
  avatarUrl,
  avatarFocalX,
  avatarFocalY,
}: {
  name: string | null;
  avatarUrl: string | null;
  avatarFocalX: number;
  avatarFocalY: number;
}) {
  if (avatarUrl) {
    return (
      <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-ordift-navy-950">
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary Storage URL, not a static/local asset next/image can optimize */}
        <img
          src={avatarUrl}
          alt=""
          className="w-full h-full object-cover"
          style={{ objectPosition: `${avatarFocalX}% ${avatarFocalY}%` }}
        />
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded-full bg-ordift-navy-950 text-white flex items-center justify-center font-sans text-caption font-semibold shrink-0">
      {initials(name)}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  invited: "bg-amber-100 text-amber-800",
  active: "bg-green-100 text-green-800",
  restricted: "bg-amber-100 text-amber-800",
  suspended: "bg-red-100 text-red-800",
  deactivated: "bg-black/10 text-ordift-ink-muted",
};

export function PeopleDirectory({ people }: { people: AdminUserRow[] }) {
  const [view, setView] = useState<"card" | "list">("card");
  const [query, setQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const departments = useMemo(
    () => [...new Set(people.map((p) => p.departmentName).filter((d): d is string => Boolean(d)))].sort(),
    [people]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((p) => {
      if (departmentFilter && p.departmentName !== departmentFilter) return false;
      if (statusFilter && p.accessStatus !== statusFilter) return false;
      if (!q) return true;
      return (
        (p.fullName ?? "").toLowerCase().includes(q) ||
        (p.memberNumber ?? "").toLowerCase().includes(q) ||
        (p.positionName ?? "").toLowerCase().includes(q) ||
        (p.departmentName ?? "").toLowerCase().includes(q)
      );
    });
  }, [people, query, departmentFilter, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, staff no., position, department…"
          className="min-w-64 rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
        />
        <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small bg-white">
          <option value="">Any department</option>
          {departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small bg-white">
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="invited">Invited</option>
          <option value="restricted">Restricted</option>
          <option value="suspended">Suspended</option>
          <option value="deactivated">Deactivated</option>
        </select>
        <div className="ml-auto flex rounded-lg border border-black/15 overflow-hidden">
          <button type="button" onClick={() => setView("card")} className={`px-3 py-2 font-sans text-caption font-semibold ${view === "card" ? "bg-ordift-navy-950 text-white" : "bg-white text-ordift-ink"}`}>
            Cards
          </button>
          <button type="button" onClick={() => setView("list")} className={`px-3 py-2 font-sans text-caption font-semibold ${view === "list" ? "bg-ordift-navy-950 text-white" : "bg-white text-ordift-ink"}`}>
            List
          </button>
        </div>
      </div>

      <p className="font-sans text-caption text-ordift-ink-muted">{filtered.length} of {people.length}</p>

      {filtered.length === 0 ? (
        <p className="font-sans text-body-small text-ordift-ink-muted">No matching people.</p>
      ) : view === "card" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <Link key={p.id} href={`/admin/organization/people/${p.id}`} className="rounded-xl border border-black/10 bg-white p-4 flex gap-3 hover:border-ordift-gold/60 transition-colors">
              <Avatar name={p.fullName} avatarUrl={p.avatarUrl} avatarFocalX={p.avatarFocalX} avatarFocalY={p.avatarFocalY} />
              <div className="min-w-0">
                <p className="font-sans text-body-small font-semibold text-ordift-ink truncate">{p.fullName ?? "(no name on record)"}</p>
                <p className="font-sans text-caption text-ordift-ink-muted truncate">{p.positionName ?? p.operationalTitleName ?? "—"}</p>
                <p className="font-sans text-caption text-ordift-ink-muted truncate">{p.departmentName ?? "—"} {p.memberNumber ? `· ${p.memberNumber}` : ""}</p>
                <span className={`inline-block mt-1.5 px-2 py-0.5 rounded-full font-sans text-[0.65rem] ${STATUS_STYLES[p.accessStatus] ?? "bg-black/5"}`}>
                  {p.accessStatus}
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-black/10 bg-white overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-black/10">
                <th className="px-4 py-2 font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Name</th>
                <th className="px-4 py-2 font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Staff No.</th>
                <th className="px-4 py-2 font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Position</th>
                <th className="px-4 py-2 font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Department</th>
                <th className="px-4 py-2 font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Relationship</th>
                <th className="px-4 py-2 font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-black/5 last:border-0 hover:bg-ordift-offwhite">
                  <td className="px-4 py-2">
                    <Link href={`/admin/organization/people/${p.id}`} className="font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4">
                      {p.fullName ?? "(no name on record)"}
                    </Link>
                  </td>
                  <td className="px-4 py-2 font-sans text-body-small text-ordift-ink-muted tabular-nums">{p.memberNumber ?? "—"}</td>
                  <td className="px-4 py-2 font-sans text-body-small text-ordift-ink-muted">{p.positionName ?? p.operationalTitleName ?? "—"}</td>
                  <td className="px-4 py-2 font-sans text-body-small text-ordift-ink-muted">{p.departmentName ?? "—"}</td>
                  <td className="px-4 py-2 font-sans text-body-small text-ordift-ink-muted">{p.engagementTypeName ?? p.roles.join(", ")}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full font-sans text-caption ${STATUS_STYLES[p.accessStatus] ?? "bg-black/5"}`}>{p.accessStatus}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
