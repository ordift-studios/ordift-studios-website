"use client";

import { useSyncExternalStore } from "react";
import { readTalentShortlist, writeTalentShortlist, subscribeTalentShortlist, getServerTalentShortlist } from "./talentShortlistStore";

// Ordift Talent — TALENT-SYS-2B, Phase 5 (2026-09-08). Shortlist/
// Compare foundation (Part 15) — deliberately client-only, no schema,
// no auth: any visitor browsing Our Roster can build a private,
// browser-local shortlist to compare. This is NOT the authenticated
// client casting workspace (Part 16/Phase 6) — that's a real, separate
// surface reusing Client Portal infrastructure, sequenced after this
// foundation, not built in this pass.
export default function TalentShortlistButton({ slug }: { slug: string }) {
  const shortlist = useSyncExternalStore(subscribeTalentShortlist, readTalentShortlist, getServerTalentShortlist);
  const shortlisted = shortlist.includes(slug);

  function toggle() {
    const current = readTalentShortlist();
    writeTalentShortlist(current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug]);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={shortlisted}
      className={`inline-flex items-center justify-center rounded-full px-6 py-3 font-sans text-caption font-semibold uppercase tracking-[0.05em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ordift-gold-hover ${
        shortlisted ? "bg-ordift-gold text-ordift-navy-950" : "bg-white/10 text-white border border-white/30 hover:bg-white/20"
      }`}
    >
      {shortlisted ? "Shortlisted ✓" : "Shortlist"}
    </button>
  );
}
