import type { Entry } from "./schema";

// Luxury Editorial descriptions for the corporate headshots packages, copied EXACTLY from Ordift_Content_Master.md (2026-10-28 handoff), by exact package key.
// status: "approved" = previously reviewed; "reviewed_draft" = reviewed commercial draft, exact-text approval still pending; "draft" = NEW proposal awaiting Founder approval (held back from every card).
// Editorial text only: prices, hours, counts and team sizes come from the selling tables. Do not edit this wording without the Founder's approval.
export const CORPORATE: Record<string, Entry> = {
  // 35. Individual Headshot — Previously reviewed
  "corp-individual_headshot": { status: "approved", description: "A refined professional portrait designed to communicate confidence, authenticity and presence. A timeless image that represents you with distinction." },
  // 36. Executive Portrait — Previously reviewed
  "corp-executive_portrait": { status: "approved", description: "An elevated portrait experience crafted for professionals who lead with purpose. Thoughtful imagery that reflects authority, character and a distinctive professional identity." },
  // 37. Team Headshots — Previously reviewed
  "corp-team": { status: "approved", description: "A cohesive portrait collection that celebrates the individuals behind your organization, creating a polished and consistent visual identity across your team." },
};
