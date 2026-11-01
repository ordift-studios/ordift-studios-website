import { isDestination } from "./destinations";

// Pure rules for permission evidence about the people and property shown in a photograph (proposed 0182). The database re-checks every one of them.
export const SUBJECT_KINDS = [{ key: "adult", label: "Adult" }, { key: "child", label: "Child (under 18)" }, { key: "property", label: "Protected property" }] as const;
export type SubjectKind = (typeof SUBJECT_KINDS)[number]["key"];
export const GRANTORS: Record<SubjectKind, { key: string; label: string }[]> = {
  child: [{ key: "parent_guardian", label: "Parent or legal guardian" }],
  adult: [{ key: "subject_self", label: "The person themself" }, { key: "authorized_representative", label: "Their authorised representative" }, { key: "signed_release", label: "A signed release" }],
  property: [{ key: "property_owner", label: "The property owner" }, { key: "authorized_representative", label: "Their authorised representative" }, { key: "signed_release", label: "A signed release" }],
};
export const EVIDENCE_KINDS = [{ key: "signed_form", label: "Signed form" }, { key: "written_message", label: "Written message" }, { key: "release_agreement", label: "Executed release agreement" }, { key: "other_written", label: "Other written record" }] as const;
export const DECLARATIONS = [{ key: "none_shown", label: "No identifiable person, child or protected property needing permission is shown" }, { key: "people_or_property_shown", label: "People, a child or protected property are shown (list each one)" }] as const;

export type SubjectGrantInput = { subjectKind: SubjectKind; grantorKind: string; grantorName: string; grantorRelationship?: string; authorityReference?: string; givenOn: string; evidenceKind: string; evidenceReference: string; agreementId?: string; destinations: string[]; restrictions?: string; expiresOn?: string; replacesGrantId?: string };
export function validateSubjectGrant(i: SubjectGrantInput, today: string): string[] {
  const e: string[] = [];
  if (!GRANTORS[i.subjectKind]?.some((g) => g.key === i.grantorKind)) e.push(i.subjectKind === "child" ? "Permission for a child can only be given by a parent or legal guardian." : "That is not an acceptable source of permission for this kind of subject.");
  if ((i.grantorName ?? "").trim().length < 2 || i.grantorName.trim().length > 120) e.push("Enter the name of the person who gave permission (2 to 120 characters).");
  if (!EVIDENCE_KINDS.some((k) => k.key === i.evidenceKind)) e.push("Choose the kind of evidence that exists.");
  if ((i.evidenceReference ?? "").trim().length < 10) e.push("Say where the evidence is kept (at least 10 characters). A reference is not itself proof: it must be verified separately.");
  if (i.evidenceKind === "release_agreement" && !i.agreementId) e.push("Choose the executed release agreement.");
  if (i.evidenceKind !== "release_agreement" && i.agreementId) e.push("Only a release agreement is linked to an agreement.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.givenOn ?? "") || i.givenOn > today) e.push("Enter the date the permission was given (not in the future). If it cannot be established, the photograph stays ineligible.");
  if (["parent_guardian", "authorized_representative"].includes(i.grantorKind) && (i.grantorRelationship ?? "").trim().length < 2) e.push(i.grantorKind === "parent_guardian" ? "Say how the person is the child's parent or legal guardian (for example mother, legal guardian by court order)." : "Say the representative's capacity (for example event organiser, agent).");
  if (i.grantorKind === "authorized_representative" && (i.authorityReference ?? "").trim().length < 10) e.push("A representative's authority to give this specific permission must be documented: say where that authority is recorded. A client, organiser, employer or family member is not assumed to have it.");
  if (i.destinations.length === 0 || i.destinations.some((d) => !isDestination(d))) e.push("Choose at least one recognised use.");
  if (i.expiresOn && (!/^\d{4}-\d{2}-\d{2}$/.test(i.expiresOn) || i.expiresOn < today)) e.push("The expiry date must be today or later.");
  return e;
}
export const validateCheckNote = (note: string): string | null => ((note ?? "").trim().length >= 10 ? null : "Say what you checked and how (at least 10 characters).");
// Verification is a separate, dated act by an identifiable manager that names the evidence actually examined; a bare assertion is never verification.
export function validateVerification(evidenceReference: string, note: string): string | null {
  if ((evidenceReference ?? "").trim().length < 10) return "Name the evidence you examined (where it is kept, at least 10 characters). An assertion without evidence is not verification.";
  return validateCheckNote(note);
}
export const validateDeclarationNote = (note: string): string | null => ((note ?? "").trim().length >= 10 ? null : "Record the basis of your assessment: who is identifiable, how, and which permissions apply (at least 10 characters). Nothing is assumed for crowds or background people.");

// Where a photograph originates. Mandatory before an identifiable child can be listed on it. "other" means the photograph does NOT originate in Qatar (stated by the manager). Anything else, including unknown, is treated as Qatar (fail closed).
export const ORIGINS = [{ key: "ghana", label: "Ghana" }, { key: "qatar", label: "Qatar" }, { key: "other", label: "Elsewhere (not Qatar)" }] as const;
export type Origin = (typeof ORIGINS)[number]["key"];
export const isKnownNonQatar = (v: string | null | undefined): boolean => v === "ghana" || v === "other";
