import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, STRATEGY_CAPABILITIES } from "@/lib/organization/authority";
import { getContactDetail } from "@/lib/directory/directory";
import { listOrganisations } from "@/lib/organisations/registry";
import { addContactEmailAction, linkContactAccountAction, removeContactEmailAction, setEmailSharedAction, setPrimaryEmailAction, unlinkContactAccountAction, updateContactAction } from "../../directoryActions";
import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import ConfirmSubmitButton from "@/components/admin/ConfirmSubmitButton";
import { BUTTON, BUTTON_QUIET, ContextSummary, FIELD, LinkedRecords, strengthLabel } from "../../ui";

export const metadata: Metadata = {
  title: "Contact — Organisations — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/overview");
  const auth = await authorizeWithSuperAdminOverride(user.id, STRATEGY_CAPABILITIES.organisationRegistryAdminister);
  if (!auth.ok) redirect("/admin/overview");

  const { id } = await params;
  const [contact, organisations] = await Promise.all([getContactDetail(user.id, id), listOrganisations(user.id)]);
  if (!contact) notFound();
  const active = contact.emails.filter((e) => !e.removed);
  const removed = contact.emails.filter((e) => e.removed);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/organisations/contacts" className="font-sans text-caption text-ordift-ink-muted underline underline-offset-4">← Contacts</Link>
        <h1 className="mt-2 font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">{contact.fullName}</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted">
          {contact.organisationId ? (
            <Link href={`/admin/organisations/${contact.organisationId}`} className="underline underline-offset-4">{contact.organisationName}</Link>
          ) : (
            "Individual client (no organisation)"
          )}
          {contact.jobTitle ? ` · ${contact.jobTitle}` : ""}
          {contact.status === "inactive" ? " · inactive" : ""}
        </p>
      </div>

      {contact.possibleDuplicates.length > 0 ? (
        <section className="rounded-xl border border-amber-600/30 bg-amber-50 p-6 space-y-2">
          <h2 className="font-serif font-medium text-body text-amber-900">May be the same person as</h2>
          <ul className="font-sans text-body-small text-amber-900 space-y-1">
            {contact.possibleDuplicates.map((d) => (
              <li key={d.contactId}>
                <Link href={`/admin/organisations/contacts/${d.contactId}`} className="underline underline-offset-4">{d.fullName}</Link> ({strengthLabel(d.strength)})
              </li>
            ))}
          </ul>
          <p className="font-sans text-caption text-amber-900">Nothing is merged automatically. Review both records and decide; a merge tool comes in a later milestone.</p>
        </section>
      ) : null}

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Details</h2>
        <ActionForm action={updateContactAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input type="hidden" name="contactId" value={contact.id} />
          <input name="fullName" required maxLength={200} defaultValue={contact.fullName} placeholder="Full name" className={FIELD} />
          <input name="preferredName" maxLength={100} defaultValue={contact.preferredName ?? ""} placeholder="Preferred name (optional)" className={FIELD} />
          <input name="jobTitle" maxLength={150} defaultValue={contact.jobTitle ?? ""} placeholder="Job title (optional)" className={FIELD} />
          <select name="organisationId" defaultValue={contact.organisationId ?? ""} className={FIELD}>
            <option value="">No organisation (individual client)</option>
            {organisations.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          <textarea name="phones" rows={2} defaultValue={contact.phones.join("\n")} placeholder="Phone numbers, one per line" className={FIELD} />
          <textarea name="notes" rows={2} maxLength={2000} defaultValue={contact.notes ?? ""} placeholder="Notes (internal)" className={FIELD} />
          <select name="status" defaultValue={contact.status} className={FIELD}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <SubmitButton pendingLabel="Saving…" className={BUTTON}>Save details</SubmitButton>
        </ActionForm>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Email addresses</h2>
        <p className="font-sans text-caption text-ordift-ink-muted max-w-2xl">
          A personal address belongs to one contact only; if another contact already has it, the two are flagged for you to review and nothing is moved or merged. A shared mailbox (info@, bookings@ …) can be held by several contacts and is never used to decide that two people are the same.
        </p>
        {active.length === 0 ? <p className="font-sans text-body-small text-ordift-ink-muted">No email addresses.</p> : null}
        <ul className="divide-y divide-black/5">
          {active.map((e) => (
            <li key={e.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-sans text-body-small text-ordift-ink">{e.email}</p>
                <p className="font-sans text-caption text-ordift-ink-muted">{e.isShared ? "Shared mailbox" : "Personal"}{e.isPrimary ? " · primary" : ""}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!e.isPrimary ? (
                  <ActionForm action={setPrimaryEmailAction}>
                    <input type="hidden" name="contactId" value={contact.id} />
                    <input type="hidden" name="emailId" value={e.id} />
                    <SubmitButton pendingLabel="Saving…" className={BUTTON_QUIET}>Make primary</SubmitButton>
                  </ActionForm>
                ) : null}
                <ActionForm action={setEmailSharedAction}>
                  <input type="hidden" name="contactId" value={contact.id} />
                  <input type="hidden" name="emailId" value={e.id} />
                  <input type="hidden" name="shared" value={e.isShared ? "false" : "true"} />
                  <SubmitButton pendingLabel="Saving…" className={BUTTON_QUIET}>{e.isShared ? "Mark as personal" : "Mark as shared mailbox"}</SubmitButton>
                </ActionForm>
                <ActionForm action={removeContactEmailAction}>
                  <input type="hidden" name="contactId" value={contact.id} />
                  <input type="hidden" name="emailId" value={e.id} />
                  <ConfirmSubmitButton confirmMessage="Remove this address from the contact? The record of it is kept." pendingLabel="Removing…" className={BUTTON_QUIET}>Remove</ConfirmSubmitButton>
                </ActionForm>
              </div>
            </li>
          ))}
        </ul>
        <ActionForm action={addContactEmailAction} className="flex flex-wrap gap-3 items-start">
          <input type="hidden" name="contactId" value={contact.id} />
          <input name="email" type="email" required placeholder="Add an email address" className={`${FIELD} min-w-64`} />
          <select name="sharing" defaultValue="auto" className={FIELD}>
            <option value="auto">Detect personal or shared</option>
            <option value="personal">Personal</option>
            <option value="shared">Shared mailbox</option>
          </select>
          <SubmitButton pendingLabel="Adding…" className={BUTTON}>Add address</SubmitButton>
        </ActionForm>
        {removed.length > 0 ? <p className="font-sans text-caption text-ordift-ink-muted">{removed.length} removed address{removed.length === 1 ? "" : "es"} kept on record.</p> : null}
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Portal account</h2>
        <p className="font-sans text-caption text-ordift-ink-muted max-w-2xl">A contact is a directory record, not a login. You can link it to a registered portal account; that is never done automatically.</p>
        {contact.profile ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-sans text-body-small text-ordift-ink">Linked to the account of {contact.profile.fullName ?? "an account"}{contact.profile.email ? ` (${contact.profile.email})` : ""}.</p>
            <ActionForm action={unlinkContactAccountAction}>
              <input type="hidden" name="contactId" value={contact.id} />
              <ConfirmSubmitButton confirmMessage="Remove the link between this contact and the portal account? Neither is deleted." pendingLabel="Removing…" className={BUTTON_QUIET}>Remove link</ConfirmSubmitButton>
            </ActionForm>
          </div>
        ) : contact.accountSuggestions.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">No portal account uses one of this contact&apos;s personal email addresses.</p>
        ) : (
          <ul className="space-y-2">
            {contact.accountSuggestions.map((a) => (
              <li key={a.profileId} className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-sans text-body-small text-ordift-ink">Account {a.fullName ?? ""} ({a.email}) uses the same address.</p>
                <ActionForm action={linkContactAccountAction}>
                  <input type="hidden" name="contactId" value={contact.id} />
                  <input type="hidden" name="profileId" value={a.profileId} />
                  <ConfirmSubmitButton confirmMessage="Link this contact to that portal account? You are saying they are the same person." pendingLabel="Linking…" className={BUTTON_QUIET}>Link to this account</ConfirmSubmitButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Linked enquiries and quotations ({contact.records.length})</h2>
        <ContextSummary context={contact.context} />
        <LinkedRecords records={contact.records} />
        <p className="font-sans text-caption text-ordift-ink-muted">Links are made from each enquiry or quotation, or from Link enquiries. The legal entity and payment market shown here are read from each record; the directory does not set them.</p>
      </section>
    </div>
  );
}
