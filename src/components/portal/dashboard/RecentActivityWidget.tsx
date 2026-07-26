import Link from "next/link";
import DashboardWidget from "./DashboardWidget";
import EmptyWidgetState from "./EmptyWidgetState";
import type { ActivityFeedItem } from "@/lib/portal/dashboard";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function RecentActivityWidget({ items }: { items: ActivityFeedItem[] }) {
  return (
    <DashboardWidget title="Recent Activity" className="lg:col-span-2">
      {items.length === 0 ? (
        <EmptyWidgetState message="No activity yet." />
      ) : (
        <ul className="divide-y divide-black/5">
          {items.map((item) => (
            <li key={item.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
              <Link
                href={item.href}
                className="font-sans text-body-small text-ordift-ink hover:text-ordift-gold-pressed underline-offset-4 hover:underline"
              >
                {item.label}
              </Link>
              <p className="font-sans text-caption text-ordift-ink-muted whitespace-nowrap">
                {formatDateTime(item.timestamp)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </DashboardWidget>
  );
}
