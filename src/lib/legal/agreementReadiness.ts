// Is a controlled legal document genuinely ready to be ISSUED to a person? Pure assessment from recorded facts only. Every check is
// either VERIFIED from a stored record or MISSING with the exact action that resolves it. Nothing is inferred, back-filled or
// "assumed approved": a blank approval date stays blank, an unconfirmed contracting entity stays unconfirmed.

export type VersionFacts = {
  status: string;
  approvedBy: string | null;
  approvedAt: string | null;
  activatedAt: string | null;
  effectiveDate: string | null;
  contentReference: string | null;
  documentHash: string | null;
  masterDocxSha256: string | null;
  masterPdfSha256: string | null;
};
export type EntityCandidate = { id: string; name: string; jurisdiction: string | null; verified: boolean; hasSignatory: boolean };

export type AgreementReadinessInput = {
  code: string;
  title: string;
  version: VersionFacts | null;
  // the jurisdiction recorded for THIS person's onboarding; null when it has not been recorded
  jurisdictionName: string | null;
  // the contracting entity confirmed for this agreement (null = nobody has confirmed one)
  confirmedEntityId: string | null;
  entityCandidates: EntityCandidate[];
};

export type ReadinessCheck = { key: string; label: string; state: "verified" | "missing"; detail: string; action: string | null };
export type AgreementReadiness = { code: string; title: string; checks: ReadinessCheck[]; canIssue: boolean; missing: ReadinessCheck[] };

const ok = (key: string, label: string, detail: string): ReadinessCheck => ({ key, label, state: "verified", detail, action: null });
const missing = (key: string, label: string, detail: string, action: string): ReadinessCheck => ({ key, label, state: "missing", detail, action });

export function assessAgreementReadiness(i: AgreementReadinessInput): AgreementReadiness {
  const v = i.version;
  const checks: ReadinessCheck[] = [];

  if (!v) {
    checks.push(missing("document", "Legal document on record", `${i.code} has no current version on record.`, "Register the controlled document version first."));
  } else {
    checks.push(
      ["approved", "active"].includes(v.status) && v.approvedBy
        ? ok("approval_recorded", "Approval recorded", `Recorded as ${v.status}${v.approvedBy ? ` by ${v.approvedBy}` : ""}.`)
        : missing("approval_recorded", "Approval recorded", `Status is “${v.status}”${v.approvedBy ? "" : " and no approver is recorded"}.`, "Complete the document's legal review and approval."),
    );
    checks.push(
      v.approvedAt
        ? ok("approval_date", "Approval date", `Approved on ${v.approvedAt.slice(0, 10)}.`)
        : missing("approval_date", "Approval date", "No approval date is recorded, and no audit entry shows when the approval happened.", "Provide the date Legal Counsel approved this version and the evidence (their email or signed approval). It is then recorded as an attested, audited entry — nothing is back-filled automatically."),
    );
    const traceable = Boolean(v.masterDocxSha256 && v.masterPdfSha256);
    checks.push(
      traceable
        ? ok("master_files", "Approved master files stored", "The official master (Word and PDF) is stored with recorded checksums.")
        : missing("master_files", "Approved master files stored", "The master files or their checksums are not recorded.", "Upload the approved master files so their checksums are recorded."),
    );
    checks.push(
      v.contentReference || v.documentHash
        ? ok("content_reference", "Controlled content reference", "The document's content is imported under a controlled reference.")
        : missing("content_reference", "Controlled content reference", "The master files exist, but the approved text has not been imported through the controlled document import, so no content reference or hash exists yet.", "Run the controlled document import on the stored master. The reference is generated from the real file — it is never typed in."),
    );
    checks.push(
      v.activatedAt && v.status === "active"
        ? ok("activation", "Activated for use", `Activated on ${v.activatedAt.slice(0, 10)}.`)
        : missing("activation", "Activated for use", "The version is not active, so it cannot be issued.", "After the items above are verified, activate it from the legal document registry. The system stamps the real activation date."),
    );
    const orderOk = Boolean(v.effectiveDate) && (!v.approvedAt || v.effectiveDate! >= v.approvedAt.slice(0, 10));
    checks.push(
      orderOk
        ? ok("effective_date", "Effective date", `Effective from ${v.effectiveDate}.`)
        : missing("effective_date", "Effective date", v.effectiveDate ? "The effective date is earlier than the approval date." : "No effective date is set (the record says it is to be set at activation).", "Set it when activating. It may not precede the verified approval date, and it must be a date the document and Ghanaian law permit."),
    );
  }

  checks.push(
    i.jurisdictionName
      ? ok("jurisdiction", "Jurisdiction", `${i.jurisdictionName}.`)
      : missing("jurisdiction", "Jurisdiction", "No jurisdiction is recorded for this person's onboarding.", "Record the jurisdiction on the onboarding record. The Founder has indicated Ghana for the current instructor onboarding."),
  );

  const confirmed = i.entityCandidates.find((c) => c.id === i.confirmedEntityId) ?? null;
  checks.push(
    confirmed && confirmed.verified
      ? ok("contracting_entity", "Contracting legal entity", `${confirmed.name}${confirmed.jurisdiction ? ` (${confirmed.jurisdiction})` : ""}.`)
      : missing(
          "contracting_entity",
          "Contracting legal entity",
          `No contracting entity is confirmed for this agreement. Verified entities on record: ${i.entityCandidates.filter((c) => c.verified).map((c) => `${c.name}${c.jurisdiction ? ` (${c.jurisdiction})` : ""}`).join("; ") || "none"}.`,
          "The Founder confirms which verified entity contracts this person. It is not assumed from the person's location or the Qatar company.",
        ),
  );
  checks.push(
    confirmed?.hasSignatory
      ? ok("signatory", "Authorised signatory", `A signatory is recorded for ${confirmed.name}.`)
      : missing("signatory", "Authorised signatory", confirmed ? `No signatory is recorded for ${confirmed.name}.` : "No contracting entity is confirmed, so no signatory can be checked.", "Record the entity's authorised signatory under the entity's registrations."),
  );

  const miss = checks.filter((c) => c.state === "missing");
  return { code: i.code, title: i.title, checks, canIssue: miss.length === 0, missing: miss };
}
