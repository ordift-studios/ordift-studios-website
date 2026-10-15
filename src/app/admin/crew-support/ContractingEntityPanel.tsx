"use client";

import { useActionState } from "react";
import { chooseContractingEntityAction, type ActionState } from "../organization/legal-entities/[entityId]/actions";

export type EntityOption = { entityId: string; name: string; eligible: boolean; blockers: string[] };

// Shows which legal entity contracts for this booking. A booking with no recorded entity is shown as such and is left exactly as it is.
export default function ContractingEntityPanel({ requestId, current, options, suggestionId, historical }: {
  requestId: string; current: { entityName: string; version: number; basis: string } | null; options: EntityOption[]; suggestionId: string | null; historical: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(chooseContractingEntityAction, null);
  return (
    <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
      <h2 className="font-serif font-medium text-body text-ordift-ink">Contracting legal entity</h2>
      {current ? (
        <p className="font-sans text-body-small text-ordift-ink"><strong>{current.entityName}</strong> contracts for this booking (recorded, version {current.version}) — <span className="text-ordift-ink-muted">{current.basis}</span></p>
      ) : (
        <p className="font-sans text-body-small text-ordift-ink-muted">{historical ? "No contracting entity is recorded. This booking was accepted or paid before entity selection existed; it is historical and is left exactly as it is." : "No contracting entity has been chosen yet. Choose one explicitly; it is never inferred from the client's location or currency."}</p>
      )}
      {!historical && (
        <form action={action} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input type="hidden" name="requestId" value={requestId} />
          <select name="entityId" required defaultValue={suggestionId && !current ? suggestionId : ""} className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small">
            <option value="" disabled>Choose the contracting entity…</option>
            {options.map((o) => <option key={o.entityId} value={o.entityId} disabled={!o.eligible}>{o.name}{o.eligible ? "" : ` — not available: ${o.blockers[0]}`}</option>)}
          </select>
          <input name="basis" required placeholder="Why this entity?" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
          <button type="submit" disabled={pending} className="justify-self-start font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">{pending ? "Saving…" : current ? "Record a change" : "Record contracting entity"}</button>
          {!pending && state?.ok === true && <p className="sm:col-span-2 font-sans text-caption text-green-700">Recorded. No quotation, invoice, agreement or payment was changed.</p>}
          {!pending && state?.ok === false && <p className="sm:col-span-2 font-sans text-caption text-red-700">{state.error}</p>}
        </form>
      )}
      <p className="font-sans text-caption text-ordift-ink-muted">Recording an entity here changes nothing else: no quotation, invoice, receipt, agreement or payment is regenerated or reassigned.</p>
    </section>
  );
}
