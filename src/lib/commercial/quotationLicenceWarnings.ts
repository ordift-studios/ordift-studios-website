// EARLY WARNING that a draft quotation appears to include an activity its contracting entity is not licensed for. Pure. It is advisory: the authoritative check is the database's own
// eligibility check when the quotation is issued, which is unchanged. Detection is keyword-based on the lines the person wrote, so it can miss something or flag something that is not
// there; it never ticks, records or changes anything, and a planned activity is never treated as licensed.

type Line = { serviceItem: string; description: string | null };
type ActivityState = { key: string; label: string; state: "licensed" | "listed_on_registration" | "planned" | "suspended" | "not_licensed" };

const PATTERNS: [string, RegExp][] = [
  ["videography", /\b(video|videograph\w*|film|films|filmed|cinemat\w*|documentary|highlight\s+reel|footage|livestream\w*|live\s+stream\w*)\b/i],
  ["photography", /\b(photo|photos|photograph\w*|portrait\w*|headshot\w*|retouch\w*)\b/i],
  ["graphic_design", /\b(graphic\s+design|logo|brand\s+identity|branding|layout|poster|brochure)\b/i],
  ["talent_management", /\btalent\b/i],
  ["production_services", /\b(production\s+services?|production\s+management|fixer|crew\s+support)\b/i],
  ["drone_operations", /\b(drone|aerial)\b/i],
];

export function detectActivities(lines: Line[], enquiryService?: string | null): string[] {
  const found = new Set<string>();
  const svc = String(enquiryService ?? "").toLowerCase().replace(/[^a-z]+/g, "_");
  if (PATTERNS.some(([k]) => k === svc)) found.add(svc);
  for (const l of lines) for (const [key, re] of PATTERNS) if (re.test(`${l.serviceItem} ${l.description ?? ""}`)) found.add(key);
  return [...found].sort();
}

export type LicenceWarning = { activity: string; text: string };

// `states` = the entity's own assessment of exactly those activities (from the authoritative rules).
export function licenceWarnings(p: { entityName: string; jurisdiction: string | null; detected: string[]; states: ActivityState[] }): LicenceWarning[] {
  const where = p.jurisdiction ? `${p.entityName} (${p.jurisdiction})` : p.entityName;
  return p.states
    .filter((s) => p.detected.includes(s.key) && s.state !== "licensed" && s.state !== "listed_on_registration")
    .map((s) => ({
      activity: s.key,
      text: `This quotation appears to include ${s.label.toLowerCase()}, which is ${s.state === "planned" ? "only planned for" : s.state === "suspended" ? "suspended for" : "not covered by the recorded licence of"} ${where}. Issuing with ${s.label.toLowerCase()} ticked will be refused. The work is not moved to another entity automatically; a Super Admin decides how to proceed.`,
    }));
}
