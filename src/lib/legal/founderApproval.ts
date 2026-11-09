// FOUNDER APPROVAL ON COUNSEL'S ADVICE (pure rules, no I/O). LOCAL build; nothing here is released.
//
// What this records: the Founder's own approval of a legal-document version, made AFTER a telephone consultation with counsel and BASED ON counsel's advice.
// What it is not: a written approval issued by counsel. It never claims counsel approved anything, never impersonates counsel, never activates, publishes or
// issues a document. Every wording that reaches a screen or the audit log comes from the constants below so the distinction cannot drift.
import { classifyRegistryApproval, type RegistryApprovalBasis } from "./approvalAttestation";

export const FOUNDER_APPROVAL_ACTION = "legal.master_version.founder_approval_recorded";
export const FOUNDER_APPROVAL_BASIS = "founder_approval_on_counsel_advice_telephone_review";
export const CONSULTATION_MODE = "telephone_consultation";
export const NOT_COUNSEL_APPROVAL_STATEMENT = "This is the Founder's approval, based on counsel's advice given in a telephone consultation. It is not a written approval issued by counsel.";
export const approverLabelFor = (consultationDate: string) => `Founder, on advice of counsel (telephone consultation ${consultationDate})`;
export const approvalSentenceFor = (code: string, version: string) => `approve ${code} ${version}`;
export const sentenceMatches = (typed: string, code: string, version: string) => typed.trim().replace(/\s+/g, " ").toLowerCase() === approvalSentenceFor(code, version).toLowerCase();

export const CONCLUSIONS = ["content_as_drafted", "content_subject_to_recorded_amendments", "amendments_needed_before_use", "wants_more_time"] as const;
export type Conclusion = (typeof CONCLUSIONS)[number];
export const CONCLUSION_LABELS: Record<Conclusion, string> = {
  content_as_drafted: "Counsel is content with the text as drafted",
  content_subject_to_recorded_amendments: "Counsel is content subject to the amendments recorded below, which are now in the text",
  amendments_needed_before_use: "Counsel says amendments are needed before the text is used (approval is not available)",
  wants_more_time: "Counsel wants more time (approval is not available)",
};
const APPROVABLE: Conclusion[] = ["content_as_drafted", "content_subject_to_recorded_amendments"];

export const TEXT_RELATIONS = ["same_text_as_reviewed", "reviewed_text_with_recorded_amendments", "different_text"] as const;
export type TextRelation = (typeof TEXT_RELATIONS)[number];
export const TEXT_RELATION_LABELS: Record<TextRelation, string> = {
  same_text_as_reviewed: "The registered master is the text counsel heard, with no change of substance (it is a conversion of the reviewed draft)",
  reviewed_text_with_recorded_amendments: "The registered master is the reviewed text plus the amendments recorded below, each recommended by counsel",
  different_text: "The registered master is different from the text counsel heard (approval is not available: hold another consultation)",
};

export type FounderApprovalInput = {
  consultationDate: string; startTime: string; endTime: string; timezone: string;
  counselName: string; counselFirm: string; identityCheckNote: string;
  recommendations: string; amendments: string; conclusion: string; conclusionNote: string;
  counselAskedToSeeFinalText: boolean; reconfirmationNote: string;
  reviewedDraftSha256: string; textRelation: string;
  typedHashPrefix: string; statementAccepted: boolean; typedSentence: string;
};
export type FounderApprovalContext = { today: string; code: string; version: string; registeredDocxSha256: string };

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const isTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const validZone = (z: string) => { try { new Intl.DateTimeFormat("en", { timeZone: z }); return z.length > 0; } catch { return false; } };
const enough = (s: string, n: number) => s.trim().length >= n;

export function validateFounderApproval(i: FounderApprovalInput, c: FounderApprovalContext): { ok: true } | { ok: false; errors: string[] } {
  const e: string[] = [];
  if (!isDate(i.consultationDate)) e.push("Enter the date of the telephone consultation (YYYY-MM-DD).");
  else if (i.consultationDate > c.today) e.push("The consultation date cannot be in the future: approval is recorded only after the consultation has taken place.");
  if (!isTime(i.startTime) || !isTime(i.endTime)) e.push("Enter the call's start and end times (HH:MM, 24-hour).");
  else if (i.endTime <= i.startTime) e.push("The call's end time must be after its start time.");
  if (!validZone(i.timezone)) e.push("Choose the time zone the call times are in.");
  if (!enough(i.counselName, 3)) e.push("Enter counsel's name as given to you on the call.");
  if (!enough(i.counselFirm, 2)) e.push("Enter counsel's firm or chambers (write “not stated” if none was given).");
  if (!enough(i.identityCheckNote, 15)) e.push("Describe how you satisfied yourself that you were speaking with counsel (for example, calling back a number taken from an independent source).");
  if (!enough(i.recommendations, 20)) e.push("Record counsel's recommendations in counsel's own terms (at least a short paragraph; write what was said, not a conclusion).");
  if (!enough(i.amendments, 4)) e.push("Record the amendments counsel requested, or write “None requested”.");
  if (!(CONCLUSIONS as readonly string[]).includes(i.conclusion)) e.push("Choose counsel's conclusion.");
  else if (!APPROVABLE.includes(i.conclusion as Conclusion)) e.push("Counsel's advice, as you recorded it, is that the text is not yet ready. A Founder approval cannot be recorded on that advice.");
  if (!enough(i.conclusionNote, 10)) e.push("Record counsel's conclusion in counsel's words.");
  if (i.counselAskedToSeeFinalText && !enough(i.reconfirmationNote, 15)) e.push("Counsel asked to see the final text. Record when and how counsel saw or reconfirmed it; if that has not happened, approval cannot be recorded yet.");
  if (!/^[0-9a-f]{64}$/i.test(i.reviewedDraftSha256.trim())) e.push("Enter the full 64-character SHA-256 of the exact draft counsel heard (from section 1 of your sheet).");
  if (!(TEXT_RELATIONS as readonly string[]).includes(i.textRelation)) e.push("State how the registered master relates to the text counsel heard.");
  else if (i.textRelation === "different_text") e.push("The registered master is not the text counsel heard. Hold another consultation on the final text before approving.");
  else if (i.textRelation === "reviewed_text_with_recorded_amendments" && i.amendments.trim().toLowerCase().replace(/[.\s]/g, "") === "nonerequested") e.push("You said amendments were incorporated but recorded none. Record them, or choose the 'no change of substance' option.");
  if (i.typedHashPrefix.trim().toLowerCase() !== c.registeredDocxSha256.slice(0, 12).toLowerCase()) e.push("The hash check does not match: type the first 12 characters of the registered master's SHA-256 exactly as shown, after comparing it with your sheet.");
  if (!i.statementAccepted) e.push("Tick the statement that this is your Founder approval on counsel's advice and not a written approval issued by counsel.");
  if (!sentenceMatches(i.typedSentence, c.code, c.version)) e.push(`To approve, type exactly: ${approvalSentenceFor(c.code, c.version)}`);
  return e.length ? { ok: false, errors: e } : { ok: true };
}

// ---- what must already be true of the version before the approval step is offered (the existing controls, not new ones)
export type VersionFacts = {
  status: string; legacyCode: string | null; approvedAt: string | null; contentRegistered: boolean; unresolvedMarkers: number | null; storedMasterVerified: boolean | null;
  founderApprovalExists: boolean; isCurrentActiveVersion: boolean;
};
export type Precondition = { key: string; label: string; ok: boolean; detail: string };
export function approvalPreconditions(f: VersionFacts): Precondition[] {
  return [
    { key: "not_baseline", label: "This is a new version, not the active baseline or a placeholder", ok: f.legacyCode === null && !f.isCurrentActiveVersion && f.status !== "active", detail: "The active version and the historical placeholder are never approved through this screen." },
    { key: "in_review", label: "The version is in legal review", ok: f.status === "legal_review", detail: f.status === "draft" ? "Start the legal review first (step 1)." : `Current status: ${f.status}.` },
    { key: "registered", label: "The stored master is registered under a controlled content reference", ok: f.contentRegistered, detail: f.contentRegistered ? "Registered." : "Register the stored master first (step 2)." },
    { key: "markers", label: "No unresolved counsel-review markers in the master", ok: f.unresolvedMarkers === 0, detail: f.unresolvedMarkers === null ? "Not checked yet: this happens when the master is registered." : f.unresolvedMarkers === 0 ? "None." : `${f.unresolvedMarkers} unresolved.` },
    { key: "integrity", label: "The stored master files match their recorded fingerprints", ok: f.storedMasterVerified === true, detail: f.storedMasterVerified === null ? "Checked when you press approve." : f.storedMasterVerified ? "Verified now." : "A stored file does not match: nothing can be approved." },
    { key: "no_prior", label: "No Founder approval or registry approval is already recorded", ok: !f.founderApprovalExists && !f.approvedAt, detail: "An approval is set once and is never replaced; a correction needs your separate instruction." },
  ];
}

// ---- how each version of a master is described on screen (the historical placeholder is never presented as an approval)
export type VersionRole = "active_baseline" | "historical_placeholder" | "target" | "other";
export function describeVersion(v: { id: string; version: string; status: string; legacyCode: string | null; approvedBy: string | null; approvedAt: string | null }, currentVersionId: string | null, targetId: string): { role: VersionRole; basis: RegistryApprovalBasis; note: string } {
  const basis = classifyRegistryApproval({ status: v.status, approvedBy: v.approvedBy, approvedAt: v.approvedAt });
  if (v.id === targetId) return { role: "target", basis, note: "The version being reviewed." };
  if (v.id === currentVersionId && v.status === "active") return { role: "active_baseline", basis, note: "The active version: the live Master Booking Terms. It is the comparison baseline." };
  if (basis === "seeded_label_unevidenced") return { role: "historical_placeholder", basis, note: "Historical placeholder: a status label seeded on 8 Sep 2026 with no text, no approval date and no evidence on record. It is not a verified approval and is not used as the baseline." };
  return { role: "other", basis, note: "Another version of this document." };
}

// ---- reading the form (everything typed is DATA to be validated above and again on the server; nothing here authorises anything)
type FormLike = { get(name: string): FormDataEntryValue | null };
const str = (f: FormLike, k: string) => String(f.get(k) ?? "").trim();
export function parseFounderApprovalForm(f: FormLike): { versionId: string; input: FounderApprovalInput } {
  return {
    versionId: str(f, "versionId"),
    input: {
      consultationDate: str(f, "consultationDate"), startTime: str(f, "startTime"), endTime: str(f, "endTime"), timezone: str(f, "timezone"),
      counselName: str(f, "counselName"), counselFirm: str(f, "counselFirm"), identityCheckNote: str(f, "identityCheckNote"),
      recommendations: str(f, "recommendations"), amendments: str(f, "amendments"), conclusion: str(f, "conclusion"), conclusionNote: str(f, "conclusionNote"),
      counselAskedToSeeFinalText: f.get("counselAskedToSeeFinalText") === "yes", reconfirmationNote: str(f, "reconfirmationNote"),
      reviewedDraftSha256: str(f, "reviewedDraftSha256"), textRelation: str(f, "textRelation"),
      typedHashPrefix: str(f, "typedHashPrefix"), statementAccepted: f.get("statementAccepted") === "yes", typedSentence: str(f, "typedSentence"),
    },
  };
}
