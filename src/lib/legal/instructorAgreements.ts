import { createAdminClient } from "@/lib/supabase/admin";
import { createDraftAgreement, addAgreementParty, attachAgreementSnapshot } from "./agreementEngine";
import { isTerminalAgreementStatus, type AgreementLifecycleStatus } from "./agreementLifecycle";
import { loadAgreementReadiness } from "./agreementReadinessData";
import { getEngagementTypeSlug } from "@/lib/organization/engagementTypeLookup";
import type { AgreementReadiness } from "./agreementReadiness";

// OS-LGL-010 Instructor / Workshop Facilitator Agreement - PREPARATION ONLY. Creates a DRAFT agreement (never issues, sends or signs) from
// facts already verified in the platform, through the existing generic agreement engine. It refuses unless every legal prerequisite is
// verified, and it never invents a value: anything with no verified source is simply absent from the frozen snapshot.
// Document composition, issuance and signature for this agreement type are separate steps (see the workspace) and are not performed here.

export const OS_LGL_010 = "OS-LGL-010";
export const INSTRUCTOR_CONTEXT_TYPE = "instructor_profile";

export type InstructorAgreementSummary = { id: string; agreementReference: string; status: AgreementLifecycleStatus; createdAt: string; evidenceClassification: string | null };

export async function getCurrentInstructorAgreement(profileId: string): Promise<InstructorAgreementSummary | null> {
  const admin = createAdminClient();
  const { data: master } = await admin.from("legal_document_masters").select("id").eq("canonical_code", OS_LGL_010).maybeSingle();
  if (!master) return null;
  const { data } = await admin
    .from("agreements").select("id, agreement_reference, status, created_at, evidence_classification")
    .eq("master_id", master.id).eq("primary_context_type", INSTRUCTOR_CONTEXT_TYPE).eq("primary_context_reference", profileId).order("created_at", { ascending: false });
  const current = (data ?? []).find((a) => !isTerminalAgreementStatus(a.status as AgreementLifecycleStatus));
  return current ? { id: current.id as string, agreementReference: current.agreement_reference as string, status: current.status as AgreementLifecycleStatus, createdAt: current.created_at as string, evidenceClassification: (current.evidence_classification as string | null) ?? null } : null;
}

// The jurisdiction and candidate entity come from the Founder-approved requisition linked to the onboarding.
export async function resolveOnboardingLegalContext(onboardingId: string): Promise<{ profileId: string; jurisdictionName: string | null; recordedEntityId: string | null; engagementTypeSlug: string | null } | null> {
  const admin = createAdminClient();
  const { data: ob } = await admin.from("staff_onboarding").select("profile_id, requisition_id").eq("id", onboardingId).maybeSingle();
  if (!ob) return null;
  let jurisdictionName: string | null = null;
  let recordedEntityId: string | null = null;
  if (ob.requisition_id) {
    const { data: r } = await admin.from("recruitment_requisitions").select("employment_jurisdiction_id, employing_entity_id").eq("id", ob.requisition_id as string).maybeSingle();
    recordedEntityId = (r?.employing_entity_id as string | null) ?? null;
    if (r?.employment_jurisdiction_id) {
      const { data: j } = await admin.from("employment_jurisdictions").select("name").eq("id", r.employment_jurisdiction_id as string).maybeSingle();
      jurisdictionName = (j?.name as string | null) ?? null;
    }
  }
  const engagementTypeSlug = await getEngagementTypeSlug(ob.profile_id as string);
  return { profileId: ob.profile_id as string, jurisdictionName, recordedEntityId, engagementTypeSlug };
}

export type PrepareResult = { ok: true; agreementId: string; agreementReference: string } | { ok: false; error: string; unresolved?: string[] };

export async function prepareInstructorAgreementDraft(params: {
  onboardingId: string;
  actorUserId: string;
  // injected for tests
  readiness?: (ctx: NonNullable<Awaited<ReturnType<typeof resolveOnboardingLegalContext>>>) => Promise<AgreementReadiness | null>;
}): Promise<PrepareResult> {
  const ctx = await resolveOnboardingLegalContext(params.onboardingId);
  if (!ctx) return { ok: false, error: "Onboarding record not found." };
  if (ctx.engagementTypeSlug !== "instructor") return { ok: false, error: "This person is not classified as an instructor; the Instructor Agreement does not apply." };

  const readiness = await (params.readiness ?? ((c) => loadAgreementReadiness({ onboardingId: params.onboardingId, canonicalCode: OS_LGL_010, jurisdictionName: c.jurisdictionName, jurisdictionSource: c.jurisdictionName ? "the Founder-approved requisition" : null, recordedEntityId: c.recordedEntityId })))(ctx);
  if (!readiness) return { ok: false, error: "The OS-LGL-010 legal master is not available." };
  if (!readiness.canIssue) return { ok: false, error: "The legal prerequisites are not all verified, so no draft was created.", unresolved: readiness.unresolved.map((c) => c.label) };

  const existing = await getCurrentInstructorAgreement(ctx.profileId);
  if (existing) return { ok: false, error: `This person already has a current Instructor Agreement (${existing.agreementReference}, status “${existing.status}”).` };

  const admin = createAdminClient();
  const { data: master } = await admin.from("legal_document_masters").select("id, current_version_id").eq("canonical_code", OS_LGL_010).maybeSingle();
  if (!master?.current_version_id) return { ok: false, error: "The OS-LGL-010 legal master is not available." };
  const { data: version } = await admin.from("legal_document_versions").select("id, content_reference, document_hash, effective_date, approved_at").eq("id", master.current_version_id as string).maybeSingle();

  const { data: decisionRows } = await admin.from("activity_log").select("action, metadata").in("action", ["onboarding.contracting_entity_confirmed", "onboarding.signatory_selected"]).eq("entity_id", params.onboardingId).order("created_at", { ascending: false });
  const entityId = (decisionRows ?? []).find((r) => r.action === "onboarding.contracting_entity_confirmed")?.metadata as { entityId?: string } | undefined;
  const signatoryPick = (decisionRows ?? []).find((r) => r.action === "onboarding.signatory_selected")?.metadata as { signatoryId?: string } | undefined;
  const useEntityId = entityId?.entityId ?? ctx.recordedEntityId;
  const { data: entity } = useEntityId ? await admin.from("employing_entities").select("id, name, legal_name, registration_type, registration_date").eq("id", useEntityId).maybeSingle() : { data: null };
  const { data: sigRows } = useEntityId ? await admin.from("entity_signatories").select("id, full_name, position, authority, source_document_id, profile_id").eq("employing_entity_id", useEntityId).is("effective_to", null) : { data: [] };
  const signatory = (sigRows ?? []).find((s) => s.id === signatoryPick?.signatoryId) ?? ((sigRows ?? []).length === 1 ? (sigRows ?? [])[0] : null);
  if (!entity || !signatory) return { ok: false, error: "The contracting entity or signatory could not be resolved." };

  const [{ data: profile }, authUser] = await Promise.all([admin.from("profiles").select("full_name, member_number").eq("id", ctx.profileId).maybeSingle(), admin.auth.admin.getUserById(ctx.profileId)]);

  const draft = await createDraftAgreement({
    masterId: master.id as string, masterVersionId: master.current_version_id as string, classification: "transaction_agreement", engagementJurisdiction: ctx.jurisdictionName,
    primaryContextType: INSTRUCTOR_CONTEXT_TYPE, primaryContextReference: ctx.profileId, actorUserId: params.actorUserId,
  });
  if (!draft.ok) return draft;

  await addAgreementParty({ agreementId: draft.agreementId, partyRole: "instructor", profileId: ctx.profileId, actorUserId: params.actorUserId });
  await addAgreementParty({ agreementId: draft.agreementId, partyRole: "ordift", profileId: (signatory.profile_id as string | null) ?? null, externalName: (entity.legal_name as string | null) ?? (entity.name as string), actorUserId: params.actorUserId });
  await attachAgreementSnapshot({
    agreementId: draft.agreementId, sourceReference: `staff_onboarding:${params.onboardingId}`, actorUserId: params.actorUserId,
    snapshotData: {
      agreementReference: draft.agreementReference,
      jurisdiction: ctx.jurisdictionName,
      instructor: { profileId: ctx.profileId, legalName: profile?.full_name ?? null, memberNumber: profile?.member_number ?? null, email: authUser.data.user?.email ?? null },
      contractingEntity: { id: entity.id, name: entity.name, legalName: entity.legal_name, registrationType: entity.registration_type, registrationDate: entity.registration_date },
      signatory: { id: signatory.id, name: signatory.full_name, position: signatory.position, authority: signatory.authority, sourceDocumentId: signatory.source_document_id },
      template: { versionId: master.current_version_id, contentReference: version?.content_reference ?? null, documentHash: version?.document_hash ?? null, templateEffectiveDate: version?.effective_date ?? null, templateApprovedAt: version?.approved_at ?? null },
      note: "Session / fee Schedules are completed per workshop assignment. The agreement's own effective and execution dates are set at signature and are independent of the template's dates.",
    },
  });
  return draft;
}
