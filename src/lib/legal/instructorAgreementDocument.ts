import type { ScheduleATerms } from "./instructorAgreementTerms";
import { missingScheduleATerms } from "./instructorAgreementTerms";

// Composition of the OS-LGL-010 Instructor / Workshop Facilitator Agreement document. Same discipline as the Employee and Vendor agreements:
// the controlled master text appears VERBATIM and is never spliced into its own placeholders; a clearly separated block of RESOLVED particulars
// follows it, built only from verified records and the terms an authorised administrator stated. A required particular that is missing makes
// composition fail - it is never replaced with a guess or "N/A". Pure and deterministic, so the preview, the issued artifact and its SHA-256
// are exactly reproducible from the same inputs.

export type InstructorSnapshot = {
  agreementReference: string;
  onboardingId?: string;
  jurisdiction: string | null;
  instructor: { profileId: string; legalName: string | null; memberNumber: string | null; email: string | null };
  contractingEntity: { id: string; name: string; legalName: string | null; registrationType: string | null; registrationDate: string | null };
  signatory: { id: string; name: string; position: string; authority: string | null; sourceDocumentId: string | null };
  template: { versionId: string; contentReference: string | null; documentHash: string | null; templateEffectiveDate: string | null };
  scheduleA?: Partial<ScheduleATerms>;
};

export type ComposeInput = { masterText: string; masterVersion: string; snapshot: InstructorSnapshot };
export type ComposeResult = { ok: true; text: string } | { ok: false; missing: string[] };

const NOT_STATED = "Not stated";

export function composeInstructorAgreementText({ masterText, masterVersion, snapshot: s }: ComposeInput): ComposeResult {
  const missing: string[] = [];
  if (!s.agreementReference) missing.push("Agreement reference");
  if (!s.jurisdiction) missing.push("Jurisdiction");
  if (!s.instructor?.legalName) missing.push("Instructor legal name");
  if (!s.contractingEntity?.name) missing.push("Contracting entity");
  if (!s.signatory?.name || !s.signatory.position || !s.signatory.authority) missing.push("Authorised signatory (name, position and authority)");
  if (!s.template?.contentReference || !s.template.documentHash) missing.push("Controlled master reference");
  missing.push(...missingScheduleATerms(s.scheduleA));
  if (missing.length) return { ok: false, missing };

  const a = s.scheduleA as ScheduleATerms;
  const e = s.contractingEntity;
  const divider = "=".repeat(72);
  const entityLine = [e.name, e.legalName && e.legalName !== e.name ? `legal name ${e.legalName}` : null, e.registrationType, e.registrationDate ? `registered ${e.registrationDate}` : null].filter(Boolean).join(", ");
  const opt = (v: string | undefined) => (v && v.trim() ? v.trim() : NOT_STATED);
  const lines = [
    masterText,
    "",
    divider,
    `ISSUED AGREEMENT REFERENCE: ${s.agreementReference}`,
    `OS-LGL-010 MASTER VERSION: ${masterVersion}`,
    `MASTER CONTENT REFERENCE: ${s.template.contentReference}`,
    `MASTER DOCUMENT SHA-256: ${s.template.documentHash}`,
    divider,
    "",
    "PARTIES & ENGAGEMENT RECORD — RESOLVED (frozen at issuance, never re-resolved)",
    "",
    `Agreement ID: ${s.agreementReference}`,
    `Ordift Contracting Entity: ${entityLine}`,
    `Instructor / Facilitator: ${s.instructor.legalName}${s.instructor.memberNumber ? ` (member ${s.instructor.memberNumber})` : ""}`,
    `Professional / Business Details: ${opt(a.businessName)}`,
    "Program / Series: As identified in each Session Schedule",
    `Role: ${a.professionalRole}`,
    `Primary Jurisdiction: ${s.jurisdiction}`,
    `Effective Date: ${a.agreementEffectiveDate}`,
    "",
    "SCHEDULE A — RESOLVED INSTRUCTOR PROFILE & MASTER TERMS",
    "",
    `Instructor legal name: ${s.instructor.legalName}`,
    `Business / trading name: ${opt(a.businessName)}`,
    `Nationality / work authorization: ${opt(a.nationalityWorkAuthorization)}`,
    `Address / country: ${a.addressCountry}`,
    `Contact: ${[s.instructor.email, a.contactPhone?.trim()].filter(Boolean).join(" / ") || NOT_STATED}`,
    `Professional role: ${a.professionalRole}`,
    `Primary expertise: ${a.primaryExpertise}`,
    `Qualifications / credentials: ${opt(a.qualifications)}`,
    `Independent status route: ${a.independentStatusRoute}`,
    `Master term: ${a.masterTerm}`,
    `Master termination notice: ${a.masterTerminationNotice}`,
    `Primary jurisdiction: ${s.jurisdiction}`,
    `Regulatory approval status: ${a.regulatoryApprovalStatus}`,
    `Special terms: ${a.specialTerms}`,
    "",
    "SCHEDULES B TO E — SESSION SCHEDULES",
    "",
    "No Session Schedule is issued with this Agreement. Under clauses 1.1 and 3.4 of the Agreement, each workshop or session is created by its own accepted",
    "Session Schedule, and this Agreement alone guarantees no engagement, fee, minimum income or exclusivity.",
    "",
    "SIGNATORIES",
    "",
    `For Ordift (${e.name}): ${s.signatory.name}, ${s.signatory.position}. Authority as recorded from the entity's supporting document: ${s.signatory.authority}`,
    `For the Instructor: ${s.instructor.legalName}`,
    "",
  ];
  return { ok: true, text: lines.join("\n") };
}

// Plain-language stage for the workspace. Only genuine execution is "Executed": a draft, an issued document, a partial signature or a TEST
// agreement is never presented as executed.
export type AgreementStage = { label: string; executed: boolean; tone: "neutral" | "pending" | "good" | "bad" };
export type SignatoryState = { status: string; linkExpiresAt: string | null };
export function instructorAgreementStage(status: string, evidenceClassification: string | null, signatories: SignatoryState[] = [], now: Date = new Date()): AgreementStage {
  // The signature engine records a refusal or an expired link on the signatory, not on the agreement row, so both are read from there.
  const open = !["fully_executed", "active", "completed", "declined", "expired", "cancelled"].includes(status) && ["sent", "viewed", "accepted_for_signature", "partially_signed", "changes_requested"].includes(status);
  if (open && signatories.some((g) => g.status === "declined")) return { label: "Declined by a signatory", executed: false, tone: "bad" };
  if (open && signatories.length > 0 && signatories.some((g) => g.status !== "signed" && g.linkExpiresAt && new Date(g.linkExpiresAt) < now)) return { label: "Signing link expired — not executed", executed: false, tone: "bad" };
  if (["fully_executed", "active", "completed"].includes(status)) {
    return evidenceClassification === "controlled_test"
      ? { label: "Test signature — not a genuine execution", executed: false, tone: "bad" }
      : { label: "Executed", executed: true, tone: "good" };
  }
  switch (status) {
    case "draft": return { label: "Draft", executed: false, tone: "neutral" };
    case "internal_review": return { label: "Draft — in internal review", executed: false, tone: "neutral" };
    case "approved_for_issue": return { label: "Approved for issue — not yet issued", executed: false, tone: "pending" };
    case "sent": return { label: "Issued — awaiting signature", executed: false, tone: "pending" };
    case "viewed": case "accepted_for_signature": case "changes_requested": return { label: "Issued — awaiting signature (opened by a signatory)", executed: false, tone: "pending" };
    case "partially_signed": return { label: "Partly signed — awaiting the remaining signature", executed: false, tone: "pending" };
    case "declined": return { label: "Declined", executed: false, tone: "bad" };
    case "expired": return { label: "Expired", executed: false, tone: "bad" };
    default: return { label: status.replace(/_/g, " "), executed: false, tone: "bad" };
  }
}
