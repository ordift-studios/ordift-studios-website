// Ordift Pulse — Official/Primary Source Discovery (2026-09-08).
// Pure, zero-import routing: which PulseArticle.origin a discovered
// draft gets, decided ONCE per source (PulseSource.sourceClassification),
// never per article — an editor should never have to remember this
// distinction for every discovered item.

export const PULSE_SOURCE_CLASSIFICATIONS = ["official_primary", "editorial_discovery"] as const;
export type PulseSourceClassification = (typeof PULSE_SOURCE_CLASSIFICATIONS)[number];

export function isValidSourceClassification(value: string): value is PulseSourceClassification {
  return (PULSE_SOURCE_CLASSIFICATIONS as readonly string[]).includes(value);
}

// "official_primary" (a brand's own newsroom) routes to origin
// "official" — an independently Ordift-written draft, full editorial
// requirements, still carrying real source/attribution fields.
// "editorial_discovery" (a third-party publication) routes to origin
// "curated" — the existing, unchanged discovery-brief behaviour
// (PetaPixel today).
export function resolveDraftOrigin(sourceClassification: PulseSourceClassification): "official" | "curated" {
  return sourceClassification === "official_primary" ? "official" : "curated";
}
