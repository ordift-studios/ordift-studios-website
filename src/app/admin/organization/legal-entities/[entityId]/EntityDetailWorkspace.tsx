"use client";

import { useActionState } from "react";
import { recordSensitiveDetailsAction, uploadEntityDocumentAction, type ActionState } from "./actions";

export interface DocumentView {
  id: string;
  documentType: string;
  notes: string | null;
  uploadedAt: string;
}

function SensitiveDetailsForm({
  entityId,
  registrationNumber,
  taxIdentifier,
  registeredAddress,
}: {
  entityId: string;
  registrationNumber: string | null;
  taxIdentifier: string | null;
  registeredAddress: string | null;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(recordSensitiveDetailsAction, null);
  return (
    <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <input type="hidden" name="entityId" value={entityId} />
      <input name="registrationNumber" defaultValue={registrationNumber ?? ""} placeholder="Registration number" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <input name="taxIdentifier" defaultValue={taxIdentifier ?? ""} placeholder="Tax identifier" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <input name="registeredAddress" defaultValue={registeredAddress ?? ""} placeholder="Registered address" className="sm:col-span-2 rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <button type="submit" disabled={pending} className="sm:col-span-2 justify-self-start font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {pending ? "Saving…" : "Save Registration Details"}
      </button>
      {!pending && state?.ok === true && <p className="sm:col-span-2 font-sans text-caption text-green-700">Saved.</p>}
      {!pending && state?.ok === false && <p className="sm:col-span-2 font-sans text-caption text-red-700">{state.error}</p>}
    </form>
  );
}

function UploadDocumentForm({ entityId }: { entityId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(uploadEntityDocumentAction, null);
  return (
    <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <input type="hidden" name="entityId" value={entityId} />
      <input name="documentType" required placeholder="Document type (e.g. Business Registration Certificate)" className="sm:col-span-2 rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <input name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png" className="sm:col-span-2 font-sans text-body-small" />
      <input name="notes" placeholder="Notes (optional)" className="sm:col-span-2 rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <button type="submit" disabled={pending} className="sm:col-span-2 justify-self-start font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {pending ? "Uploading…" : "Upload Evidence Document"}
      </button>
      {!pending && state?.ok === false && <p className="sm:col-span-2 font-sans text-caption text-red-700">{state.error}</p>}
    </form>
  );
}

export function EntityDetailWorkspace({
  entityId,
  registrationNumber,
  taxIdentifier,
  registeredAddress,
  documents,
}: {
  entityId: string;
  registrationNumber: string | null;
  taxIdentifier: string | null;
  registeredAddress: string | null;
  documents: DocumentView[];
}) {
  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Registration Details (Super Admin only)</h2>
        <SensitiveDetailsForm entityId={entityId} registrationNumber={registrationNumber} taxIdentifier={taxIdentifier} registeredAddress={registeredAddress} />
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Evidence Documents (Super Admin only)</h2>
        {documents.length > 0 ? (
          <ul className="space-y-1">
            {documents.map((d) => (
              <li key={d.id} className="font-sans text-caption text-ordift-ink-muted">
                · {d.documentType} — uploaded {new Date(d.uploadedAt).toLocaleDateString()}{d.notes ? ` — "${d.notes}"` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-sans text-body-small text-ordift-ink-muted">No evidence documents on file yet.</p>
        )}
        <UploadDocumentForm entityId={entityId} />
      </section>
    </div>
  );
}
