import { PATHWAYS } from "@/lib/enquiry/pathways";

// Creative Crew Support (2026-10-04) — configuration only. Service
// families are derived from the existing service PATHWAYS (so a new
// pathway is one entry away, not a second taxonomy); roles come from the
// existing operational_titles lookup at request time, grouped here by
// slug. A role not mapped to a family still appears under "Other".

export const COMMERCIAL_INTENT_CREW_SUPPORT = "creative_crew_support" as const;
export const CREW_SUPPORT_SERVICE = "crew-support" as const;

export const REQUESTER_TYPES = [
  { value: "photographer", label: "Photographer" },
  { value: "videographer", label: "Videographer / Filmmaker" },
  { value: "creative_studio", label: "Creative Studio" },
  { value: "production_company", label: "Production Company" },
  { value: "agency", label: "Agency" },
  { value: "brand_business", label: "Brand / Business" },
  { value: "event_professional", label: "Event Professional" },
  { value: "other", label: "Other" },
] as const;
export type RequesterType = (typeof REQUESTER_TYPES)[number]["value"];

export const URGENCY_OPTIONS = [
  { value: "flexible", label: "Flexible" },
  { value: "standard", label: "Standard" },
  { value: "urgent", label: "Urgent — needed soon" },
] as const;

// Which existing operational_titles are offered under each family.
// Purely presentational grouping — assignment eligibility is decided by
// staff, never by this mapping.
const TITLE_SLUGS_BY_FAMILY: Record<string, string[]> = {
  photography: ["photographer", "photo_editor", "lighting_assistant", "drone_operator", "production_assistant"],
  videography: ["videographer", "video_editor", "drone_operator", "lighting_assistant", "production_assistant"],
  production: ["production_assistant", "event_coordinator", "lighting_assistant", "creative_director", "makeup_artist", "stylist"],
  "content-creation": ["videographer", "photographer", "video_editor", "creative_director"],
  "graphic-design": ["graphic_designer", "creative_director"],
};

const FAMILY_PATHWAYS = ["photography", "videography", "production", "content-creation", "graphic-design"] as const;
const FAMILY_LABEL_OVERRIDES: Record<string, string> = { videography: "Videography / Film", "graphic-design": "Graphic Design / Creative" };

export const SERVICE_FAMILIES: { value: string; label: string; titleSlugs: string[] }[] = [
  ...FAMILY_PATHWAYS.map((value) => ({
    value,
    label: FAMILY_LABEL_OVERRIDES[value] ?? PATHWAYS.find((p) => p.value === value)?.label ?? value,
    titleSlugs: TITLE_SLUGS_BY_FAMILY[value] ?? [],
  })),
  { value: "other", label: "Other / Custom Creative Support", titleSlugs: [] },
];

export function isServiceFamily(value: string): boolean {
  return SERVICE_FAMILIES.some((f) => f.value === value);
}

export type DetailQuestion = { id: string; label: string; kind: "text" | "textarea" | "select"; options?: { value: string; label: string }[] };

const MEDIA_QUESTIONS: DetailQuestion[] = [
  { id: "equipment", label: "Equipment", kind: "select", options: [{ value: "crew_brings", label: "Ordift crew brings their own" }, { value: "requester_supplies", label: "I will supply equipment" }, { value: "to_discuss", label: "To discuss" }] },
  { id: "coverageResponsibilities", label: "Coverage responsibilities", kind: "textarea" },
  { id: "mediaHandoff", label: "File / media handoff expectations", kind: "textarea" },
  { id: "rawRequired", label: "Are RAW / original files required?", kind: "select", options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "to_discuss", label: "To discuss" }] },
  { id: "dressCode", label: "Dress / appearance requirements (if any)", kind: "text" },
];
const PRODUCTION_QUESTIONS: DetailQuestion[] = [
  { id: "callTimesLogistics", label: "Call times and logistics", kind: "textarea" },
  { id: "equipmentPpe", label: "Equipment / PPE requirements (only if relevant)", kind: "textarea" },
];
const GENERAL_QUESTIONS: DetailQuestion[] = [
  { id: "deliveryNotes", label: "What should the support person work on or deliver?", kind: "textarea" },
];

export function detailQuestionsFor(family: string): DetailQuestion[] {
  if (family === "photography" || family === "videography") return MEDIA_QUESTIONS;
  if (family === "production") return PRODUCTION_QUESTIONS;
  return GENERAL_QUESTIONS;
}

export const CREW_SUPPORT_STATUSES = ["received", "under_review", "availability_review", "quote_preparation", "quoted", "agreement_pending", "payment_pending", "confirmed", "declined", "cancelled"] as const;
export type CrewSupportStatus = (typeof CREW_SUPPORT_STATUSES)[number];

export const STATUS_LABELS: Record<CrewSupportStatus, string> = {
  received: "Request received",
  under_review: "Under review",
  availability_review: "Availability review",
  quote_preparation: "Quote preparation",
  quoted: "Quote issued",
  agreement_pending: "Agreement pending",
  payment_pending: "Payment pending",
  confirmed: "Confirmed",
  declined: "Declined",
  cancelled: "Cancelled",
};

const FORWARD: Record<CrewSupportStatus, CrewSupportStatus[]> = {
  received: ["under_review", "declined", "cancelled"],
  under_review: ["availability_review", "declined", "cancelled"],
  availability_review: ["quote_preparation", "declined", "cancelled"],
  quote_preparation: ["quoted", "availability_review", "declined", "cancelled"],
  quoted: ["agreement_pending", "payment_pending", "declined", "cancelled"],
  agreement_pending: ["payment_pending", "confirmed", "declined", "cancelled"],
  payment_pending: ["agreement_pending", "confirmed", "declined", "cancelled"],
  confirmed: ["cancelled"],
  declined: [],
  cancelled: [],
};

export function allowedStatusTransitions(from: CrewSupportStatus): CrewSupportStatus[] {
  return FORWARD[from];
}

export const SLOT_STATUSES = ["unfilled", "proposed", "assigned", "declined", "released"] as const;
export type SlotStatus = (typeof SLOT_STATUSES)[number];
export const SLOT_STATUS_LABELS: Record<SlotStatus, string> = { unfilled: "Unfilled", proposed: "Proposed", assigned: "Assigned", declined: "Declined", released: "Released" };

// The only wording the requester sees after submitting. Deliberately
// never says "booked"/"confirmed" and never promises crew.
export const SUBMITTED_MESSAGE =
  "Request received. Ordift will review your scope and crew requirements and confirm availability, pricing and next steps.";

export const PROFICIENCIES = ["primary", "secondary", "supporting"] as const;
export type Proficiency = (typeof PROFICIENCIES)[number];
export const PROFICIENCY_LABELS: Record<Proficiency, string> = { primary: "Primary", secondary: "Secondary", supporting: "Supporting" };

export const VERIFICATION_STATUSES = ["self_declared", "verified", "revoked"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
export const VERIFICATION_LABELS: Record<VerificationStatus, string> = { self_declared: "Self-declared (unverified)", verified: "Verified", revoked: "Revoked" };
