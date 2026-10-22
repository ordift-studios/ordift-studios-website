"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManageOnboarding } from "@/lib/organization/onboarding";
import { attestHistoricalApproval, registerControlledMaster, activateMasterVersion } from "@/lib/legal/masterRegistryActions";
import { confirmContractingEntity, selectAgreementSignatory } from "@/lib/organization/onboardingDecisions";
import { addEntitySignatory } from "@/lib/organization/entityRegistrations";
import { prepareInstructorAgreementDraft, resolveOnboardingLegalContext } from "@/lib/legal/instructorAgreements";

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

export async function addSignatoryAction(_p: JourneyActionState, d: FormData): Promise<JourneyActionState> {
  const onboardingId = f(d, "onboardingId");
  const a = await actor(onboardingId);
  if ("error" in a) return { ok: false, error: a.error };
  const r = await addEntitySignatory({
    entityId: f(d, "entityId"), fullName: f(d, "fullName"), position: f(d, "position"), authority: f(d, "authority"), sourceDocumentId: f(d, "sourceDocumentId"),
    profileId: d.get("linkFounder") === "yes" ? f(d, "founderProfileId") || null : null, effectiveFrom: f(d, "effectiveFrom") || null, actorUserId: a.id,
  });
  return r.ok ? done(onboardingId, "Signatory recorded with its supporting document.") : fail(r);
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
