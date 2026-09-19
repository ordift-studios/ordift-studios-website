"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export type WorkshopListRow = {
  id: string;
  title: string;
  status: string;
  categoryLabel: string;
  instructorNames: string[];
  deliveryMode: string;
  startDate: string | null;
  registeredCount: number;
  capacity: number;
  priceLabel: string;
  warningLabels: string[];
};

const STATUS_OPTIONS = ["coming-soon", "open", "full", "closed", "completed"];

type SortKey = "title" | "startDate" | "registrations";

// Admin Workshop Command Centre (Section C, 2026-09-19) — client-side
// search/filter/sort over the already-fetched row list (the same
// established "filter the full array in the browser" pattern this
// codebase already uses for moderate-sized admin lists, e.g. People
// Directory) — never a second, duplicate data-fetching path.
export function WorkshopListTable({ rows, categories }: { rows: WorkshopListRow[]; categories: string[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [deliveryMode, setDeliveryMode] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("startDate");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    let result = rows.filter((r) => {
      if (status && r.status !== status) return false;
      if (category && r.categoryLabel !== category) return false;
      if (deliveryMode && r.deliveryMode !== deliveryMode) return false;
      if (term && !r.title.toLowerCase().includes(term) && !r.instructorNames.some((n) => n.toLowerCase().includes(term))) return false;
      return true;
    });
    result = [...result].sort((a, b) => {
      if (sortKey === "title") return a.title.localeCompare(b.title);
      if (sortKey === "registrations") return b.registeredCount - a.registeredCount;
      return (b.startDate ?? "").localeCompare(a.startDate ?? "");
    });
    return result;
  }, [rows, search, status, category, deliveryMode, sortKey]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title or instructor…"
          className="flex-1 min-w-[12rem] rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select value={deliveryMode} onChange={(e) => setDeliveryMode(e.target.value)} className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
          <option value="">All delivery modes</option>
          <option value="In-Person">In-Person</option>
          <option value="Online">Online</option>
          <option value="Hybrid">Hybrid</option>
        </select>
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
          <option value="startDate">Sort: Start Date</option>
          <option value="title">Sort: Title</option>
          <option value="registrations">Sort: Registrations</option>
        </select>
      </div>

      <div className="rounded-xl border border-black/10 bg-white divide-y divide-black/5">
        {filtered.map((w) => (
          <Link key={w.id} href={`/admin/workshops/${w.id}`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-ordift-offwhite/60">
            <div>
              <p className="font-sans text-body-small text-ordift-ink font-medium">{w.title}</p>
              <p className="font-sans text-caption text-ordift-ink-muted">
                {w.status} · {w.categoryLabel} · {w.deliveryMode} · {w.instructorNames.length > 0 ? w.instructorNames.join(", ") : "No instructor"}
                {w.startDate ? ` · ${w.startDate}` : ""}
              </p>
              {w.warningLabels.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {w.warningLabels.map((label) => (
                    <span key={label} className="font-sans text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">{label}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="font-sans text-body-small text-ordift-ink tabular-nums">{w.registeredCount}/{w.capacity}</p>
              <p className="font-sans text-caption text-ordift-ink-muted">{w.priceLabel}</p>
            </div>
          </Link>
        ))}
        {filtered.length === 0 && <p className="px-5 py-8 text-center font-sans text-body-small text-ordift-ink-muted">No workshops match these filters.</p>}
      </div>
    </div>
  );
}
