import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, STRATEGY_CAPABILITIES } from "@/lib/organization/authority";
import { listOrganisations } from "@/lib/organisations/registry";
import OrganisationsSubNav from "./OrganisationsSubNav";
import { createOrganisationAction } from "./directoryActions";
import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import { BUTTON, FIELD } from "./ui";

export const metadata: Metadata = {
  title: "Organisations — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Organisation registry (v1) — one record per organisation. An organisation that has approved Ordift as ITS supplier is a
// "client"; an organisation that supplies services TO Ordift is a "vendor" (reserved — the existing vendor and production-supplier
// records are separate and are not shown or changed here). Organisations are registered by confirming a supplier approval.
export default async function OrganisationsDirectoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/overview");
  const auth = await authorizeWithSuperAdminOverride(user.id, STRATEGY_CAPABILITIES.organisationRegistryAdminister);
  if (!auth.ok) redirect("/admin/overview");

  const organisations = await listOrganisations(user.id);

  return (
    <div className="space-y-8">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · Organisations</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Organisations</h1>
      </div>

      <OrganisationsSubNav active="directory" />

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Add an organisation</h2>
        <p className="font-sans text-body-small text-ordift-ink-muted max-w-2xl">Hotels, companies, event planners and other organisations a contact can belong to. If the name or domain matches one already registered you are told, and an identical name cannot be created twice.</p>
        <ActionForm action={createOrganisationAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input name="name" required maxLength={200} placeholder="Organisation name" className={FIELD} />
          <input name="domain" placeholder="Email domain, e.g. example.com (optional)" className={FIELD} />
          <textarea name="notes" rows={2} maxLength={2000} placeholder="Notes (internal)" className={`${FIELD} sm:col-span-2`} />
          <label className="flex items-start gap-2 font-sans text-caption text-ordift-ink-muted sm:col-span-2">
            <input type="checkbox" name="confirmedDistinct" className="mt-0.5" />
            If the system says a very similar organisation already exists, tick here to confirm this is a different organisation.
          </label>
          <SubmitButton pendingLabel="Saving…" className={`${BUTTON} sm:col-span-2`}>Add organisation</SubmitButton>
        </ActionForm>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Directory ({organisations.length})</h2>
        <p className="font-sans text-body-small text-ordift-ink-muted">
          Each organisation is listed once, however many contacts or relationships it has with Ordift. Organisations are added here, from a contact or enquiry, or when a supplier approval is confirmed.
        </p>
        {organisations.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted rounded-lg border border-dashed border-black/15 px-4 py-6 text-center">
            No organisations yet. Record a <Link href="/admin/organisations/applications" className="underline underline-offset-4">supplier application</Link>, then attach and confirm the approval email.
          </p>
        ) : (
          <ul className="divide-y divide-black/5">
            {organisations.map((o) => (
              <li key={o.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-sans text-body-small font-medium text-ordift-ink">
                    <Link href={`/admin/organisations/${o.id}`} className="underline underline-offset-4">{o.name}</Link>{o.status === "inactive" ? " (inactive)" : ""}
                  </p>
                  <p className="font-sans text-caption text-ordift-ink-muted">{o.primaryDomain ?? "No domain recorded"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {o.relationships.length === 0 ? (
                    <span className="rounded-full border border-black/15 px-3 py-1 font-sans text-caption text-ordift-ink-muted">No relationship</span>
                  ) : (
                    o.relationships.map((r) => (
                      <span key={r.kind} className="rounded-full border border-black/15 px-3 py-1 font-sans text-caption text-ordift-ink">
                        {r.kind === "client" ? "Client (approved Ordift as supplier)" : "Vendor (supplies Ordift)"} · {r.status}
                        {r.approvedAt ? ` · since ${r.approvedAt.slice(0, 10)}` : ""}
                      </span>
                    ))
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
