"use client";

import { useActionState } from "react";
import { acknowledgeOwnPolicyAction, type ActionState } from "./actions";

export interface PendingPolicyView {
  masterId: string;
  canonicalCode: string;
  title: string;
  documentVersionId: string;
  version: string;
}

function AcknowledgeForm({ documentVersionId }: { documentVersionId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(acknowledgeOwnPolicyAction, null);
  return (
    <form action={formAction}>
      <input type="hidden" name="documentVersionId" value={documentVersionId} />
      <button type="submit" disabled={pending} className="font-sans text-caption font-semibold px-3 py-1.5 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {pending ? "Recording…" : "I have read and acknowledge this policy"}
      </button>
      {!pending && state?.ok === false && <p className="font-sans text-caption text-red-700 mt-1">{state.error}</p>}
    </form>
  );
}

export function MyWorkspaceLanding({ pendingPolicies }: { pendingPolicies: PendingPolicyView[] }) {
  if (pendingPolicies.length === 0) {
    return <p className="font-sans text-body-small text-ordift-ink-muted">You have acknowledged every currently active controlled policy.</p>;
  }
  return (
    <ul className="space-y-3">
      {pendingPolicies.map((doc) => (
        <li key={doc.masterId} className="rounded-lg border border-ordift-gold-pressed/40 bg-ordift-gold-pressed/5 p-4 space-y-2">
          <p className="font-sans text-body-small font-medium text-ordift-ink">{doc.canonicalCode} — {doc.title} <span className="text-ordift-ink-muted font-normal">(v{doc.version})</span></p>
          <AcknowledgeForm documentVersionId={doc.documentVersionId} />
        </li>
      ))}
    </ul>
  );
}
