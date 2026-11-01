import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId } from "@/lib/organization/authority";
import { getEngagementTypeSlug } from "@/lib/organization/engagementTypeLookup";
import { adoptionBlockers, ACKNOWLEDGEMENT_CONSENT, type StandardsContacts } from "./rules";
import { INSTRUCTOR_FRAMEWORK_ENABLED } from "./featureGate";

// INDEPENDENT INSTRUCTOR STANDARDS (migration 0180). Management (Super Admin) drafts, adopts and retires versions; an independent instructor acknowledges the CURRENTLY ADOPTED version in
// their own portal. The database refuses adoption with unresolved placeholders or missing contacts, and refuses an acknowledgement of anything but the adopted version and its exact hash.
// Employee HR policies (policy_acknowledgements) are NOT used here and are never presented to instructors.
type Fail = { ok: false; error: string };
const OFF: Fail = { ok: false, error: "The instructor standards framework is not enabled yet." };
const DENIED: Fail = { ok: false, error: "Only a Super Admin can manage the instructor standards." };

export type StandardsVersion = { id: string; versionLabel: string; title: string; bodyText: string; bodySha256: string; status: "draft" | "adopted" | "retired"; designatedContact: string; safeguardingContact: string; escalationContact: string; emergencyInstructions: string; createdAt: string; adoptedAt: string | null; retiredAt: string | null; acknowledgements: number };
const COLS = "id, version_label, title, body_text, body_sha256, status, designated_contact, safeguarding_contact, escalation_contact, emergency_instructions, created_at, adopted_at, retired_at";
type Row = { id: string; version_label: string; title: string; body_text: string; body_sha256: string; status: string; designated_contact: string | null; safeguarding_contact: string | null; escalation_contact: string | null; emergency_instructions: string | null; created_at: string; adopted_at: string | null; retired_at: string | null };
const map = (r: Row, acks = 0): StandardsVersion => ({ id: r.id, versionLabel: r.version_label, title: r.title, bodyText: r.body_text, bodySha256: r.body_sha256, status: r.status as StandardsVersion["status"], designatedContact: r.designated_contact ?? "", safeguardingContact: r.safeguarding_contact ?? "", escalationContact: r.escalation_contact ?? "", emergencyInstructions: r.emergency_instructions ?? "", createdAt: r.created_at, adoptedAt: r.adopted_at, retiredAt: r.retired_at, acknowledgements: acks });

// The adopted version, null when there is none, undefined when it cannot be read (callers fail CLOSED).
export async function getAdoptedStandards(): Promise<StandardsVersion | null | undefined> {
  if (!INSTRUCTOR_FRAMEWORK_ENABLED) return undefined;
  const { data, error } = await createAdminClient().from("instructor_standards_versions").select(COLS).eq("applies_to", "independent_instructor").eq("status", "adopted").maybeSingle();
  if (error) return undefined;
  return data ? map(data as Row) : null;
}

export async function listStandardsVersions(): Promise<StandardsVersion[]> {
  if (!INSTRUCTOR_FRAMEWORK_ENABLED) return [];
  const admin = createAdminClient();
  const { data } = await admin.from("instructor_standards_versions").select(COLS).order("created_at", { ascending: false });
  const { data: acks } = await admin.from("instructor_standards_acknowledgements").select("version_id");
  const count = new Map<string, number>(); for (const a of acks ?? []) count.set(a.version_id as string, (count.get(a.version_id as string) ?? 0) + 1);
  return (data ?? []).map((r) => map(r as Row, count.get((r as Row).id) ?? 0));
}

export async function createStandardsDraft(p: { actorUserId: string; versionLabel: string; title: string; bodyText: string; contacts: StandardsContacts }): Promise<{ ok: true; id: string } | Fail> {
  if (!INSTRUCTOR_FRAMEWORK_ENABLED) return OFF;
  if (!(await isSuperAdminId(p.actorUserId))) return DENIED;
  if (p.versionLabel.trim().length < 1 || p.title.trim().length < 3 || p.bodyText.trim().length < 200) return { ok: false, error: "Enter a version label, a title and the full standards text." };
  const { data, error } = await createAdminClient().from("instructor_standards_versions").insert({ version_label: p.versionLabel.trim(), title: p.title.trim(), body_text: p.bodyText, designated_contact: p.contacts.designatedContact.trim() || null, safeguarding_contact: p.contacts.safeguardingContact.trim() || null, escalation_contact: p.contacts.escalationContact.trim() || null, emergency_instructions: p.contacts.emergencyInstructions.trim() || null, created_by: p.actorUserId }).select("id").single();
  if (error || !data) return { ok: false, error: "The draft could not be saved (is that version label already used?)." };
  await logActivity({ actorUserId: p.actorUserId, action: "instructor_standards.draft_created", entityType: "instructor_standards_version", entityId: data.id as string, metadata: { versionLabel: p.versionLabel.trim() } });
  return { ok: true, id: data.id as string };
}

export async function updateStandardsDraft(p: { actorUserId: string; versionId: string; title: string; bodyText: string; contacts: StandardsContacts }): Promise<{ ok: true } | Fail> {
  if (!INSTRUCTOR_FRAMEWORK_ENABLED) return OFF;
  if (!(await isSuperAdminId(p.actorUserId))) return DENIED;
  const { data: updated, error } = await createAdminClient().from("instructor_standards_versions").update({ title: p.title.trim(), body_text: p.bodyText, designated_contact: p.contacts.designatedContact.trim() || null, safeguarding_contact: p.contacts.safeguardingContact.trim() || null, escalation_contact: p.contacts.escalationContact.trim() || null, emergency_instructions: p.contacts.emergencyInstructions.trim() || null }).eq("id", p.versionId).eq("status", "draft").select("id");
  if (error || !updated?.length) return { ok: false, error: "Only a draft can be edited, and it must be valid." };
  await logActivity({ actorUserId: p.actorUserId, action: "instructor_standards.draft_updated", entityType: "instructor_standards_version", entityId: p.versionId, metadata: {} });
  return { ok: true };
}

export async function adoptStandards(p: { actorUserId: string; versionId: string; note: string }): Promise<{ ok: true; sha256: string } | (Fail & { blockers?: string[] })> {
  if (!INSTRUCTOR_FRAMEWORK_ENABLED) return OFF;
  if (!(await isSuperAdminId(p.actorUserId))) return DENIED;
  const admin = createAdminClient();
  const { data: v } = await admin.from("instructor_standards_versions").select(COLS).eq("id", p.versionId).maybeSingle();
  if (!v || (v as Row).status !== "draft") return { ok: false, error: "Only a draft can be adopted." };
  const r = v as Row;
  const blockers = adoptionBlockers(r.body_text, { designatedContact: r.designated_contact ?? "", safeguardingContact: r.safeguarding_contact ?? "", escalationContact: r.escalation_contact ?? "", emergencyInstructions: r.emergency_instructions ?? "" });
  if (blockers.length) return { ok: false, error: "The standards cannot be adopted yet.", blockers };
  if (p.note.trim().length < 5) return { ok: false, error: "Record a short adoption note (who approved this and on what basis)." };
  const { data: current } = await admin.from("instructor_standards_versions").select("id, version_label").eq("applies_to", "independent_instructor").eq("status", "adopted").maybeSingle();
  if (current) return { ok: false, error: `Version ${(current as { version_label: string }).version_label} is currently adopted. Retire it first; instructors then acknowledge the new version.` };
  const { data: done, error } = await admin.from("instructor_standards_versions").update({ status: "adopted", adopted_by: p.actorUserId, adoption_note: p.note.trim() }).eq("id", p.versionId).eq("status", "draft").select("body_sha256").single();
  if (error || !done) return { ok: false, error: "The database refused the adoption." };
  await logActivity({ actorUserId: p.actorUserId, action: "instructor_standards.adopted", entityType: "instructor_standards_version", entityId: p.versionId, metadata: { versionLabel: r.version_label, sha256: (done as { body_sha256: string }).body_sha256 } });
  return { ok: true, sha256: (done as { body_sha256: string }).body_sha256 };
}

export async function retireStandards(p: { actorUserId: string; versionId: string }): Promise<{ ok: true } | Fail> {
  if (!INSTRUCTOR_FRAMEWORK_ENABLED) return OFF;
  if (!(await isSuperAdminId(p.actorUserId))) return DENIED;
  const { data: done, error } = await createAdminClient().from("instructor_standards_versions").update({ status: "retired", retired_by: p.actorUserId }).eq("id", p.versionId).eq("status", "adopted").select("id");
  if (error || !done?.length) return { ok: false, error: "Only an adopted version can be retired." };
  await logActivity({ actorUserId: p.actorUserId, action: "instructor_standards.retired", entityType: "instructor_standards_version", entityId: p.versionId, metadata: {} });
  return { ok: true };
}

// ---- the instructor's own acknowledgement (the signed-in person, for themself only)
export type AcknowledgementState =
  | { state: "not_available" }                                                                            // framework off, nothing adopted, or not an independent instructor
  | { state: "pending"; version: StandardsVersion }
  | { state: "acknowledged"; version: StandardsVersion; acknowledgedAt: string; sha256: string };
export async function loadStandardsStateFor(profileId: string): Promise<AcknowledgementState> {
  if (!INSTRUCTOR_FRAMEWORK_ENABLED) return { state: "not_available" };
  if ((await getEngagementTypeSlug(profileId)) !== "instructor") return { state: "not_available" };
  const v = await getAdoptedStandards();
  if (!v) return { state: "not_available" };
  const { data } = await createAdminClient().from("instructor_standards_acknowledgements").select("acknowledged_at, document_sha256").eq("profile_id", profileId).eq("version_id", v.id).maybeSingle();
  return data ? { state: "acknowledged", version: v, acknowledgedAt: data.acknowledged_at as string, sha256: data.document_sha256 as string } : { state: "pending", version: v };
}

export async function acknowledgeStandards(p: { profileId: string; versionId: string; presentedSha256: string; typedFullName: string; consent: boolean; ipAddress: string | null; userAgent: string | null }): Promise<{ ok: true; sha256: string } | Fail> {
  if (!INSTRUCTOR_FRAMEWORK_ENABLED) return OFF;
  if ((await getEngagementTypeSlug(p.profileId)) !== "instructor") return { ok: false, error: "These standards apply to independent instructors." };
  if (!p.consent) return { ok: false, error: "Tick the box to confirm you have read and agree." };
  if (p.typedFullName.trim().length < 3) return { ok: false, error: "Type your full name to acknowledge." };
  const v = await getAdoptedStandards();
  if (!v) return { ok: false, error: "There are no adopted standards to acknowledge." };
  if (v.id !== p.versionId || v.bodySha256 !== p.presentedSha256) return { ok: false, error: "These standards have changed since you opened the page. Reload to read the current version." };
  const { error } = await createAdminClient().from("instructor_standards_acknowledgements").insert({ profile_id: p.profileId, version_id: v.id, document_sha256: v.bodySha256, typed_full_name: p.typedFullName.trim(), consent_statement: ACKNOWLEDGEMENT_CONSENT, ip_address: p.ipAddress, user_agent: p.userAgent });
  if (error) return { ok: false, error: error.code === "23505" ? "You have already acknowledged this version." : "The acknowledgement could not be saved." };
  await logActivity({ actorUserId: p.profileId, action: "instructor_standards.acknowledged", entityType: "instructor_standards_version", entityId: v.id, metadata: { versionLabel: v.versionLabel, sha256: v.bodySha256 } });
  return { ok: true, sha256: v.bodySha256 };
}

// Assignment gate input: null when the person may proceed, otherwise the reason. Fails CLOSED on any read problem. Only called while the framework is enabled.
export async function instructorStandardsRefusal(profileId: string): Promise<string | null> {
  const v = await getAdoptedStandards();
  if (v === undefined) return "The instructor standards could not be checked, so this instructor cannot be assigned right now.";
  if (v === null) return "This instructor cannot be assigned yet: the Independent Instructor Standards have not been adopted by management.";
  const { data, error } = await createAdminClient().from("instructor_standards_acknowledgements").select("id").eq("profile_id", profileId).eq("version_id", v.id).eq("document_sha256", v.bodySha256).maybeSingle();
  if (error) return "The instructor's standards acknowledgement could not be checked, so they cannot be assigned right now.";
  return data ? null : `This instructor cannot be assigned yet: they have not acknowledged the current Independent Instructor Standards (version ${v.versionLabel}).`;
}
