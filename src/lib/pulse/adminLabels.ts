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

// Rights Intelligence "Check Policy" (2026-09-08) — deliberately never
// the words Green/Amber/Red, so this can never be mistaken for the
// actual Permission Classification it's only ever a non-binding
// suggestion toward. See policyEvidence.ts.
export const POLICY_CHECK_RECOMMENDATION_LABEL: Record<"candidate-green" | "candidate-red" | "inconclusive", string> = {
  "candidate-green": "Candidate for Green — clear, contextual permissive language found",
  "candidate-red": "Candidate for Red — restrictive language found",
  inconclusive: "Inconclusive — no clear signal, signals conflict, or the page couldn't be checked",
};

export const POLICY_CHECK_DISCLAIMER =
  "A non-binding editorial risk signal based on the page checked below — not a legal determination and not the Permission Classification itself. Choose and Save Permission Classification above yourself.";

export const POLICY_CHECK_CATEGORY_LABEL: Record<string, string> = {
  "press-materials": "Press materials",
  photographs: "Photographs",
  trademarks: "Trademarks",
  "third-party": "Third-party content",
  "website-general": "General website text",
  "fetch-error": "Couldn't check",
  "safety-block": "Blocked for safety",
  "unsupported-content": "Unsupported content",
  "fallback-candidate": "Discovered official policy/gateway page",
  "fallback-candidate-substantive": "Possible substantive official policy page",
};
