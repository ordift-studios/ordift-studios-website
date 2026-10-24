import type { UsageRightsCategory } from "@/lib/legal/rightsCatalogue";

// Where a photograph may be used. The same list, and the same mapping to the legal rights catalogue, is enforced by the database
// (supabase/proposals 0170/0171); destinations.test.ts keeps the two in step.
export const DESTINATIONS = [
  { key: "portfolio", label: "Portfolio" },
  { key: "website", label: "Website" },
  { key: "social_media", label: "Social media" },
  { key: "client_samples", label: "Client samples" },
  { key: "journal", label: "Journal" },
  { key: "brochure", label: "Brochures" },
  { key: "print_collateral", label: "Rate cards, flyers & print" },
  { key: "paid_advertising", label: "Paid advertising" },
] as const;
export type Destination = (typeof DESTINATIONS)[number]["key"];
export const DESTINATION_KEYS: readonly Destination[] = DESTINATIONS.map((d) => d.key);
export const DESTINATION_LABEL = Object.fromEntries(DESTINATIONS.map((d) => [d.key, d.label])) as Record<Destination, string>;
export const isDestination = (v: string): v is Destination => (DESTINATION_KEYS as readonly string[]).includes(v);

// Which existing release usage-right (agreement_releases.usage_rights) a use depends on.
export const DESTINATION_USAGE_RIGHT: Record<Destination, UsageRightsCategory> = {
  portfolio: "portfolio",
  client_samples: "portfolio",
  website: "website",
  journal: "website",
  social_media: "organic_social",
  brochure: "print",
  print_collateral: "print",
  paid_advertising: "paid_advertising",
};

export type JobType = "crew_support_request" | "engagement";
export const isJobType = (v: string): v is JobType => v === "crew_support_request" || v === "engagement";
export const jobKey = (t: JobType, id: string) => `${t}:${id}`;
export function parseJobKey(key: string | undefined | null): { jobType: JobType; jobId: string } | null {
  const m = /^(crew_support_request|engagement):([0-9a-f-]{36})$/i.exec(key ?? "");
  return m ? { jobType: m[1] as JobType, jobId: m[2].toLowerCase() } : null;
}
