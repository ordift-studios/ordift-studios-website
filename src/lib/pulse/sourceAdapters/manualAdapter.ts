import type { PulseSourceAdapter, PulseSourceLike, RawDiscoveredItem } from "./types";

// Manual/editorial adapter (Phase A, 2026-08-24 — see
// PULSE_INGESTION_FOUNDATION.md §D). Represents sources whose content is
// always entered directly by an editor in Sanity Studio — nothing to
// fetch. Exists so `sourceType: "manual"` has a real, interface-conforming
// adapter (satisfying any code that dispatches by sourceType) rather than
// a special-cased branch — same polymorphic-field discipline as the rest
// of this codebase.
export const manualAdapter: PulseSourceAdapter = {
  async fetch(_source: PulseSourceLike): Promise<RawDiscoveredItem[]> {
    return [];
  },
};
