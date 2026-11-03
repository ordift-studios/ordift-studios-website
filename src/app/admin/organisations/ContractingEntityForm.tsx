"use client";

import { useState } from "react";
import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import { chooseOrdinaryContractingEntityAction } from "./contractingActions";

export type EntityOption = { entityId: string; name: string; eligible: boolean; blockers: string[] };

const FIELD = "rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small";

export type EntitySuggestion = { entityId: string; text: string; usable: boolean };

// No entity is preselected: the person chooses explicitly and says why. A market-based suggestion is shown as text with a button that only fills the choice in; the person must still
// give a reason and press Record, and nothing is saved by the suggestion itself.
export default function ContractingEntityForm({ subjectType, subjectId, options, suggestion = null }: { subjectType: "enquiry" | "quotation"; subjectId: string; options: EntityOption[]; suggestion?: EntitySuggestion | null }) {
  const [entityId, setEntityId] = useState("");
  return (
    <ActionForm action={chooseOrdinaryContractingEntityAction} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <input type="hidden" name="subjectType" value={subjectType} />
      <input type="hidden" name="subjectId" value={subjectId} />
      {suggestion && (
        <div role="note" className="sm:col-span-2 rounded-lg border border-black/15 bg-ordift-offwhite p-3 font-sans text-caption text-ordift-ink">
          <p>{suggestion.text}</p>
          {suggestion.usable && entityId !== suggestion.entityId && (
            <button type="button" onClick={() => setEntityId(suggestion.entityId)} className="mt-2 min-h-11 rounded-md border border-black/20 px-3 py-1 font-sans text-body-small font-semibold text-ordift-ink">Use this suggestion (you still confirm below)</button>
          )}
        </div>
      )}
      <select name="entityId" required value={entityId} onChange={(e) => setEntityId(e.target.value)} className={FIELD}>
        <option value="" disabled>Choose the contracting entity…</option>
        {options.map((o) => (
          <option key={o.entityId} value={o.entityId} disabled={!o.eligible}>
            {o.name}{o.eligible ? "" : ` — not available: ${o.blockers[0]}`}
          </option>
        ))}
      </select>
      <input name="basis" required minLength={5} placeholder="Why this entity?" className={FIELD} />
      <SubmitButton pendingLabel="Saving…" className="justify-self-start font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white">Record contracting entity</SubmitButton>
    </ActionForm>
  );
}
