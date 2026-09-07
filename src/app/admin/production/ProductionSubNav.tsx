import Link from "next/link";

const SECTIONS = [
  { key: "overview", label: "Overview", href: "/admin/production" },
  { key: "suppliers", label: "Suppliers", href: "/admin/production/suppliers" },
  { key: "quotes", label: "Supplier Quotes", href: "/admin/production/quotes" },
  { key: "budgets", label: "Production Budgets", href: "/admin/production/budgets" },
  { key: "changes", label: "Changes / Variations", href: "/admin/production/changes" },
] as const;

// Production Operations Admin (2026-09-07) — a coherent, dedicated
// Admin area for Production Services' internal procurement/budget
// records, deliberately separate from Admin Pricing: pricing RATES
// belong in Pricing; project-specific suppliers, quotes, budgets and
// changes belong here. Horizontal-scroll on narrow viewports (no
// wrapping/truncation) — same responsive treatment applied to Admin
// Pricing's own tab row this same phase.
export default function ProductionSubNav({ active }: { active: (typeof SECTIONS)[number]["key"] }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 sm:flex-wrap sm:overflow-visible">
      {SECTIONS.map((s) => (
        <Link
          key={s.key}
          href={s.href}
          className={`shrink-0 rounded-lg px-4 py-2 font-sans text-body-small whitespace-nowrap ${active === s.key ? "bg-ordift-ink text-white" : "text-ordift-ink-muted hover:text-ordift-ink border border-black/15"}`}
        >
          {s.label}
        </Link>
      ))}
    </div>
  );
}
