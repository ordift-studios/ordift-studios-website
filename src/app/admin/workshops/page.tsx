import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/portal/roles";
import { isStaffOrAdmin } from "@/lib/portal/roles";
import { getAllWorkshopsAdmin } from "@/lib/content/sanity/workshopAdmin";
import { getWorkshopOperationalWarnings } from "@/lib/workshops/financialOverview";

export const metadata: Metadata = {
  title: "Workshop Management — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Workshop Management V1, Phase B, Part 6 (2026-08-25). Visible to any
// staff/admin (read-only browsing) — mutation actions each independently
// require operations.workshop.administer or Super Admin (see actions.ts),
// so viewing this list is not itself a privileged action.
export default async function AdminWorkshopsPage() {
  const user = await getCurrentUser();
  if (!user || !isStaffOrAdmin(user)) redirect("/admin/overview");

  const workshops = await getAllWorkshopsAdmin();
  const warningsByWorkshop = new Map(
    await Promise.all(
      workshops.map(
        async (w) => [w.id, await getWorkshopOperationalWarnings(w.id, { capacity: w.capacity, requiresPayment: w.requiresPayment })] as const
      )
    )
  );

  return (
    <div>
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin</p>
          <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Workshop Management</h1>
          <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
            Workshops, ticket types, registrations, instructors, and financial overview — one unified module. CHIEF/
            Super Admin has complete visibility; other capabilities activate as Executive/Director positions are
            occupied and granted.
          </p>
        </div>
        <Link href="/admin/workshops/new" className="font-sans text-body-small font-semibold px-4 py-2.5 rounded-full bg-ordift-gold text-ordift-navy-950 whitespace-nowrap">
          New Workshop
        </Link>
      </div>

      <div className="rounded-xl border border-black/10 bg-white divide-y divide-black/5">
        {workshops.map((w) => {
          const warnings = warningsByWorkshop.get(w.id) ?? [];
          return (
            <Link key={w.id} href={`/admin/workshops/${w.id}`} className="flex items-center justify-between px-5 py-4 hover:bg-ordift-offwhite/60">
              <div>
                <p className="font-sans text-body-small text-ordift-ink font-medium">{w.title}</p>
                <p className="font-sans text-caption text-ordift-ink-muted">
                  {w.status} · Capacity {w.capacity} {w.startDate ? `· ${w.startDate}` : ""}
                </p>
                {warnings.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {warnings.map((warn) => (
                      <span key={warn.key} className="font-sans text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                        {warn.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Link>
          );
        })}
        {workshops.length === 0 && <p className="px-5 py-8 text-center font-sans text-body-small text-ordift-ink-muted">No workshops yet.</p>}
      </div>
    </div>
  );
}
