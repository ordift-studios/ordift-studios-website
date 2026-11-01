// The authoritative package keys of the selling tables (identical in Ghana and Qatar). The registry is checked against this list, and a test checks this list against what the mappers produce.
const MODES = ["photography", "film", "photography_film"] as const;
const WEDDING_TIERS = ["chapter", "narrative", "chronicle", "archive"] as const;
const EVENT_TIERS = ["focused", "half_day", "full_day", "extended", "full_event", "round_the_clock"] as const;
const COMMERCIAL_SCOPES = ["focused", "full_day", "extended"] as const;

export const PACKAGE_KEYS: readonly string[] = [
  "ps-1h", "ps-2h", "ps-3h", "ps-4h",
  ...MODES.flatMap((m) => WEDDING_TIERS.map((t) => `wedding-${m}-${t}`)),
  ...MODES.flatMap((m) => EVENT_TIERS.map((t) => `event-${m}-${t}`)),
  "corp-individual_headshot", "corp-executive_portrait", "corp-team",
  ...MODES.flatMap((m) => COMMERCIAL_SCOPES.map((s) => `com-${m}-${s}`)), "com-catalogue",
];
export const SECTION_KEYS: readonly string[] = [
  "personal_sessions",
  ...MODES.map((m) => `wedding_${m}`), ...MODES.map((m) => `event_${m}`),
  "corporate_headshots", "commercial",
];
