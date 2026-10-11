import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import {
  CONCERN_AREAS, ISSUE_STATUS_LABELS, NOTICE_METHOD_LABELS, NOTICE_METHODS, READINESS_SHORT_LABELS, READINESS_STATE_LABELS, SELF_ISSUE_MESSAGE,
  independentOfAssignee, managementIssueActions, type IssueAction, type IssueStatus, type Party, type ReadinessStatus,
} from "@/lib/crewSupport/readinessRules";
import { formatInZone } from "@/lib/crewSupport/schedule";
import type { AdminReadinessView } from "@/lib/crewSupport/readiness";
import type { ScheduleChangeView } from "@/lib/crewSupport/reschedule";
import { assignFollowUpAction, disableAction, enrolAction, manageIssueAction, postIssueMessageAction, recordNoticeAction, rescheduleAction, setAreaLabelAction, setManagerAction, setTimezoneAction } from "./readinessAdminActions";
import { DELIVERY_STAGE_LABELS, REMINDER_KIND_LABELS, SKIP_REASON_LABELS, type DeliveryStage, type ReminderKind, type SkipReason } from "@/lib/crewSupport/readinessReminderRules";

export type ReadinessSlotData = { engagementId: string; label: string; assigneeId: string | null; view: AdminReadinessView; actualDates: string[] };

const INPUT = "w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small";
const LABEL = "font-sans text-caption text-ordift-ink-muted";
const BTN = "rounded-md px-3 py-1.5 font-sans text-caption font-semibold";
const ACTION_LABEL: Record<IssueAction, string> = { acknowledge: "Acknowledge", start_action: "Action in progress", request_confirmation: "Ask professional to confirm", resolve: "Resolve & close", reopen: "Reopen" };
const STATE_TONE: Record<string, string> = { ready: "border-green-200 bg-green-50 text-green-900", need_assistance: "border-blue-200 bg-blue-50 text-blue-900", not_ready: "border-red-200 bg-red-50 text-red-900", not_confirmed: "border-amber-200 bg-amber-50 text-amber-900", stale: "border-amber-200 bg-amber-50 text-amber-900" };

const fmt = (iso: string, tz: string | null) => (tz ? formatInZone(Date.parse(iso), tz) : new Date(iso).toLocaleString());
const sched = (s: Record<string, string | null>) => `${s.start_date === s.end_date ? s.start_date : `${s.start_date} → ${s.end_date}`}${s.call_time ? `, call ${s.call_time}` : ""}${s.finish_time ? `, finish ${s.finish_time}` : ""}${s.event_timezone ? ` (${s.event_timezone})` : ""}`;

function NoticeRows({ parties, tz }: { parties: Party[]; tz: string | null }) {
  return (
    <fieldset className="space-y-3 rounded-lg border border-black/10 p-3">
      <legend className={LABEL}>Who have you told? (Ordift sends nothing — record your own communication{tz ? `; times are in ${tz}` : ""})</legend>
      <input type="hidden" name="partyCount" value={parties.length} />
      {parties.map((p, i) => (
        <div key={`${p.kind}-${p.profileId ?? "client"}`} className="grid gap-2 sm:grid-cols-5 sm:items-end">
          <p className="font-sans text-body-small text-ordift-ink sm:col-span-1">{p.label}</p>
          <label className="flex flex-col gap-1"><span className={LABEL}>Told yet?</span>
            <select name={`informed_${i}`} defaultValue="no" className={INPUT}><option value="no">Not yet</option><option value="yes">Yes, told</option></select></label>
          <label className="flex flex-col gap-1"><span className={LABEL}>How</span>
            <select name={`method_${i}`} defaultValue="" className={INPUT}><option value="">—</option>{NOTICE_METHODS.map((m) => <option key={m} value={m}>{NOTICE_METHOD_LABELS[m]}</option>)}</select></label>
          <label className="flex flex-col gap-1"><span className={LABEL}>When</span><input type="datetime-local" name={`at_${i}`} className={INPUT} /></label>
          <label className="flex flex-col gap-1"><span className={LABEL}>Note (optional)</span><input name={`note_${i}`} maxLength={500} className={INPUT} /></label>
        </div>
      ))}
    </fieldset>
  );
}

function ChangeHistory({ requestId, changes, canManage, tz }: { requestId: string; changes: ScheduleChangeView[]; canManage: boolean; tz: string | null }) {
  if (changes.length === 0) return <p className="font-sans text-caption text-ordift-ink-muted">Never rescheduled.</p>;
  return (
    <ul className="space-y-3">
      {changes.map((c) => (
        <li key={c.id} className="rounded-lg border border-black/10 p-3 space-y-1">
          <p className="font-sans text-body-small text-ordift-ink">{c.kind === "reschedule" ? "Rescheduled" : "Timezone changed"} · {fmt(c.changedAt, tz)}</p>
          <p className="font-sans text-caption text-ordift-ink-muted">{sched(c.previous)} → <strong className="text-ordift-ink">{sched(c.new)}</strong></p>
          <p className="font-sans text-caption text-ordift-ink-muted">Reason: {c.reason}</p>
          {c.parties.map((p) => (
            <div key={`${p.kind}-${p.profileId ?? "client"}`} className="font-sans text-caption">
              {p.notice ? (
                <span className="text-green-800">✓ {p.label} was told by {NOTICE_METHOD_LABELS[p.notice.method as keyof typeof NOTICE_METHOD_LABELS] ?? p.notice.method} on {fmt(p.notice.informedAt, tz)} (recorded by management{p.notice.note ? ` — ${p.notice.note}` : ""}).</span>
              ) : (
                <span className="text-amber-900">⚠ {p.label} is not yet recorded as told.</span>
              )}
              {!p.notice && canManage && (
                <ActionForm action={recordNoticeAction} className="mt-1 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="requestId" value={requestId} /><input type="hidden" name="changeId" value={c.id} />
                  <input type="hidden" name="partyKind" value={p.kind} /><input type="hidden" name="partyProfileId" value={p.profileId ?? ""} />
                  <select name="method" required defaultValue="" className={`${INPUT} sm:w-44`}><option value="">How…</option>{NOTICE_METHODS.map((m) => <option key={m} value={m}>{NOTICE_METHOD_LABELS[m]}</option>)}</select>
                  <input type="datetime-local" name="at" required className={`${INPUT} sm:w-56`} />
                  <input name="note" placeholder="Note (optional)" maxLength={500} className={`${INPUT} sm:w-56`} />
                  <SubmitButton pendingLabel="Saving…" className={`${BTN} border border-black/20`}>Record that they were told</SubmitButton>
                </ActionForm>
              )}
            </div>
          ))}
        </li>
      ))}
    </ul>
  );
}

function Issues({ requestId, slot, canManageIssues, managers, viewerId }: { requestId: string; slot: ReadinessSlotData; canManageIssues: boolean; managers: { id: string; label: string }[]; viewerId: string }) {
  const own = independentOfAssignee(viewerId, slot.assigneeId);
  return (
    <div className="space-y-3">
      {slot.view.issues.length === 0 && <p className="font-sans text-caption text-ordift-ink-muted">No issues raised.</p>}
      {slot.view.issues.map((i) => {
        const actions = managementIssueActions(i.status);
        return (
          <div key={i.id} className="rounded-lg border border-black/10 p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-sans text-body-small font-medium text-ordift-ink">{READINESS_SHORT_LABELS[i.kind as ReadinessStatus] ?? i.kind}</span>
              <span className="rounded-full border border-black/10 bg-ordift-offwhite px-2.5 py-0.5 font-sans text-caption">{ISSUE_STATUS_LABELS[i.status as IssueStatus] ?? i.status}</span>
              {i.professionalReportedResolvedAt && i.status !== "resolved" && <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 font-sans text-caption text-green-900">Professional reports it is sorted — verify</span>}
            </div>
            <ul className="space-y-1">
              {i.events.filter((e) => e.body).map((e) => (
                <li key={e.id} className={`font-sans text-caption ${e.visibility === "internal" ? "rounded bg-amber-50 px-2 py-1 text-amber-900" : "text-ordift-ink"}`}>
                  <span className="text-ordift-ink-muted">{new Date(e.createdAt).toLocaleString()} · {e.actorRole}{e.visibility === "internal" ? " · INTERNAL (professional can't see)" : ""}: </span>{e.body}
                </li>
              ))}
            </ul>
            {i.followUpAction && <p className="font-sans text-caption text-ordift-ink-muted">Follow-up (internal): {i.followUpAction}{i.assignedTo ? ` — assigned to ${managers.find((m) => m.id === i.assignedTo)?.label ?? "an administrator"}` : ""}</p>}
            {own ? (
              <p role="note" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 font-sans text-caption text-amber-900">{SELF_ISSUE_MESSAGE}</p>
            ) : canManageIssues && (
              <div className="space-y-2">
                {actions.length > 0 && (
                  <ActionForm action={manageIssueAction} className="space-y-2">
                    <input type="hidden" name="requestId" value={requestId} /><input type="hidden" name="issueId" value={i.id} />
                    <input name="sharedMessage" placeholder="Short message the professional will see (optional)" maxLength={1000} className={INPUT} />
                    <input name="note" placeholder="Internal note (professional can't see) — required to resolve or reopen" maxLength={1000} className={INPUT} />
                    <div className="flex flex-wrap gap-2">
                      {actions.map((a) => <SubmitButton key={a} name="action" value={a} pendingLabel="Saving…" className={`${BTN} ${a === "resolve" ? "bg-ordift-navy-950 text-white" : "border border-black/20"}`}>{ACTION_LABEL[a]}</SubmitButton>)}
                    </div>
                  </ActionForm>
                )}
                {i.status !== "resolved" && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <ActionForm action={postIssueMessageAction} className="flex flex-wrap gap-2">
                      <input type="hidden" name="requestId" value={requestId} /><input type="hidden" name="issueId" value={i.id} />
                      <input name="body" placeholder="Add a message…" maxLength={1000} required className={`${INPUT} sm:flex-1`} />
                      <select name="visibility" defaultValue="shared" className={`${INPUT} sm:w-44`}><option value="shared">Visible to professional</option><option value="internal">Internal only</option></select>
                      <SubmitButton pendingLabel="Saving…" className={`${BTN} border border-black/20`}>Post</SubmitButton>
                    </ActionForm>
                    <ActionForm action={assignFollowUpAction} className="flex flex-wrap gap-2">
                      <input type="hidden" name="requestId" value={requestId} /><input type="hidden" name="issueId" value={i.id} />
                      <input name="followUpAction" placeholder="Follow-up action (internal)" maxLength={500} defaultValue={i.followUpAction ?? ""} className={`${INPUT} sm:flex-1`} />
                      <select name="assignedTo" defaultValue={i.assignedTo ?? ""} className={`${INPUT} sm:w-44`}><option value="">Unassigned</option>{managers.filter((m) => m.id !== slot.assigneeId).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
                      <SubmitButton pendingLabel="Saving…" className={`${BTN} border border-black/20`}>Save follow-up</SubmitButton>
                    </ActionForm>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Management's view of an assignment's SCHEDULE (scheduled / rescheduled / actual, kept separate) and the
// professional's READINESS with its issues. B1 sends nothing automatically: rescheduling is communicated
// manually and recorded here.
export default function ScheduleReadinessPanel({ requestId, slots, changes, parties, managers, viewerId, isManagement, canManageIssues, flagHours }: {
  requestId: string; slots: ReadinessSlotData[]; changes: ScheduleChangeView[]; parties: Party[]; managers: { id: string; label: string }[];
  viewerId: string; isManagement: boolean; canManageIssues: boolean; flagHours: number;
}) {
  if (slots.length === 0) return null;
  const ctx = slots[0].view.context;
  const tz = ctx.timezone.timezone;
  const closed = ["declined", "cancelled", "completed"].includes(ctx.requestStatus);
  return (
    <section className="rounded-xl border border-black/10 bg-white p-6 space-y-6" aria-labelledby="schedule-readiness-heading">
      <div>
        <h2 id="schedule-readiness-heading" className="font-serif font-medium text-body text-ordift-ink">Schedule &amp; readiness</h2>
        <p className="font-sans text-caption text-ordift-ink-muted mt-1">Scheduled, rescheduled and actual service dates are kept separately. Nothing on this panel sends any email or notification — rescheduling is communicated by you and recorded below. Readiness never completes a job, releases files or affects any payment.</p>
      </div>

      <div className="space-y-2">
        <p className="font-sans text-body-small font-medium text-ordift-ink">Scheduled</p>
        <p className="font-sans text-body-small text-ordift-ink">
          {ctx.startDate === ctx.endDate ? ctx.startDate : `${ctx.startDate} → ${ctx.endDate}`}{ctx.callTime ? `, call ${ctx.callTime}` : " (call time not set)"}{ctx.finishTime ? `, finish ${ctx.finishTime}` : ""}
          {ctx.startMs != null && tz ? <span className="text-ordift-ink-muted"> · starts {formatInZone(ctx.startMs, tz)}</span> : null}
        </p>
        <p className="font-sans text-caption text-ordift-ink-muted">
          Timezone: {tz ? <><strong className="text-ordift-ink">{tz}</strong> ({ctx.timezone.source === "override" ? "management override" : "market default"})</> : <strong className="text-amber-900">not set — set one so start times and flags can be calculated</strong>} · schedule version {ctx.scheduleVersion}
        </p>
        <p className="font-sans text-caption text-ordift-ink-muted">Actual service date (from the professional&apos;s job report): {slots.flatMap((s) => s.actualDates).length ? slots.map((s) => `${s.label}: ${s.actualDates[0] ?? "not reported"}`).join(" · ") : "not reported yet"}</p>
      </div>

      <div className="space-y-2">
        <p className="font-sans text-body-small font-medium text-ordift-ink">Rescheduled</p>
        <ChangeHistory requestId={requestId} changes={changes} canManage={isManagement} tz={tz} />
        {isManagement && !closed && (
          <div className="space-y-2">
            <details className="rounded-lg border border-black/10 p-3">
              <summary className="cursor-pointer font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">Reschedule this assignment</summary>
              <ActionForm action={rescheduleAction} className="mt-3 space-y-3">
                <input type="hidden" name="requestId" value={requestId} />
                <div className="grid gap-3 sm:grid-cols-4">
                  <label className="flex flex-col gap-1"><span className={LABEL}>New start date</span><input type="date" name="startDate" required defaultValue={ctx.startDate} className={INPUT} /></label>
                  <label className="flex flex-col gap-1"><span className={LABEL}>New end date</span><input type="date" name="endDate" required defaultValue={ctx.endDate} className={INPUT} /></label>
                  <label className="flex flex-col gap-1"><span className={LABEL}>Call time (HH:MM)</span><input name="callTime" pattern="([01][0-9]|2[0-3]):[0-5][0-9]" placeholder="10:00" defaultValue={ctx.callTime ?? ""} className={INPUT} /></label>
                  <label className="flex flex-col gap-1"><span className={LABEL}>Finish time (HH:MM)</span><input name="finishTime" pattern="([01][0-9]|2[0-3]):[0-5][0-9]" placeholder="21:00" defaultValue={ctx.finishTime ?? ""} className={INPUT} /></label>
                </div>
                <label className="flex flex-col gap-1"><span className={LABEL}>Timezone (leave blank to keep {tz ?? "the market default"})</span><input name="timezone" placeholder="e.g. Asia/Qatar" className={INPUT} /></label>
                <label className="flex flex-col gap-1"><span className={LABEL}>Reason (kept in the history)</span><textarea name="reason" required minLength={5} rows={2} className={INPUT} /></label>
                <NoticeRows parties={parties} tz={tz} />
                <SubmitButton pendingLabel="Rescheduling…" className={`${BTN} bg-ordift-navy-950 text-white`}>Reschedule</SubmitButton>
              </ActionForm>
            </details>
            <details className="rounded-lg border border-black/10 p-3">
              <summary className="cursor-pointer font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">Override the timezone</summary>
              <ActionForm action={setTimezoneAction} className="mt-3 flex flex-wrap items-end gap-2">
                <input type="hidden" name="requestId" value={requestId} />
                <label className="flex flex-col gap-1"><span className={LABEL}>IANA timezone (blank = back to market default)</span><input name="timezone" placeholder="Africa/Accra" defaultValue={ctx.timezone.source === "override" ? (tz ?? "") : ""} className={INPUT} /></label>
                <label className="flex flex-1 flex-col gap-1"><span className={LABEL}>Reason</span><input name="reason" required minLength={5} className={INPUT} /></label>
                <SubmitButton pendingLabel="Saving…" className={`${BTN} border border-black/20`}>Save timezone</SubmitButton>
              </ActionForm>
            </details>
          </div>
        )}
        {!isManagement && <p className={LABEL}>Only authorised management can reschedule or change the timezone.</p>}
      </div>

      {slots.map((s) => {
        const v = s.view;
        return (
          <div key={s.engagementId} className="space-y-3 border-t border-black/5 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-sans text-body-small font-medium text-ordift-ink">{s.label} — readiness</p>
              {v.enrolled && !v.disabledAt && <span className={`rounded-full border px-2.5 py-0.5 font-sans text-caption ${STATE_TONE[v.state]}`}>{READINESS_STATE_LABELS[v.state]}</span>}
              {v.flagNoResponse && <span className="rounded-full border border-red-300 bg-red-50 px-2.5 py-0.5 font-sans text-caption font-semibold text-red-900">No answer — starts within {flagHours}h</span>}
              {v.enrolled && v.disabledAt && <span className="rounded-full border border-black/10 bg-ordift-offwhite px-2.5 py-0.5 font-sans text-caption">Tracking stopped</span>}
            </div>

            {!v.enrolled && (
              <div className="space-y-2">
                <p className="font-sans text-caption text-ordift-ink-muted">Readiness tracking is not on for this assignment, so the professional has no readiness form and nothing is flagged.{v.enrolBlocker ? ` Can't enrol: ${v.enrolBlocker}` : ""}</p>
                {isManagement && !v.enrolBlocker && (
                  <ActionForm action={enrolAction} className="flex items-center gap-2">
                    <input type="hidden" name="requestId" value={requestId} /><input type="hidden" name="engagementId" value={s.engagementId} />
                    <label className="flex flex-col gap-1"><span className={LABEL}>City/area for reminder emails (optional now)</span><input name="areaLabel" maxLength={80} placeholder="Doha — West Bay" className={INPUT} /></label>
                    <SubmitButton pendingLabel="Enrolling…" className={`${BTN} border border-black/20`}>Turn on readiness tracking</SubmitButton>
                    <span className={LABEL}>No message is sent to the professional now.</span>
                  </ActionForm>
                )}
              </div>
            )}

            {v.enrolled && (
              <div className="space-y-3">
                <p className="font-sans text-caption text-ordift-ink-muted">Tracking on since {new Date(v.enrolledAt as string).toLocaleDateString()} ({v.enrolmentSource === "manual" ? "enrolled by management" : "automatic"}){v.disabledAt ? ` · stopped: ${v.disabledReason}` : ""}.</p>
                {isManagement && !v.disabledAt && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <ActionForm action={setManagerAction} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="requestId" value={requestId} /><input type="hidden" name="engagementId" value={s.engagementId} />
                      <label className="flex flex-1 flex-col gap-1"><span className={LABEL}>Responsible manager (falls back to Super Admins if none)</span>
                        <select name="managerId" defaultValue={v.responsibleManagerId ?? ""} className={INPUT}><option value="">None assigned</option>{managers.filter((m) => m.id !== s.assigneeId).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
                      <SubmitButton pendingLabel="Saving…" className={`${BTN} border border-black/20`}>Save</SubmitButton>
                    </ActionForm>
                    <ActionForm action={disableAction} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="requestId" value={requestId} /><input type="hidden" name="engagementId" value={s.engagementId} />
                      <label className="flex flex-1 flex-col gap-1"><span className={LABEL}>Stop tracking (reason)</span><input name="reason" required minLength={5} className={INPUT} /></label>
                      <SubmitButton pendingLabel="Saving…" className={`${BTN} border border-black/20`}>Stop</SubmitButton>
                    </ActionForm>
                  </div>
                )}
                <Reminders requestId={requestId} slot={s} canEdit={isManagement && !v.disabledAt} />
                {v.responses[0] ? (
                  <div className="rounded-lg border border-black/10 p-3 space-y-1">
                    <p className="font-sans text-caption text-ordift-ink-muted">Latest answer: version {v.responses[0].version} · {READINESS_SHORT_LABELS[v.responses[0].status as ReadinessStatus] ?? v.responses[0].status} · {fmt(v.responses[0].submittedAt, tz)} · for schedule version {v.responses[0].scheduleVersion}{v.responses.length > 1 ? ` · ${v.responses.length - 1} earlier version(s) kept` : ""}</p>
                    {Object.entries(v.responses[0].concerns).map(([k, t]) => <p key={k} className="font-sans text-body-small text-ordift-ink"><span className="text-ordift-ink-muted">{CONCERN_AREAS.find((a) => a.id === k)?.label ?? k}: </span>{t}</p>)}
                    {v.responses[0].remarks && <p className="font-sans text-body-small text-ordift-ink"><span className="text-ordift-ink-muted">Remarks: </span>{v.responses[0].remarks}</p>}
                  </div>
                ) : <p className="font-sans text-caption text-ordift-ink-muted">No answer yet.</p>}
                <Issues requestId={requestId} slot={s} canManageIssues={canManageIssues} managers={managers} viewerId={viewerId} />
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

function Reminders({ requestId, slot, canEdit }: { requestId: string; slot: ReadinessSlotData; canEdit: boolean }) {
  const v = slot.view;
  return (
    <div className="space-y-2 rounded-lg border border-black/10 p-3">
      <p className="font-sans text-caption font-medium text-ordift-ink">Automatic reminders</p>
      <p className={LABEL}>
        City/area shown in reminder emails: <strong className="text-ordift-ink">{v.areaLabel ?? "not set — no reminder can be sent to the professional until it is"}</strong>. Reminder emails never include the venue, client details, access instructions or pay.
      </p>
      {canEdit && (
        <ActionForm action={setAreaLabelAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="requestId" value={requestId} /><input type="hidden" name="engagementId" value={slot.engagementId} />
          <label className="flex flex-1 flex-col gap-1"><span className={LABEL}>City/area label</span><input name="areaLabel" required minLength={2} maxLength={80} defaultValue={v.areaLabel ?? ""} placeholder="Doha — West Bay" className={INPUT} /></label>
          <SubmitButton pendingLabel="Saving…" className={`${BTN} border border-black/20`}>Save label</SubmitButton>
        </ActionForm>
      )}
      {v.notifications.length === 0 ? (
        <p className={LABEL}>Nothing has been sent, skipped or recorded for this assignment.</p>
      ) : (
        <ul className="space-y-1">
          {v.notifications.map((n) => (
            <li key={n.id} className="font-sans text-caption text-ordift-ink">
              <strong>{REMINDER_KIND_LABELS[n.kind as ReminderKind] ?? n.kind}</strong> · for schedule version {n.scheduleVersion} · {n.mode === "test" ? "test mode" : "live"} ·{" "}
              {n.status === "skipped" ? <>skipped — {SKIP_REASON_LABELS[n.skipReason as SkipReason] ?? n.skipReason}</> : n.status === "suppressed_test" ? "recorded, not sent (test mode)" : n.status === "logged" ? "logged only (production sending is off)" : n.status === "claimed" ? "in progress" : n.status === "failed" ? "failed" : "sent"}
              {n.recipientLabel ? ` · to ${n.recipientRole === "management" ? "manager " : ""}${n.recipientLabel}` : ""}
              {n.stage ? <span className="text-ordift-ink-muted"> · {DELIVERY_STAGE_LABELS[n.stage as DeliveryStage] ?? n.stage}</span> : null}
              {(n.stage === "bounced" || n.stage === "complained") && <span className="font-semibold text-red-900"> — contact them another way</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
