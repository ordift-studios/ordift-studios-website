"use client";

import { useActionState } from "react";
import { createFounderDirectHireAction, type FounderDirectHireState } from "./actions";

type PersonOption = { id: string; label: string };
type NameOption = { id: string; name: string };
type GradeOption = { id: string; code: string; name: string };

// UX/idempotency fix (2026-09-15) — extracted from a plain inline
// Server-Component form (page.tsx) into its own Client Component so
// useActionState can give real pending/success/error feedback. Root
// cause of a real Production incident: the prior plain <form
// action={...}> gave NO feedback of any kind (no disabled state while
// submitting, no success confirmation, errors only logged to the
// server console) — a slow response looked identical to nothing
// happening, and a resubmission silently created a second, duplicate,
// already-approved Founder Direct Hire requisition for the same
// person. The server-side duplicate guard now in
// createRecruitmentRequisition() is the real fix; this pending/error
// UI is what makes a human never need to guess whether it worked.
export function FounderDirectHireForm({
  people,
  positions,
  departments,
  grades,
  engagementTypes,
  employingEntities,
  employmentJurisdictions,
}: {
  people: PersonOption[];
  positions: NameOption[];
  departments: NameOption[];
  grades: GradeOption[];
  engagementTypes: NameOption[];
  employingEntities: NameOption[];
  employmentJurisdictions: NameOption[];
}) {
  const [state, formAction, pending] = useActionState<FounderDirectHireState, FormData>(createFounderDirectHireAction, null);

  return (
    <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <select name="directHireProfileId" required defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small sm:col-span-2">
        <option value="" disabled>Person being hired…</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>{p.label}</option>
        ))}
      </select>
      <input type="text" name="title" placeholder="Requisition title (e.g. Client Engagement Representative)" required className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small sm:col-span-2" />
      <select name="requestedPositionId" defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
        <option value="">Position (optional)…</option>
        {positions.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <select name="departmentId" defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
        <option value="">Department (optional)…</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>
      <select name="gradeId" defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
        <option value="">Grade (optional)…</option>
        {grades.map((g) => (
          <option key={g.id} value={g.id}>{g.code} — {g.name}</option>
        ))}
      </select>
      <select name="engagementTypeId" defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
        <option value="">Engagement Type (optional)…</option>
        {engagementTypes.map((e) => (
          <option key={e.id} value={e.id}>{e.name}</option>
        ))}
      </select>
      <select name="employingEntityId" defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
        <option value="">Employing Entity — leave unset if undecided…</option>
        {employingEntities.map((e) => (
          <option key={e.id} value={e.id}>{e.name}</option>
        ))}
      </select>
      <select name="employmentJurisdictionId" required defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
        <option value="" disabled>Employment Jurisdiction…</option>
        {employmentJurisdictions.map((j) => (
          <option key={j.id} value={j.id}>{j.name}</option>
        ))}
      </select>
      <input type="text" name="workLocation" placeholder="Work location (optional, free text)" className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
      <input type="date" name="preferredStartDate" className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
      <textarea name="justification" placeholder="Justification (optional)" className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small sm:col-span-2" />
      <button type="submit" disabled={pending} className="sm:col-span-2 justify-self-start font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-gold-pressed text-ordift-navy-950 disabled:opacity-50">
        {pending ? "Creating & Approving…" : "Create & Approve Founder Direct Hire"}
      </button>
      {!pending && state?.ok === true && <p className="sm:col-span-2 font-sans text-caption text-green-700">Requisition created and approved.</p>}
      {!pending && state?.ok === false && <p className="sm:col-span-2 font-sans text-caption text-red-700">{state.error}</p>}
    </form>
  );
}
