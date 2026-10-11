"use client";

import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import { updateSettingsAction } from "../readinessAdminActions";

const INPUT = "w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small";
const LABEL = "font-sans text-caption text-ordift-ink-muted";

export default function ReadinessSettingsForm({ values }: { values: { firstReminderHours: number; readinessCheckHours: number; noResponseFlagHours: number; skipCheckIfReady: boolean } }) {
  return (
    <ActionForm action={updateSettingsAction} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1"><span className={LABEL}>First reminder — hours before the start</span><input type="number" name="firstReminderHours" min={3} max={336} required defaultValue={values.firstReminderHours} className={INPUT} /></label>
        <label className="flex flex-col gap-1"><span className={LABEL}>Readiness check — hours before the start</span><input type="number" name="readinessCheckHours" min={2} max={335} required defaultValue={values.readinessCheckHours} className={INPUT} /></label>
        <label className="flex flex-col gap-1"><span className={LABEL}>Unanswered flag — hours before the start</span><input type="number" name="noResponseFlagHours" min={1} max={168} required defaultValue={values.noResponseFlagHours} className={INPUT} /></label>
      </div>
      <label className="flex items-center gap-2 font-sans text-body-small text-ordift-ink"><input type="checkbox" name="skipCheckIfReady" defaultChecked={values.skipCheckIfReady} /> Skip the routine readiness check when the professional has already confirmed Ready for the current schedule</label>
      <SubmitButton pendingLabel="Saving…" className="rounded-md bg-ordift-navy-950 px-4 py-2 font-sans text-body-small font-semibold text-white">Save settings</SubmitButton>
    </ActionForm>
  );
}
