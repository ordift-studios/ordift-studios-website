// Historical approval attestation - the smallest audited way to record WHEN Legal Counsel actually approved ONE specific controlled
// document, without inventing a date. Pure rules only; the write path is attestHistoricalApproval() in masterRegistryActions.ts, which stores the
// attestation as an audit event (no table of its own).
//
// Dates and facts that are kept apart and never substituted for one another:
//   1. creation date              - when the registry created the version (legal_document_versions.created_at); never changed
//   2. registry "approved" label  - for the seeded v1.0 masters this is an UNEVIDENCED assertion made by the seed migration (no stamp, no date, no
//                                   evidence). It is not a dated approval and is never presented as one.
//   3. counsel's legal approval / confirmation date - what this attestation records: the day shown in counsel's own evidence. It may be the day of
//                                   the creation or any later day up to today; it can never precede the version's creation, and never be in the future.
//   4. counsel identity check     - the administrator's recorded, independent check of WHO counsel is (method, date, note). The system has not
//                                   itself verified anyone's identity; an email's own claim, or the sender's own confirmation, is never enough.
//   5. verification time          - when an administrator recorded the attestation (system clock, not typed)
//   6. template effective date / activation timestamp - set later, at activation; never earlier than (3)
//   7. the individual agreement's own effective / execution dates - belong to that agreement, never to the template

export const EVIDENCE_KINDS = ["signed_letter", "counsel_email", "counsel_message", "message_transcript", "signed_register", "other_written_record"] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

// Independent ways of checking who counsel is. Deliberately absent: "the email says so" / "counsel confirms their own address" - a self-declaration from the
// account being checked is not an independent check.
export const IDENTITY_METHODS = ["call_back_independent_number", "firm_or_bar_register_confirmation", "in_person", "other_documented"] as const;
export type IdentityMethod = (typeof IDENTITY_METHODS)[number];
export const IDENTITY_METHOD_LABELS: Record<IdentityMethod, string> = {
  call_back_independent_number: "Call-back to a number obtained independently of the email",
  firm_or_bar_register_confirmation: "Confirmation from the firm or the Bar register",
  in_person: "In person",
  other_documented: "Another documented independent method",
};
export type CounselIdentityCheck = { method: string; checkedOn: string; note: string };

export type AttestationInput = {
  documentCode: string;
  approvalDate: string; // YYYY-MM-DD: the day counsel's evidence shows legal approval / confirmation
  counselName: string;
  counselFirm: string;
  evidenceKind: string;
  evidenceReference: string; // what the evidence is and where it can be found
  evidenceSha256?: string | null; // fingerprint of the evidence file when one is attached
  coversDocumentCodes: string[]; // the approval must name THIS document; a package-level date is not borrowed
  identityCheck: CounselIdentityCheck;
};

export type AttestationContext = {
  documentCode: string;
  today: string; // YYYY-MM-DD
  versionCreatedOn: string | null; // YYYY-MM-DD, taken from the registry row by the server (never from the form)
};

export type AttestationVerdict = { ok: true } | { ok: false; errors: string[] };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const HEX64 = /^[0-9a-f]{64}$/i;
const validDate = (s: string) => ISO.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;

export function validateIdentityCheck(c: CounselIdentityCheck | null | undefined, today: string): string[] {
  const errors: string[] = [];
  if (!c) return ["Record how counsel's identity was independently checked (method, date and a note)."];
  if (!(IDENTITY_METHODS as readonly string[]).includes(c.method)) errors.push("Choose how counsel's identity was checked independently. The sender's own confirmation, or the email itself, is not an independent check.");
  if (!validDate(c.checkedOn)) errors.push("Enter the date of the identity check as YYYY-MM-DD.");
  else if (c.checkedOn > today) errors.push("The identity-check date cannot be in the future.");
  const note = (c.note ?? "").trim();
  if (note.length < 15) errors.push("Describe the identity check (who did it, how, and what was confirmed) in at least a short sentence.");
  else if (c.method === "other_documented" && note.length < 30) errors.push("For another documented method, describe it in enough detail for a later reader to repeat it (at least 30 characters).");
  return errors;
}

export function validateApprovalAttestation(i: AttestationInput, c: AttestationContext): AttestationVerdict {
  const errors: string[] = [];
  if (i.documentCode !== c.documentCode) errors.push(`This attestation is for ${i.documentCode}, not ${c.documentCode}.`);
  if (!i.coversDocumentCodes.includes(c.documentCode)) errors.push(`The approval must expressly name ${c.documentCode}. A date that belongs to a different document set cannot be reused.`);
  if (!validDate(i.approvalDate)) errors.push("Enter counsel's approval date as YYYY-MM-DD.");
  else {
    if (i.approvalDate > c.today) errors.push("The approval date cannot be in the future.");
    if (!c.versionCreatedOn || !ISO.test(c.versionCreatedOn)) errors.push("The version's creation date is not available, so the approval date cannot be checked against it.");
    else if (i.approvalDate < c.versionCreatedOn) errors.push(`The version was created on ${c.versionCreatedOn}; counsel's approval of this version cannot be dated before it existed. Check which document the date belongs to.`);
  }
  if (i.counselName.trim().length < 3) errors.push("Name the approving counsel.");
  if (i.counselFirm.trim().length < 3) errors.push("Name counsel's firm.");
  if (!(EVIDENCE_KINDS as readonly string[]).includes(i.evidenceKind)) errors.push("Choose the kind of evidence.");
  if (i.evidenceReference.trim().length < 15) errors.push("Describe the evidence and where it is kept (at least a short sentence).");
  if (i.evidenceSha256 && !HEX64.test(i.evidenceSha256)) errors.push("The evidence fingerprint must be a 64-character SHA-256 value.");
  errors.push(...validateIdentityCheck(i.identityCheck, c.today));
  return errors.length ? { ok: false, errors } : { ok: true };
}

// What the registry's own "approved" status stands for. The v1.0 masters were seeded 'approved' with the approver label "Legal Counsel" and NO approval
// stamp: a recorded assertion, not a dated, evidenced approval. Only a registry stamp (written by a real approve transition) or a valid attestation is evidence.
export type RegistryApprovalBasis = "registry_stamp" | "seeded_label_unevidenced" | "not_approved";
export function classifyRegistryApproval(v: { status: string; approvedBy: string | null; approvedAt: string | null }): RegistryApprovalBasis {
  if (!["approved", "active"].includes(v.status)) return "not_approved";
  return v.approvedAt ? "registry_stamp" : "seeded_label_unevidenced";
}

// The date shown as "approval date" comes from, in order: the registry's own stamp (only set by a real approve transition), then a
// valid attestation. Never from ingestion, never from the present date, never from another document's approval.
export type ApprovalDateSource = { date: string; source: "registry_stamp" | "attestation" } | null;
export function resolveApprovalDate(version: { approvedAt: string | null }, attestation: { approvalDate: string } | null): ApprovalDateSource {
  if (version.approvedAt) return { date: version.approvedAt.slice(0, 10), source: "registry_stamp" };
  if (attestation) return { date: attestation.approvalDate, source: "attestation" };
  return null;
}
