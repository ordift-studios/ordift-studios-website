import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { authorizeWithSuperAdminOverride, isSuperAdminId, PEOPLE_CAPABILITIES } from "@/lib/organization/authority";
import { hasFullyExecutedAgreement } from "@/lib/legal/agreementEngine";
import { INSTRUCTOR_FRAMEWORK_ENABLED } from "./featureGate";
import { getAdoptedStandards } from "./standards";
import { EMPTY_RIGHTS, scheduleReadiness, validateScheduleInput, type ReadinessItem, type RightsMatrix, type ScheduleInput } from "./rules";

// SESSION SCHEDULES AND RIGHTS MATRIX (migration 0180). One assignment = one schedule + one rights matrix. PROPOSED until a Super Admin approves; the database refuses approval unless the
// agreement is executed, the adopted standards are acknowledged, regulatory clearance is recorded with a reference, every right is decided and no decision is flagged. Rights start UNSET and
// are never inferred or granted automatically. A signed framework agreement alone makes nobody eligible to begin work.
type Fail = { ok: false; error: string };
const OFF: Fail = { ok: false, error: "The instructor assignment framework is not enabled yet." };
const NOT_AUTH: Fail = { ok: false, error: "Not authorized to manage instructor assignments." };

export type Schedule = { id: string; instructorProfileId: string; instructorName: string | null; agreementId: string; programmeName: string; venue: string; timezone: string; firstSessionAt: string; lastSessionAt: string | null; durationMinutes: number; frequency: string; responsibilities: string; compensationReference: string; regulatoryClearance: string; regulatoryEvidenceReference: string; status: string; approvedAt: string | null; standardsVersionId: string | null; rights: RightsMatrix; readiness: ReadinessItem[] };
type SRow = { id: string; instructor_profile_id: string; agreement_id: string; programme_name: string; venue: string; timezone: string; first_session_at: string; last_session_at: string | null; duration_minutes: number; frequency: string; responsibilities: string; compensation_reference: string; regulatory_clearance: string; regulatory_evidence_reference: string | null; status: string; approved_at: string | null; standards_version_id: string | null };
type MRow = { teaching_materials_use: string; material_ownership: string; photography: string; recording: string; participant_data_access: string; publication_promotion: string; sharing_reuse_restrictions: string | null; agreement_policy_references: string | null; unresolved_decisions: string | null };
const rightsOf = (m: MRow | null | undefined): RightsMatrix => m ? ({ teachingMaterialsUse: m.teaching_materials_use, materialOwnership: m.material_ownership, photography: m.photography, recording: m.recording, participantDataAccess: m.participant_data_access, publicationPromotion: m.publication_promotion, sharingReuseRestrictions: m.sharing_reuse_restrictions ?? "", agreementPolicyReferences: m.agreement_policy_references ?? "", unresolvedDecisions: m.unresolved_decisions ?? "" } as RightsMatrix) : { ...EMPTY_RIGHTS };

async function manager(actor: string): Promise<boolean> { return (await authorizeWithSuperAdminOverride(actor, PEOPLE_CAPABILITIES.workshopEngagementAdminister)).ok; }

async function readinessFor(s: SRow, rights: RightsMatrix): Promise<ReadinessItem[]> {
  const admin = createAdminClient();
  const adopted = await getAdoptedStandards();
  const { data: ack } = adopted ? await admin.from("instructor_standards_acknowledgements").select("id").eq("profile_id", s.instructor_profile_id).eq("version_id", adopted.id).eq("document_sha256", adopted.bodySha256).maybeSingle() : { data: null };
  const executed = await hasFullyExecutedAgreement({ canonicalCode: "OS-LGL-010", primaryContextType: "instructor_profile", primaryContextReference: s.instructor_profile_id });
  const coreComplete = Boolean(s.programme_name && s.venue && s.first_session_at && s.duration_minutes && s.frequency && s.responsibilities && s.compensation_reference);
  return scheduleReadiness({ agreementExecuted: executed, standardsAdopted: Boolean(adopted), standardsAcknowledged: Boolean(ack), regulatoryClearance: s.regulatory_clearance, regulatoryEvidence: s.regulatory_evidence_reference, rights, coreComplete });
}

const SCOLS = "id, instructor_profile_id, agreement_id, programme_name, venue, timezone, first_session_at, last_session_at, duration_minutes, frequency, responsibilities, compensation_reference, regulatory_clearance, regulatory_evidence_reference, status, approved_at, standards_version_id";
async function build(rows: SRow[]): Promise<Schedule[]> {
  if (rows.length === 0) return [];
  const admin = createAdminClient();
  const [{ data: ms }, { data: ps }] = await Promise.all([admin.from("instructor_rights_matrix").select("*").in("schedule_id", rows.map((r) => r.id)), admin.from("profiles").select("id, full_name").in("id", Array.from(new Set(rows.map((r) => r.instructor_profile_id))))]);
  const mBy = new Map((ms ?? []).map((m) => [m.schedule_id as string, m as MRow])); const nBy = new Map((ps ?? []).map((p) => [p.id as string, (p.full_name as string | null) ?? null]));
  return Promise.all(rows.map(async (s) => { const rights = rightsOf(mBy.get(s.id)); return { id: s.id, instructorProfileId: s.instructor_profile_id, instructorName: nBy.get(s.instructor_profile_id) ?? null, agreementId: s.agreement_id, programmeName: s.programme_name, venue: s.venue, timezone: s.timezone, firstSessionAt: s.first_session_at, lastSessionAt: s.last_session_at, durationMinutes: s.duration_minutes, frequency: s.frequency, responsibilities: s.responsibilities, compensationReference: s.compensation_reference, regulatoryClearance: s.regulatory_clearance, regulatoryEvidenceReference: s.regulatory_evidence_reference ?? "", status: s.status, approvedAt: s.approved_at, standardsVersionId: s.standards_version_id, rights, readiness: s.status === "proposed" ? await readinessFor(s, rights) : [] }; }));
}

export async function listSchedules(): Promise<Schedule[]> {
  if (!INSTRUCTOR_FRAMEWORK_ENABLED) return [];
  const { data } = await createAdminClient().from("instructor_session_schedules").select(SCOLS).order("created_at", { ascending: false }).limit(100);
  return build((data ?? []) as SRow[]);
}

export async function proposeSchedule(p: { actorUserId: string; input: ScheduleInput }): Promise<{ ok: true; id: string } | Fail> {
  if (!INSTRUCTOR_FRAMEWORK_ENABLED) return OFF;
  if (!(await manager(p.actorUserId))) return NOT_AUTH;
  const v = validateScheduleInput(p.input); if (!v.ok) return v;
  const i = p.input; const admin = createAdminClient();
  const { data, error } = await admin.from("instructor_session_schedules").insert({ instructor_profile_id: i.instructorProfileId, agreement_id: i.agreementId, engagement_id: i.engagementId || null, workshop_id: i.workshopId || null, programme_name: i.programmeName.trim(), venue: i.venue.trim(), timezone: (i.timezone ?? "Africa/Accra").trim(), first_session_at: new Date(i.firstSessionAt).toISOString(), last_session_at: i.lastSessionAt ? new Date(i.lastSessionAt).toISOString() : null, duration_minutes: i.durationMinutes, frequency: i.frequency.trim(), responsibilities: i.responsibilities.trim(), compensation_reference: i.compensationReference.trim(), proposed_by: p.actorUserId }).select("id").single();
  if (error || !data) return { ok: false, error: "The schedule could not be saved (the agreement must be this instructor's own)." };
  const { error: mErr } = await admin.from("instructor_rights_matrix").insert({ schedule_id: data.id, updated_by: p.actorUserId });
  if (mErr) return { ok: false, error: "The rights matrix could not be created." };
  await logActivity({ actorUserId: p.actorUserId, action: "instructor_schedule.proposed", entityType: "instructor_session_schedule", entityId: data.id as string, metadata: { programme: i.programmeName.trim() } });
  return { ok: true, id: data.id as string };
}

export async function updateScheduleRightsAndClearance(p: { actorUserId: string; scheduleId: string; rights: RightsMatrix; regulatoryClearance: string; regulatoryEvidenceReference: string }): Promise<{ ok: true } | Fail> {
  if (!INSTRUCTOR_FRAMEWORK_ENABLED) return OFF;
  if (!(await manager(p.actorUserId))) return NOT_AUTH;
  if (!["pending", "not_required", "confirmed"].includes(p.regulatoryClearance)) return { ok: false, error: "Choose the regulatory clearance state." };
  const admin = createAdminClient(); const r = p.rights;
  const { data: sDone, error: sErr } = await admin.from("instructor_session_schedules").update({ regulatory_clearance: p.regulatoryClearance, regulatory_evidence_reference: p.regulatoryEvidenceReference.trim() || null }).eq("id", p.scheduleId).eq("status", "proposed").select("id");
  if (sErr || !sDone?.length) return { ok: false, error: "Only a proposed schedule can be changed." };
  const { error } = await admin.from("instructor_rights_matrix").update({ teaching_materials_use: r.teachingMaterialsUse, material_ownership: r.materialOwnership, photography: r.photography, recording: r.recording, participant_data_access: r.participantDataAccess, publication_promotion: r.publicationPromotion, sharing_reuse_restrictions: r.sharingReuseRestrictions.trim() || null, agreement_policy_references: r.agreementPolicyReferences.trim() || null, unresolved_decisions: r.unresolvedDecisions.trim() || null, updated_by: p.actorUserId }).eq("schedule_id", p.scheduleId);
  if (error) return { ok: false, error: "The rights matrix could not be saved (it is frozen once the schedule is approved)." };
  await logActivity({ actorUserId: p.actorUserId, action: "instructor_schedule.rights_updated", entityType: "instructor_session_schedule", entityId: p.scheduleId, metadata: { regulatoryClearance: p.regulatoryClearance, unresolvedFlagged: r.unresolvedDecisions.trim().length > 0 } });
  return { ok: true };
}

export async function approveSchedule(p: { actorUserId: string; scheduleId: string }): Promise<{ ok: true } | (Fail & { unmet?: string[] })> {
  if (!INSTRUCTOR_FRAMEWORK_ENABLED) return OFF;
  if (!(await isSuperAdminId(p.actorUserId))) return { ok: false, error: "Only a Super Admin can approve an assignment." };
  const admin = createAdminClient();
  const { data } = await admin.from("instructor_session_schedules").select(SCOLS).eq("id", p.scheduleId).maybeSingle();
  if (!data || (data as SRow).status !== "proposed") return { ok: false, error: "Only a proposed schedule can be approved." };
  const [s] = await build([data as SRow]);
  const unmet = s.readiness.filter((x) => !x.met).map((x) => x.detail ? `${x.label} (${x.detail})` : x.label);
  if (unmet.length) return { ok: false, error: "This assignment cannot be approved yet.", unmet };
  const { data: done, error } = await admin.from("instructor_session_schedules").update({ status: "approved", approved_by: p.actorUserId }).eq("id", p.scheduleId).eq("status", "proposed").select("id");
  if (error || !done?.length) return { ok: false, error: "The database refused the approval." };
  await logActivity({ actorUserId: p.actorUserId, action: "instructor_schedule.approved", entityType: "instructor_session_schedule", entityId: p.scheduleId, metadata: { programme: s.programmeName } });
  return { ok: true };
}

export async function closeSchedule(p: { actorUserId: string; scheduleId: string; to: "cancelled" | "completed"; note: string }): Promise<{ ok: true } | Fail> {
  if (!INSTRUCTOR_FRAMEWORK_ENABLED) return OFF;
  if (!(await manager(p.actorUserId))) return NOT_AUTH;
  if (p.note.trim().length < 5) return { ok: false, error: "Add a short note." };
  const { data: done, error } = await createAdminClient().from("instructor_session_schedules").update({ status: p.to, closed_by: p.actorUserId, close_note: p.note.trim() }).eq("id", p.scheduleId).in("status", p.to === "completed" ? ["approved"] : ["proposed", "approved"]).select("id");
  if (error || !done?.length) return { ok: false, error: "That change is not allowed for this schedule." };
  await logActivity({ actorUserId: p.actorUserId, action: `instructor_schedule.${p.to}`, entityType: "instructor_session_schedule", entityId: p.scheduleId, metadata: {} });
  return { ok: true };
}
