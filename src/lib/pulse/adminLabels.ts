import type { PulseEditorialTrustLevel, PulsePermissionClassification } from "@/lib/content/types";

// Shared Admin-facing labels for Pulse's two independent classifications
// (Phase D, 2026-08-24) — kept as one small lookup so the list and detail
// pages render identical wording, and so the "permission ≠ trust"
// distinction (2026-08-24 direction) reads the same everywhere.
export const PERMISSION_LABEL: Record<PulsePermissionClassification, string> = {
  green: "Green — Syndication Permitted",
  blue: "Blue — Discovery/Linking Only",
  amber: "Amber — Permission Unclear",
  red: "Red — Disallowed",
  unknown: "Unknown — Not Yet Reviewed",
};

// Rights Intelligence (2026-09-08) — these are editorial RISK
// INDICATORS the Admin UI must present as such, never as a legal
// determination. Any component rendering PERMISSION_LABEL should
// surface this caption near it at least once per page.
export const RIGHTS_STATUS_DISCLAIMER = "Editorial risk indicator, not a legal determination.";

export const TRUST_LABEL: Record<PulseEditorialTrustLevel, string> = {
  high: "High",
  standard: "Standard",
  unverified: "Unverified",
  flagged: "Flagged",
};
