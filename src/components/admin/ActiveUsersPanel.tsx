"use client";

import { useAdminPresence } from "./PresenceProvider";

// Positioned above Recent Activity on /admin/overview, matching its
// card styling exactly (see src/app/admin/overview/page.tsx) so it
// reads as part of the same dashboard rather than a separate module.
export default function ActiveUsersPanel() {
  const users = useAdminPresence();
  const sorted = [...users].sort((a, b) => (a.fullName ?? "").localeCompare(b.fullName ?? ""));

  return (
    <section>
      <h2 className="font-serif font-medium text-body text-ordift-ink mb-4">Active Now</h2>
      {sorted.length === 0 ? (
        <p className="font-sans text-body-small text-ordift-ink-muted">No one else is currently online.</p>
      ) : (
        <div className="rounded-xl border border-black/10 bg-white divide-y divide-black/5">
          {sorted.map((u) => (
            <div key={u.userId} className="px-5 py-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`h-2 w-2 rounded-full flex-shrink-0 ${
                    u.status === "online" ? "bg-emerald-500" : "bg-amber-400"
                  }`}
                  aria-hidden="true"
                />
                <span className="font-sans text-body-small text-ordift-ink truncate">{u.fullName ?? "Unnamed account"}</span>
                {u.memberNumber && (
                  <span className="font-sans text-caption text-ordift-ink-muted whitespace-nowrap">{u.memberNumber}</span>
                )}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {u.department && (
                  <span className="font-sans text-caption text-ordift-ink-muted whitespace-nowrap">{u.department}</span>
                )}
                <span className="font-sans text-caption text-ordift-ink-muted whitespace-nowrap capitalize">
                  {u.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
