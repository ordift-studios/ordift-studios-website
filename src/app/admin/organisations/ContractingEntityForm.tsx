"use client";

import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import { chooseOrdinaryContractingEntityAction } from "./contractingActions";

export type EntityOption = { entityId: string; name: string; eligible: boolean; blockers: string[] };

const FIELD = "rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small";

// No entity is preselected: the person chooses explicitly and says why.
export default function ContractingEntityForm({ subjectType, subjectId, options }: { subjectType: "enquiry" | "quotation"; subjectId: string; options: EntityOption[] }) {
  return (
    <ActionForm action={chooseOrdinaryContractingEntityAction} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <input type="hidden" name="subjectType" value={subjectType} />
      <input type="hidden" name="subjectId" value={subjectId} />
      <select name="entityId" required defaultValue="" className={FIELD}>
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
