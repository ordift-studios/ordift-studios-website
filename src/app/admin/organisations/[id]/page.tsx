import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, STRATEGY_CAPABILITIES } from "@/lib/organization/authority";
import { getOrganisationDetail } from "@/lib/directory/directory";
import OrganisationsSubNav from "../OrganisationsSubNav";
import { ContextSummary, LinkedRecords } from "../ui";

export const metadata: Metadata = {
  title: "Organisation — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

export default async function OrganisationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/overview");
  const auth = await authorizeWithSuperAdminOverride(user.id, STRATEGY_CAPABILITIES.organisationRegistryAdminister);
  if (!auth.ok) redirect("/admin/overview");

  const { id } = await params;
  const org = await getOrganisationDetail(user.id, id);
  if (!org) notFound();

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/organisations" className="font-sans text-caption text-ordift-ink-muted underline underline-offset-4">← Directory</Link>
        <h1 className="mt-2 font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">{org.name}</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted">{org.primaryDomain ?? "No domain recorded"}{org.status === "inactive" ? " · inactive" : ""}</p>
      </div>

      <OrganisationsSubNav active="directory" />

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Relationship with Ordift</h2>
        {org.relationships.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">No relationship recorded yet. A client relationship is recorded when a supplier approval is confirmed.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {org.relationships.map((r) => (
              <li key={r.kind} className="rounded-full border border-black/15 px-3 py-1 font-sans text-caption text-ordift-ink">
                {r.kind === "client" ? "Client (approved Ordift as supplier)" : "Vendor (supplies Ordift)"} · {r.status}{r.approvedAt ? ` · since ${r.approvedAt.slice(0, 10)}` : ""}
              </li>
            ))}
          </ul>
        )}
        {org.applications.length > 0 ? (
          <p className="font-sans text-caption text-ordift-ink-muted">
            Supplier applications:{" "}
            {org.applications.map((a, i) => (
              <span key={a.id}>
                {i > 0 ? ", " : ""}
                <Link href={`/admin/organisations/applications/${a.id}`} className="underline underline-offset-4">{a.reference ?? a.submittedOn} ({a.status.replace(/_/g, " ")})</Link>
              </span>
            ))}
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Contacts ({org.contacts.length})</h2>
          <Link href={`/admin/organisations/contacts?org=${org.id}`} className="font-sans text-body-small text-ordift-ink underline underline-offset-4">Add a contact →</Link>
        </div>
        {org.contacts.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">No contacts yet.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {org.contacts.map((c) => (
              <li key={c.id} className="py-2">
                <Link href={`/admin/organisations/contacts/${c.id}`} className="font-sans text-body-small font-medium text-ordift-ink underline underline-offset-4">{c.fullName}</Link>
                <span className="font-sans text-caption text-ordift-ink-muted">{c.jobTitle ? ` · ${c.jobTitle}` : ""} · {c.emails.filter((e) => !e.removed).length} address{c.emails.filter((e) => !e.removed).length === 1 ? "" : "es"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Linked enquiries and quotations ({org.records.length})</h2>
        <ContextSummary context={org.context} />
        <LinkedRecords records={org.records} />
        <p className="font-sans text-caption text-ordift-ink-muted">One organisation can deal with more than one Ordift legal entity. The entity and payment market are read from each record and are never set from here.</p>
      </section>
    </div>
  );
}
