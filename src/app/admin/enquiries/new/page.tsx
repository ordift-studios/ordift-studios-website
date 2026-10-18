import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole, isStaffOrAdmin, isSuperAdmin } from "@/lib/portal/roles";
import { PATHWAYS } from "@/lib/enquiry/pathways";
import { INTAKE_CHANNELS } from "@/lib/enquiry/staffIntake";
import { listContacts } from "@/lib/directory/directory";
import { listOrganisations } from "@/lib/organisations/registry";
import { createStaffEnquiryAction } from "../staffIntakeActions";
import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import LocalDateTimeField from "@/components/admin/LocalDateTimeField";

export const metadata: Metadata = {
  title: "Record an enquiry — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

const FIELD = "rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small";

// Record an enquiry that came in through WhatsApp, a call, an email or in person. It creates the ordinary enquiry at the first stage and nothing else: no
// email is sent, and no quotation, amount, payment or booking is created.
export default async function RecordEnquiryPage() {
  const user = await getCurrentUser();
  if (!user || !isStaffOrAdmin(user)) redirect("/admin/overview");
  const superAdmin = isSuperAdmin(user);
  const canAllowEmails = superAdmin || hasRole(user, "admin");
  const [contacts, organisations] = superAdmin ? await Promise.all([listContacts(user.id), listOrganisations(user.id)]) : [[], []];

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <Link href="/admin/enquiries" className="font-sans text-body-small text-ordift-gold-pressed underline">← All Enquiries</Link>
        <h1 className="mt-3 font-serif font-medium text-section-heading text-ordift-ink">Record an enquiry</h1>
        <p className="mt-2 font-sans text-body-small text-ordift-ink-muted">
          For an enquiry that reached you by WhatsApp, telephone, email or in person. It is saved as a new enquiry. <strong>Nothing is sent to the client</strong>, and no quotation, amount due, payment or booking is created.
        </p>
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-6">
        <ActionForm action={createStaffEnquiryAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 font-sans text-caption text-ordift-ink-muted">
            How did it reach Ordift?
            <select name="channel" required defaultValue="" className={FIELD}>
              <option value="" disabled>Choose…</option>
              {INTAKE_CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 font-sans text-caption text-ordift-ink-muted">
            When did the client make contact?
            <LocalDateTimeField name="receivedAt" className={FIELD} />
          </label>
          <label className="flex flex-col gap-1 font-sans text-caption text-ordift-ink-muted">
            Service asked about
            <select name="service" required defaultValue="" className={FIELD}>
              <option value="" disabled>Choose…</option>
              {PATHWAYS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 font-sans text-caption text-ordift-ink-muted">
            Client&apos;s name
            <input name="fullName" required maxLength={200} className={FIELD} />
          </label>
          <label className="flex flex-col gap-1 font-sans text-caption text-ordift-ink-muted">
            Email (leave empty if they gave none)
            <input name="email" type="email" className={FIELD} />
          </label>
          <label className="flex flex-col gap-1 font-sans text-caption text-ordift-ink-muted">
            Phone or WhatsApp number
            <input name="phone" className={FIELD} />
          </label>
          <label className="flex flex-col gap-1 font-sans text-caption text-ordift-ink-muted sm:col-span-2">
            What did they ask for? (kept as an internal note)
            <textarea name="details" rows={4} maxLength={4000} className={FIELD} />
          </label>

          {superAdmin ? (
            <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-lg border border-black/10 p-4">
              <p className="sm:col-span-2 font-sans text-body-small font-medium text-ordift-ink">Client Directory (optional, Super Admin)</p>
              <select name="contactId" defaultValue="" className={FIELD}>
                <option value="">Link an existing contact…</option>
                {contacts.filter((c) => c.status === "active").map((c) => (
                  <option key={c.id} value={c.id}>{c.fullName}{c.organisationName ? ` (${c.organisationName})` : ""}</option>
                ))}
              </select>
              <select name="organisationId" defaultValue="" className={FIELD}>
                <option value="">Link a client organisation…</option>
                {organisations.filter((o) => o.status === "active").map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
              <p className="sm:col-span-2 font-sans text-caption text-ordift-ink-muted">Not sure? Leave both empty. After saving, the enquiry page suggests matches and can create the contact, with the duplicate checks.</p>
            </div>
          ) : null}

          {canAllowEmails ? (
            <label className="flex items-start gap-2 font-sans text-caption text-ordift-ink-muted sm:col-span-2">
              <input type="checkbox" name="allowStatusEmails" className="mt-0.5" />
              Allow automatic status emails to this client later (quotation ready, booking confirmed, files ready). Needs an email address. Leave unticked unless the client has agreed to receive them; they are off by default, and you can switch them on later from the enquiry.
            </label>
          ) : (
            <p className="sm:col-span-2 font-sans text-caption text-ordift-ink-muted">Automatic status emails to this client are off. An admin can switch them on later if the client agrees.</p>
          )}
          <SubmitButton pendingLabel="Saving…" className="min-h-11 px-5 rounded-full bg-ordift-navy-950 text-white font-sans text-body-small sm:col-span-2 justify-self-start">Record enquiry</SubmitButton>
        </ActionForm>
      </section>
    </div>
  );
}
