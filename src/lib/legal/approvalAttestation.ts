// Historical approval attestation - the smallest audited way to record WHEN Legal Counsel actually approved ONE specific controlled
// document, without inventing a date. Pure rules only; the storage and the write path are proposed separately
// (supabase/proposals/PROPOSED_legal_approval_attestations.sql) and are NOT applied.
//
// Five dates are kept apart and never substituted for one another:
//   1. historical approval date   - what this attestation records (the real day counsel approved THIS document)
//   2. verification time          - when an administrator checked the evidence (system clock, not typed)
//   3. template effective date    - set when the template is activated
//   4. activation timestamp       - stamped by the registry when the version is activated
//   5. the individual agreement's own effective / execution dates - belong to that agreement, never to the template

export const EVIDENCE_KINDS = ["signed_letter", "counsel_email", "signed_register", "other_written_record"] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export type AttestationInput = {
  documentCode: string;
  approvalDate: string; // YYYY-MM-DD, the historical approval date
  counselName: string;
  counselFirm: string;
  evidenceKind: string;
  evidenceReference: string; // what the evidence is and where it can be found
  evidenceSha256?: string | null; // fingerprint of the evidence file when one is attached
  coversDocumentCodes: string[]; // the approval must name THIS document; a package-level date is not borrowed
};

export type AttestationContext = {
  documentCode: string;
  today: string; // YYYY-MM-DD
  // The registry created this version already marked approved, so the approval cannot have happened after that moment.
  versionCreatedOn: string | null; // YYYY-MM-DD
  versionWasCreatedApproved: boolean;
};

export type AttestationVerdict = { ok: true } | { ok: false; errors: string[] };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const HEX64 = /^[0-9a-f]{64}$/i;

export function validateApprovalAttestation(i: AttestationInput, c: AttestationContext): AttestationVerdict {
  const errors: string[] = [];
  if (i.documentCode !== c.documentCode) errors.push(`This attestation is for ${i.documentCode}, not ${c.documentCode}.`);
  if (!i.coversDocumentCodes.includes(c.documentCode)) errors.push(`The approval must expressly name ${c.documentCode}. A date that belongs to a different document set cannot be reused.`);
  if (!ISO.test(i.approvalDate) || Number.isNaN(Date.parse(i.approvalDate))) errors.push("Enter the historical approval date as YYYY-MM-DD.");
  else {
    if (i.approvalDate > c.today) errors.push("The approval date cannot be in the future.");
    if (c.versionWasCreatedApproved && c.versionCreatedOn && i.approvalDate > c.versionCreatedOn)
      errors.push(`The registry already recorded this version as approved on ${c.versionCreatedOn}, so counsel cannot have approved it later than that. Check which document the date belongs to.`);
  }
  if (i.counselName.trim().length < 3) errors.push("Name the approving counsel.");
  if (i.counselFirm.trim().length < 3) errors.push("Name counsel's firm.");
  if (!(EVIDENCE_KINDS as readonly string[]).includes(i.evidenceKind)) errors.push("Choose the kind of evidence.");
  if (i.evidenceReference.trim().length < 15) errors.push("Describe the evidence and where it is kept (at least a short sentence).");
  if (i.evidenceSha256 && !HEX64.test(i.evidenceSha256)) errors.push("The evidence fingerprint must be a 64-character SHA-256 value.");
  return errors.length ? { ok: false, errors } : { ok: true };
}

// The date shown as "approval date" comes from, in order: the registry's own stamp (only set by a real approve transition), then a
// valid attestation. Never from ingestion, never from the present date, never from another document's approval.
export type ApprovalDateSource = { date: string; source: "registry_stamp" | "attestation" } | null;
export function resolveApprovalDate(version: { approvedAt: string | null }, attestation: { approvalDate: string } | null): ApprovalDateSource {
  if (version.approvedAt) return { date: version.approvedAt.slice(0, 10), source: "registry_stamp" };
  if (attestation) return { date: attestation.approvalDate, source: "attestation" };
  return null;
}
