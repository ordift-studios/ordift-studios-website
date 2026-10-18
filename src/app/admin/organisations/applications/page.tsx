import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, STRATEGY_CAPABILITIES } from "@/lib/organization/authority";
import { listApplications, type ApplicationStatus } from "@/lib/organisations/registry";
import OrganisationsSubNav from "../OrganisationsSubNav";
import { recordApplicationAction } from "../actions";
import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";

export const metadata: Metadata = {
  title: "Supplier applications — Organisations — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  submitted: "Submitted — waiting for approval",
  pending_confirmation: "Approval email attached — needs your confirmation",
  approved: "Approved",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

export default async function SupplierApplicationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/overview");
  const auth = await authorizeWithSuperAdminOverride(user.id, STRATEGY_CAPABILITIES.organisationRegistryAdminister);
  if (!auth.ok) redirect("/admin/overview");

  const applications = await listApplications(user.id);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-8">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · Organisations</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Supplier applications</h1>
        <p className="mt-2 font-sans text-body-small text-ordift-ink-muted max-w-2xl">
          Applications Ordift has submitted to organisations to become their approved supplier. When an organisation emails its approval, open the application and paste the email. You then confirm it; nothing changes until you do, and confirming never creates a booking, invoice or payment.
        </p>
      </div>

      <OrganisationsSubNav active="applications" />

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Record an application</h2>
        <ActionForm action={recordApplicationAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input name="organisationName" required maxLength={200} placeholder="Organisation name" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <input name="contactDomain" placeholder="Organisation's email domain, e.g. example.com (recommended)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <input name="reference" maxLength={120} placeholder="Application reference, if they gave one" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <label className="font-sans text-caption text-ordift-ink-muted flex flex-col gap-1">
            Date submitted
            <input name="submittedOn" type="date" required max={today} defaultValue={today} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          </label>
          <textarea name="notes" rows={2} maxLength={2000} placeholder="Notes: how it was submitted, who to expect the reply from (optional)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small sm:col-span-2" />
          <SubmitButton pendingLabel="Recording…" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small sm:col-span-2">Record application</SubmitButton>
        </ActionForm>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">All applications ({applications.length})</h2>
        {applications.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted rounded-lg border border-dashed border-black/15 px-4 py-6 text-center">No applications recorded yet.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {applications.map((a) => (
              <li key={a.id}>
                <Link href={`/admin/organisations/applications/${a.id}`} className="flex items-center justify-between gap-4 py-3 hover:bg-black/[0.02] px-2 -mx-2 rounded">
                  <div>
                    <p className="font-sans text-body-small font-medium text-ordift-ink">{a.organisationName}{a.reference ? ` · ${a.reference}` : ""}</p>
                    <p className="font-sans text-caption text-ordift-ink-muted">Submitted {a.submittedOn} · {STATUS_LABEL[a.status]}</p>
                  </div>
                  <span className="font-sans text-caption text-ordift-ink underline underline-offset-4 shrink-0">Open →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
