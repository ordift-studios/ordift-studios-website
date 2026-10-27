// PROPOSED default pricing structure per service family: "fixed" = a package with one price, "from" = a starting price quoted per brief. These are working defaults for the draft only —
// the Founder confirms the structure per category before anything is approved. Nothing here sets or implies a price.
export type FamilyKey = "personal_sessions" | "weddings_events" | "content_creation" | "corporate_headshots" | "commercial" | "graphic_design" | "branding" | "production_services" | "crew_support";
export const DEFAULT_STRUCTURE: Record<FamilyKey, "fixed" | "from"> = {
  personal_sessions: "fixed", weddings_events: "fixed", content_creation: "fixed",
  corporate_headshots: "from", commercial: "from", graphic_design: "from", branding: "from", production_services: "from", crew_support: "from",
};
// Families whose selling tables are connected to the builder so far (the rest are added the same way, one adapter each).
export const CONNECTED_FAMILIES: FamilyKey[] = ["personal_sessions", "weddings_events"];
