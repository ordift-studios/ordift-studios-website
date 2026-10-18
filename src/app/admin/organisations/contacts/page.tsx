import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, STRATEGY_CAPABILITIES } from "@/lib/organization/authority";
import { listContacts } from "@/lib/directory/directory";
import { listOrganisations } from "@/lib/organisations/registry";
import OrganisationsSubNav from "../OrganisationsSubNav";
import { createContactAction } from "../directoryActions";
import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import { BUTTON, FIELD } from "../ui";

export const metadata: Metadata = {
  title: "Contacts — Organisations — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Client Directory v1 — people. An individual client is a contact with no organisation; an organisation can have several contacts. A contact is
// NOT a portal account: the optional account link is made on the contact's own page, by a person.
export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/overview");
  const auth = await authorizeWithSuperAdminOverride(user.id, STRATEGY_CAPABILITIES.organisationRegistryAdminister);
  if (!auth.ok) redirect("/admin/overview");

  const { org } = await searchParams;
  const [contacts, organisations] = await Promise.all([listContacts(user.id), listOrganisations(user.id)]);

  return (
    <div className="space-y-8">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · Organisations</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Contacts</h1>
      </div>

      <OrganisationsSubNav active="contacts" />

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Add a contact</h2>
        <p className="font-sans text-body-small text-ordift-ink-muted max-w-2xl">
          Leave the organisation empty for an individual client. If the same personal email address already belongs to a contact, you are sent to that contact instead of creating a second one. Addresses such as info@ or bookings@ are treated as shared mailboxes and are never used to decide two people are the same; you can change this on the contact.
        </p>
        <ActionForm action={createContactAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input name="fullName" required maxLength={200} placeholder="Full name" className={FIELD} />
          <input name="jobTitle" maxLength={150} placeholder="Job title (optional)" className={FIELD} />
          <select name="organisationId" defaultValue={org ?? ""} className={FIELD}>
            <option value="">No organisation (individual client)</option>
            {organisations.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          <textarea name="emails" rows={2} placeholder="Email addresses (separate with spaces, commas or new lines)" className={FIELD} />
          <textarea name="phones" rows={2} placeholder="Phone numbers (optional, one per line)" className={FIELD} />
          <textarea name="notes" rows={2} maxLength={2000} placeholder="Notes (internal)" className={FIELD} />
          <label className="flex items-start gap-2 font-sans text-caption text-ordift-ink-muted sm:col-span-2">
            <input type="checkbox" name="confirmedDistinct" className="mt-0.5" />
            If the system says someone looks like the same person, tick here to confirm this is a different person.
          </label>
          <SubmitButton pendingLabel="Saving…" className={`${BUTTON} sm:col-span-2`}>Add contact</SubmitButton>
        </ActionForm>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">All contacts ({contacts.length})</h2>
        {contacts.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted rounded-lg border border-dashed border-black/15 px-4 py-6 text-center">No contacts yet.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {contacts.map((c) => (
              <li key={c.id}>
                <Link href={`/admin/organisations/contacts/${c.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3 hover:bg-black/[0.02] px-2 -mx-2 rounded">
                  <div>
                    <p className="font-sans text-body-small font-medium text-ordift-ink">{c.fullName}{c.status === "inactive" ? " (inactive)" : ""}</p>
                    <p className="font-sans text-caption text-ordift-ink-muted">
                      {c.organisationName ?? "Individual client"}{c.jobTitle ? ` · ${c.jobTitle}` : ""}{c.profileLinked ? " · has a portal account link" : ""}
                    </p>
                  </div>
                  <span className="font-sans text-caption text-ordift-ink-muted">{c.enquiryCount} enquir{c.enquiryCount === 1 ? "y" : "ies"} · {c.quotationCount} quotation{c.quotationCount === 1 ? "" : "s"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
