import { DESTINATION_KEYS, isDestination, type Destination } from "./destinations";

// Pure rules shared by the pages and the server library. Nothing here touches the database, and nothing is ever defaulted to "permitted".

export const GRANTOR_CAPACITIES = [
  { key: "client", label: "The client" },
  { key: "client_representative", label: "Someone acting for the client" },
  { key: "commissioning_party", label: "The commissioning party" },
  { key: "photographer_of_record", label: "The photographer of record" },
  { key: "venue_or_property_owner", label: "Venue or property owner" },
  { key: "subject_individual", label: "A person photographed" },
  { key: "guardian", label: "Parent or guardian" },
  { key: "other", label: "Other (explain in the evidence)" },
] as const;
export const PERMISSION_METHODS = [
  { key: "email", label: "Email" },
  { key: "message", label: "Chat message" },
  { key: "signed_document", label: "Signed document" },
  { key: "verbal", label: "Spoken (no written record)" },
  { key: "other", label: "Other" },
] as const;

export const SOURCE_LABEL = { contract: "From a signed agreement", client_portal: "Given by the client in the portal", admin_recorded: "Recorded by an administrator" } as const;

const REASON_LABEL: Record<string, string> = {
  permission_in_force: "Permission in force",
  no_permission_on_record: "No permission on record",
  declined_or_withdrawn: "Declined or withdrawn",
  pending_verification: "Recorded, verification still required",
  expired: "Permission expired",
  use_not_authorised: "This use is not covered",
  photograph_not_in_scope: "This photograph is not covered",
  file_has_no_job: "Not linked to a job",
};
const INTERNAL_LABEL: Record<string, string> = {
  approved: "Approved internally",
  no_internal_review: "Not yet reviewed internally",
  destination_not_approved: "Not approved for this use",
  returned_for_further_review: "Returned for further review",
  rejected: "Rejected internally",
  revoked: "Internal approval revoked",
};
export const permissionReasonLabel = (r: string) => REASON_LABEL[r] ?? r.replace(/_/g, " ");
export const internalReasonLabel = (r: string) => INTERNAL_LABEL[r] ?? r.replace(/_/g, " ");

export type Standing = { destination: string; eligible: boolean; rightsReason: string; internalReason: string };
// One-line standing for the picker: the permission picture and the internal picture, across every destination.
export function summariseStanding(rows: Standing[]): { permission: string; internal: string; usable: Destination[] } {
  const usable = rows.filter((r) => r.eligible && isDestination(r.destination)).map((r) => r.destination as Destination);
  const inForce = rows.filter((r) => r.rightsReason === "permission_in_force").length;
  const pending = rows.some((r) => r.rightsReason === "pending_verification");
  const blocked = rows.some((r) => r.rightsReason === "declined_or_withdrawn");
  const internalOk = rows.filter((r) => r.internalReason === "approved").length;
  const perm = blocked ? "Permission declined or withdrawn" : inForce > 0 ? `Permission: ${inForce} of ${DESTINATION_KEYS.length} uses` : pending ? "Permission recorded, verification needed" : "No permission on record";
  const intl = rows.find((r) => r.internalReason === "revoked") ? "Internal approval revoked" : internalOk > 0 ? `Approved internally: ${internalOk} of ${DESTINATION_KEYS.length} uses` : rows.find((r) => r.internalReason === "rejected") ? "Rejected internally" : rows.find((r) => r.internalReason === "returned_for_further_review") ? "Returned for further review" : "Not yet reviewed internally";
  return { permission: perm, internal: intl, usable };
}

const todayIso = () => new Date().toISOString().slice(0, 10);
export type AdminPermissionInput = {
  decision: "granted" | "declined" | "withdrawn";
  grantorName: string; grantorCapacity: string; destinations: string[]; fileIds: string[] | null; restrictions: string; expiresOn: string;
  method: string; grantedOn: string; evidenceSummary: string; note: string;
};
export function validateAdminPermission(i: AdminPermissionInput, today = todayIso()): string[] {
  const e: string[] = [];
  if (i.grantorName.trim().length < 2) e.push("Say who gave the permission.");
  if (!GRANTOR_CAPACITIES.some((c) => c.key === i.grantorCapacity)) e.push("Say in what capacity they gave it.");
  if (!PERMISSION_METHODS.some((m) => m.key === i.method)) e.push("Say how the permission was given.");
  if (i.evidenceSummary.trim().length < 10) e.push("Describe the supporting evidence (what it is and where it is kept).");
  if (i.decision === "granted") {
    if (i.destinations.length === 0) e.push("Choose at least one use that was authorised.");
    if (i.destinations.some((d) => !isDestination(d))) e.push("One of the chosen uses is not recognised.");
    if (i.fileIds && i.fileIds.length === 0) e.push("Choose at least one photograph, or leave it as the whole job.");
  } else if (i.note.trim().length < 3) e.push("Add a short note saying why.");
  if (i.grantedOn && !/^\d{4}-\d{2}-\d{2}$/.test(i.grantedOn)) e.push("The date of authorisation is not a valid date.");
  if (i.grantedOn && i.grantedOn > today) e.push("The date of authorisation cannot be in the future. Leave it blank if it is not established.");
  if (i.expiresOn && (!/^\d{4}-\d{2}-\d{2}$/.test(i.expiresOn) || i.expiresOn < today)) e.push("The expiry date must be today or later.");
  return e;
}

export const REVIEW_CHECKS = [
  { key: "confidentiality", label: "No confidentiality obligation prevents this use" },
  { key: "embargo", label: "No embargo applies, or it has ended" },
  { key: "contractual_restrictions", label: "No contractual restriction prevents this use" },
  { key: "release_rights", label: "Client / model release rights are in place for people shown" },
  { key: "quality", label: "It meets Ordift's creative and quality standard" },
] as const;
export type ReviewInput = { decision: "approved" | "rejected" | "returned" | "revoked"; destinations: string[]; checks: Record<string, boolean>; notes: string };
export function validateReview(i: ReviewInput): string[] {
  const e: string[] = [];
  if (i.decision === "approved") {
    if (i.destinations.length === 0) e.push("Choose where this photograph may be used.");
    if (i.destinations.some((d) => !isDestination(d))) e.push("One of the chosen uses is not recognised.");
    const missing = REVIEW_CHECKS.filter((c) => i.checks[c.key] !== true);
    if (missing.length) e.push(`Confirm every check before approving: ${missing.map((m) => m.label).join("; ")}.`);
  } else if (i.notes.trim().length < 3) e.push("Add a short note explaining the decision.");
  return e;
}
