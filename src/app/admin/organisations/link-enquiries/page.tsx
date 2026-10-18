import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, STRATEGY_CAPABILITIES } from "@/lib/organization/authority";
import { listContacts, listEnquiriesForLinkReview } from "@/lib/directory/directory";
import { listOrganisations } from "@/lib/organisations/registry";
import OrganisationsSubNav from "../OrganisationsSubNav";
import { createContactFromRecordAction, linkRecordAction } from "../directoryActions";
import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import ConfirmSubmitButton from "@/components/admin/ConfirmSubmitButton";
import { BUTTON_QUIET, FIELD, strengthLabel } from "../ui";

export const metadata: Metadata = {
  title: "Link enquiries — Organisations — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// One-off, human-reviewed linking of enquiries that existed before the directory. Nothing is linked automatically: the suggestions are computed when
// this page is opened, and each enquiry is linked, given a new contact, or left alone by a person, one at a time. Every action is logged.
export default async function LinkEnquiriesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/overview");
  const auth = await authorizeWithSuperAdminOverride(user.id, STRATEGY_CAPABILITIES.organisationRegistryAdminister);
  if (!auth.ok) redirect("/admin/overview");

  const [items, contacts, organisations] = await Promise.all([listEnquiriesForLinkReview(user.id), listContacts(user.id), listOrganisations(user.id)]);

  return (
    <div className="space-y-8">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · Organisations</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Link existing enquiries</h1>
        <p className="mt-2 font-sans text-body-small text-ordift-ink-muted max-w-2xl">
          Enquiries received before the directory existed. Link each to a contact (and organisation, if it was for one), create a contact from it, or leave it alone. Nothing here changes the enquiry&apos;s stage, amounts, payments or legal entity.
        </p>
      </div>

      <OrganisationsSubNav active="link-enquiries" />

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Enquiries not yet linked ({items.length})</h2>
        {items.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted rounded-lg border border-dashed border-black/15 px-4 py-6 text-center">Every enquiry is linked, or there are none.</p>
        ) : (
          <ul className="divide-y divide-black/10">
            {items.map((e) => (
              <li key={e.enquiryId} className="py-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Link href={`/admin/enquiries/${e.enquiryId}`} className="font-sans text-body-small font-medium text-ordift-ink underline underline-offset-4">{e.reference}</Link>
                    <span className="font-sans text-body-small text-ordift-ink"> · {e.fullName}</span>
                    {e.isTest ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 font-sans text-caption text-amber-900">test</span> : null}
                    <p className="font-sans text-caption text-ordift-ink-muted">{e.service} · {e.stage.replace(/_/g, " ")} · {e.submittedAt.slice(0, 10)}{e.emailDomain ? ` · email at ${e.emailDomain}` : ""}</p>
                  </div>
                </div>
                {e.contactSuggestions.length + e.organisationSuggestions.length > 0 ? (
                  <ul className="space-y-1">
                    {e.contactSuggestions.map((s) => (
                      <li key={s.contactId} className="flex flex-wrap items-center justify-between gap-3 font-sans text-body-small text-ordift-ink">
                        <span>Suggested contact: {s.fullName} · {strengthLabel(s.strength)}</span>
                        <ActionForm action={linkRecordAction}>
                          <input type="hidden" name="subjectType" value="enquiry" />
                          <input type="hidden" name="subjectId" value={e.enquiryId} />
                          <input type="hidden" name="contactId" value={s.contactId} />
                          <ConfirmSubmitButton confirmMessage={`Link ${e.reference} to ${s.fullName}?`} pendingLabel="Linking…" className={BUTTON_QUIET}>Link</ConfirmSubmitButton>
                        </ActionForm>
                      </li>
                    ))}
                    {e.organisationSuggestions.map((s) => (
                      <li key={s.organisationId} className="flex flex-wrap items-center justify-between gap-3 font-sans text-body-small text-ordift-ink">
                        <span>Suggested organisation: {s.name} · {strengthLabel(s.strength)}</span>
                        <ActionForm action={linkRecordAction}>
                          <input type="hidden" name="subjectType" value="enquiry" />
                          <input type="hidden" name="subjectId" value={e.enquiryId} />
                          <input type="hidden" name="organisationId" value={s.organisationId} />
                          <ConfirmSubmitButton confirmMessage={`Link ${e.reference} to ${s.name} as the client organisation?`} pendingLabel="Linking…" className={BUTTON_QUIET}>Link</ConfirmSubmitButton>
                        </ActionForm>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="font-sans text-caption text-ordift-ink-muted">No existing contact or organisation looks like a match.</p>
                )}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <ActionForm action={linkRecordAction} className="flex flex-wrap gap-2">
                    <input type="hidden" name="subjectType" value="enquiry" />
                    <input type="hidden" name="subjectId" value={e.enquiryId} />
                    <select name="contactId" defaultValue="" className={FIELD}>
                      <option value="">Contact…</option>
                      {contacts.filter((c) => c.status === "active").map((c) => (
                        <option key={c.id} value={c.id}>{c.fullName}{c.organisationName ? ` (${c.organisationName})` : ""}</option>
                      ))}
                    </select>
                    <select name="organisationId" defaultValue="" className={FIELD}>
                      <option value="">Organisation…</option>
                      {organisations.filter((o) => o.status === "active").map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                    <SubmitButton pendingLabel="Saving…" className={BUTTON_QUIET}>Link selected</SubmitButton>
                  </ActionForm>
                  <ActionForm action={createContactFromRecordAction} className="flex flex-wrap gap-2 items-center">
                    <input type="hidden" name="subjectType" value="enquiry" />
                    <input type="hidden" name="subjectId" value={e.enquiryId} />
                    <select name="organisationId" defaultValue="" className={FIELD}>
                      <option value="">Individual client</option>
                      {organisations.filter((o) => o.status === "active").map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                    {e.contactSuggestions.some((s) => s.strength === "same_person" || s.strength === "likely") ? (
                      <label className="flex items-center gap-2 font-sans text-caption text-ordift-ink-muted">
                        <input type="checkbox" name="confirmedDistinct" /> different person
                      </label>
                    ) : null}
                    <SubmitButton pendingLabel="Creating…" className={BUTTON_QUIET}>Create contact from this enquiry</SubmitButton>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
