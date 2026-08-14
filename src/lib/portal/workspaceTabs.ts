export type WorkspaceTab = { slug: string; label: string };

// The whole reusable-tabs contract lives in this one array. Adding a
// future tab (Payments, Contracts, Messages, Document Vault, Feedback,
// Invoices, AI Assistant) means adding one entry here plus its route
// folder — the layout, header, and every existing tab are untouched.
export const WORKSPACE_TABS: WorkspaceTab[] = [
  { slug: "", label: "Overview" },
  { slug: "timeline", label: "Timeline" },
  { slug: "deliverables", label: "Deliverables" },
  { slug: "booking-details", label: "Booking Details" },
  { slug: "payments", label: "Payments" },
  { slug: "requests", label: "Requests" },
  { slug: "updates", label: "Updates" },
];
