import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import {
  isWorkshopInstructor,
  listEngagementsForInstructor,
  listRegistrationsForInstructorWorkshop,
} from "@/lib/workshops/instructorEngagements";
import { getStaffOnboardingByProfileId } from "@/lib/organization/onboarding";
import { listResolvedRequirements } from "@/lib/organization/onboardingRequirements";
import { getOwnPayeeProfile } from "@/lib/payables/payeeProfiles";
import { listPaymentObligationsForPayee } from "@/lib/payments/payoutObligations";
import { listUpcomingSessionsForInstructor } from "@/lib/workshops/sessions";
import { listMaterialsForInstructor } from "@/lib/workshops/materials";
import { listAnnouncementsForInstructor } from "@/lib/workshops/announcements";
import { listBriefsForWorkshop } from "@/lib/workshops/briefsAndSubmissions";
import { AttendanceRoster } from "./AttendanceRoster";
import { InstructorMaterialsList, InstructorAnnouncementsBlock, InstructorBriefsBlock } from "./InstructorWorkshopExtras";

export const metadata: Metadata = {
  title: "Instructor — Ordift Studios Portal",
  robots: { index: false, follow: false },
};

// Instructor/Facilitator Portal (2026-09-16) — audit found instructors
// were tracked only as workshop_instructor_engagements rows with no
// self-service surface at all: no role slug exists for "instructor"
// (see roles.ts's ROLE_SLUGS — instructor is a payee_profiles.category
// value and/or an engagement record, never a role), so visibility here
// is scoped by real engagement ownership, matching the same principle
// the Vendor/Collaborator portals already use ("engagement ownership,
// not role, is what scopes this data" — see vendor/page.tsx).
//
// Workshop Learning Infrastructure V1 (2026-09-19) — Materials,
// Announcements, and Creative Briefs are now real, workshop-scoped,
// engagement-gated features (workshop_materials/announcements/briefs,
// migration 0138) — see the per-workshop card below. A generic
// payee-document library (unrelated to workshops) still does not
// exist anywhere in this codebase.
export default async function InstructorPortalPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/portal/login");

  const isInstructor = await isWorkshopInstructor(user.id);
  if (!isInstructor) {
    return (
      <div className="space-y-6">
        <div>
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Instructor / Facilitator</p>
          <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">My Workshops</h1>
        </div>
        <section className="rounded-xl border border-black/10 bg-white p-6">
          <p className="font-sans text-body-small text-ordift-ink-muted">
            No workshop instructor engagement is on record for your account yet.
          </p>
        </section>
      </div>
    );
  }

  const [engagements, onboarding, payeeProfile] = await Promise.all([
    listEngagementsForInstructor(user.id),
    getStaffOnboardingByProfileId(user.id),
    getOwnPayeeProfile(user.id),
  ]);

  const [outstandingRequirements, paymentObligations, rostersByWorkshop, materialsByWorkshop, announcementsByWorkshop, briefsByWorkshop, upcomingSessions] = await Promise.all([
    onboarding ? listResolvedRequirements({ onboardingId: onboarding.id, profileId: user.id, pipeline: onboarding.pipeline }) : Promise.resolve([]),
    payeeProfile ? listPaymentObligationsForPayee(user.id) : Promise.resolve([]),
    Promise.all(engagements.map(async (e) => [e.workshopId, await listRegistrationsForInstructorWorkshop(e.workshopId, user.id)] as const)),
    Promise.all(engagements.map(async (e) => [e.workshopId, await listMaterialsForInstructor(e.workshopId, user.id)] as const)),
    Promise.all(engagements.map(async (e) => [e.workshopId, await listAnnouncementsForInstructor(e.workshopId, user.id)] as const)),
    Promise.all(engagements.map(async (e) => [e.workshopId, await listBriefsForWorkshop(e.workshopId)] as const)),
    listUpcomingSessionsForInstructor(user.id, new Date().toISOString().slice(0, 10)),
  ]);
  const rosterByWorkshopId = new Map(rostersByWorkshop);
  const materialsByWorkshopId = new Map(materialsByWorkshop);
  const announcementsByWorkshopId = new Map(announcementsByWorkshop);
  const briefsByWorkshopId = new Map(briefsByWorkshop);
  const outstanding = outstandingRequirements.filter((r) => r.status !== "satisfied" && r.status !== "waived" && r.status !== "not_applicable");

  return (
    <div className="space-y-10">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Instructor / Facilitator</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">{user.fullName ?? user.email}</h1>
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Upcoming Sessions</h2>
        {upcomingSessions.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">No dated sessions on your schedule yet.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {upcomingSessions.slice(0, 10).map((s) => (
              <li key={s.id} className="py-2 flex items-center justify-between gap-3">
                <div>
                  <p className="font-sans text-body-small text-ordift-ink">{s.title} — {s.workshopTitle}</p>
                  <p className="font-sans text-caption text-ordift-ink-muted">{s.locationOverride ?? ""}</p>
                </div>
                <span className="font-sans text-caption text-ordift-ink-muted whitespace-nowrap">
                  {s.sessionDate} · {s.startTime.slice(0, 5)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">My Workshops</h2>
        {engagements.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">No workshop engagements on record.</p>
        ) : (
          engagements.map((e) => (
            <div key={e.id} className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-sans text-body font-semibold text-ordift-ink">{e.workshopTitle}</p>
                  <p className="font-sans text-caption text-ordift-ink-muted">
                    {e.role} · {e.workshopStatus} {e.workshopStartDate ? `· ${e.workshopStartDate}` : ""}
                  </p>
                </div>
                {e.agreedCompensationAmount != null && (
                  <span className="font-sans text-caption text-ordift-ink-muted">
                    Agreed: {e.agreedCompensationCurrency ?? ""} {e.agreedCompensationAmount}
                  </span>
                )}
              </div>
              <div>
                <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted mb-2">Participants &amp; Attendance</p>
                <AttendanceRoster workshopId={e.workshopId} registrations={rosterByWorkshopId.get(e.workshopId) ?? []} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-black/5">
                <div>
                  <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted mb-2">Materials</p>
                  <InstructorMaterialsList materials={materialsByWorkshopId.get(e.workshopId) ?? []} />
                </div>
                <div>
                  <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted mb-2">Announcements</p>
                  <InstructorAnnouncementsBlock workshopId={e.workshopId} announcements={announcementsByWorkshopId.get(e.workshopId) ?? []} />
                </div>
                <div>
                  <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted mb-2">Creative Briefs</p>
                  <InstructorBriefsBlock workshopId={e.workshopId} briefs={briefsByWorkshopId.get(e.workshopId) ?? []} />
                </div>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Onboarding &amp; Compliance</h2>
          {!onboarding ? (
            <p className="font-sans text-body-small text-ordift-ink-muted">No onboarding record — not applicable to this engagement.</p>
          ) : onboarding.status === "completed" ? (
            <p className="font-sans text-body-small text-green-700">Complete.</p>
          ) : outstanding.length === 0 ? (
            <p className="font-sans text-body-small text-ordift-ink-muted">In progress — no outstanding requirements.</p>
          ) : (
            <ul className="space-y-1">
              {outstanding.map((r) => (
                <li key={r.requirementKey} className="font-sans text-body-small text-ordift-ink-muted">{r.label} — {r.status}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Payments</h2>
          {!payeeProfile ? (
            <p className="font-sans text-body-small text-ordift-ink-muted">No payee profile set up yet — payments are configured per engagement by Finance.</p>
          ) : paymentObligations.length === 0 ? (
            <p className="font-sans text-body-small text-ordift-ink-muted">No payment obligations on record yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {paymentObligations.map((p) => (
                <li key={p.id} className="font-sans text-body-small text-ordift-ink-muted flex items-center justify-between gap-3">
                  <span>{p.description}</span>
                  <span className="tabular-nums">{p.currency} {p.amount.toFixed(2)} · {p.status.replace(/_/g, " ")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
