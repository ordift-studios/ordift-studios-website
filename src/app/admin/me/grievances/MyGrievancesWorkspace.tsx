"use client";

import { useActionState } from "react";
import { submitOwnGrievanceAction, submitOwnSpeakUpReportAction, submitOwnAppealAction, type ActionState } from "./actions";

export interface OwnGrievanceView {
  id: string;
  grievanceType: string;
  description: string;
  status: string;
  submittedAt: string;
  resolutionNotes: string | null;
}

export interface OwnAppealView {
  id: string;
  appealedDecisionType: string;
  appealedDecisionReference: string;
  status: string;
  submittedAt: string;
}

function GrievanceForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(submitOwnGrievanceAction, null);
  return (
    <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <select name="grievanceType" required defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
        <option value="" disabled>Grievance type…</option>
        <option value="informal">Informal</option>
        <option value="formal">Formal</option>
      </select>
      <label className="flex items-center gap-1 font-sans text-caption text-ordift-ink-muted">
        <input type="checkbox" name="bypassedManager" value="true" /> Bypass my manager (raise directly to HR)
      </label>
      <textarea name="description" required placeholder="Describe your grievance" className="sm:col-span-2 rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" rows={3} />
      <button type="submit" disabled={pending} className="sm:col-span-2 justify-self-start font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {pending ? "Submitting…" : "Submit Grievance"}
      </button>
      {!pending && state?.ok === true && <p className="sm:col-span-2 font-sans text-caption text-green-700">Submitted.</p>}
      {!pending && state?.ok === false && <p className="sm:col-span-2 font-sans text-caption text-red-700">{state.error}</p>}
    </form>
  );
}

function SpeakUpForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(submitOwnSpeakUpReportAction, null);
  return (
    <form action={formAction} className="space-y-2">
      <textarea name="description" required placeholder="Describe your concern" className="w-full rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" rows={3} />
      <label className="flex items-center gap-1 font-sans text-caption text-ordift-ink-muted">
        <input type="checkbox" name="stayAnonymous" value="true" defaultChecked /> Submit anonymously
      </label>
      <button type="submit" disabled={pending} className="font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {pending ? "Submitting…" : "Submit Speak-Up Report"}
      </button>
      {!pending && state?.ok === true && <p className="font-sans text-caption text-green-700">Submitted. This channel is confidential — you will not see a history of it here.</p>}
      {!pending && state?.ok === false && <p className="font-sans text-caption text-red-700">{state.error}</p>}
    </form>
  );
}

function AppealForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(submitOwnAppealAction, null);
  return (
    <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <input name="appealedDecisionType" required placeholder="What decision (e.g. disciplinary_action)" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <input name="appealedDecisionReference" required placeholder="Reference ID of that decision" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <input type="date" name="decisionDate" aria-label="Date of the original decision" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <textarea name="reason" required placeholder="Reason for your appeal" className="sm:col-span-2 rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" rows={3} />
      <button type="submit" disabled={pending} className="sm:col-span-2 justify-self-start font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {pending ? "Filing…" : "File Appeal"}
      </button>
      {!pending && state?.ok === true && <p className="sm:col-span-2 font-sans text-caption text-green-700">Filed.</p>}
      {!pending && state?.ok === false && <p className="sm:col-span-2 font-sans text-caption text-red-700">{state.error}</p>}
    </form>
  );
}

export function MyGrievancesWorkspace({ grievances, appeals }: { grievances: OwnGrievanceView[]; appeals: OwnAppealView[] }) {
  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">My Grievances</h2>
        {grievances.length > 0 ? (
          <ul className="space-y-2">
            {grievances.map((g) => (
              <li key={g.id} className="font-sans text-caption text-ordift-ink-muted">
                · {g.grievanceType} — &ldquo;{g.description}&rdquo; — {g.status.replace(/_/g, " ")} · {new Date(g.submittedAt).toLocaleDateString()}
                {g.resolutionNotes && <span> — &ldquo;{g.resolutionNotes}&rdquo;</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-sans text-body-small text-ordift-ink-muted">No grievances submitted yet.</p>
        )}
        <GrievanceForm />
      </section>

      <section className="rounded-xl border border-red-900/20 bg-red-50/30 p-6 space-y-3">
        <div>
          <h2 className="font-serif font-medium text-body text-ordift-ink">Speak-Up (Confidential Channel)</h2>
          <p className="font-sans text-caption text-ordift-ink-muted mt-1">
            Deliberately separate from Grievances. You may report anonymously, and non-retaliation applies. This channel is
            admin-read-only — you will not see a history of your own reports here.
          </p>
        </div>
        <SpeakUpForm />
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">My Appeals</h2>
        {appeals.length > 0 ? (
          <ul className="space-y-2">
            {appeals.map((a) => (
              <li key={a.id} className="font-sans text-caption text-ordift-ink-muted">
                · {a.appealedDecisionType.replace(/_/g, " ")} ({a.appealedDecisionReference}) — {a.status.replace(/_/g, " ")} · {new Date(a.submittedAt).toLocaleDateString()}
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-sans text-body-small text-ordift-ink-muted">No appeals filed yet.</p>
        )}
        <AppealForm />
      </section>
    </div>
  );
}
