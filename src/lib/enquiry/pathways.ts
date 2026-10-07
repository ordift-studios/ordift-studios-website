// Enquiry pathways — approved 2026-07-23. Talent Management is
// deliberately excluded: the public directory/application/booking flow is
// Phase 1B and stays gated behind the Talent Management "Coming Soon"
// page rather than offered here as a working pathway.

export const PATHWAYS = [
  { value: "photography", label: "Photography" },
  { value: "videography", label: "Videography" },
  { value: "graphic-design", label: "Graphic Design" },
  { value: "branding", label: "Branding & Creative Strategy" },
  { value: "content-creation", label: "Content Creation" },
  { value: "production", label: "Production Services" },
  { value: "general", label: "General Enquiry" },
  { value: "partnership", label: "Partnership or Collaboration" },
] as const;

export type PathwayValue = (typeof PATHWAYS)[number]["value"];

export function isPathwayValue(value: string): value is PathwayValue {
  return PATHWAYS.some((p) => p.value === value);
}

// Services that create enquiries but are deliberately NOT offered in the
// main /book service selector (so the primary booking pathways stay
// uncluttered). Used for display, filtering and reports only.
export const EXTRA_ENQUIRY_SERVICES = [{ value: "crew-support", label: "Creative Crew Support" }] as const;

export function pathwayLabel(value: string): string {
  return PATHWAYS.find((p) => p.value === value)?.label ?? EXTRA_ENQUIRY_SERVICES.find((p) => p.value === value)?.label ?? value;
}
