"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { readTalentShortlist, subscribeTalentShortlist, getServerTalentShortlist } from "./talentShortlistStore";

// Ordift Talent — TALENT-SYS-2B, Phase 5 (2026-09-08). Floating tray,
// visible on Our Roster and every profile page, showing the current
// browser-local shortlist and linking to Compare. Renders nothing when
// the shortlist is empty — never an empty tray taking up space.
export default function TalentShortlistTray() {
  const slugs = useSyncExternalStore(subscribeTalentShortlist, readTalentShortlist, getServerTalentShortlist);

  if (slugs.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-full bg-ordift-navy-950 text-white pl-5 pr-2 py-2 shadow-lg">
      <span className="font-sans text-caption font-semibold">{slugs.length} shortlisted</span>
      <Link
        href={`/talent/shortlist?slugs=${slugs.map(encodeURIComponent).join(",")}`}
        className="rounded-full bg-ordift-gold text-ordift-navy-950 px-4 py-1.5 font-sans text-caption font-semibold uppercase tracking-[0.05em]"
      >
        Compare
      </Link>
    </div>
  );
}
