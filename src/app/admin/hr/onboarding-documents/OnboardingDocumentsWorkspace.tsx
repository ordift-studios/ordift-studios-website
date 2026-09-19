"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { OnboardingDocumentsRow } from "@/lib/organization/onboardingDocumentsOverview";

// HR Onboarding Documents (Task 2, 2026-09-17) — client-side
// search/filter over the already-fetched rows, matching the same
// pattern PeopleDirectory.tsx already established (search input + a
// handful of selects, no second data fetch on filter change).

function workspaceHref(row: OnboardingDocumentsRow): string {
  return row.pipeline === "employee" ? `/admin/organization/onboarding/${row.onboardingId}` : `/admin/organization/vendors/${row.profileId}`;
}

// Same profiles.avatar_url source Meet the Team / People Directory
// already use (Task 7/10) — never a second photo source, never a
// fabricated image. Initials fallback when none exists.
function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

function Avatar({ row }: { row: OnboardingDocumentsRow }) {
  if (row.avatarUrl) {
    return (
      <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-ordift-navy-950">
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary Storage URL */}
        <img
          src={row.avatarUrl}
          alt=""
          className="w-full h-full object-cover"
          style={{ objectPosition: `${row.avatarFocalX}% ${row.avatarFocalY}%` }}
        />
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded-full bg-ordift-navy-950 text-white flex items-center justify-center font-sans text-caption font-semibold shrink-0">
      {initials(row.fullName)}
    </div>
  );
}

const EMPLOYMENT_AGREEMENT_STYLES: Record<string, string> = {
  "Not Ready": "bg-red-100 text-red-800",
  "Ready to Draft": "bg-amber-100 text-amber-800",
  Draft: "bg-blue-100 text-blue-800",
};

export function OnboardingDocumentsWorkspace({ rows }: { rows: OnboardingDocumentsRow[] }) {
  const [query, setQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [relationshipFilter, setRelationshipFilter] = useState("");
  const [jurisdictionFilter, setJurisdictionFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [documentStatusFilter, setDocumentStatusFilter] = useState("");

  const departments = useMemo(() => [...new Set(rows.map((r) => r.departmentName).filter((d): d is string => Boolean(d)))].sort(), [rows]);
  const relationships = useMemo(() => [...new Set(rows.map((r) => r.relationshipLabel))].sort(), [rows]);
  const jurisdictions = useMemo(() => [...new Set(rows.map((r) => r.jurisdictionName).filter((j): j is string => Boolean(j)))].sort(), [rows]);
  const stages = useMemo(() => [...new Set(rows.map((r) => r.stage))].sort(), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (departmentFilter && r.departmentName !== departmentFilter) return false;
      if (relationshipFilter && r.relationshipLabel !== relationshipFilter) return false;
      if (jurisdictionFilter && r.jurisdictionName !== jurisdictionFilter) return false;
      if (stageFilter && r.stage !== stageFilter) return false;
      if (documentStatusFilter === "complete" && r.documentsComplete < r.documentsTotal) return false;
      if (documentStatusFilter === "incomplete" && r.documentsComplete >= r.documentsTotal) return false;
      if (!q) return true;
      return (r.fullName ?? "").toLowerCase().includes(q) || (r.memberNumber ?? "").toLowerCase().includes(q);
    });
  }, [rows, query, departmentFilter, relationshipFilter, jurisdictionFilter, stageFilter, documentStatusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or staff no…"
          className="min-w-56 rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
        />
        <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small bg-white">
          <option value="">Any department</option>
          {departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select value={relationshipFilter} onChange={(e) => setRelationshipFilter(e.target.value)} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small bg-white">
          <option value="">Any relationship</option>
          {relationships.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <select value={jurisdictionFilter} onChange={(e) => setJurisdictionFilter(e.target.value)} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small bg-white">
          <option value="">Any jurisdiction</option>
          {jurisdictions.map((j) => (
            <option key={j} value={j}>{j}</option>
          ))}
        </select>
        <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small bg-white">
          <option value="">Any stage</option>
          {stages.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
          ))}
        </select>
        <select value={documentStatusFilter} onChange={(e) => setDocumentStatusFilter(e.target.value)} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small bg-white">
          <option value="">Any document status</option>
          <option value="complete">Documents complete</option>
          <option value="incomplete">Documents incomplete</option>
        </select>
      </div>

      <p className="font-sans text-caption text-ordift-ink-muted">{filtered.length} of {rows.length} currently onboarding</p>

      {filtered.length === 0 ? (
        <p className="font-sans text-body-small text-ordift-ink-muted">
          {rows.length === 0 ? "No one is currently onboarding." : "No matching onboarding records."}
        </p>
      ) : (
        <div className="rounded-xl border border-black/10 bg-white divide-y divide-black/5">
          {filtered.map((r) => (
            <Link key={r.onboardingId} href={workspaceHref(r)} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-ordift-offwhite/60">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar row={r} />
                <div className="min-w-0">
                  <p className="font-sans text-body-small font-medium text-ordift-ink truncate">
                    {r.fullName ?? "(no name on record)"} {r.memberNumber ? <span className="text-ordift-ink-muted">· {r.memberNumber}</span> : null}
                  </p>
                  <p className="font-sans text-caption text-ordift-ink-muted truncate">
                    {r.positionName ?? r.relationshipLabel} · {r.departmentName ?? "—"} {r.jurisdictionName ? `· ${r.jurisdictionName}` : ""} · Stage: {r.stage.replace(/_/g, " ")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-sans text-caption text-ordift-ink-muted tabular-nums">
                  Documents: {r.documentsComplete}/{r.documentsTotal}
                </span>
                {r.outstandingActionCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full font-sans text-caption whitespace-nowrap bg-amber-100 text-amber-800">
                    {r.outstandingActionCount} outstanding
                  </span>
                )}
                {r.employmentAgreementStatus && (
                  <span className={`px-2 py-0.5 rounded-full font-sans text-caption whitespace-nowrap ${EMPLOYMENT_AGREEMENT_STYLES[r.employmentAgreementStatus] ?? "bg-black/5 text-ordift-ink"}`}>
                    Agreement: {r.employmentAgreementStatus}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
