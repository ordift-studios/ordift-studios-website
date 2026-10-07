import type { CrmStage } from "@/lib/admin/enquiries";

// Explicit ONE-WAY mapping from Crew Support events to the linked
// enquiry's CRM stage, so the two never drift without a reason. Crew
// Support owns the operational lifecycle; the enquiry stage follows. `to:
// null` is a deliberate, documented no-op. "Booked" is intentionally NOT
// reachable from any event here: it is reserved for genuine confirmation
// (Phase 3), never for quotation acceptance or payment alone.
export type CrewSyncEvent = "under_review" | "quote_issued" | "quote_accepted" | "declined" | "cancelled";

const OPEN_STAGES: CrmStage[] = ["new_lead", "contacted", "discovery_meeting", "quotation_sent", "negotiation"];

export const ENQUIRY_STAGE_SYNC: Record<CrewSyncEvent, { to: CrmStage | null; from: CrmStage[] }> = {
  under_review: { to: "contacted", from: ["new_lead"] },
  quote_issued: { to: "quotation_sent", from: ["new_lead", "contacted", "discovery_meeting"] },
  quote_accepted: { to: null, from: [] },
  declined: { to: "declined", from: OPEN_STAGES },
  cancelled: { to: "closed", from: OPEN_STAGES },
};
