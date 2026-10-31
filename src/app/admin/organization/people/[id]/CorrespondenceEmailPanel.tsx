import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import { ContactEmailLines } from "../../ContactEmailLines";
import { CORRESPONDENCE_SOURCES, CORRESPONDENCE_SOURCE_LABELS, type ContactEmailsView } from "@/lib/organization/correspondenceEmail";
import { setCorrespondenceEmailAction } from "./actions";

// People management: the two emails side by side, and the control to record, change or clear the PREFERRED CORRESPONDENCE email. The account (login) email is shown
// read-only and has no control anywhere in this feature. Rendered only for viewers authorized by loadContactEmailsForViewer; the action re-checks authority itself.
export function CorrespondenceEmailPanel({ profileId, view }: { profileId: string; view: ContactEmailsView }) {
  return (
    <div className="space-y-3">
      <ContactEmailLines view={view} />
      {view.available ? (
        <details className="rounded-lg border border-black/10 bg-white p-3">
          <summary className="cursor-pointer font-sans text-caption font-semibold text-ordift-ink">{view.preferred ? "Change or clear the preferred correspondence email" : "Record a preferred correspondence email"}</summary>
          <ActionForm action={setCorrespondenceEmailAction} className="mt-3 space-y-3">
            <input type="hidden" name="profileId" value={profileId} />
            <p className="font-sans text-caption text-ordift-ink-muted">This never changes the account email. Login, password reset and signing links always use the account email.</p>
            <label className="block font-sans text-caption text-ordift-ink" htmlFor={`ce-email-${profileId}`}>Preferred correspondence email
              <input id={`ce-email-${profileId}`} name="email" type="email" autoComplete="off" maxLength={254} defaultValue={view.preferred?.email ?? ""} className="mt-1 block w-full rounded-md border border-black/15 px-2 py-1.5 font-sans text-body-small" />
            </label>
            <label className="block font-sans text-caption text-ordift-ink" htmlFor={`ce-source-${profileId}`}>How was this requested?
              <select id={`ce-source-${profileId}`} name="source" defaultValue="person_request" className="mt-1 block w-full rounded-md border border-black/15 px-2 py-1.5 font-sans text-body-small">
                {CORRESPONDENCE_SOURCES.map((s) => <option key={s} value={s}>{CORRESPONDENCE_SOURCE_LABELS[s]}</option>)}
              </select>
            </label>
            <label className="block font-sans text-caption text-ordift-ink" htmlFor={`ce-evidence-${profileId}`}>Evidence reference (how the request was made and checked)
              <textarea id={`ce-evidence-${profileId}`} name="evidenceNote" rows={2} maxLength={500} required className="mt-1 block w-full rounded-md border border-black/15 px-2 py-1.5 font-sans text-body-small" />
            </label>
            <p className="font-sans text-caption text-ordift-ink-muted">Describe the evidence; do not paste an email address or a phone number. Only authorized administrators can see this note.</p>
            <div className="flex flex-wrap gap-2">
              <SubmitButton name="intent" value="save" pendingLabel="Saving…" className="font-sans text-caption font-semibold px-3 py-1.5 rounded-md bg-ordift-navy-950 text-white">Save preferred email</SubmitButton>
              {view.preferred && <SubmitButton name="intent" value="clear" pendingLabel="Clearing…" className="font-sans text-caption font-semibold px-3 py-1.5 rounded-md border border-black/15 text-ordift-ink">Clear (use the account email)</SubmitButton>}
            </div>
          </ActionForm>
        </details>
      ) : (
        <p className="font-sans text-caption text-ordift-ink-muted">Recording a preferred correspondence email is not available yet.</p>
      )}
      {view.history.length > 0 && (
        <details>
          <summary className="cursor-pointer font-sans text-caption text-ordift-ink-muted">History ({view.history.length})</summary>
          <ul className="mt-2 space-y-1">
            {view.history.map((h) => (
              <li key={h.id} className="font-sans text-caption text-ordift-ink-muted">
                {h.recordedAt.slice(0, 10)} · {h.action === "cleared" ? "Cleared" : h.action === "changed" ? "Changed to" : "Set to"} {h.maskedEmail ?? "—"} · {h.sourceLabel}{h.recordedByName ? ` · ${h.recordedByName}` : ""} · {h.evidenceNote}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
