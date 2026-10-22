"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManageOnboarding } from "@/lib/organization/onboarding";
import { attestHistoricalApproval, registerControlledMaster, activateMasterVersion } from "@/lib/legal/masterRegistryActions";
import { confirmContractingEntity, selectAgreementSignatory } from "@/lib/organization/onboardingDecisions";
import { addEntitySignatory, addVaultDocument, findActiveProfileByMemberNumber } from "@/lib/organization/entityRegistrations";
import { ENTITY_DOCUMENT_TYPES } from "@/lib/organization/entityRegistry";
import { loadOnboardingDecisions } from "@/lib/organization/onboardingDecisions";
import { STEP7_UPLOAD_MAX_BYTES, STEP7_UPLOAD_MAX_LABEL } from "@/lib/organization/onboardingUploadLimit";
import { prepareInstructorAgreementDraft, resolveOnboardingLegalContext } from "@/lib/legal/instructorAgreements";
import { approveInstructorAgreementForIssue, issueInstructorAgreement, saveInstructorScheduleA } from "@/lib/legal/instructorAgreementIssuance";
import { SCHEDULE_A_FIELDS, type ScheduleATerms } from "@/lib/legal/instructorAgreementTerms";

// Embedded actions of the guided onboarding workspace. Each is a thin wrapper: it checks that the caller may manage onboarding, then calls
// the existing authoritative function, which independently re-checks its own authority (contract administration / Super Admin) and writes
// the audit record. Nothing here issues, signs or sends an agreement, sends an invitation or creates an engagement.

export type JourneyActionState = { ok: boolean; message?: string; error?: string; errors?: string[] } | null;
const f = (d: FormData, k: string) => String(d.get(k) ?? "").trim();

async function actor(onboardingId: string): Promise<{ id: string } | { error: string }> {
  const u = await getCurrentUser();
  if (!u) return { error: "Not authenticated." };
  if (!(await canManageOnboarding(u.id))) return { error: "Not authorized to manage onboarding." };
  if (!onboardingId) return { error: "Invalid request." };
  return { id: u.id };
}
const done = (onboardingId: string, message: string): JourneyActionState => { revalidatePath(`/admin/organization/onboarding/${onboardingId}`); return { ok: true, message }; };
const fail = (r: { error: string; errors?: string[] }): JourneyActionState => ({ ok: false, error: r.error, errors: r.errors });

export async function attestApprovalAction(_p: JourneyActionState, d: FormData): Promise<JourneyActionState> {
  const onboardingId = f(d, "onboardingId");
  const a = await actor(onboardingId);
  if ("error" in a) return { ok: false, error: a.error };
  const code = f(d, "documentCode");
  const r = await attestHistoricalApproval({
    versionId: f(d, "versionId"), actorUserId: a.id,
    input: { approvalDate: f(d, "approvalDate"), counselName: f(d, "counselName"), counselFirm: f(d, "counselFirm"), evidenceKind: f(d, "evidenceKind"), evidenceReference: f(d, "evidenceReference"), evidenceSha256: f(d, "evidenceSha256") || null, coversDocumentCodes: d.get("namesThisDocument") === "yes" && code ? [code] : [] },
  });
  return r.ok ? done(onboardingId, "Historical approval recorded with your identity and the current time.") : fail(r);
}

export async function registerMasterAction(_p: JourneyActionState, d: FormData): Promise<JourneyActionState> {
  const onboardingId = f(d, "onboardingId");
  const a = await actor(onboardingId);
  if ("error" in a) return { ok: false, error: a.error };
  const r = await registerControlledMaster({ versionId: f(d, "versionId"), actorUserId: a.id });
  return r.ok ? done(onboardingId, "The stored master was verified against its checksums and registered.") : fail(r);
}

export async function activateTemplateAction(_p: JourneyActionState, d: FormData): Promise<JourneyActionState> {
  const onboardingId = f(d, "onboardingId");
  const a = await actor(onboardingId);
  if ("error" in a) return { ok: false, error: a.error };
  if (d.get("confirmActivate") !== "yes") return { ok: false, error: "Tick the confirmation to activate: activation makes the template available for use." };
  const r = await activateMasterVersion({ versionId: f(d, "versionId"), effectiveDate: f(d, "effectiveDate"), backdatedReason: f(d, "backdatedReason") || null, actorUserId: a.id });
  return r.ok ? done(onboardingId, "Template activated at the current time.") : fail(r);
}

export async function confirmEntityAction(_p: JourneyActionState, d: FormData): Promise<JourneyActionState> {
  const onboardingId = f(d, "onboardingId");
  const a = await actor(onboardingId);
  if ("error" in a) return { ok: false, error: a.error };
  const ctx = await resolveOnboardingLegalContext(onboardingId);
  const r = await confirmContractingEntity({ onboardingId, entityId: f(d, "entityId"), expectedJurisdiction: ctx?.jurisdictionName ?? null, actorUserId: a.id });
  return r.ok ? done(onboardingId, "Contracting entity confirmed.") : fail(r);
}

// The entity must be THIS onboarding's contracting entity (confirmed, else the one recorded on the requisition) - evidence and signatories are
// recorded per entity and are never carried from one entity or jurisdiction to another.
async function entityForOnboarding(onboardingId: string, entityId: string): Promise<boolean> {
  const [ctx, decisions] = await Promise.all([resolveOnboardingLegalContext(onboardingId), loadOnboardingDecisions(onboardingId)]);
  const allowed = decisions.entityId ?? ctx?.recordedEntityId ?? null;
  return Boolean(entityId) && entityId === allowed;
}

export async function uploadEvidenceAction(_p: JourneyActionState, d: FormData): Promise<JourneyActionState> {
  const onboardingId = f(d, "onboardingId");
  const a = await actor(onboardingId);
  if ("error" in a) return { ok: false, error: a.error };
  const entityId = f(d, "entityId");
  if (!(await entityForOnboarding(onboardingId, entityId))) return { ok: false, error: "Evidence can only be added to this onboarding's contracting entity." };
  const documentType = f(d, "documentType");
  if (!ENTITY_DOCUMENT_TYPES.some((t) => t.value === documentType)) return { ok: false, error: "Choose what kind of document this is." };
  const notes = f(d, "notes");
  if (notes.length < 10) return { ok: false, error: "Describe what the document is and what it shows (at least a short sentence)." };
  const file = d.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose the file to upload." };
  if (file.size > STEP7_UPLOAD_MAX_BYTES) return { ok: false, error: `This file is too large for this form (the limit here is ${STEP7_UPLOAD_MAX_LABEL}). Compress it or save it as a smaller PDF, and nothing has been stored.` };
  const r = await addVaultDocument({ entityId, documentType, filename: file.name, mimeType: file.type, bytes: new Uint8Array(await file.arrayBuffer()), notes, issuedOn: f(d, "issuedOn") || null, issuingAuthority: f(d, "issuingAuthority") || null, replaces: f(d, "replaces") || null, actorUserId: a.id });
  return r.ok ? done(onboardingId, r.duplicateOf ? "This exact file was already in the vault; it was recorded as a duplicate of the original." : "Stored in the entity's document vault with its fingerprint.") : fail(r);
}

export async function addSignatoryAction(_p: JourneyActionState, d: FormData): Promise<JourneyActionState> {
  const onboardingId = f(d, "onboardingId");
  const a = await actor(onboardingId);
  if ("error" in a) return { ok: false, error: a.error };
  const entityId = f(d, "entityId");
  if (!(await entityForOnboarding(onboardingId, entityId))) return { ok: false, error: "A signatory can only be recorded for this onboarding's contracting entity." };
  if (d.get("documentShowsAuthority") !== "yes") return { ok: false, error: "Tick the confirmation that the selected document itself shows this person's name, position and authority. If it does not, upload the document that does." };
  let profileId: string | null = null;
  const member = f(d, "accountMemberNumber");
  if (member) {
    const found = await findActiveProfileByMemberNumber(member, a.id);
    if (!found.ok) return { ok: false, error: found.error };
    profileId = found.profileId;
  }
  const r = await addEntitySignatory({
    entityId, fullName: f(d, "fullName"), position: f(d, "position"), authority: f(d, "authority"), sourceDocumentId: f(d, "sourceDocumentId"),
    profileId, effectiveFrom: f(d, "effectiveFrom") || null, actorUserId: a.id,
  });
  return r.ok ? done(onboardingId, profileId ? "Signatory recorded with its supporting document and linked to the Ordift account." : "Signatory recorded with its supporting document. Link an Ordift account before issuing, so a secure signing link can be delivered.") : fail(r);
}

export async function selectSignatoryAction(_p: JourneyActionState, d: FormData): Promise<JourneyActionState> {
  const onboardingId = f(d, "onboardingId");
  const a = await actor(onboardingId);
  if ("error" in a) return { ok: false, error: a.error };
  const r = await selectAgreementSignatory({ onboardingId, entityId: f(d, "entityId"), signatoryId: f(d, "signatoryId"), actorUserId: a.id });
  return r.ok ? done(onboardingId, "Signatory selected.") : fail(r);
}

export async function prepareAgreementAction(_p: JourneyActionState, d: FormData): Promise<JourneyActionState> {
  const onboardingId = f(d, "onboardingId");
  const a = await actor(onboardingId);
  if ("error" in a) return { ok: false, error: a.error };
  const r = await prepareInstructorAgreementDraft({ onboardingId, actorUserId: a.id });
  return r.ok ? done(onboardingId, `Draft ${r.agreementReference} prepared. Nothing has been issued or sent.`) : fail({ error: r.error, errors: r.unresolved });
}

export async function saveScheduleAAction(_p: JourneyActionState, d: FormData): Promise<JourneyActionState> {
  const onboardingId = f(d, "onboardingId");
  const a = await actor(onboardingId);
  if ("error" in a) return { ok: false, error: a.error };
  const terms: Partial<ScheduleATerms> = {};
  for (const field of SCHEDULE_A_FIELDS) terms[field.key] = f(d, field.key);
  const r = await saveInstructorScheduleA({ onboardingId, agreementId: f(d, "agreementId"), terms, actorUserId: a.id });
  return r.ok ? done(onboardingId, "Agreement terms saved. Review the preview below.") : fail(r);
}

export async function approveForIssueAction(_p: JourneyActionState, d: FormData): Promise<JourneyActionState> {
  const onboardingId = f(d, "onboardingId");
  const a = await actor(onboardingId);
  if ("error" in a) return { ok: false, error: a.error };
  if (d.get("confirmPreview") !== "yes") return { ok: false, error: "Tick the confirmation that you have reviewed the full preview." };
  const r = await approveInstructorAgreementForIssue({ onboardingId, agreementId: f(d, "agreementId"), actorUserId: a.id });
  return r.ok ? done(onboardingId, "Approved for issue. Nothing has been sent yet.") : fail(r);
}

export async function issueAgreementAction(_p: JourneyActionState, d: FormData): Promise<JourneyActionState> {
  const onboardingId = f(d, "onboardingId");
  const a = await actor(onboardingId);
  if ("error" in a) return { ok: false, error: a.error };
  if (d.get("confirmIssue") !== "yes") return { ok: false, error: "Tick the confirmation to issue: secure signing links will be emailed to both signatories." };
  const r = await issueInstructorAgreement({ onboardingId, agreementId: f(d, "agreementId"), actorUserId: a.id });
  return r.ok ? done(onboardingId, "Issued. Secure signing links were sent to both signatories.") : fail({ error: `${r.error} (step: ${r.step.replace(/_/g, " ")}). Nothing is marked executed; you can retry.` });
}
