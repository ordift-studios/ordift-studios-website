import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/portal/roles";
import { getEnquiriesForUser, getWorkshopRegistrationsForUser } from "@/lib/portal/data";
import {
  getActiveProjects,
  getLatestProjectUpdates,
  getRecentActivity,
  getUpcomingSessions,
} from "@/lib/portal/dashboard";
import WelcomeBanner from "@/components/portal/dashboard/WelcomeBanner";
import ActiveProjectsWidget from "@/components/portal/dashboard/ActiveProjectsWidget";
import UpcomingSessionsWidget from "@/components/portal/dashboard/UpcomingSessionsWidget";
import LatestUpdatesWidget from "@/components/portal/dashboard/LatestUpdatesWidget";
import DeliverablesReadyWidget from "@/components/portal/dashboard/DeliverablesReadyWidget";
import PendingPaymentsWidget from "@/components/portal/dashboard/PendingPaymentsWidget";
import RecentNotificationsWidget from "@/components/portal/dashboard/RecentNotificationsWidget";
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

  const activeProjects = getActiveProjects(enquiries);
  const latestUpdates = getLatestProjectUpdates(enquiries);
  const recentActivity = getRecentActivity(enquiries, registrations);
  const upcomingSessions = await getUpcomingSessions(registrations);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-3">
        <WelcomeBanner name={user?.fullName ?? null} />
      </div>

      <ActiveProjectsWidget projects={activeProjects} />
      <UpcomingSessionsWidget sessions={upcomingSessions} />

      <LatestUpdatesWidget projects={latestUpdates} />
      <DeliverablesReadyWidget />
      <PendingPaymentsWidget />

      <RecentActivityWidget items={recentActivity} />
      <RecentNotificationsWidget />

      <QuickActionsWidget />
    </div>
  );
}
