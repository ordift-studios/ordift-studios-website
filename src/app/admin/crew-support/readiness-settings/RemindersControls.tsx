"use client";

import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import { REMINDER_MODES, REMINDER_MODE_LABELS, type ReminderMode } from "@/lib/crewSupport/readinessReminderRules";
import { clearSuppressionAction, runCheckNowAction, setRemindersModeAction, updateLateCapsAction } from "../readinessAdminActions";

const INPUT = "w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small";
const LABEL = "font-sans text-caption text-ordift-ink-muted";
const BTN = "rounded-md bg-ordift-navy-950 px-4 py-2 font-sans text-body-small font-semibold text-white";

export function ModeForm({ current }: { current: ReminderMode }) {
  return (
    <ActionForm action={setRemindersModeAction} className="space-y-3">
      <fieldset className="space-y-2">
        <legend className={LABEL}>Reminder mode — currently <strong className="text-ordift-ink">{REMINDER_MODE_LABELS[current]}</strong></legend>
        {REMINDER_MODES.map((m) => (
          <label key={m} className="flex items-start gap-2 font-sans text-body-small text-ordift-ink"><input type="radio" name="mode" value={m} defaultChecked={m === current} className="mt-1" /> {REMINDER_MODE_LABELS[m]}</label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1"><span className={LABEL}>Why are you changing it? (kept in the audit log)</span><input name="reason" required minLength={5} className={INPUT} /></label>
      <SubmitButton pendingLabel="Saving…" className={BTN}>Change mode</SubmitButton>
    </ActionForm>
  );
}

export function LateCapsForm({ first, check, escalation }: { first: number; check: number; escalation: number }) {
  return (
    <ActionForm action={updateLateCapsAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1"><span className={LABEL}>First reminder: send at most this many hours late</span><input type="number" name="first" min={1} max={48} required defaultValue={first} className={INPUT} /></label>
        <label className="flex flex-col gap-1"><span className={LABEL}>Follow-up: at most this many hours late</span><input type="number" name="check" min={1} max={48} required defaultValue={check} className={INPUT} /></label>
        <label className="flex flex-col gap-1"><span className={LABEL}>Escalation: at most this many hours late</span><input type="number" name="escalation" min={1} max={48} required defaultValue={escalation} className={INPUT} /></label>
      </div>
      <p className={LABEL}>If a check runs later than this, the reminder is skipped and recorded as “too late” rather than sent stale.</p>
      <SubmitButton pendingLabel="Saving…" className={BTN}>Save limits</SubmitButton>
    </ActionForm>
  );
}

export function RunCheckForm() {
  return (
    <ActionForm action={runCheckNowAction} className="flex items-center gap-3">
      <SubmitButton pendingLabel="Checking…" className={BTN}>Run check now</SubmitButton>
      <span className={LABEL}>Safe to repeat: the same reminder can never be sent twice.</span>
    </ActionForm>
  );
}

export function ClearSuppressionForm({ profileId }: { profileId: string }) {
  return (
    <ActionForm action={clearSuppressionAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="profileId" value={profileId} />
      <label className="flex flex-col gap-1"><span className={LABEL}>Why is it safe to resume?</span><input name="reason" required minLength={5} className={INPUT} /></label>
      <SubmitButton pendingLabel="Saving…" className="rounded-md border border-black/20 px-3 py-1.5 font-sans text-caption font-semibold">Resume reminders</SubmitButton>
    </ActionForm>
  );
}
