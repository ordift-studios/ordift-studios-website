import { deriveMasterContentReference } from "./masterContentReference";
import { resolveApprovalDate } from "./approvalAttestation";

// Is a controlled legal document genuinely ready to be ISSUED to a person? Pure assessment from recorded facts only. Every check is
// VERIFIED from a stored record, NEEDS CONFIRMATION (a record exists but a person must confirm it), or MISSING - and each unresolved item
// says what is missing, why it matters, which existing record can supply it, who may resolve it and how. Nothing is inferred,
// back-filled or assumed: a blank approval date stays blank, an unconfirmed contracting entity stays unconfirmed.

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
  masterDocxPath: string | null;
  masterPdfPath: string | null;
  createdAt: string | null;
  ingestedAt: string | null;
};
export type EntityCandidate = { id: string; name: string; jurisdiction: string | null; verified: boolean; hasSignatory: boolean; signatoryName: string | null; href: string };
export type AttestationFacts = { approvalDate: string; counselName: string; counselFirm: string; verifiedAt: string } | null;

export type AgreementReadinessInput = {
  code: string;
  title: string;
  version: VersionFacts | null;
  jurisdictionName: string | null;
  jurisdictionSource: string | null; // e.g. "the Founder-approved requisition"
  // the entity already recorded for this person (e.g. on their requisition) - offered as the candidate, still needs confirmation
  recordedEntityId: string | null;
  confirmedEntityId: string | null;
  entityCandidates: EntityCandidate[];
  attestation: AttestationFacts;
  attestationStoreAvailable: boolean;
  legalHref: string;
};

export type Guide = { what: string; why: string; source: string; who: string; how: string; href: string | null; hrefLabel: string | null };
export type ReadinessCheck = { key: string; label: string; state: "verified" | "needs_confirmation" | "missing"; detail: string; guide: Guide | null };
export type AgreementReadiness = { code: string; title: string; checks: ReadinessCheck[]; canIssue: boolean; unresolved: ReadinessCheck[] };

const WHO_LEGAL = "Founder / Super Admin (contract administration authority)";
const ok = (key: string, label: string, detail: string): ReadinessCheck => ({ key, label, state: "verified", detail, guide: null });
const open = (state: "missing" | "needs_confirmation", key: string, label: string, detail: string, guide: Guide): ReadinessCheck => ({ key, label, state, detail, guide });

export function assessAgreementReadiness(i: AgreementReadinessInput): AgreementReadiness {
  const v = i.version;
  const checks: ReadinessCheck[] = [];

  if (!v) {
    checks.push(open("missing", "document", "Legal document on record", `${i.code} has no current version on record.`, { what: "No version of the document exists.", why: "There is nothing to issue.", source: "Legal document registry", who: WHO_LEGAL, how: "Register the controlled document version first.", href: i.legalHref, hrefLabel: "Open the legal document registry" }));
  } else {
    checks.push(
      ["approved", "active"].includes(v.status) && v.approvedBy
        ? ok("approval_recorded", "Approval recorded", `Recorded as ${v.status} by ${v.approvedBy}.`)
        : open("missing", "approval_recorded", "Approval recorded", `Status is “${v.status}”${v.approvedBy ? "" : " and no approver is recorded"}.`, { what: "The document is not recorded as approved.", why: "An unapproved template cannot be issued.", source: "Legal document registry", who: WHO_LEGAL, how: "Complete legal review and approval.", href: i.legalHref, hrefLabel: "Open the legal document registry" }),
    );

    const approval = resolveApprovalDate({ approvedAt: v.approvedAt }, i.attestation);
    if (approval) {
      checks.push(
        ok(
          "approval_date",
          "Historical approval date",
          approval.source === "registry_stamp"
            ? `Approved on ${approval.date} (registry stamp).`
            : `Approved on ${approval.date} by ${i.attestation!.counselName}, ${i.attestation!.counselFirm}; evidence verified ${i.attestation!.verifiedAt.slice(0, 10)}.`,
        ),
      );
    } else {
      checks.push(
        open("missing", "approval_date", "Historical approval date requires verification", `The registry recorded this version as approved by “${v.approvedBy ?? "—"}” on its creation${v.createdAt ? ` (${v.createdAt.slice(0, 10)})` : ""}, but no approval date was stamped and no dated evidence is on file. Another document set's approval date is not borrowed.`, {
          what: "The day Legal Counsel actually approved this specific document is not recorded.",
          why: "The approval date is the legal starting point for the template's effective date and for every agreement built from it. It must be real, not the day of ingestion or today.",
          source: "Counsel's written approval (letter, email or signed register) that names this document. The approval can only pre-date the registry entry.",
          who: `${WHO_LEGAL}, recorded with the verifier's identity and the verification time.`,
          how: i.attestationStoreAvailable
            ? "Use “Record verified approval” on this page: enter the date, counsel's name and firm, the evidence and its fingerprint."
            : "Prepared, not available yet: the audited record needs one schema change that awaits the Founder's separate authorization. Until then the date stays unverified.",
          href: null,
          hrefLabel: null,
        }),
      );
    }

    const traceable = Boolean(v.masterDocxSha256 && v.masterPdfSha256);
    checks.push(
      traceable
        ? ok("master_files", "Approved master files stored", "The official Word and PDF masters are stored with recorded SHA-256 checksums.")
        : open("missing", "master_files", "Approved master files stored", "The master files or their checksums are not recorded.", { what: "Master files or checksums are missing.", why: "Without them the issued text cannot be proven to be the approved text.", source: "The controlled release package", who: WHO_LEGAL, how: "Re-ingest the master through the controlled import.", href: i.legalHref, hrefLabel: "Open the legal document registry" }),
    );

    if (v.contentReference || v.documentHash) {
      checks.push(ok("content_reference", "Controlled content reference", "The stored master is registered under a controlled reference."));
    } else {
      const derived = traceable && v.masterDocxPath && v.masterPdfPath && v.masterDocxSha256 && v.masterPdfSha256
        ? deriveMasterContentReference({ code: i.code, version: "1.0", docxPath: v.masterDocxPath, docxSha256: v.masterDocxSha256, pdfPath: v.masterPdfPath, pdfSha256: v.masterPdfSha256 })
        : null;
      checks.push(
        open("missing", "content_reference", "Controlled content reference", `The masters are stored, but the registry's content reference and hash are empty. ${derived ? `Derived (not yet registered): document hash ${derived.documentHash.slice(0, 12)}…` : ""}`, {
          what: "The registry does not yet point at the stored approved master.",
          why: "The reference is how an issued agreement proves which approved text it came from.",
          source: "The master already stored in the private legal-masters bucket. Nothing is re-uploaded or duplicated.",
          who: WHO_LEGAL,
          how: "Register the reference: the stored files are re-hashed, compared with the recorded checksums, and only on an exact match the reference is written. Not built as an action yet; no migration is needed.",
          href: null,
          hrefLabel: null,
        }),
      );
    }

    checks.push(
      v.activatedAt && v.status === "active"
        ? ok("activation", "Activated for use", `Activated on ${v.activatedAt.slice(0, 10)}.`)
        : open("missing", "activation", "Activated for use", "The version is approved but not active, so it cannot be issued.", { what: "The template has not been activated.", why: "Activation is the deliberate moment a template becomes usable; its timestamp is the real time of that action and is never back-dated.", source: "Legal document registry", who: WHO_LEGAL, how: "Activate it after the items above are verified. No activation screen exists yet; it is a separate build.", href: i.legalHref, hrefLabel: "Open the legal document registry" }),
    );

    const approvalDate = resolveApprovalDate({ approvedAt: v.approvedAt }, i.attestation)?.date ?? null;
    const effOk = Boolean(v.effectiveDate) && (!approvalDate || v.effectiveDate! >= approvalDate);
    checks.push(
      effOk
        ? ok("effective_date", "Template effective date", `Effective from ${v.effectiveDate}.`)
        : open("missing", "effective_date", "Template effective date", v.effectiveDate ? "The effective date is earlier than the approval date." : "No effective date is set; the record says it is set at activation.", { what: "The date the approved template takes effect is not set.", why: "It is separate from the approval date and from any individual agreement's own effective date.", source: "Counsel's approval and the Founder's decision", who: WHO_LEGAL, how: "Set when activating. Normally the approval date where the terms and Ghanaian law allow; never earlier than the verified approval date.", href: null, hrefLabel: null }),
    );
  }

  checks.push(
    i.jurisdictionName
      ? ok("jurisdiction", "Jurisdiction", `${i.jurisdictionName}${i.jurisdictionSource ? ` (from ${i.jurisdictionSource})` : ""}.`)
      : open("missing", "jurisdiction", "Jurisdiction", "No jurisdiction is recorded for this person.", { what: "The governing jurisdiction is not recorded.", why: "It selects the correct schedule and entity.", source: "The person's requisition", who: "Ordift staff with onboarding authority", how: "Record it on the requisition.", href: null, hrefLabel: null }),
  );

  const confirmed = i.entityCandidates.find((c) => c.id === i.confirmedEntityId) ?? null;
  const recorded = i.entityCandidates.find((c) => c.id === i.recordedEntityId) ?? null;
  const inJurisdiction = i.entityCandidates.filter((c) => c.verified && (!i.jurisdictionName || c.jurisdiction === i.jurisdictionName));
  if (confirmed && confirmed.verified) {
    checks.push(ok("contracting_entity", "Contracting legal entity", `${confirmed.name}${confirmed.jurisdiction ? ` (${confirmed.jurisdiction})` : ""} — confirmed.`));
  } else if (recorded && recorded.verified) {
    checks.push(open("needs_confirmation", "contracting_entity", "Contracting legal entity", `${recorded.name}${recorded.jurisdiction ? ` (${recorded.jurisdiction})` : ""} is recorded on the Founder-approved requisition and is verified. It must be confirmed before an agreement is issued.`, { what: "The recorded entity has not been confirmed as the contracting party.", why: "The agreement names this entity as the contracting party and binds it.", source: "Requisition and the verified entity register", who: "Founder", how: "Confirm it when preparing the agreement (that preparation step is not built yet). Another entity, such as the Qatar W.L.L., is never substituted.", href: recorded.href, hrefLabel: "Open the entity record" }));
  } else {
    checks.push(open("missing", "contracting_entity", "Contracting legal entity", `No contracting entity is recorded. Verified candidates: ${inJurisdiction.map((c) => c.name).join("; ") || "none in this jurisdiction"}.`, { what: "No contracting entity is selected.", why: "An agreement needs a contracting party.", source: "Verified entity register", who: "Founder", how: "Select and confirm the verified entity for this jurisdiction.", href: i.legalHref, hrefLabel: null }));
  }

  const signEntity = confirmed ?? recorded;
  checks.push(
    signEntity?.hasSignatory
      ? ok("signatory", "Authorised signatory", `${signEntity.signatoryName ?? "A signatory"} is recorded for ${signEntity.name}.`)
      : open("missing", "signatory", "Authorised signatory", signEntity ? `No authorised signatory is recorded for ${signEntity.name}.` : "No entity is selected, so no signatory can be checked.", {
          what: "The person authorised to sign for the contracting entity is not recorded.",
          why: "Without a verified signatory the agreement cannot be signed for Ordift. One entity's signatory is never borrowed for another.",
          source: "The entity's business registration or authorisation documents already filed on its record",
          who: "Founder",
          how: "Record the signatory on the entity record, taken from its registration document.",
          href: signEntity?.href ?? null,
          hrefLabel: signEntity ? "Open the entity record" : null,
        }),
  );

  const unresolved = checks.filter((c) => c.state !== "verified");
  return { code: i.code, title: i.title, checks, canIssue: unresolved.length === 0, unresolved };
}
