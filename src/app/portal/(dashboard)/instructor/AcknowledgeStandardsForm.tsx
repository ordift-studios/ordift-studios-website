"use client";

import { useActionState } from "react";
import { acknowledgeInstructorStandardsAction, type StandardsAckState } from "./standardsActions";

// The instructor's own acknowledgement: the exact version and hash they were shown travel with the form, so a changed text is refused instead of silently acknowledged.
export function AcknowledgeStandardsForm({ versionId, sha256, consentText }: { versionId: string; sha256: string; consentText: string }) {
  const [state, action, pending] = useActionState<StandardsAckState, FormData>(acknowledgeInstructorStandardsAction, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="versionId" value={versionId} />
      <input type="hidden" name="sha256" value={sha256} />
      <div>
        <label htmlFor="std-name" className="block font-sans text-caption text-ordift-ink-muted mb-1">Type your full name</label>
        <input id="std-name" name="typedFullName" required minLength={3} autoComplete="name" className="w-full max-w-sm rounded-lg border border-black/15 bg-white px-3 py-2 font-sans text-body-small text-ordift-ink" />
      </div>
      <label className="flex items-start gap-2 font-sans text-body-small text-ordift-ink"><input type="checkbox" name="consent" value="yes" className="mt-1" /> {consentText}</label>
      <button disabled={pending} className="min-h-9 rounded-lg bg-ordift-gold px-4 font-sans text-body-small font-medium text-ordift-navy-950 hover:bg-ordift-gold-hover disabled:opacity-60">{pending ? "Recording…" : "Acknowledge these standards"}</button>
      {state && <p role={state.ok ? "status" : "alert"} className={`font-sans text-body-small ${state.ok ? "text-green-800" : "text-red-800"}`}>{state.ok ? "Thank you. Your acknowledgement has been recorded." : state.error}</p>}
    </form>
  );
}
