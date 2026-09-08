"use client";

import { useState } from "react";

// Ordift Talent — TALENT-SYS-2B, Phase 4 (2026-09-08). Portfolio /
// Digitals / Reel / Info (Part 8) — the functional hierarchy every
// concept prototype converged on. Client-only tab state, no route
// change — keyboard/focus-operable buttons, not hover-only (Part 25).
export type TalentTabId = "portfolio" | "digitals" | "reel" | "info";

const TABS: { id: TalentTabId; label: string }[] = [
  { id: "portfolio", label: "Portfolio" },
  { id: "digitals", label: "Digitals" },
  { id: "reel", label: "Reel" },
  { id: "info", label: "Info" },
];

export default function TalentProfileTabs({ panels }: { panels: Record<TalentTabId, React.ReactNode> }) {
  const [active, setActive] = useState<TalentTabId>("portfolio");

  return (
    <div>
      <div role="tablist" aria-label="Talent profile sections" className="flex gap-1 border-b border-black/10 mb-8 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active === tab.id}
            onClick={() => setActive(tab.id)}
            className={`px-4 py-3 font-sans text-caption font-semibold uppercase tracking-[0.06em] whitespace-nowrap border-b-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ordift-gold-pressed ${
              active === tab.id ? "border-ordift-gold-pressed text-ordift-ink" : "border-transparent text-ordift-ink-muted hover:text-ordift-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {TABS.map((tab) => (
        <div key={tab.id} role="tabpanel" hidden={active !== tab.id}>
          {panels[tab.id]}
        </div>
      ))}
    </div>
  );
}
