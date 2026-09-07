import Link from "next/link";

const SECTIONS = [
  { key: "overview", label: "Overview", href: "/admin/partnerships" },
  { key: "opportunities", label: "Opportunities", href: "/admin/partnerships/opportunities" },
  { key: "referrals", label: "Referrals", href: "/admin/partnerships/referrals" },
] as const;

// Partnerships & Collaborations V1 (2026-09-07) — Assessments,
// Agreements, and Outcome Reviews are deliberately NOT separate top-
// level routes in this phase: they are facets of one opportunity
// record, not independent entities, so they live as sections within
// each Opportunity's detail page rather than duplicating opportunity-
// centric CRUD across five separate list screens. See the completion
// report's own scoping note.
export default function PartnershipsSubNav({ active }: { active: (typeof SECTIONS)[number]["key"] }) {
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
