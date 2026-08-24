// Source adapter interface for Ordift Pulse discovery (Phase A, 2026-08-24
// — see PULSE_INGESTION_FOUNDATION.md §D). Every adapter turns one
// pulseSource into a list of raw discovered items; nothing beyond that —
// permission gating, dedup, exclusion filtering, classification, and
// draft creation all happen in a later orchestrator (not built in Phase
// A), so an adapter never talks to Sanity and never decides what's
// published.
//
// Free adapters only, per explicit direction: RSS/Atom, a generic
// documented free JSON API, and Manual (a pass-through — editor-submitted
// items already work today via Studio, so this adapter fetches nothing).
// A future paid/licensed adapter (LicensedApiAdapter, PremiumFeedAdapter,
// etc.) implements this same interface later — the orchestrator never
// needs to change, only a new PulseSourceLike.sourceType value and one
// new adapter file. No paid adapter exists yet.

export type RawDiscoveredItem = {
  title: string;
  // Always a link-out target and dedup key — never rendered as the
  // article body itself (see PULSE_ARCHITECTURE.md's no-reproduction
  // rule, unchanged by this foundation work).
  sourceUrl: string;
  // Short excerpt/summary as provided by the feed/API, if any — raw
  // material for a human (or future AI-assist) to turn into a proper
  // Ordift-authored excerpt/body, never published verbatim as `body`.
  summary: string | null;
  imageUrl: string | null;
  author: string | null;
  publishedAt: string | null; // ISO datetime, if the source provided one
};

// The minimal shape an adapter needs from a pulseSource document — kept
// narrow and structural (not importing the full PulseSource type) so
// adapters stay decoupled from the content layer's exact field set.
export type PulseSourceLike = {
  id: string;
  name: string;
  feedUrl: string | null;
  url: string | null;
};

export interface PulseSourceAdapter {
  /**
   * Fetches raw items from one source. Must not throw for an individual
   * malformed item — skip it and return the rest; a full-source failure
   * (network error, invalid feed) should reject so the caller can log it
   * against that source specifically.
   */
  fetch(source: PulseSourceLike): Promise<RawDiscoveredItem[]>;
}
