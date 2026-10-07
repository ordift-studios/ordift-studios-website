import type { ProjectKind } from "@/lib/portal/workspace";

export type WorkspaceTab = { slug: string; label: string; kinds?: ProjectKind[]; requires?: string };

// The whole reusable-tabs contract lives in this one array. Adding a
// future tab (Payments, Contracts, Messages, Document Vault, Feedback,
// Invoices, AI Assistant) means adding one entry here plus its route
// folder — the layout, header, and every existing tab are untouched.
// `kinds` (added for Workshop Learning Infrastructure V1, 2026-09-19)
// scopes a tab to specific project kinds only — undefined = every
// kind (the original, unscoped behaviour every pre-existing tab keeps).
export const WORKSPACE_TABS: WorkspaceTab[] = [
  { slug: "", label: "Overview" },
  { slug: "schedule", label: "Schedule", kinds: ["workshop"] },
  { slug: "timeline", label: "Timeline" },
  { slug: "materials", label: "Materials", kinds: ["workshop"] },
  { slug: "briefs", label: "Creative Briefs", kinds: ["workshop"] },
  { slug: "deliverables", label: "Deliverables" },
  { slug: "booking-details", label: "Booking Details" },
  // Shown only when the project actually has an issued quotation
  // (Creative Crew Support, 2026-10-07) — never for legacy enquiries.
  { slug: "quotation", label: "Quotation", kinds: ["enquiry"], requires: "quotation" },
  { slug: "payments", label: "Payments" },
  { slug: "requests", label: "Requests" },
  { slug: "updates", label: "Updates" },
];

export function workspaceTabsForKind(kind: ProjectKind, features: string[] = []): WorkspaceTab[] {
  return WORKSPACE_TABS.filter((t) => (!t.kinds || t.kinds.includes(kind)) && (!t.requires || features.includes(t.requires)));
}
