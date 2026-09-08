// Ordift Studios Legal Suite — LEGAL-SYS-1, Phase D-0 (2026-09-08).
// Pure derivation logic for the Settings → Legal & Forms page.
//
// Replaces the previous single, vestigial LEGAL_PAGES_APPROVED env-var
// badge (which did not gate anything real — see the Discovery Report)
// with two genuinely separate, derived truths, exactly per instruction:
// "LEGAL SUITE COUNSEL APPROVAL" is distinct from "PUBLIC LEGAL
// ACTIVATION". Neither status is ever hand-set by an admin toggle —
// both are computed from the real legal_document_masters/versions rows.

import { CANONICAL_LEGAL_MASTERS, type LegalDocumentClassification } from "./masterCatalogue";

export type MasterVersionSummary = { status: string; effectiveDate: string | null; publicSlug: string | null };
export type MasterStatusInput = { canonicalCode: string; classification: LegalDocumentClassification; versions: MasterVersionSummary[] };

export type LegalMastersStatus = "approved" | "incomplete";

// "Legal Masters: APPROVED" requires EVERY one of the 21 canonical
// codes to be represented, each with at least one version that has
// genuinely reached "approved" or a later lifecycle status (active/
// retired/superseded all imply it was approved at some point). This
// can only ever be true because it reflects a real fact recorded in
// the database — never a flag an admin can flip directly.
export function deriveLegalMastersStatus(masters: MasterStatusInput[]): LegalMastersStatus {
  const APPROVED_OR_LATER = new Set(["approved", "active", "retired", "superseded"]);
  const byCode = new Map(masters.map((m) => [m.canonicalCode, m]));
  for (const def of CANONICAL_LEGAL_MASTERS) {
    const master = byCode.get(def.code);
    if (!master) return "incomplete";
    const hasApprovedOrLater = master.versions.some((v) => APPROVED_OR_LATER.has(v.status));
    if (!hasApprovedOrLater) return "incomplete";
  }
  return "approved";
}

export type PublicLegalPagesStatus = "active" | "pending_activation";

// "Public Legal Pages" covers ONLY the public_legal_document
// classification (Website Terms / Privacy / Cookie Notice) — never
// Booking Terms (OS-LGL-014, a transaction_agreement) or any other
// code. ACTIVE requires each of those three to have a version that is
// genuinely status='active' AND carries a real (non-fabricated)
// effective date AND a real public URL slug — i.e. is genuinely,
// verifiably live today, not merely approved in principle.
export function derivePublicLegalPagesStatus(masters: MasterStatusInput[]): PublicLegalPagesStatus {
  const publicMasters = masters.filter((m) => m.classification === "public_legal_document");
  const requiredCodes = CANONICAL_LEGAL_MASTERS.filter((d) => d.classification === "public_legal_document").map((d) => d.code);
  for (const code of requiredCodes) {
    const master = publicMasters.find((m) => m.canonicalCode === code);
    if (!master) return "pending_activation";
    const hasGenuinelyActiveVersion = master.versions.some((v) => v.status === "active" && v.effectiveDate !== null && v.publicSlug !== null);
    if (!hasGenuinelyActiveVersion) return "pending_activation";
  }
  return "active";
}
