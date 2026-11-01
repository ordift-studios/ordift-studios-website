import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import type { CurrentUser } from "@/lib/portal/roles";
import { isManagementUser } from "@/lib/crewSupport/management";
import { PORTFOLIO_LIBRARY_ENABLED } from "./featureGate";
import { SUBJECT_PERMISSIONS_ENABLED } from "./subjectGate";
import { DECLARATIONS, SUBJECT_KINDS, validateCheckNote, validateSubjectGrant, type SubjectGrantInput, type SubjectKind } from "./subjectRules";

// PERMISSION EVIDENCE FOR THE PEOPLE AND PROPERTY SHOWN (proposed migration 0182; dormant until SUBJECT_PERMISSIONS_ENABLED). Management only. A grant is only RECORDED here; it counts for nothing until a separate
// verification (with a stated check) is recorded, and withdrawal blocks use at once. The database applies the same rules. No evidence document or identification is stored: only who gave it and where it is kept.
export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const gate = () => (PORTFOLIO_LIBRARY_ENABLED && SUBJECT_PERMISSIONS_ENABLED ? null : fail("Recording permission evidence for people shown is not switched on yet."));
const authority = async (u: CurrentUser) => ((await isManagementUser(u)) ? null : fail("Only the Founder or an authorised executive admin can do this."));
const clean = (e: { message?: string } | null) => (e?.message ?? "That could not be saved.").replace(/^.*?ERROR:\s*/, "");
const today = () => new Date().toISOString().slice(0, 10);

export async function declarePeopleShown(user: CurrentUser, fileId: string, declaration: string, note: string): Promise<Result> {
  const g = gate(); if (g) return g; const a = await authority(user); if (a) return a;
  if (!DECLARATIONS.some((d) => d.key === declaration)) return fail("Choose what the photograph shows.");
  const { error } = await createAdminClient().from("portfolio_people_declarations").insert({ project_file_id: fileId, declaration, note: note.trim() || null, declared_by: user.id });
  if (error) return fail(clean(error));
  await logActivity({ actorUserId: user.id, action: "portfolio.people_declared", entityType: "project_file", entityId: fileId, metadata: { declaration } });
  return { ok: true };
}

export async function addSubject(user: CurrentUser, fileId: string, kind: SubjectKind, label: string): Promise<Result<{ id: string }>> {
  const g = gate(); if (g) return g; const a = await authority(user); if (a) return a;
  if (!SUBJECT_KINDS.some((k) => k.key === kind)) return fail("Choose who or what is shown.");
  if (label.trim().length < 3 || label.trim().length > 120) return fail("Describe where they appear in the frame (3 to 120 characters). Use a description, not a full name.");
  const { data, error } = await createAdminClient().from("portfolio_file_subjects").insert({ project_file_id: fileId, action: "added", subject_kind: kind, label: label.trim(), recorded_by: user.id }).select("id").single();
  if (error || !data) return fail(clean(error));
  await logActivity({ actorUserId: user.id, action: "portfolio.subject_added", entityType: "project_file", entityId: fileId, metadata: { kind } });
  return { ok: true, id: data.id as string };
}

export async function recordSubjectPermission(user: CurrentUser, subject: { id: string; kind: SubjectKind }, input: Omit<SubjectGrantInput, "subjectKind">): Promise<Result<{ id: string }>> {
  const g = gate(); if (g) return g; const a = await authority(user); if (a) return a;
  const problems = validateSubjectGrant({ ...input, subjectKind: subject.kind }, today());
  if (problems.length) return fail(problems.join(" "));
  const { data, error } = await createAdminClient().from("portfolio_subject_permissions").insert({
    subject_id: subject.id, decision: "granted", grantor_kind: input.grantorKind, grantor_name: input.grantorName.trim(), grantor_relationship: input.grantorRelationship?.trim() || null, evidence_kind: input.evidenceKind, evidence_reference: input.evidenceReference.trim(),
    agreement_id: input.agreementId || null, allowed_destinations: input.destinations, restrictions: input.restrictions?.trim() || null, expires_on: input.expiresOn || null, recorded_by: user.id,
  }).select("id").single();
  if (error || !data) return fail(clean(error));
  await logActivity({ actorUserId: user.id, action: "portfolio.subject_permission_recorded", entityType: "portfolio_file_subject", entityId: subject.id, metadata: { grantorKind: input.grantorKind, destinations: input.destinations } });
  return { ok: true, id: data.id as string };
}

async function followUp(user: CurrentUser, decision: "verified" | "withdrawn", subjectId: string, grantId: string, note: string): Promise<Result> {
  const g = gate(); if (g) return g; const a = await authority(user); if (a) return a;
  const bad = validateCheckNote(note); if (bad) return fail(bad);
  const { error } = await createAdminClient().from("portfolio_subject_permissions").insert({ subject_id: subjectId, decision, supersedes_id: grantId, note: note.trim(), recorded_by: user.id });
  if (error) return fail(clean(error));
  await logActivity({ actorUserId: user.id, action: `portfolio.subject_permission_${decision}`, entityType: "portfolio_file_subject", entityId: subjectId, metadata: {} });
  return { ok: true };
}
export const verifySubjectPermission = (user: CurrentUser, subjectId: string, grantId: string, checked: string) => followUp(user, "verified", subjectId, grantId, checked);
export const withdrawSubjectPermission = (user: CurrentUser, subjectId: string, grantId: string, reason: string) => followUp(user, "withdrawn", subjectId, grantId, reason);
