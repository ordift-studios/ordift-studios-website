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

export type SubjectGrantInput = { subjectKind: SubjectKind; grantorKind: string; grantorName: string; grantorRelationship?: string; evidenceKind: string; evidenceReference: string; agreementId?: string; destinations: string[]; restrictions?: string; expiresOn?: string };
export function validateSubjectGrant(i: SubjectGrantInput, today: string): string[] {
  const e: string[] = [];
  if (!GRANTORS[i.subjectKind]?.some((g) => g.key === i.grantorKind)) e.push(i.subjectKind === "child" ? "Permission for a child can only be given by a parent or legal guardian." : "That is not an acceptable source of permission for this kind of subject.");
  if ((i.grantorName ?? "").trim().length < 2 || i.grantorName.trim().length > 120) e.push("Enter the name of the person who gave permission (2 to 120 characters).");
  if (!EVIDENCE_KINDS.some((k) => k.key === i.evidenceKind)) e.push("Choose the kind of evidence that exists.");
  if ((i.evidenceReference ?? "").trim().length < 10) e.push("Say where the evidence is kept (at least 10 characters). A reference is not itself proof: it must be verified separately.");
  if (i.evidenceKind === "release_agreement" && !i.agreementId) e.push("Choose the executed release agreement.");
  if (i.evidenceKind !== "release_agreement" && i.agreementId) e.push("Only a release agreement is linked to an agreement.");
  if (i.destinations.length === 0 || i.destinations.some((d) => !isDestination(d))) e.push("Choose at least one recognised use.");
  if (i.expiresOn && (!/^\d{4}-\d{2}-\d{2}$/.test(i.expiresOn) || i.expiresOn < today)) e.push("The expiry date must be today or later.");
  return e;
}
export const validateCheckNote = (note: string): string | null => ((note ?? "").trim().length >= 10 ? null : "Say what you checked and how (at least 10 characters).");
