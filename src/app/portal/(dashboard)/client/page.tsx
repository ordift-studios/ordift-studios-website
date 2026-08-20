import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/portal/roles";
import { getEnquiriesForUser, getWorkshopRegistrationsForUser } from "@/lib/portal/data";
import {
  getActiveProjects,
  getDeliverablesSummary,
  getLatestProjectUpdates,
  getRecentActivity,
  getTopDeliverablesHref,
  getUpcomingSessions,
} from "@/lib/portal/dashboard";
import WelcomeBanner from "@/components/portal/dashboard/WelcomeBanner";
import ActiveProjectsWidget from "@/components/portal/dashboard/ActiveProjectsWidget";
import UpcomingSessionsWidget from "@/components/portal/dashboard/UpcomingSessionsWidget";
import LatestUpdatesWidget from "@/components/portal/dashboard/LatestUpdatesWidget";
import DeliverablesReadyWidget from "@/components/portal/dashboard/DeliverablesReadyWidget";
// PendingPaymentsWidget / RecentNotificationsWidget — hidden from the
// dashboard for public launch (pre-launch polish pass, 2026-08-20):
// both are honest "coming in a future release" placeholders (real
// payment tracking is v1.4.x, notifications are Milestone 5), which
// read as unfinished to a real customer landing on their own
// workspace. Components themselves are untouched and still fully
// functional — this is only a presentation-level removal from this
// page. Restore by re-adding both imports below and the two JSX
// lines further down once the underlying functionality ships.
import RecentActivityWidget from "@/components/portal/dashboard/RecentActivityWidget";
import QuickActionsWidget from "@/components/portal/dashboard/QuickActionsWidget";

export const metadata: Metadata = {
  title: "My Workspace — Ordift Studios Portal",
  robots: { index: false, follow: false },
};

export default async function ClientPortalPage() {
  const user = await getCurrentUser();

  const [enquiries, registrations] = user
    ? await Promise.all([getEnquiriesForUser(user.id), getWorkshopRegistrationsForUser(user.id)])
    : [[], []];

  const deliverablesSummary = await getDeliverablesSummary(enquiries, registrations);
  const activeProjects = getActiveProjects(enquiries, deliverablesSummary.countByEntityId);
  const latestUpdates = getLatestProjectUpdates(enquiries, deliverablesSummary.countByEntityId);
  const recentActivity = getRecentActivity(enquiries, registrations);
  const upcomingSessions = await getUpcomingSessions(registrations);
  const deliverablesHref = getTopDeliverablesHref(deliverablesSummary, enquiries, registrations);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-3">
        <WelcomeBanner name={user?.fullName ?? null} />
      </div>

      <ActiveProjectsWidget projects={activeProjects} />
      <UpcomingSessionsWidget sessions={upcomingSessions} />

      <LatestUpdatesWidget projects={latestUpdates} />
      <DeliverablesReadyWidget count={deliverablesSummary.totalCount} />

      <RecentActivityWidget items={recentActivity} />

      <QuickActionsWidget deliverablesHref={deliverablesHref} />
    </div>
  );
}
