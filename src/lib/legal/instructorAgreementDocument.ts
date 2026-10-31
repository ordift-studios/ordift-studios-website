import type { ScheduleATerms } from "./instructorAgreementTerms";
import { missingScheduleATerms } from "./instructorAgreementTerms";
import { splitInstructorMaster, TEMPLATE_PLACEHOLDER } from "./instructorMasterSections";

// Composition of the OS-LGL-010 Instructor / Workshop Facilitator Agreement document ("Option A"). The individual agreement is ONE clean document:
// the controlled master's title and introduction, ONE completed contracting-party record, the master's operative clauses 1-29 exactly as approved,
// ONE resolved Schedule A, the Session Schedule status statement and the signature section. The master's blank template forms (cover record and
// Schedules A-F) and its internal counsel-routing notes (Schedule F) are NOT carried into the individual document - they remain in the controlled
// master, whose version, content reference and SHA-256 are cited at the top. The clauses are never re-worded or spliced into: they are copied
// line for line from the verified master text, and composition REFUSES (never guesses) when the master's structure cannot be identified exactly
// or any required particular is missing. A required particular is never replaced with a guess or "N/A". Pure and deterministic, so the preview,
// the issued artifact and its SHA-256 are exactly reproducible from the same inputs. (The Employee and Vendor agreements use a different,
// unchanged composition.)

export type InstructorSnapshot = {
  agreementReference: string;
  onboardingId?: string;
  jurisdiction: string | null;
  // `email` is the Supabase Auth ACCOUNT email (used for login and for signing links). `correspondenceEmail` is the person's recorded preferred correspondence email
  // (migration 0178), when there is one: the agreement's CONTACT line shows it in preference to the account email. It is informational only - the master has no
  // notice-address clause - and it never changes who receives a signing link.
  instructor: { profileId: string; legalName: string | null; memberNumber: string | null; email: string | null; correspondenceEmail?: string | null };
  // registrationNumber / businessAddress come from the verified entity record (Super-Admin-only details; the stored column is historically named
  // registered_address) and are frozen with the snapshot. businessAddress is the CURRENT business address as recorded - it is never labelled "registered"
  // because whether the Registrar's record carries it is a separate, unverified question; postalAddress is optional.
  contractingEntity: { id: string; name: string; legalName: string | null; registrationType: string | null; registrationDate: string | null; registrationNumber?: string | null; businessAddress?: string | null; postalAddress?: string | null };
  // `position` is only the management title (for example Chief Executive Officer). `legalCapacity` is the separate, recorded capacity in which the
  // person may bind the entity. When it is "sole_proprietor" the signatory IS the proprietor of a sole-proprietorship business name: the contracting
  // party is that individual "trading as" the business name, and the signature block states both the title and the capacity.
  signatory: { id: string; name: string; position: string; authority: string | null; sourceDocumentId: string | null; legalCapacity?: string | null };
  template: { versionId: string; contentReference: string | null; documentHash: string | null; templateEffectiveDate: string | null };
  scheduleA?: Partial<ScheduleATerms>;
};

export type ComposeInput = { masterText: string; masterVersion: string; snapshot: InstructorSnapshot };
export type ComposeResult = { ok: true; text: string } | { ok: false; missing: string[]; structural?: boolean };

const NOT_STATED = "Not stated";
const SOLE_PROPRIETOR = "sole_proprietor";
const SOLE_PROPRIETOR_LABEL = "Sole Proprietor";

// Optional Schedule A terms that are STORED (when an administrator enters them) but deliberately NOT printed in the individual agreement until
// they have been verified and the Founder approves printing them: nationality / work authorization (unverified, and the master asks for it only
// where lawfully required) and a personal phone number (the master's contact field is satisfied by the account email). They print as "Not stated".
export const OPTIONAL_TERMS_NOT_PRINTED: readonly (keyof ScheduleATerms)[] = ["nationalityWorkAuthorization", "contactPhone"];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// "2027-01-01" -> "1 January 2027"; null when it is not a real calendar date. Locale-free so the text and its hash never vary by machine.
export function longDate(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return `${d} ${MONTHS[mo - 1]} ${y}`;
}

// The stored master term "DATE RANGE: 2027-01-01 to 2027-12-31" reads "From 1 January 2027 to 31 December 2027". The stored dates are not changed.
// Any other stated term (for example ONGOING) is printed exactly as stated; a malformed or reversed date range is refused.
function renderMasterTerm(value: string): { ok: true; text: string } | { ok: false } {
  const m = /^DATE RANGE:\s*(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})$/i.exec(value.trim());
  if (!m) return { ok: true, text: value.trim() };
  const [from, to] = [longDate(m[1]), longDate(m[2])];
  if (!from || !to || m[1] > m[2]) return { ok: false };
  return { ok: true, text: `From ${from} to ${to}` };
}

// The entity record keeps one address text, with " || " between its parts. A part that is a postal box (for example "P.O. Box GP 1234" or "Box GP 1234") is the
// POSTAL address; every other part is the business (street) address. Nothing is invented or reworded: each part is passed on exactly as recorded, and when
// no street part exists the business address is null, which the composition then refuses. A value without " || " is one business address.
const POSTAL_PART = /^(p\.?\s*o\.?\s*)?box\b/i;
export function splitStoredAddress(raw: string | null | undefined): { businessAddress: string | null; postalAddress: string | null } {
  const parts = (raw ?? "").split("||").map((p) => p.trim()).filter(Boolean);
  const postal = parts.filter((p) => POSTAL_PART.test(p));
  const street = parts.filter((p) => !POSTAL_PART.test(p));
  return { businessAddress: street.length ? street.join(" || ") : null, postalAddress: postal.length ? postal.join(" || ") : null };
}

// An address may be stored on one line with " || " between its parts; it is shown comma-separated, otherwise exactly as recorded.
const formatAddress = (a: string) => a.split("||").map((p) => p.trim()).filter(Boolean).join(", ");

export function composeInstructorAgreementText({ masterText, masterVersion, snapshot: s }: ComposeInput): ComposeResult {
  const missing: string[] = [];
  if (!s.agreementReference) missing.push("Agreement reference");
  if (!s.jurisdiction) missing.push("Jurisdiction");
  if (!s.instructor?.legalName) missing.push("Instructor legal name");
  if (!s.contractingEntity?.name) missing.push("Contracting entity");
  if (s.contractingEntity?.name && !s.contractingEntity.registrationNumber?.trim()) missing.push("Contracting entity registration number");
  if (s.contractingEntity?.name && !s.contractingEntity.businessAddress?.trim()) missing.push("Contracting entity business address");
  if (!s.signatory?.name || !s.signatory.position || !s.signatory.authority) missing.push("Authorised signatory (name, position and authority)");
  if (!s.template?.contentReference || !s.template.documentHash) missing.push("Controlled master reference");
  missing.push(...missingScheduleATerms(s.scheduleA));
  const a = (s.scheduleA ?? {}) as ScheduleATerms;
  const term = a.masterTerm?.trim() ? renderMasterTerm(a.masterTerm) : null;
  if (term && !term.ok) missing.push("Master term (the date range is not a valid range)");
  const resolvedValues = [s.instructor?.correspondenceEmail, s.contractingEntity?.registrationNumber, s.contractingEntity?.businessAddress, s.contractingEntity?.postalAddress, s.signatory?.name, s.signatory?.position, a.addressCountry, a.primaryExpertise, a.businessName, a.masterTerm, a.masterTerminationNotice, a.specialTerms, a.qualifications];
  if (resolvedValues.some((v) => typeof v === "string" && TEMPLATE_PLACEHOLDER.test(v))) missing.push("A stated particular still contains an unresolved template placeholder");
  if (missing.length) return { ok: false, missing };

  // The master must be exactly the structure this composition was written for; otherwise refuse (never guess where the clauses end).
  const split = splitInstructorMaster(masterText);
  if (!split.ok) return { ok: false, missing: split.problems, structural: true };

  const e = s.contractingEntity;
  const divider = "=".repeat(72);
  const registered = e.registrationDate ? longDate(e.registrationDate) ?? e.registrationDate : null;
  // A sole-proprietorship business name has no separate legal person: the signatory recorded with the sole_proprietor capacity is the contracting
  // party, trading under the business name. The title (position) and the capacity are kept apart and both are stated; a title that already says
  // "Sole Proprietor" is not repeated.
  const soleProprietor = s.signatory.legalCapacity === SOLE_PROPRIETOR;
  const proprietor = soleProprietor ? s.signatory.name.trim() : null;
  const signatoryTitle = s.signatory.position.trim();
  const signatoryDesignation = soleProprietor && !/sole\s+proprietor/i.test(signatoryTitle) ? `${signatoryTitle} and ${SOLE_PROPRIETOR_LABEL}` : signatoryTitle;
  const registrationBits = [`registration number ${e.registrationNumber!.trim()}`, registered ? `registered ${registered}` : null].filter(Boolean).join(", ");
  const partyName = proprietor ? `${proprietor}, trading as ${e.name}` : e.name;
  const partyDescription = proprietor
    ? `${partyName}, a ${e.registrationType?.trim() || "registered business name"} (${registrationBits})`
    : [e.name, e.legalName && e.legalName !== e.name ? `legal name ${e.legalName}` : null, e.registrationType, registrationBits].filter(Boolean).join(", ");
  const entityLine = `${partyDescription}; business address: ${formatAddress(e.businessAddress!)}${e.postalAddress?.trim() ? `; postal address: ${formatAddress(e.postalAddress)}` : ""}`;
  const opt = (v: string | undefined) => (v && v.trim() ? v.trim() : NOT_STATED);
  const printable = (k: keyof ScheduleATerms) => (OPTIONAL_TERMS_NOT_PRINTED.includes(k) ? undefined : a[k]);
  const effective = longDate(a.agreementEffectiveDate) ?? a.agreementEffectiveDate;
  const affiliation = `Professional affiliation (as stated by the Instructor; not a contracting party): ${opt(a.businessName)}`;

  const lines = [
    split.sections.title,
    "",
    split.sections.introduction,
    "",
    divider,
    `AGREEMENT REFERENCE: ${s.agreementReference}`,
    `OS-LGL-010 MASTER VERSION: ${masterVersion}`,
    `MASTER CONTENT REFERENCE: ${s.template.contentReference}`,
    `MASTER DOCUMENT SHA-256: ${s.template.documentHash}`,
    divider,
    "",
    "PARTIES & ENGAGEMENT RECORD",
    "",
    `Agreement ID: ${s.agreementReference}`,
    `Ordift Contracting ${proprietor ? "Party" : "Entity"}: ${entityLine}`,
    `Instructor / Facilitator: ${s.instructor.legalName}, contracting personally${s.instructor.memberNumber ? ` (member ${s.instructor.memberNumber})` : ""}`,
    affiliation,
    "Program / Series: As identified in each Session Schedule",
    `Role: ${a.professionalRole}`,
    `Primary Jurisdiction: ${s.jurisdiction}`,
    `Effective Date: ${effective}`,
    "",
    split.sections.clauses,
    "",
    "SCHEDULE A - INSTRUCTOR PROFILE & MASTER TERMS",
    "",
    `Instructor legal name: ${s.instructor.legalName}`,
    affiliation,
    `Nationality / work authorization: ${opt(printable("nationalityWorkAuthorization"))}`,
    `Address / country: ${a.addressCountry}`,
    `Contact: ${s.instructor.correspondenceEmail?.trim() || s.instructor.email?.trim() || NOT_STATED}`,
    `Professional role: ${a.professionalRole}`,
    `Primary expertise: ${a.primaryExpertise}`,
    `Qualifications / credentials: ${opt(a.qualifications)}`,
    `Independent status route: ${a.independentStatusRoute}`,
    `Master term: ${(term as { ok: true; text: string }).text}`,
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
    ...(soleProprietor
      ? [`For Ordift:`, s.signatory.name.trim(), signatoryDesignation, `Trading as ${e.name}`, "", `Authority: ${s.signatory.authority}`] // the three lines counsel approved stay together; the authority basis is its own line
      : [`For Ordift (${partyName}): ${s.signatory.name}, ${s.signatory.position}. Authority as recorded from the entity's supporting document: ${s.signatory.authority}`]),
    "",
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
