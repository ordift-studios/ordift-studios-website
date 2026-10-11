import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManageCrewSupport } from "@/lib/crewSupport/permissions";
import { isManagementUser } from "@/lib/crewSupport/management";
import { getReadinessSettings } from "@/lib/crewSupport/readiness";
import { MARKET_TIMEZONES } from "@/lib/crewSupport/schedule";
import CrewSupportSubNav from "../CrewSupportSubNav";
import ReadinessSettingsForm from "./ReadinessSettingsForm";

export const metadata: Metadata = { title: "Readiness settings — Ordift Studios Admin", robots: { index: false, follow: false } };

export default async function ReadinessSettingsPage() {
  const user = await getCurrentUser();
  if (!user || !canManageCrewSupport(user)) redirect("/admin/overview");
  const canEdit = await isManagementUser(user);
  const s = await getReadinessSettings();
  return (
    <div className="space-y-6">
      <div>
        <CrewSupportSubNav active="readiness" />
        <h1 className="mt-3 font-serif font-medium text-section-heading text-ordift-ink">Readiness settings</h1>
        <p className="mt-1 max-w-3xl font-sans text-body-small text-ordift-ink-muted">Pre-assignment readiness is in its first version: management enrols an assignment by hand, the professional confirms readiness, and issues are tracked here. <strong>Nothing is sent automatically</strong> — no reminders, no escalation emails. The intervals below are stored for the next version.</p>
      </div>
      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <div className="grid gap-3 sm:grid-cols-3 font-sans text-body-small text-ordift-ink">
          <p><span className="block text-caption text-ordift-ink-muted">Automatic enrolment</span><strong>Off</strong> — not available in this version</p>
          <p><span className="block text-caption text-ordift-ink-muted">Reminders and escalation emails</span><strong>Off</strong> — not built yet</p>
          <p><span className="block text-caption text-ordift-ink-muted">Market timezone defaults</span>{Object.entries(MARKET_TIMEZONES).map(([c, tz]) => `${c}: ${tz}`).join(" · ")} (override per assignment)</p>
        </div>
        {canEdit ? <ReadinessSettingsForm values={{ firstReminderHours: s.firstReminderHours, readinessCheckHours: s.readinessCheckHours, noResponseFlagHours: s.noResponseFlagHours, skipCheckIfReady: s.skipCheckIfReady }} /> : (
          <p className="font-sans text-caption text-ordift-ink-muted">Current intervals: {s.firstReminderHours}h / {s.readinessCheckHours}h / unanswered flag at {s.noResponseFlagHours}h. Only authorised management can change them.</p>
        )}
      </section>
    </div>
  );
}
