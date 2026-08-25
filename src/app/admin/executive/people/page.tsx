import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, PEOPLE_CAPABILITIES } from "@/lib/organization/authority";
import { listRecruitmentRequisitions } from "@/lib/recruitment/requisitions";
import { listStaffOnboarding } from "@/lib/organization/onboarding";

export const metadata: Metadata = {
  title: "People — Executive — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// PULSE's jurisdiction hub. Reuses existing recruitment_requisitions,
// staff_onboarding, and links to /admin/recruitment (inbound
// applications) — never duplicated. Workshop instructor engagements
// are managed from each workshop's own dashboard (Workshop Phase B),
// linked from there.
export default async function ExecutivePeoplePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/overview");
  const auth = await authorizeWithSuperAdminOverride(user.id, PEOPLE_CAPABILITIES.workshopEngagementAdminister);
  if (!auth.ok) redirect("/admin/executive");

  const [requisitions, onboarding] = await Promise.all([listRecruitmentRequisitions(), listStaffOnboarding()]);

  return (
    <div className="space-y-8">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · Executive</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">PULSE · People / HR</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Recruitment requisition administration, interview coordination, onboarding workflow, Workshop instructor
          engagement. {auth.actedAsOverride && "Viewing via Super Admin override — this Position is currently unoccupied."}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/admin/recruitment" className="block rounded-xl border border-black/10 bg-white p-5 hover:border-black/25">
          <p className="font-serif text-card-title text-ordift-ink">Recruitment Applications</p>
          <p className="font-sans text-caption text-ordift-ink-muted mt-2">Inbound applications, review, status.</p>
        </Link>
        <Link href="/admin/workshops" className="block rounded-xl border border-black/10 bg-white p-5 hover:border-black/25">
          <p className="font-serif text-card-title text-ordift-ink">Workshop Instructor Engagements</p>
          <p className="font-sans text-caption text-ordift-ink-muted mt-2">
            Managed from each workshop&rsquo;s own dashboard — open a workshop, then its Instructor / Facilitator
            Engagement section.
          </p>
        </Link>
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-3">Recruitment Requisitions</h2>
        <p className="font-sans text-caption text-ordift-ink-muted mb-3">A requesting department/executive can never approve/reject its own requisition — only PULSE or Super Admin can.</p>
        <ul className="divide-y divide-black/5 rounded-lg border border-black/5">
          {requisitions.map((r) => (
            <li key={r.id} className="px-4 py-2.5">
              <p className="font-sans text-body-small text-ordift-ink">{r.requestTitle}</p>
              <p className="font-sans text-caption text-ordift-ink-muted">{r.departmentName ?? "—"} · {r.gradeName ?? "—"} · headcount {r.headcount} · {r.requestStatus}</p>
            </li>
          ))}
          {requisitions.length === 0 && <li className="px-4 py-3 font-sans text-body-small text-ordift-ink-muted">None yet.</li>}
        </ul>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-3">Staff Onboarding</h2>
        <ul className="divide-y divide-black/5 rounded-lg border border-black/5">
          {onboarding.map((o) => (
            <li key={o.id} className="px-4 py-2.5 font-sans text-body-small text-ordift-ink">
              {o.status} {o.startDate ? `· starts ${o.startDate}` : ""}
            </li>
          ))}
          {onboarding.length === 0 && <li className="px-4 py-3 font-sans text-body-small text-ordift-ink-muted">None in progress.</li>}
        </ul>
      </section>
    </div>
  );
}
