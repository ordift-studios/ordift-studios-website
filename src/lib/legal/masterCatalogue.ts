// Ordift Studios Legal Suite — LEGAL-SYS-1, Phase D-0 (2026-09-08).
// Pure, zero-import canonical catalogue for the 21 approved Ordift
// Studios legal documents. This is the LOCKED numbering — do not
// renumber. Distinct from, and never confused with, the pre-existing
// in-code "Enterprise Legal Series" (OSELS) registry at
// src/lib/legal/registry.ts, whose own OS-LGL-001..004 codes are now
// legacy identifiers reconciled onto these canonical codes (see
// migration 0067's header comment for the full mapping).
//
// This module carries ONLY metadata (code, title, classification) —
// never legal prose. The actual approved Official Master text is
// supplied through a separate, controlled document-import process; no
// document body is fabricated here.

export const LEGAL_DOCUMENT_CLASSIFICATIONS = [
  "transaction_agreement",
  "release_authorization",
  "public_legal_document",
  "internal_governance",
] as const;
export type LegalDocumentClassification = (typeof LEGAL_DOCUMENT_CLASSIFICATIONS)[number];

export type CanonicalLegalMasterDefinition = {
  code: string;
  title: string;
  classification: LegalDocumentClassification;
};

// Order matches the approved catalogue exactly (Phase D-0, Part 1).
export const CANONICAL_LEGAL_MASTERS: readonly CanonicalLegalMasterDefinition[] = [
  { code: "OS-LGL-001", title: "Personal Portrait Agreement", classification: "transaction_agreement" },
  { code: "OS-LGL-002", title: "Wedding & Event Photography/Videography Agreement", classification: "transaction_agreement" },
  { code: "OS-LGL-003", title: "Commercial / Advertising Production Agreement", classification: "transaction_agreement" },
  { code: "OS-LGL-004", title: "Model / Talent Appearance, Image & Usage Rights Release", classification: "release_authorization" },
  { code: "OS-LGL-005", title: "Property / Location Release & Production Authorization", classification: "release_authorization" },
  { code: "OS-LGL-006", title: "RAW / Source Files Release & Licence Agreement", classification: "transaction_agreement" },
  { code: "OS-LGL-007", title: "Employee Employment Agreement", classification: "transaction_agreement" },
  { code: "OS-LGL-008", title: "Independent Contractor / Freelancer Agreement", classification: "transaction_agreement" },
  { code: "OS-LGL-009", title: "Vendor / Supplier Agreement", classification: "transaction_agreement" },
  { code: "OS-LGL-010", title: "Instructor / Workshop Facilitator Agreement", classification: "transaction_agreement" },
  { code: "OS-LGL-011", title: "Partnership / Collaboration Agreement", classification: "transaction_agreement" },
  { code: "OS-LGL-012", title: "Referral Agreement", classification: "transaction_agreement" },
  { code: "OS-LGL-013", title: "Sponsorship / Value Exchange Agreement", classification: "transaction_agreement" },
  { code: "OS-LGL-014", title: "Client Service Terms & General Booking Agreement", classification: "transaction_agreement" },
  { code: "OS-LGL-015", title: "Website / Platform Terms", classification: "public_legal_document" },
  { code: "OS-LGL-016", title: "Privacy Notice / Privacy Policy", classification: "public_legal_document" },
  { code: "OS-LGL-017", title: "Cookie Notice / Cookie Policy", classification: "public_legal_document" },
  { code: "OS-LGL-018", title: "Data Processing Agreement", classification: "transaction_agreement" },
  { code: "OS-LGL-019", title: "Confidentiality / Mutual NDA", classification: "transaction_agreement" },
  { code: "OS-LGL-020", title: "Data / Security Incident & Breach Response Standard", classification: "internal_governance" },
  { code: "OS-LGL-021", title: "Model / Talent Management Agreement", classification: "transaction_agreement" },
] as const;

// The 4 canonical codes reconciled from pre-existing, genuinely-live
// legacy OSELS content — see migration 0067. Every other code in the
// catalogue has no legacy mapping (content not yet supplied).
export const LEGACY_OSELS_RECONCILIATION: Readonly<Record<string, { legacyCode: string; publicSlug: string }>> = {
  "OS-LGL-016": { legacyCode: "OS-LGL-001", publicSlug: "privacy" },
  "OS-LGL-017": { legacyCode: "OS-LGL-002", publicSlug: "cookies" },
  "OS-LGL-015": { legacyCode: "OS-LGL-003", publicSlug: "terms" },
  "OS-LGL-014": { legacyCode: "OS-LGL-004", publicSlug: "booking" },
};

export function getCanonicalMasterDefinition(code: string): CanonicalLegalMasterDefinition | null {
  return CANONICAL_LEGAL_MASTERS.find((m) => m.code === code) ?? null;
}

// Template lifecycle (Part 5) — a state machine on ONE version row,
// never a new version per state. "approved" and "active" are
// deliberately separate: reaching approved never auto-transitions to
// active (Production Activation is always a distinct, explicit step).
export const TEMPLATE_LIFECYCLE_STATUSES = ["draft", "legal_review", "approved", "active", "retired", "superseded"] as const;
export type TemplateLifecycleStatus = (typeof TEMPLATE_LIFECYCLE_STATUSES)[number];

const VALID_TRANSITIONS: Readonly<Record<TemplateLifecycleStatus, readonly TemplateLifecycleStatus[]>> = {
  draft: ["legal_review"],
  legal_review: ["draft", "approved"],
  approved: ["active", "retired"],
  active: ["retired", "superseded"],
  retired: [],
  superseded: [],
};

export function isValidTemplateLifecycleTransition(from: TemplateLifecycleStatus, to: TemplateLifecycleStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// Part 16/26 — business-line/document activation gates. Approval of
// the legal text never itself activates the underlying business line
// or commercial policy — both remain deliberately independent facts,
// each gated by its own separate authorization.
export const TALENT_MANAGEMENT_CODE = "OS-LGL-021";
export const RAW_LICENCE_CODE = "OS-LGL-006";

export function requiresBusinessLineActivation(code: string): boolean {
  return code === TALENT_MANAGEMENT_CODE;
}

// RAW delivery is never automatically bundled into another agreement —
// this returns true only for the RAW licence document itself, i.e. is
// used to assert "never auto-select this for every booking" at the
// contract-selection layer (built in a later phase), not to gate
// anything here.
export function isSeparatelyControlledRelease(code: string): boolean {
  return code === RAW_LICENCE_CODE;
}
