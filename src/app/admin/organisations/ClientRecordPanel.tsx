import Link from "next/link";
import { getRecordLinkContext, listContacts, type RecordSubject } from "@/lib/directory/directory";
import { listOrganisations } from "@/lib/organisations/registry";
import { createContactFromRecordAction, linkRecordAction, unlinkRecordAction } from "./directoryActions";
import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import ConfirmSubmitButton from "@/components/admin/ConfirmSubmitButton";
import { BUTTON, BUTTON_QUIET, FIELD, strengthLabel } from "./ui";

// "Client record" panel for an enquiry or quotation: which directory contact and organisation it is linked to, the suggestions, and the controls a
// Super Admin uses to link, create from this record, or unlink. Rendered only when the caller is authorised (getRecordLinkContext returns null
// otherwise). Linking changes nothing else: the stage, quotation status, amounts, legal entity and payment market are shown here for reference only.
export default async function ClientRecordPanel({ userId, subject }: { userId: string; subject: RecordSubject }) {
  const context = await getRecordLinkContext(userId, subject);
  if (!context) return null;
  const [contacts, organisations] = await Promise.all([listContacts(userId), listOrganisations(userId)]);
  const linked = Boolean(context.current.contactId || context.current.organisationId);
  const likely = context.contactSuggestions.some((s) => s.strength === "same_person" || s.strength === "likely");

  return (
    <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Client record</h2>
        <Link href="/admin/organisations/contacts" className="font-sans text-caption text-ordift-ink underline underline-offset-4">Open the directory →</Link>
      </div>

      <div className="space-y-1 font-sans text-body-small text-ordift-ink">
        <p>
          Contact:{" "}
          {context.current.contactId ? <Link href={`/admin/organisations/contacts/${context.current.contactId}`} className="underline underline-offset-4">{context.current.contactName}</Link> : <span className="text-ordift-ink-muted">not linked</span>}
        </p>
        <p>
          Client organisation:{" "}
          {context.current.organisationId ? <Link href={`/admin/organisations/${context.current.organisationId}`} className="underline underline-offset-4">{context.current.organisationName}</Link> : <span className="text-ordift-ink-muted">not linked (an individual client needs none)</span>}
        </p>
        <p className="font-sans text-caption text-ordift-ink-muted">
          Legal entity: {context.contractingEntity ?? "none chosen yet"} · Payment market: {context.paymentCountry === "GH" ? "Ghana" : context.paymentCountry === "QA" ? "Qatar" : "not set"} (read from this record; the directory never sets them).
        </p>
      </div>

      {context.sharedAddressNotes.map((n) => (
        <p key={n} className="font-sans text-caption text-ordift-ink-muted">{n} It is not used to match people.</p>
      ))}

      {!linked && (context.contactSuggestions.length > 0 || context.organisationSuggestions.length > 0) ? (
        <div className="space-y-2">
          <p className="font-sans text-body-small font-medium text-ordift-ink">Suggestions (you decide; nothing is linked automatically)</p>
          <ul className="space-y-2">
            {context.contactSuggestions.map((s) => (
              <li key={s.contactId} className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-sans text-body-small text-ordift-ink">{s.fullName}{s.organisationName ? ` (${s.organisationName})` : ""} · {strengthLabel(s.strength)}</span>
                <ActionForm action={linkRecordAction}>
                  <input type="hidden" name="subjectType" value={subject.type} />
                  <input type="hidden" name="subjectId" value={subject.id} />
                  <input type="hidden" name="contactId" value={s.contactId} />
                  <ConfirmSubmitButton confirmMessage={`Link this ${subject.type} to ${s.fullName}? You are saying it is the same person.`} pendingLabel="Linking…" className={BUTTON_QUIET}>Link to this contact</ConfirmSubmitButton>
                </ActionForm>
              </li>
            ))}
            {context.organisationSuggestions.map((s) => (
              <li key={s.organisationId} className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-sans text-body-small text-ordift-ink">{s.name} · {strengthLabel(s.strength)}</span>
                <ActionForm action={linkRecordAction}>
                  <input type="hidden" name="subjectType" value={subject.type} />
                  <input type="hidden" name="subjectId" value={subject.id} />
                  <input type="hidden" name="organisationId" value={s.organisationId} />
                  <ConfirmSubmitButton confirmMessage={`Link this ${subject.type} to ${s.name} as the client organisation?`} pendingLabel="Linking…" className={BUTTON_QUIET}>Link to this organisation</ConfirmSubmitButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <details className="rounded-lg border border-black/10 px-3 py-2" open={!linked}>
        <summary className="cursor-pointer font-sans text-body-small text-ordift-ink">{linked ? "Change the link" : "Choose a contact and organisation"}</summary>
        <ActionForm action={linkRecordAction} className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input type="hidden" name="subjectType" value={subject.type} />
          <input type="hidden" name="subjectId" value={subject.id} />
          <select name="contactId" defaultValue={context.current.contactId ?? ""} className={FIELD}>
            <option value="">No contact</option>
            {contacts.filter((c) => c.status === "active").map((c) => (
              <option key={c.id} value={c.id}>{c.fullName}{c.organisationName ? ` (${c.organisationName})` : ""}</option>
            ))}
          </select>
          <select name="organisationId" defaultValue={context.current.organisationId ?? ""} className={FIELD}>
            <option value="">No client organisation</option>
            {organisations.filter((o) => o.status === "active").map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          <SubmitButton pendingLabel="Saving…" className={`${BUTTON} sm:col-span-2`}>Save link</SubmitButton>
        </ActionForm>
      </details>

      {!context.current.contactId ? (
        <details className="rounded-lg border border-black/10 px-3 py-2">
          <summary className="cursor-pointer font-sans text-body-small text-ordift-ink">Create a contact from this {subject.type}</summary>
          <p className="mt-2 font-sans text-caption text-ordift-ink-muted">Uses the name, email and phone already on this record. If a contact already has the same personal email address, you are told and nothing is created.</p>
          <ActionForm action={createContactFromRecordAction} className="mt-3 space-y-3">
            <input type="hidden" name="subjectType" value={subject.type} />
            <input type="hidden" name="subjectId" value={subject.id} />
            <select name="organisationId" defaultValue={context.current.organisationId ?? ""} className={`${FIELD} w-full`}>
              <option value="">No organisation (individual client)</option>
              {organisations.filter((o) => o.status === "active").map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
            {likely ? (
              <label className="flex items-start gap-2 font-sans text-caption text-ordift-ink-muted">
                <input type="checkbox" name="confirmedDistinct" className="mt-0.5" />
                A suggested contact above looks like the same person. Tick only if this is a different person.
              </label>
            ) : null}
            <SubmitButton pendingLabel="Creating…" className={BUTTON}>Create contact and link</SubmitButton>
          </ActionForm>
        </details>
      ) : null}

      {linked ? (
        <ActionForm action={unlinkRecordAction}>
          <input type="hidden" name="subjectType" value={subject.type} />
          <input type="hidden" name="subjectId" value={subject.id} />
          <ConfirmSubmitButton confirmMessage="Remove the directory link from this record? The contact and organisation are not deleted." pendingLabel="Removing…" className={BUTTON_QUIET}>Remove link</ConfirmSubmitButton>
        </ActionForm>
      ) : null}
    </section>
  );
}
