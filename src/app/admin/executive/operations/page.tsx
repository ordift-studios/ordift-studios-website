import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, OPERATIONS_CAPABILITIES } from "@/lib/organization/authority";
import { listDepartmentRequests } from "@/lib/organization/departmentRequests";
import { getAllWorkshopsAdmin } from "@/lib/content/sanity/workshopAdmin";

export const metadata: Metadata = {
  title: "Operations — Executive — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// PRIME's jurisdiction hub. Real functionality only, reused from
// existing modules — never a duplicate of them: department_requests
// (Phase 3.3), Workshop operational administration (Workshop Phase B),
// and a direct link to /admin/bookings (registration operations,
// unchanged, pre-existing).
export default async function ExecutiveOperationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/overview");
  const auth = await authorizeWithSuperAdminOverride(user.id, OPERATIONS_CAPABILITIES.workshopAdminister);
  if (!auth.ok) redirect("/admin/executive");

  const [requests, workshops] = await Promise.all([listDepartmentRequests(), getAllWorkshopsAdmin()]);

  return (
    <div className="space-y-8">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · Executive</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">PRIME · Operations</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Operational administration, cross-department coordination, Workshop operations, and service-delivery
          workflows. {auth.actedAsOverride && "Viewing via Super Admin override — this Position is currently unoccupied."}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/admin/bookings" className="block rounded-xl border border-black/10 bg-white p-5 hover:border-black/25">
          <p className="font-serif text-card-title text-ordift-ink">Bookings &amp; Registrations</p>
          <p className="font-sans text-caption text-ordift-ink-muted mt-2">Workshop/enquiry registration operations.</p>
        </Link>
        <Link href="/admin/workshops" className="block rounded-xl border border-black/10 bg-white p-5 hover:border-black/25">
          <p className="font-serif text-card-title text-ordift-ink">Workshop Management</p>
          <p className="font-sans text-caption text-ordift-ink-muted mt-2">{workshops.length} workshop(s) — content, ticket types, check-in.</p>
        </Link>
        <Link href="/admin/organization" className="block rounded-xl border border-black/10 bg-white p-5 hover:border-black/25">
          <p className="font-serif text-card-title text-ordift-ink">Organization</p>
          <p className="font-sans text-caption text-ordift-ink-muted mt-2">Departments, Positions, staff assignment.</p>
        </Link>
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-3">Cross-Department Requests</h2>
        <ul className="divide-y divide-black/5 rounded-lg border border-black/5">
          {requests.map((r) => (
            <li key={r.id} className="px-4 py-2.5">
              <p className="font-sans text-body-small text-ordift-ink">{r.title}</p>
              <p className="font-sans text-caption text-ordift-ink-muted">
                {r.requestType} · {r.requestingDepartmentName ?? r.requestingJurisdiction ?? "—"} → {r.servicingDepartmentName ?? r.servicingJurisdiction ?? "—"} · {r.status}
              </p>
            </li>
          ))}
          {requests.length === 0 && <li className="px-4 py-3 font-sans text-body-small text-ordift-ink-muted">None yet.</li>}
        </ul>
      </section>
    </div>
  );
}
