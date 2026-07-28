"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

// Backs the "Active Users" dashboard panel — see migration 0020 for
// why this uses a Realtime Authorization-gated private channel rather
// than an unprotected one: an unprotected channel could be joined by
// any authenticated client (including a Client/Model/Vendor/Workshop
// Participant account) directly from browser dev tools, regardless of
// what this component chooses to render. The authorization policy
// itself is a direct inline check against user_roles/roles/profiles,
// not a call through the shared private.is_staff_or_admin() helper —
// that helper didn't resolve auth.uid() correctly when evaluated from
// inside Realtime's authorization path, confirmed by isolating the
// failure against a topic-only policy during staging verification.
//
// Mounted once in src/app/admin/layout.tsx, wrapping every /admin/**
// page — so a person shows as present anywhere in the admin console,
// not only while literally on /admin/overview (where the visible panel
// lives). Presence itself (join/leave) is Realtime's own connection
// tracking; "online" vs "away" on top of that is a client-side idle
// timer, since Presence alone can't tell an open-but-idle tab from an
// actively-used one.

export type PresenceUser = {
  userId: string;
  fullName: string | null;
  memberNumber: string | null;
  department: string | null;
  status: "online" | "away";
};

type TrackedPresenceUser = PresenceUser & { updatedAt: number };

const PresenceContext = createContext<PresenceUser[]>([]);

export function useAdminPresence(): PresenceUser[] {
  return useContext(PresenceContext);
}

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const CHANNEL_TOPIC = "admin-presence";

// Presence state is keyed by presence key (userId here), but each key
// can hold more than one entry — the same person connected from two
// tabs, or two overlapping connections during a navigation-triggered
// remount (observed here: the /admin -> /admin/overview server
// redirect briefly mounts the layout twice, leaving a second, stale
// connection under the same key until its own leave propagates).
// Preferring "online" over "away" isn't reliable in that case — a
// stale connection can sit at "online" indefinitely. Instead, trust
// whichever connection wrote most recently, so a real idle transition
// on the connection actually in use always wins.
function dedupeByUser(entries: TrackedPresenceUser[]): PresenceUser[] {
  const byUserId = new Map<string, TrackedPresenceUser>();
  for (const entry of entries) {
    const existing = byUserId.get(entry.userId);
    if (!existing || entry.updatedAt >= existing.updatedAt) {
      byUserId.set(entry.userId, entry);
    }
  }
  return Array.from(byUserId.values()).map(
    (u): PresenceUser => ({
      userId: u.userId,
      fullName: u.fullName,
      memberNumber: u.memberNumber,
      department: u.department,
      status: u.status,
    })
  );
}

export function PresenceProvider({
  self,
  children,
}: {
  self: Omit<PresenceUser, "status">;
  children: ReactNode;
}) {
  const [users, setUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let cleanupChannel: (() => void) | null = null;

    async function connect() {
      // Realtime Authorization evaluates RLS against the connection's
      // own JWT, which the realtime websocket client doesn't
      // automatically inherit from the main auth session — it must be
      // handed the current access token explicitly before subscribing
      // to a private channel, or the connection is evaluated as
      // `anon`, not `authenticated`, and the policy check fails even
      // for a legitimately authorized user.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled || !session) return;
      supabase.realtime.setAuth(session.access_token);

      const channel = supabase.channel(CHANNEL_TOPIC, {
        config: { private: true, presence: { key: self.userId } },
      });

      function syncPresence() {
        const state = channel.presenceState<TrackedPresenceUser>();
        setUsers(dedupeByUser(Object.values(state).flat()));
      }

      let status: "online" | "away" = "online";
      let idleTimer: ReturnType<typeof setTimeout> | null = null;

      function track(next: "online" | "away") {
        status = next;
        channel.track({ ...self, status: next, updatedAt: Date.now() });
      }

      function resetIdleTimer() {
        if (status !== "online") track("online");
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => track("away"), IDLE_TIMEOUT_MS);
      }

      channel
        .on("presence", { event: "sync" }, syncPresence)
        .on("presence", { event: "join" }, syncPresence)
        .on("presence", { event: "leave" }, syncPresence)
        .subscribe((subscribeStatus) => {
          if (subscribeStatus === "SUBSCRIBED") track("online");
        });

      const activityEvents = ["mousemove", "keydown", "click", "scroll"] as const;
      activityEvents.forEach((e) => window.addEventListener(e, resetIdleTimer, { passive: true }));
      resetIdleTimer();

      cleanupChannel = () => {
        activityEvents.forEach((e) => window.removeEventListener(e, resetIdleTimer));
        if (idleTimer) clearTimeout(idleTimer);
        channel.untrack();
        supabase.removeChannel(channel);
      };
    }

    connect();

    return () => {
      cancelled = true;
      cleanupChannel?.();
    };
    // self.userId is the only value that should ever re-trigger this —
    // fullName/memberNumber/department don't change mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [self.userId]);

  return <PresenceContext.Provider value={users}>{children}</PresenceContext.Provider>;
}
