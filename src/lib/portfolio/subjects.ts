import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import type { CurrentUser } from "@/lib/portal/roles";
import { isManagementUser } from "@/lib/crewSupport/management";
import { PORTFOLIO_LIBRARY_ENABLED } from "./featureGate";
import { SUBJECT_PERMISSIONS_ENABLED } from "./subjectGate";
import { DECLARATIONS, SUBJECT_KINDS, validateCheckNote, validateDeclarationNote, validateSubjectGrant, validateVerification, type SubjectGrantInput, type SubjectKind } from "./subjectRules";

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
  const bad = validateDeclarationNote(note); if (bad) return fail(bad);
  const { error } = await createAdminClient().from("portfolio_people_declarations").insert({ project_file_id: fileId, declaration, note: note.trim(), declared_by: user.id });
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
    subject_id: subject.id, decision: "granted", supersedes_id: input.replacesGrantId || null, grantor_kind: input.grantorKind, grantor_name: input.grantorName.trim(), grantor_relationship: input.grantorRelationship?.trim() || null, authority_reference: input.authorityReference?.trim() || null, given_on: input.givenOn, evidence_kind: input.evidenceKind, evidence_reference: input.evidenceReference.trim(),
    agreement_id: input.agreementId || null, allowed_destinations: input.destinations, restrictions: input.restrictions?.trim() || null, expires_on: input.expiresOn || null, recorded_by: user.id,
  }).select("id").single();
  if (error || !data) return fail(clean(error));
  await logActivity({ actorUserId: user.id, action: "portfolio.subject_permission_recorded", entityType: "portfolio_file_subject", entityId: subject.id, metadata: { grantorKind: input.grantorKind, destinations: input.destinations } });
  return { ok: true, id: data.id as string };
}

async function followUp(user: CurrentUser, decision: "verified" | "withdrawn", subjectId: string, grantId: string, o: { evidenceReference?: string; note: string }): Promise<Result> {
  const g = gate(); if (g) return g; const a = await authority(user); if (a) return a;
  const bad = decision === "verified" ? validateVerification(o.evidenceReference ?? "", o.note) : validateCheckNote(o.note); if (bad) return fail(bad);
  const { error } = await createAdminClient().from("portfolio_subject_permissions").insert({ subject_id: subjectId, decision, supersedes_id: grantId, evidence_reference: decision === "verified" ? o.evidenceReference!.trim() : null, note: o.note.trim(), recorded_by: user.id });
  if (error) return fail(clean(error));
  await logActivity({ actorUserId: user.id, action: `portfolio.subject_permission_${decision}`, entityType: "portfolio_file_subject", entityId: subjectId, metadata: {} });
  return { ok: true };
}
export const verifySubjectPermission = (user: CurrentUser, subjectId: string, grantId: string, evidenceExamined: string, checked: string) => followUp(user, "verified", subjectId, grantId, { evidenceReference: evidenceExamined, note: checked });
export const withdrawSubjectPermission = (user: CurrentUser, subjectId: string, grantId: string, reason: string) => followUp(user, "withdrawn", subjectId, grantId, { note: reason });

// Retention policy: erase the personal details of a permission that is no longer in force. The database refuses an in-force permission and logs every erasure; decisions, dates and uses are kept.
export async function redactSubjectPermission(user: CurrentUser, grantId: string, reason: string, confirmPermitted: boolean): Promise<Result> {
  const g = gate(); if (g) return g; const a = await authority(user); if (a) return a;
  if (reason.trim().length < 10 || reason.trim().length > 200) return fail("State the reason for the erasure in 10 to 200 characters. Do not include names or other personal details: the log is kept.");
  if (confirmPermitted !== true) return fail("Confirm that erasure is permitted: no dispute, legal obligation, audit or active permission still needs this evidence.");
  const { error } = await createAdminClient().rpc("portfolio_subject_permission_redact", { p_permission: grantId, p_actor: user.id, p_reason: reason.trim(), p_confirm_permitted: true });
  if (error) return fail(clean(error));
  await logActivity({ actorUserId: user.id, action: "portfolio.subject_permission_erased", entityType: "portfolio_subject_permission", entityId: grantId, metadata: {} });
  return { ok: true };
}

// A legal / dispute hold on a photograph: while it is in place no personal detail about its permissions can be erased. Management only; recorded, dated and attributed.
export async function setFileHold(user: CurrentUser, fileId: string, action: "placed" | "released", reason: string): Promise<Result> {
  const g = gate(); if (g) return g; const a = await authority(user); if (a) return a;
  if (reason.trim().length < 10 || reason.trim().length > 200) return fail("State the reason in 10 to 200 characters: the kind of dispute, complaint, audit or legal obligation. Do not include names or other personal details: the log is kept.");
  const { error } = await createAdminClient().from("portfolio_file_holds").insert({ project_file_id: fileId, action, reason: reason.trim(), recorded_by: user.id });
  if (error) return fail(clean(error));
  await logActivity({ actorUserId: user.id, action: `portfolio.hold_${action}`, entityType: "project_file", entityId: fileId, metadata: {} });
  return { ok: true };
}

// ---------------------------------------------------------------- read model for the job page (server only)
export type GrantStatus = "recorded_unverified" | "verified" | "withdrawn" | "replaced" | "expired";
export type SubjectGrantView = { id: string; status: GrantStatus; grantorKind: string; grantorName: string; grantorRelationship: string | null; evidenceKind: string; evidenceReference: string; givenOn: string | null; destinations: string[]; restrictions: string | null; expiresOn: string | null; verifiedOn: string | null; erased: boolean };
export type SubjectView = { id: string; kind: SubjectKind; label: string; grants: SubjectGrantView[] };
export type PhotoPeopleView = { declaration: { value: string; note: string; at: string } | null; subjects: SubjectView[]; hold: { reason: string; at: string } | null };
export async function getPeopleViews(fileIds: string[]): Promise<Record<string, PhotoPeopleView>> {
  if (!PORTFOLIO_LIBRARY_ENABLED || !SUBJECT_PERMISSIONS_ENABLED || fileIds.length === 0) return {};
  const admin = createAdminClient(); const ids = fileIds.slice(0, 200);
  const { data: holds } = await admin.from("portfolio_file_holds").select("project_file_id, action, reason, recorded_at, seq").in("project_file_id", ids).order("seq", { ascending: false });
  const [{ data: decs }, { data: subs }] = await Promise.all([
    admin.from("portfolio_people_declarations").select("project_file_id, declaration, note, declared_at, seq").in("project_file_id", ids).order("seq", { ascending: false }),
    admin.from("portfolio_file_subjects").select("id, project_file_id, action, subject_kind, label, supersedes_id, seq").in("project_file_id", ids).order("seq", { ascending: true }),
  ]);
  const removed = new Set((subs ?? []).filter((x) => x.action === "removed").map((x) => x.supersedes_id as string));
  const active = (subs ?? []).filter((x) => x.action === "added" && !removed.has(x.id as string));
  const { data: perms } = active.length ? await admin.from("portfolio_subject_permissions").select("*").in("subject_id", active.map((x) => x.id as string)).order("seq", { ascending: true }) : { data: [] };
  const rows = perms ?? []; const todayIso = today();
  const out: Record<string, PhotoPeopleView> = {};
  for (const f of ids) {
    const d = (decs ?? []).find((x) => x.project_file_id === f);
    out[f] = { declaration: d ? { value: d.declaration as string, note: d.note as string, at: d.declared_at as string } : null, subjects: [], hold: null };
    const h = (holds ?? []).find((x) => x.project_file_id === f);
    if (h && h.action === "placed") out[f].hold = { reason: h.reason as string, at: h.recorded_at as string };
  }
  for (const s of active) {
    const grants: SubjectGrantView[] = rows.filter((r) => r.subject_id === s.id && r.decision === "granted").map((g) => {
      const follow = rows.filter((r) => r.supersedes_id === g.id);
      const verified = follow.find((r) => r.decision === "verified");
      const status: GrantStatus = follow.some((r) => r.decision === "withdrawn") ? "withdrawn" : follow.some((r) => r.decision === "granted") ? "replaced" : g.expires_on && (g.expires_on as string) < todayIso ? "expired" : verified ? "verified" : "recorded_unverified";
      return { id: g.id as string, status, grantorKind: g.grantor_kind as string, grantorName: g.grantor_name as string, grantorRelationship: (g.grantor_relationship as string | null) ?? null, evidenceKind: g.evidence_kind as string, evidenceReference: g.evidence_reference as string, givenOn: (g.given_on as string | null) ?? null, destinations: g.allowed_destinations as string[], restrictions: (g.restrictions as string | null) ?? null, expiresOn: (g.expires_on as string | null) ?? null, verifiedOn: verified ? (verified.recorded_at as string) : null, erased: String(g.grantor_name) === "[erased]" };
    });
    out[s.project_file_id as string]?.subjects.push({ id: s.id as string, kind: s.subject_kind as SubjectKind, label: s.label as string, grants });
  }
  return out;
}

// INTERIM RESTRICTION (management, 1 Nov 2026): a photograph that shows an identifiable child and is marked as originating in Qatar is not approved or cleared for promotional portfolio use until the Qatar requirements
// (including any authorisation the Competent Department requires for children's data) have been verified. Internal handling for contracted services is unaffected. Applies only once structured evidence is live.
export async function childQatarRestriction(fileId: string): Promise<string | null> {
  if (!PORTFOLIO_LIBRARY_ENABLED || !SUBJECT_PERMISSIONS_ENABLED) return null;
  const admin = createAdminClient();
  const { data: cand } = await admin.from("portfolio_candidates").select("jurisdiction").eq("project_file_id", fileId).maybeSingle();
  if (!/qatar/i.test(String(cand?.jurisdiction ?? ""))) return null;
  const { data: subs } = await admin.from("portfolio_file_subjects").select("id, action, subject_kind, supersedes_id").eq("project_file_id", fileId);
  const removed = new Set((subs ?? []).filter((x) => x.action === "removed").map((x) => x.supersedes_id as string));
  return (subs ?? []).some((x) => x.action === "added" && x.subject_kind === "child" && !removed.has(x.id as string))
    ? "This photograph shows an identifiable child and originates in Qatar: it cannot be approved for promotional use until the Qatar legal requirements, guardian permission and any required authorisation have been verified."
    : null;
}
