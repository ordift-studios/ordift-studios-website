import Link from "next/link";
import DashboardWidget from "./DashboardWidget";
import EmptyWidgetState from "./EmptyWidgetState";
import type { UpcomingSession } from "@/lib/portal/dashboard";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function UpcomingSessionsWidget({ sessions }: { sessions: UpcomingSession[] }) {
  return (
    <DashboardWidget title="Upcoming Sessions" action={{ label: "Browse Workshops", href: "/workshops" }}>
      {sessions.length === 0 ? (
        <EmptyWidgetState message="No upcoming sessions. Browse the Academy to find your next workshop." />
      ) : (
        <ul className="space-y-3">
          {sessions.map((session) => (
            <li key={session.registrationId}>
              <Link
                href={session.href}
                className="font-serif text-body-small text-ordift-ink hover:text-ordift-gold-pressed underline-offset-4 hover:underline block"
              >
                {session.workshopTitle}
              </Link>
              <p className="font-sans text-caption text-ordift-ink-muted mt-0.5">
                {formatDate(session.startDate)}
                {session.registrationStatus === "Waitlisted" && session.waitingListPosition
                  ? ` · Waitlisted (position ${session.waitingListPosition})`
                  : ` · ${session.registrationStatus}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </DashboardWidget>
  );
}
