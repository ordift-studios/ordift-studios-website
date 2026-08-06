"use client";

import { useMemo, useState } from "react";
import type { ClientDeliverable } from "@/lib/portal/workspace";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

type SortOption = "newest" | "oldest" | "title";
type ViewMode = "grid" | "list";

function Thumbnail({ deliverable, className }: { deliverable: ClientDeliverable; className: string }) {
  if (deliverable.thumbnailUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- staff-provided external reference links, not a Next-managed asset
    return <img src={deliverable.thumbnailUrl} alt={deliverable.title} className={`${className} object-cover`} />;
  }
  return (
    <div className={`${className} bg-ordift-offwhite flex items-center justify-center`}>
      <span className="font-serif text-eyebrow text-ordift-ink-muted uppercase tracking-wide text-center px-2">
        {deliverable.categoryLabel}
      </span>
    </div>
  );
}

export default function DeliverablesGallery({ deliverables }: { deliverables: ClientDeliverable[] }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<SortOption>("newest");
  const [view, setView] = useState<ViewMode>("grid");

  const categories = useMemo(
    () => Array.from(new Set(deliverables.map((d) => d.categoryLabel))).sort(),
    [deliverables]
  );

  const filtered = useMemo(() => {
    let result = deliverables;
    if (category !== "all") {
      result = result.filter((d) => d.categoryLabel === category);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (d) => d.title.toLowerCase().includes(q) || (d.description ?? "").toLowerCase().includes(q)
      );
    }
    const sorted = [...result];
    if (sort === "newest") sorted.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    else if (sort === "oldest") sorted.sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime());
    else sorted.sort((a, b) => a.title.localeCompare(b.title));
    return sorted;
  }, [deliverables, category, search, sort]);

  if (deliverables.length === 0) {
    return (
      <div className="rounded-xl border border-black/10 bg-white p-6">
        <p className="font-sans text-body-small text-ordift-ink-muted">
          Nothing here yet — your final files and staff-published deliverables will appear as soon as they&apos;re
          published.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search deliverables…"
          className="flex-1 min-w-[180px] min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink"
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className="min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="title">Title A–Z</option>
        </select>
        <div className="flex rounded-lg border border-black/15 overflow-hidden">
          <button
            type="button"
            onClick={() => setView("grid")}
            className={`px-3 min-h-11 font-sans text-body-small ${
              view === "grid" ? "bg-ordift-navy-950 text-white" : "bg-white text-ordift-ink-muted"
            }`}
          >
            Grid
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            className={`px-3 min-h-11 font-sans text-body-small ${
              view === "list" ? "bg-ordift-navy-950 text-white" : "bg-white text-ordift-ink-muted"
            }`}
          >
            List
          </button>
        </div>
      </div>

      <p className="font-sans text-caption text-ordift-ink-muted mb-4">
        {filtered.length} of {deliverables.length} deliverable{deliverables.length === 1 ? "" : "s"}
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-black/10 bg-white p-6">
          <p className="font-sans text-body-small text-ordift-ink-muted">
            No deliverables match your search or filter.
          </p>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((d) => (
            <div key={d.id} className="rounded-xl border border-black/10 bg-white overflow-hidden flex flex-col">
              <Thumbnail deliverable={d} className="w-full aspect-video" />
              <div className="p-4 flex flex-col flex-1">
                <span className="inline-flex self-start items-center px-2.5 py-0.5 rounded-full bg-ordift-offwhite font-sans text-caption font-medium text-ordift-ink mb-2">
                  {d.categoryLabel}
                </span>
                <p className="font-serif text-body-small text-ordift-ink mb-1">{d.title}</p>
                {d.description && (
                  <p className="font-sans text-caption text-ordift-ink-muted mb-2 line-clamp-2">{d.description}</p>
                )}
                <p className="font-sans text-caption text-ordift-ink-muted mt-auto pt-2">
                  {formatDate(d.publishedAt)}
                  {d.publishedByName ? ` · ${d.publishedByName}` : ""}
                </p>
                <a
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4 mt-2 inline-block"
                >
                  Open ↗
                </a>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-black/10 bg-white divide-y divide-black/5">
          {filtered.map((d) => (
            <div key={d.id} className="p-4 flex items-center gap-4">
              <Thumbnail deliverable={d} className="w-16 h-16 rounded-lg shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-ordift-offwhite font-sans text-caption font-medium text-ordift-ink whitespace-nowrap">
                    {d.categoryLabel}
                  </span>
                </div>
                <p className="font-serif text-body-small text-ordift-ink truncate">{d.title}</p>
                <p className="font-sans text-caption text-ordift-ink-muted">
                  {formatDate(d.publishedAt)}
                  {d.publishedByName ? ` · ${d.publishedByName}` : ""}
                </p>
              </div>
              <a
                href={d.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4 whitespace-nowrap"
              >
                Open ↗
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
