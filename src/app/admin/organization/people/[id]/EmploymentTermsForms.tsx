"use client";

import { useActionState, useState } from "react";
import {
  recordInitialEmploymentTermsAction,
  recordEmploymentTransitionAction,
  type EmploymentTermsActionState,
} from "./actions";

// Task 2/16 consequential-action UX fix (2026-09-18) — ONE shared pair
// of forms, used by both the Full Profile page and the Internal Staff
// Onboarding Workspace (previously two independently-duplicated copies
// of the same JSX). Real pending/success/error feedback via
// useActionState, matching CreateAgreementDraftForm's established
// pattern — this is exactly the class of fix Task 16 asks for (the
// Lady onboarding double-click duplicate came from a consequential
// action with no such feedback).

export type EntityOption = { id: string; label: string };
export type JurisdictionOption = { id: string; name: string };
export type WorkPatternTypeOption = { value: string; label: string };

export const WORK_PATTERN_TYPE_OPTIONS: WorkPatternTypeOption[] = [
  { value: "fixed_schedule", label: "Standard / Fixed Schedule" },
  { value: "shift_roster", label: "Shift / Rostered" },
  { value: "flexible_executive", label: "Flexible Executive" },
];

const WEEKDAYS: { iso: number; short: string }[] = [
  { iso: 1, short: "Mon" },
  { iso: 2, short: "Tue" },
  { iso: 3, short: "Wed" },
  { iso: 4, short: "Thu" },
  { iso: 5, short: "Fri" },
  { iso: 6, short: "Sat" },
  { iso: 7, short: "Sun" },
];

function SubmitFeedback({ state, pending }: { state: EmploymentTermsActionState; pending: boolean }) {
  if (pending) return <p className="col-span-2 font-sans text-caption text-ordift-ink-muted">Saving…</p>;
  if (state?.ok === true) return <p className="col-span-2 font-sans text-caption text-green-700">Saved.</p>;
  if (state?.ok === false) return <p className="col-span-2 font-sans text-caption text-red-700">{state.error}</p>;
  return null;
}

// Task 6 (2026-09-18) — root cause of Task 7's Kelvin Calendar
// "Unconfigured" defect: classifyDate() (workingDayCalendar.ts) reads
// employment_terms_history.working_weekdays to resolve WORKING_DAY vs
// REST_DAY for a fixed_schedule/shift_roster person — that column
// already existed but no form anywhere ever collected it. Reused here
// as the ONE source of truth My Calendar, attendance expectations, and
// this same Employment Terms record all read from. Only shown for
// fixed_schedule/shift_roster — a flexible_executive genuinely has no
// fixed weekday pattern by design (classifyDate() already special-cases
// this), so this UI never asks for one, matching that same rule rather
// than fabricating a schedule that doesn't apply.
function WeekdayCheckboxes({ selected, onChange }: { selected: Set<number>; onChange: (next: Set<number>) => void }) {
  return (
    <div className="col-span-2">
      <p className="font-sans text-[0.65rem] uppercase tracking-wide text-ordift-ink-muted mb-1">Working Days</p>
      <div className="flex flex-wrap gap-1.5">
        {WEEKDAYS.map((d) => {
          const isSelected = selected.has(d.iso);
          return (
            <label key={d.iso} className={`px-2 py-1 rounded-md border font-sans text-caption cursor-pointer ${isSelected ? "bg-ordift-navy-950 text-white border-ordift-navy-950" : "border-black/15 text-ordift-ink"}`}>
              <input
                type="checkbox"
                name="workingWeekdays"
                value={d.iso}
                checked={isSelected}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(d.iso);
                  else next.delete(d.iso);
                  onChange(next);
                }}
                className="sr-only"
              />
              {d.short}
            </label>
          );
        })}
      </div>
    </div>
  );
}

export function RecordInitialEmploymentTermsForm({
  profileId,
  onboardingId,
  employingEntities,
  jurisdictions,
  workPatternTypes,
}: {
  profileId: string;
  onboardingId?: string;
  employingEntities: EntityOption[];
  jurisdictions: JurisdictionOption[];
  workPatternTypes: WorkPatternTypeOption[];
}) {
  const [state, formAction, pending] = useActionState<EmploymentTermsActionState, FormData>(recordInitialEmploymentTermsAction, null);
  const [workPatternType, setWorkPatternType] = useState("");
  const [workingWeekdays, setWorkingWeekdays] = useState<Set<number>>(new Set([1, 2, 3, 4, 5]));
  const showWeekdays = workPatternType === "fixed_schedule" || workPatternType === "shift_roster";

  return (
    <form action={formAction} className="grid grid-cols-2 gap-2 rounded-lg border border-ordift-gold-pressed/40 bg-ordift-gold-pressed/5 p-3">
      <p className="col-span-2 font-sans text-caption font-semibold text-ordift-ink">Record Initial Employment Terms (formal commencement)</p>
      <input type="hidden" name="profileId" value={profileId} />
      {onboardingId && <input type="hidden" name="onboardingId" value={onboardingId} />}
      <input type="date" name="effectiveFrom" required aria-label="Formal commencement date" className="col-span-2 rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
      <select name="employingEntityId" required defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption">
        <option value="" disabled>Employing entity…</option>
        {employingEntities.map((e) => (
          <option key={e.id} value={e.id}>{e.label}</option>
        ))}
      </select>
      <select name="employmentJurisdictionId" required defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption">
        <option value="" disabled>Employment jurisdiction…</option>
        {jurisdictions.map((j) => (
          <option key={j.id} value={j.id}>{j.name}</option>
        ))}
      </select>
      <input name="workLocation" required placeholder="Primary work location" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
      <select
        name="workPatternType"
        required
        value={workPatternType}
        onChange={(e) => setWorkPatternType(e.target.value)}
        className="rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption"
      >
        <option value="" disabled>Work pattern…</option>
        {workPatternTypes.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {showWeekdays && <WeekdayCheckboxes selected={workingWeekdays} onChange={setWorkingWeekdays} />}
      <input name="workPattern" required placeholder="Normal working hours (e.g. 08:00–17:00, 1h break)" className="col-span-2 rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
      <input name="basicSalary" type="number" step="0.01" min="0" required placeholder="Basic salary" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
      <input name="currency" required placeholder="Currency (e.g. GHS)" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
      <button type="submit" disabled={pending} aria-busy={pending} className="col-span-2 justify-self-start font-sans text-caption font-semibold px-3 py-1 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {pending ? "Recording…" : "Record Formal Commencement"}
      </button>
      <SubmitFeedback state={state} pending={pending} />
    </form>
  );
}

export function RecordEmploymentTransitionForm({
  profileId,
  onboardingId,
  employingEntities,
  jurisdictions,
  workPatternTypes,
  transitionTypes,
  heading = "Record Employment Transition",
  submitLabel = "Record Transition",
}: {
  profileId: string;
  onboardingId?: string;
  employingEntities: EntityOption[];
  jurisdictions: JurisdictionOption[];
  workPatternTypes: WorkPatternTypeOption[];
  transitionTypes: readonly string[];
  heading?: string;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState<EmploymentTermsActionState, FormData>(recordEmploymentTransitionAction, null);
  const [workPatternType, setWorkPatternType] = useState("");
  const [workingWeekdays, setWorkingWeekdays] = useState<Set<number>>(new Set());
  const showWeekdays = workPatternType === "fixed_schedule" || workPatternType === "shift_roster";

  return (
    <form action={formAction} className="grid grid-cols-2 gap-2">
      {heading && <p className="col-span-2 font-sans text-caption font-semibold text-ordift-ink">{heading}</p>}
      <input type="hidden" name="profileId" value={profileId} />
      {onboardingId && <input type="hidden" name="onboardingId" value={onboardingId} />}
      <select name="transitionType" required defaultValue="" className="col-span-2 rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption">
        <option value="" disabled>Transition type…</option>
        {transitionTypes.map((t) => (
          <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
        ))}
      </select>
      <input type="date" name="effectiveFrom" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
      <select name="employingEntityId" defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption">
        <option value="">Employing entity unchanged</option>
        {employingEntities.map((e) => (
          <option key={e.id} value={e.id}>{e.label}</option>
        ))}
      </select>
      <select name="employmentJurisdictionId" defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption">
        <option value="">Jurisdiction unchanged</option>
        {jurisdictions.map((j) => (
          <option key={j.id} value={j.id}>{j.name}</option>
        ))}
      </select>
      <input name="workLocation" placeholder="Work location (if changed)" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
      <select
        name="workPatternType"
        value={workPatternType}
        onChange={(e) => setWorkPatternType(e.target.value)}
        className="rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption"
      >
        <option value="">Work pattern unchanged</option>
        {workPatternTypes.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {showWeekdays && <WeekdayCheckboxes selected={workingWeekdays} onChange={setWorkingWeekdays} />}
      <input name="workPattern" placeholder="Normal working hours (if changed, e.g. 08:00–17:00, 1h break)" className="col-span-2 rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
      <input name="basicSalary" type="number" step="0.01" min="0" placeholder="Basic salary (if changed)" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
      <input name="currency" placeholder="Currency (if changed)" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
      <input name="notes" placeholder="Notes (optional)" className="col-span-2 rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
      <button type="submit" disabled={pending} aria-busy={pending} className="col-span-2 justify-self-start font-sans text-caption font-semibold px-3 py-1 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {pending ? "Saving…" : submitLabel}
      </button>
      <SubmitFeedback state={state} pending={pending} />
    </form>
  );
}
