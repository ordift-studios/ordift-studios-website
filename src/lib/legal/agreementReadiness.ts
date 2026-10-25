import { deriveMasterContentReference } from "./masterContentReference";
import { resolveApprovalDate, classifyRegistryApproval, IDENTITY_METHOD_LABELS, type IdentityMethod } from "./approvalAttestation";

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
export type SignatoryFact = { id: string; fullName: string; position: string; authority: string | null; sourceDocumentId: string | null; profileId: string | null };
export type EntityDocumentFact = { id: string; type: string; filename: string | null; hasStoredFile: boolean; notes: string | null };
export type EntityCandidate = { id: string; name: string; jurisdiction: string | null; verified: boolean; signatories: SignatoryFact[]; documents: EntityDocumentFact[]; href: string };
export type AttestationFacts = {
  approvalDate: string; counselName: string; counselFirm: string; verifiedAt: string; verifiedByLabel: string | null;
  identityCheck?: { method: string; checkedOn: string } | null; // null/absent: an event written before counsel-identity checks were captured
  approvalDateInEvidence?: boolean | null;
} | null;
export type FounderFact = { profileId: string; name: string; memberNumber: string | null } | null;
// the action a check needs; the workspace shows the matching embedded form next to it
export type ActionKey = "attest_approval" | "register_master" | "activate" | "confirm_entity" | "add_signatory" | "select_signatory" | "set_jurisdiction";

export type AgreementReadinessInput = {
  code: string;
  title: string;
  versionId: string | null;
  version: VersionFacts | null;
  jurisdictionName: string | null;
  jurisdictionSource: string | null; // e.g. "the Founder-approved requisition"
  // the entity already recorded for this person (e.g. on their requisition) - offered as the candidate, still needs confirmation
  recordedEntityId: string | null;
  confirmedEntityId: string | null;
  entityCandidates: EntityCandidate[];
  attestation: AttestationFacts;
  // result of the controlled-master check recorded at registration (null = not registered yet)
  registrationCheck: { unresolvedMarkers: number } | null;
  selectedSignatoryId: string | null;
  founder: FounderFact;
  legalHref: string;
};

export type Guide = { what: string; why: string; source: string; who: string; how: string; href: string | null; hrefLabel: string | null };
export type ReadinessCheck = { key: string; label: string; state: "verified" | "needs_confirmation" | "missing"; detail: string; guide: Guide | null; actionKey: ActionKey | null };
export type ReadinessContext = {
  versionId: string | null;
  approvalDate: string | null;
  entity: EntityCandidate | null; // confirmed, else the one recorded on the requisition
  recordedEntityId: string | null;
  candidates: EntityCandidate[]; // verified entities in the person's jurisdiction
  founder: FounderFact;
  // The Founder's verified identity against each verified entity, from the existing registers (no separate Founder profile per country).
  governance: { entityName: string; jurisdiction: string | null; founderIsSignatory: boolean; signatories: number; storedBasisDocuments: number; noteOnlyRecords: number; href: string }[];
};
export type AgreementReadiness = { code: string; title: string; checks: ReadinessCheck[]; canIssue: boolean; unresolved: ReadinessCheck[]; context: ReadinessContext };

const WHO_LEGAL = "Founder / Super Admin (contract administration authority)";
const ok = (key: string, label: string, detail: string): ReadinessCheck => ({ key, label, state: "verified", detail, guide: null, actionKey: null });
const open = (state: "missing" | "needs_confirmation", key: string, label: string, detail: string, guide: Guide, actionKey: ActionKey | null = null): ReadinessCheck => ({ key, label, state, detail, guide, actionKey });

export function assessAgreementReadiness(i: AgreementReadinessInput): AgreementReadiness {
  const v = i.version;
  const checks: ReadinessCheck[] = [];
  const legal = (what: string, why: string, source: string, how: string): Guide => ({ what, why, source, who: WHO_LEGAL, how, href: null, hrefLabel: null });

  if (!v) {
    checks.push(open("missing", "document", "Legal document on record", `${i.code} has no current version on record.`, { ...legal("No version of the document exists.", "There is nothing to issue.", "Legal document registry", "Register the controlled document version first."), href: i.legalHref, hrefLabel: "Open the legal document registry" }));
  } else {
    checks.push(
      ["approved", "active"].includes(v.status) && v.approvedBy
        ? ok("approval_recorded", "Registry status", classifyRegistryApproval(v) === "seeded_label_unevidenced"
            ? `The registry shows “${v.status}”, approver label “${v.approvedBy}”${v.createdAt ? `, set when the version was created (${v.createdAt.slice(0, 10)})` : ""}. This is the registry's seeded label: it carries no approval date and no evidence, so it is not a verified legal approval. Counsel's dated approval is verified separately below.`
            : `Recorded as ${v.status} by ${v.approvedBy}, with an approval stamp from the registry.`)
        : open("missing", "approval_recorded", "Approval recorded", `Status is “${v.status}”${v.approvedBy ? "" : " and no approver is recorded"}.`, { ...legal("The document is not recorded as approved.", "An unapproved template cannot be issued.", "Legal document registry", "Complete legal review and approval."), href: i.legalHref, hrefLabel: "Open the legal document registry" }),
    );

    const approval = resolveApprovalDate({ approvedAt: v.approvedAt }, i.attestation);
    if (approval) {
      checks.push(
        ok(
          "approval_date",
          "Historical approval date",
          approval.source === "registry_stamp"
            ? `Approved on ${approval.date} (registry stamp).`
            : `Counsel's legal approval / confirmation dated ${approval.date} — attested by ${i.attestation!.verifiedByLabel ?? "an administrator"}: ${i.attestation!.counselName}, ${i.attestation!.counselFirm}. Recorded on ${i.attestation!.verifiedAt.slice(0, 10)} (a separate date from the approval, and from the registry's creation date${v.createdAt ? ` of ${v.createdAt.slice(0, 10)}` : ""}). ${
              i.attestation!.identityCheck
                ? `Counsel's identity was checked independently by the administrator: ${IDENTITY_METHOD_LABELS[i.attestation!.identityCheck.method as IdentityMethod] ?? i.attestation!.identityCheck.method}, on ${i.attestation!.identityCheck.checkedOn}.`
                : "No independent counsel-identity check is on record for this attestation (it pre-dates that control)."
            } ${i.attestation!.approvalDateInEvidence === false ? "The readable evidence does not mention this date. " : ""}This is an administrator attestation backed by an evidence fingerprint; the system has not itself inspected counsel's document or verified counsel's identity.`,
        ),
      );
    } else {
      checks.push(
        open("missing", "approval_date", "Verify historical legal approval", `The registry labelled this version “approved” by “${v.approvedBy ?? "—"}” when it was created${v.createdAt ? ` (${v.createdAt.slice(0, 10)})` : ""}, but that label carries no approval date and no evidence. The creation date is not proof of approval, and another document set's approval date is not borrowed.`, {
          what: "The day Legal Counsel actually approved this specific document is not recorded.",
          why: "The approval date is the legal starting point for the template's effective date and for every agreement built from it. It must be real — not the ingestion date, not today, not another package's date.",
          source: "Counsel's own written approval or confirmation (letter, email or signed register) that names this document. Its date may be the creation date or any later day up to today, never earlier than the version's creation.",
          who: `${WHO_LEGAL}. The verifier's identity and the real verification time are recorded automatically, separately from the approval date.`,
          how: "Enter the date, counsel and firm, the evidence, and how counsel's identity was checked independently (the sender's own confirmation is not enough). If no such evidence exists, a fresh counsel approval is needed: this form refuses to guess.",
          href: null, hrefLabel: null,
        }, "attest_approval"),
      );
    }

    const traceable = Boolean(v.masterDocxSha256 && v.masterPdfSha256);
    checks.push(
      traceable
        ? ok("master_files", "Approved master files stored", "The official Word and PDF masters are stored with recorded SHA-256 checksums.")
        : open("missing", "master_files", "Approved master files stored", "The master files or their checksums are not recorded.", { ...legal("Master files or checksums are missing.", "Without them the issued text cannot be proven to be the approved text.", "The controlled release package", "Re-ingest the master through the controlled import."), href: i.legalHref, hrefLabel: "Open the legal document registry" }),
    );

    const registered = Boolean(v.contentReference || v.documentHash);
    if (registered) {
      checks.push(ok("content_reference", "Register controlled master", "The stored master is registered under a controlled content reference."));
    } else {
      const derived = traceable && v.masterDocxPath && v.masterPdfPath && v.masterDocxSha256 && v.masterPdfSha256
        ? deriveMasterContentReference({ code: i.code, version: "1.0", docxPath: v.masterDocxPath, docxSha256: v.masterDocxSha256, pdfPath: v.masterPdfPath, pdfSha256: v.masterPdfSha256 })
        : null;
      checks.push(
        open("missing", "content_reference", "Register controlled master", `The masters are stored, but the registry's content reference and hash are empty.${derived ? ` The reference will be derived from the stored files (document hash ${derived.documentHash.slice(0, 12)}…).` : ""}`,
          legal("The registry does not yet point at the stored approved master.", "The reference is how an issued agreement proves which approved text it came from.", "The master already stored in the private legal-masters bucket. Nothing is re-uploaded or duplicated.", "Register it: the stored Word and PDF are re-hashed and compared with the checksums recorded at ingestion, the Word text is checked for unresolved counsel-review markers, and only if everything matches is the reference written."), "register_master"),
      );
    }

    if (registered && i.registrationCheck && i.registrationCheck.unresolvedMarkers === 0) {
      checks.push(ok("review_clauses", "Counsel-review clauses resolved", "The registered master was checked and contains no unresolved counsel-review markers (indemnity and liability-cap clauses are operative text; any cap is selected per Schedule)."));
    } else {
      checks.push(open("missing", "review_clauses", "Counsel-review clauses resolved", registered ? "The master was registered without a recorded clause check." : "Not yet checked: this happens when the master is registered.", legal("Outstanding counsel-review clauses have not been ruled out in the stored master.", "A template with open review items must not be used.", "The stored Word master itself.", "Register the controlled master; the check runs as part of it and refuses if any marker remains."), registered ? null : "register_master"));
    }

    checks.push(
      v.activatedAt && v.status === "active"
        ? ok("activation", "Activated for use", `Activated on ${v.activatedAt.slice(0, 10)} (the real time of activation).`)
        : open("missing", "activation", "Activate the template", "The version is approved but not active, so it cannot be issued.",
            legal("The template has not been activated.", "Activation is the deliberate moment a template becomes usable; its timestamp is the real time of that action and is never back-dated.", "Legal document registry", "After the items above are verified, set the effective date (normally the approval date) and activate. Nothing activates automatically."), "activate"),
    );

    const approvalDate = resolveApprovalDate({ approvedAt: v.approvedAt }, i.attestation)?.date ?? null;
    const effOk = Boolean(v.effectiveDate) && (!approvalDate || v.effectiveDate! >= approvalDate);
    checks.push(
      effOk
        ? ok("effective_date", "Template effective date", `Effective from ${v.effectiveDate} (distinct from the activation time and from any individual agreement's dates).`)
        : open("missing", "effective_date", "Template effective date", v.effectiveDate ? "The effective date is earlier than the approval date." : "No effective date is set; the record says it is set at activation.",
            legal("The date the approved template takes effect is not set.", "It is separate from the approval date and from any individual agreement's own effective date.", "Counsel's approval and the Founder's decision", "Set it in the activation step. The default is the approval date; it can never be earlier than that."), "activate"),
    );
  }

  checks.push(
    i.jurisdictionName
      ? ok("jurisdiction", "Jurisdiction", `${i.jurisdictionName}${i.jurisdictionSource ? ` (from ${i.jurisdictionSource})` : ""}.`)
      : open("missing", "jurisdiction", "Jurisdiction", "No jurisdiction is recorded for this person.", { what: "The governing jurisdiction is not recorded.", why: "It selects the correct schedule and entity.", source: "The person's requisition", who: "Ordift staff with onboarding authority", how: "Record it on the requisition (“Link requisition” below).", href: null, hrefLabel: null }),
  );

  const confirmed = i.entityCandidates.find((c) => c.id === i.confirmedEntityId) ?? null;
  const recorded = i.entityCandidates.find((c) => c.id === i.recordedEntityId) ?? null;
  const inJurisdiction = i.entityCandidates.filter((c) => c.verified && (!i.jurisdictionName || c.jurisdiction === i.jurisdictionName));
  if (confirmed && confirmed.verified) {
    checks.push(ok("contracting_entity", "Confirm contracting entity", `${confirmed.name}${confirmed.jurisdiction ? ` (${confirmed.jurisdiction})` : ""} — confirmed.`));
  } else if (recorded && recorded.verified) {
    checks.push(open("needs_confirmation", "contracting_entity", "Confirm contracting entity", `${recorded.name}${recorded.jurisdiction ? ` (${recorded.jurisdiction})` : ""} is recorded on the Founder-approved requisition and is verified. Confirm it as the contracting party.`, { what: "The recorded entity has not been confirmed as the contracting party.", why: "The agreement names this entity as the contracting party and binds it.", source: "The requisition and the verified entity register", who: "Founder / Super Admin", how: "Confirm it below. Another entity, such as the Qatar W.L.L., is never substituted.", href: recorded.href, hrefLabel: "Open the entity record" }, "confirm_entity"));
  } else {
    checks.push(open("missing", "contracting_entity", "Confirm contracting entity", `No contracting entity is recorded. Verified candidates: ${inJurisdiction.map((c) => c.name).join("; ") || "none in this jurisdiction"}.`, { what: "No contracting entity is selected.", why: "An agreement needs a contracting party.", source: "Verified entity register", who: "Founder / Super Admin", how: "Select the verified entity for this jurisdiction below.", href: null, hrefLabel: null }, "confirm_entity"));
  }

  const entity = confirmed ?? recorded;
  const docs = entity?.documents ?? [];
  const storedDocs = docs.filter((d) => d.hasStoredFile);
  const sigs = entity?.signatories ?? [];
  const chosen = sigs.find((s) => s.id === i.selectedSignatoryId) ?? (sigs.length === 1 ? sigs[0] : null);
  const founderLink = (s: SignatoryFact) => (i.founder && s.profileId === i.founder.profileId ? ` This is the Founder's verified identity (${i.founder.name}${i.founder.memberNumber ? `, member ${i.founder.memberNumber}` : ""}).` : "");
  if (!entity) {
    checks.push(open("missing", "signatory", "Confirm authorised signatory", "No entity is selected, so no signatory can be checked.", { what: "No signatory can be checked yet.", why: "The signatory is the person authorised to sign for the contracting entity.", source: "The entity record", who: "Founder / Super Admin", how: "Confirm the contracting entity first.", href: null, hrefLabel: null }));
  } else if (chosen && chosen.sourceDocumentId) {
    checks.push(ok("signatory", "Confirm authorised signatory", `${chosen.fullName}, ${chosen.position}, for ${entity.name}. Documentary basis on file.${founderLink(chosen)}`));
  } else if (chosen) {
    checks.push(open("needs_confirmation", "signatory", "Confirm authorised signatory", `${chosen.fullName} is recorded for ${entity.name} but no source document is linked.`, { what: "The signatory has no documentary basis linked.", why: "Signing authority must rest on a registration or authorisation document, not on assertion.", source: "The entity's business registration or authorisation document", who: "Founder / Super Admin", how: "Link the supporting document on the entity record.", href: entity.href, hrefLabel: "Open the entity record" }, null));
  } else if (sigs.length > 1) {
    checks.push(open("needs_confirmation", "signatory", "Confirm authorised signatory", `${entity.name} has ${sigs.length} recorded signatories; choose which one signs this agreement.`, { what: "More than one signatory is recorded.", why: "One person must be named for this agreement.", source: "The entity's signatory register", who: "Founder / Super Admin", how: "Select one below.", href: null, hrefLabel: null }, "select_signatory"));
  } else {
    const gap = storedDocs.length
      ? `A document with a stored, fingerprinted file is on file (${storedDocs.map((d) => d.filename ?? d.type).join("; ")}); select it as the documentary basis when recording the signatory.`
      : `The only record on file (${docs.map((d) => d.type).join("; ") || "none"}) is an older entry with no recorded filename or fingerprint, so it cannot yet evidence who may sign. Upload the document below; the older entry is kept.`;
    checks.push(open("missing", "signatory", "Confirm authorised signatory", `No authorised signatory is recorded for ${entity.name}. ${gap}`, {
      what: `No one is recorded as authorised to sign for ${entity.name}.`,
      why: "Without a verified signatory the agreement cannot be signed for Ordift. One entity's signatory is never borrowed for another, and the Founder's authority is not assumed from ownership alone.",
      source: "The entity's business registration or authorisation documents",
      who: "Founder / Super Admin",
      how: storedDocs.length ? "Record the signatory below, linking the supporting document." : "Upload the certificate (and, if it does not state signing authority, the document that does) below, then record the signatory.",
      href: entity.href, hrefLabel: "Open the entity record",
    }, "add_signatory"));
  }

  const unresolved = checks.filter((c) => c.state !== "verified");
  const approvalDateOut = i.version ? resolveApprovalDate({ approvedAt: i.version.approvedAt }, i.attestation)?.date ?? null : null;
  return {
    code: i.code, title: i.title, checks, canIssue: unresolved.length === 0, unresolved,
    context: { versionId: i.versionId, approvalDate: approvalDateOut, entity, recordedEntityId: i.recordedEntityId, candidates: inJurisdiction, founder: i.founder,
      governance: i.entityCandidates.filter((c) => c.verified).map((c) => ({ entityName: c.name, jurisdiction: c.jurisdiction, founderIsSignatory: Boolean(i.founder && c.signatories.some((s) => s.profileId === i.founder!.profileId && s.sourceDocumentId)), signatories: c.signatories.length, storedBasisDocuments: c.documents.filter((d) => d.hasStoredFile).length, noteOnlyRecords: c.documents.filter((d) => !d.hasStoredFile).length, href: c.href })) },
  };
}
