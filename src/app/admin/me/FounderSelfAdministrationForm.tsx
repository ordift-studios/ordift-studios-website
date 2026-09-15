"use client";

import { useActionState, useState } from "react";
import { recordOwnFounderEmploymentTermsAction, type ActionState } from "./actions";
import type { EmployingEntity } from "@/lib/organization/legalEntities";

export function FounderSelfAdministrationForm({ employingEntities }: { employingEntities: EmployingEntity[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(recordOwnFounderEmploymentTermsAction, null);
  const [entityId, setEntityId] = useState(employingEntities[0]?.id ?? "");
  const selectedEntity = employingEntities.find((e) => e.id === entityId) ?? null;

  return (
    <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <input type="hidden" name="employmentJurisdictionId" value={selectedEntity?.jurisdictionId ?? ""} />
      <select
        name="employingEntityId"
        value={entityId}
        onChange={(e) => setEntityId(e.target.value)}
        className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small"
      >
        {employingEntities.map((e) => (
          <option key={e.id} value={e.id}>
            {e.legalName ?? e.name} {e.jurisdictionName ? `(${e.jurisdictionName})` : ""}
          </option>
        ))}
      </select>
      <input name="workLocation" required placeholder="Work location (e.g. Accra, Ghana)" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <label className="flex flex-col gap-1 font-sans text-caption text-ordift-ink-muted">
        Commencement date
        <input name="effectiveFrom" type="date" required className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small text-ordift-ink" />
      </label>
      <input name="workPattern" placeholder="Working pattern description (e.g. Flexible — weekdays, evenings, and weekends as required)" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <label className="flex flex-col gap-1 font-sans text-caption text-ordift-ink-muted">
        Work pattern classification
        <select name="workPatternType" defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small text-ordift-ink">
          <option value="">Not yet classified</option>
          <option value="fixed_schedule">Standard / Fixed Schedule</option>
          <option value="shift_roster">Shift / Rostered</option>
          <option value="flexible_executive">Flexible Executive</option>
        </select>
      </label>
      <input name="basicSalary" type="number" step="0.01" min="0" placeholder="Basic salary (optional)" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <input name="currency" placeholder="Currency (e.g. GHS)" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <label className="sm:col-span-2 flex flex-col gap-1 font-sans text-caption text-ordift-ink-muted">
        Founder/Director compensation classification
        <select name="compensationStatus" defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small text-ordift-ink">
          <option value="">Not yet considered</option>
          <option value="not_yet_determined">Decision deliberately deferred (pending legal/policy determination)</option>
        </select>
        <span>This does not set a salary or make any legal claim about Director vs employee status — it only records that a classification decision is outstanding.</span>
      </label>
      <button
        type="submit"
        disabled={pending || !entityId}
        className="sm:col-span-2 justify-self-start font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50"
      >
        {pending ? "Saving…" : "Record My Own Employment Terms (Self-Administered)"}
      </button>
      {!pending && state?.ok === true && <p className="sm:col-span-2 font-sans text-caption text-green-700">Recorded.</p>}
      {!pending && state?.ok === false && <p className="sm:col-span-2 font-sans text-caption text-red-700">{state.error}</p>}
    </form>
  );
}
