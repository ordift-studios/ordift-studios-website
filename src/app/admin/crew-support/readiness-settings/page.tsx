import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManageCrewSupport } from "@/lib/crewSupport/permissions";
import { isManagementUser } from "@/lib/crewSupport/management";
import { getReadinessSettings } from "@/lib/crewSupport/readiness";
import { MARKET_TIMEZONES } from "@/lib/crewSupport/schedule";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSchedulerStatus, loadReminderSettings, previewReminders } from "@/lib/crewSupport/readinessReminders";
import { DELIVERY_STAGE_LABELS, REMINDER_KIND_LABELS, SKIP_REASON_LABELS, type ReminderKind, type SkipReason } from "@/lib/crewSupport/readinessReminderRules";
import CrewSupportSubNav from "../CrewSupportSubNav";
import { ClearSuppressionForm, LateCapsForm, ModeForm, RunCheckForm } from "./RemindersControls";
import ReadinessSettingsForm from "./ReadinessSettingsForm";

export const metadata: Metadata = { title: "Readiness settings — Ordift Studios Admin", robots: { index: false, follow: false } };

export default async function ReadinessSettingsPage() {
  const user = await getCurrentUser();
  if (!user || !canManageCrewSupport(user)) redirect("/admin/overview");
  const canEdit = await isManagementUser(user);
  const s = await getReadinessSettings();
  const rs = await loadReminderSettings();
  const status = canEdit ? await getSchedulerStatus() : null;
  const preview = canEdit && rs.mode !== "off" ? await previewReminders({ horizonHours: 72 }) : null;
  const { data: blocked } = canEdit ? await createAdminClient().from("assignment_notification_suppressions").select("profile_id, reason, created_at").is("cleared_at", null) : { data: [] };
  return (
    <div className="space-y-6">
      <div>
        <CrewSupportSubNav active="readiness" />
        <h1 className="mt-3 font-serif font-medium text-section-heading text-ordift-ink">Readiness settings</h1>
        <p className="mt-1 max-w-3xl font-sans text-body-small text-ordift-ink-muted">Management enrols an assignment by hand, the professional confirms readiness, and issues are tracked here. Automatic reminders and management escalation are controlled by the <strong>Reminders</strong> mode below. They are <strong>{rs.mode === "off" ? "off" : rs.mode === "live" ? "LIVE" : rs.mode === "test" ? "in test mode — nothing leaves the system" : "in dry-run — nothing is sent"}</strong>, and only ever apply to assignments that management has enrolled.</p>
      </div>
      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <div className="grid gap-3 sm:grid-cols-3 font-sans text-body-small text-ordift-ink">
          <p><span className="block text-caption text-ordift-ink-muted">Automatic enrolment</span><strong>Off</strong> — not available in this version</p>
          <p><span className="block text-caption text-ordift-ink-muted">Reminders and escalation emails</span><strong>{rs.mode === "off" ? "Off" : rs.mode === "live" ? "Live" : rs.mode === "test" ? "Test" : "Dry run"}</strong></p>
          <p><span className="block text-caption text-ordift-ink-muted">Market timezone defaults</span>{Object.entries(MARKET_TIMEZONES).map(([c, tz]) => `${c}: ${tz}`).join(" · ")} (override per assignment)</p>
        </div>
        {canEdit ? <ReadinessSettingsForm values={{ firstReminderHours: s.firstReminderHours, readinessCheckHours: s.readinessCheckHours, noResponseFlagHours: s.noResponseFlagHours, skipCheckIfReady: s.skipCheckIfReady }} /> : (
          <p className="font-sans text-caption text-ordift-ink-muted">Current intervals: {s.firstReminderHours}h / {s.readinessCheckHours}h / unanswered flag at {s.noResponseFlagHours}h. Only authorised management can change them.</p>
        )}
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-5" aria-labelledby="reminders-heading">
        <h2 id="reminders-heading" className="font-serif font-medium text-card-heading text-ordift-ink">Reminders and escalation</h2>
        <p className="max-w-3xl font-sans text-body-small text-ordift-ink-muted">
          At the first interval the assigned professional gets a preparation reminder; at the second, a follow-up if they have not confirmed for the current schedule; at the third, management is told if there is still no answer or a concern is unresolved. Emails carry only the reference, service, time, a city/area label and a sign-in link.
        </p>
        {canEdit && status ? (
          <>
            <div className="grid gap-3 sm:grid-cols-4 font-sans text-body-small text-ordift-ink">
              <p><span className="block text-caption text-ordift-ink-muted">Scheduler</span><strong>{status.health.state === "ok" ? "Healthy" : status.health.state === "stale" ? "OVERDUE — no successful run recently" : status.health.state === "never_run" ? "Never run" : "Not needed yet"}</strong></p>
              <p><span className="block text-caption text-ordift-ink-muted">Last run</span>{status.lastRunAt ? `${new Date(status.lastRunAt).toLocaleString()} (${status.lastTrigger})` : "—"}</p>
              <p><span className="block text-caption text-ordift-ink-muted">Too late (7 days)</span>{status.lateSkips7d}</p>
              <p><span className="block text-caption text-ordift-ink-muted">Failed (7 days) / stuck</span>{status.failed7d} / {status.stuckClaims}</p>
            </div>
            <ModeForm current={rs.mode} />
            <p className="font-sans text-caption text-ordift-ink-muted">
              Delivery tracking from the email provider: {rs.resendWebhookConfigured ? "set up" : "NOT set up — Live cannot be switched on until it is"}. Test mode runs everything but sends nothing; Live can only be reached from Test. {rs.switchedOnAtMs ? `Last switched on ${new Date(rs.switchedOnAtMs).toLocaleString()}; reminders due before then are never sent.` : ""}
            </p>
            <LateCapsForm first={rs.lateCapFirstHours} check={rs.lateCapCheckHours} escalation={rs.lateCapEscalationHours} />
            <RunCheckForm />
            {(blocked ?? []).length > 0 && (
              <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="font-sans text-body-small font-semibold text-red-900">Addresses blocked after a bounce or spam report</p>
                {(blocked ?? []).map((b) => (
                  <div key={b.profile_id as string} className="space-y-1">
                    <p className="font-sans text-caption text-red-900">Profile {(b.profile_id as string).slice(0, 8)} — {b.reason as string} on {new Date(b.created_at as string).toLocaleDateString()}. Contact them another way.</p>
                    <ClearSuppressionForm profileId={b.profile_id as string} />
                  </div>
                ))}
              </div>
            )}
            {preview && (
              <div className="space-y-2">
                <h3 className="font-sans text-body-small font-semibold text-ordift-ink">What the system would do in the next 72 hours (nothing here is sent by viewing it)</h3>
                {preview.items.length === 0 ? <p className={"font-sans text-caption text-ordift-ink-muted"}>No enrolled assignment has anything due in that window.</p> : (
                  <ul className="space-y-2">
                    {preview.items.map((i) => (
                      <li key={`${i.readinessId}-${i.kind}-${i.dueAt}`} className="rounded-lg border border-black/10 p-3 font-sans text-caption text-ordift-ink space-y-1">
                        <p><strong>{i.reference}</strong> · {REMINDER_KIND_LABELS[i.kind as ReminderKind]} · due {new Date(i.dueAt).toLocaleString()} · to {i.audience}</p>
                        <p>{i.outcome === "will_send" ? "Would send" : i.outcome === "would_skip" ? `Would skip — ${SKIP_REASON_LABELS[i.reason as SkipReason] ?? i.reason}` : i.outcome === "blocked" ? `Blocked — ${i.reason}` : i.outcome === "waiting" ? "Waiting for its time" : "Nothing to do"}{i.recorded ? ` · already recorded: ${i.recorded}` : ""}</p>
                        {i.subject && <details><summary className="cursor-pointer text-ordift-ink-muted">Exact text</summary><p className="mt-1 font-medium">{i.subject}</p><pre className="whitespace-pre-wrap font-sans">{i.text}</pre></details>}
                      </li>
                    ))}
                  </ul>
                )}
                <p className={"font-sans text-caption text-ordift-ink-muted"}>Delivery stages are shown on each assignment: {Object.values(DELIVERY_STAGE_LABELS).slice(0, 4).join(" → ")} … Accepted by the provider is not the same as delivered.</p>
              </div>
            )}
          </>
        ) : <p className="font-sans text-caption text-ordift-ink-muted">Only authorised management can see or change the reminder mode.</p>}
      </section>
    </div>
  );
}
