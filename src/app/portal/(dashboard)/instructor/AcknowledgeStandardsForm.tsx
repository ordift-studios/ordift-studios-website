"use client";

import { useRestoringActionState } from "@/components/admin/useRestoringActionState";
import { acknowledgeInstructorStandardsAction, type StandardsAckState } from "./standardsActions";

// The instructor's own acknowledgement: the exact version and hash they were shown travel with the form, so a changed text is refused instead of silently acknowledged.
export function AcknowledgeStandardsForm({ versionId, sha256, consentText }: { versionId: string; sha256: string; consentText: string }) {
  // A refusal (for example an unticked box) keeps what the person typed instead of wiping the form.
  const [state, action, pending, formRef] = useRestoringActionState<StandardsAckState>(acknowledgeInstructorStandardsAction, null);
  return (
    <form ref={formRef} action={action} className="space-y-3">
      <input type="hidden" name="versionId" value={versionId} />
      <input type="hidden" name="sha256" value={sha256} />
      <div>
        <label htmlFor="std-name" className="block font-sans text-caption text-ordift-ink-muted mb-1">Type your full name</label>
        <input id="std-name" name="typedFullName" required minLength={3} autoComplete="name" autoCapitalize="words" aria-describedby="std-name-hint" className="min-h-11 w-full max-w-sm rounded-lg border border-black/25 bg-white px-3 py-2 font-sans text-base text-ordift-ink" />
        <p id="std-name-hint" className="mt-1 font-sans text-caption text-ordift-ink-muted">Type your full name exactly as you would sign it.</p>
      </div>
      <label className="flex items-start gap-3 py-1 font-sans text-body-small text-ordift-ink"><input type="checkbox" name="consent" value="yes" required className="mt-1 h-5 w-5 shrink-0" /> <span>{consentText}</span></label>
      <button disabled={pending} className="min-h-11 w-full sm:w-auto rounded-lg bg-ordift-gold px-5 font-sans text-body-small font-semibold text-ordift-navy-950 hover:bg-ordift-gold-hover disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">{pending ? "Recording…" : "Acknowledge these standards"}</button>
      {state && !state.ok && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 font-sans text-body-small text-red-900">{state.error}</p>}
    </form>
  );
}
