import { createAdminClient } from "@/lib/supabase/admin";
import { recordAuditEvent } from "@/lib/legal/strictAudit";
import { authorizeWithSuperAdminOverride, GOVERNANCE_CAPABILITIES } from "@/lib/organization/authority";

// Two audited decisions the Founder makes inside an onboarding, stored in the existing audit log keyed to the onboarding record (no new
// table): which verified legal entity contracts with this person, and which of that entity's recorded signatories signs. Latest event
// wins; earlier ones remain as history. Neither decision creates, issues or signs anything.

export const CONFIRMED_ENTITY_ACTION = "onboarding.contracting_entity_confirmed";
export const SELECTED_SIGNATORY_ACTION = "onboarding.signatory_selected";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function requireAuthority(actorUserId: string) {
  const auth = await authorizeWithSuperAdminOverride(actorUserId, GOVERNANCE_CAPABILITIES.contractAdminister);
  return auth.ok;
}

export async function loadOnboardingDecisions(onboardingId: string): Promise<{ entityId: string | null; signatoryId: string | null }> {
  const admin = createAdminClient();
  const latest = async (action: string, key: string): Promise<string | null> => {
    const { data } = await admin.from("activity_log").select("metadata").eq("action", action).eq("entity_id", onboardingId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const v = (data?.metadata as Record<string, unknown> | null)?.[key];
    return typeof v === "string" ? v : null;
  };
  return { entityId: await latest(CONFIRMED_ENTITY_ACTION, "entityId"), signatoryId: await latest(SELECTED_SIGNATORY_ACTION, "signatoryId") };
}

export async function confirmContractingEntity(p: { onboardingId: string; entityId: string; expectedJurisdiction: string | null; actorUserId: string }): Promise<Result> {
  if (!(await requireAuthority(p.actorUserId))) return { ok: false, error: "Not authorized to confirm a contracting entity." };
  const admin = createAdminClient();
  const { data: ob } = await admin.from("staff_onboarding").select("id, profile_id").eq("id", p.onboardingId).maybeSingle();
  if (!ob) return { ok: false, error: "Onboarding record not found." };
  const { data: e } = await admin.from("employing_entities").select("id, name, active, verification_status, jurisdiction_id").eq("id", p.entityId).maybeSingle();
  if (!e || !e.active) return { ok: false, error: "That entity is not active." };
  if (e.verification_status !== "verified") return { ok: false, error: "Only a verified entity can be the contracting party." };
  if (p.expectedJurisdiction) {
    const { data: j } = await admin.from("employment_jurisdictions").select("name").eq("id", e.jurisdiction_id as string).maybeSingle();
    if (j?.name !== p.expectedJurisdiction) return { ok: false, error: `This onboarding is for ${p.expectedJurisdiction}; ${e.name} is registered in ${j?.name ?? "another jurisdiction"}.` };
  }
  const written = await recordAuditEvent({ actorUserId: p.actorUserId, action: CONFIRMED_ENTITY_ACTION, entityType: "staff_onboarding", entityId: p.onboardingId, metadata: { entityId: p.entityId, entityName: e.name, profileId: ob.profile_id } });
  return written.ok ? { ok: true } : { ok: false, error: "The confirmation could not be recorded, so nothing was saved. Try again." };
}

export async function selectAgreementSignatory(p: { onboardingId: string; entityId: string; signatoryId: string; actorUserId: string }): Promise<Result> {
  if (!(await requireAuthority(p.actorUserId))) return { ok: false, error: "Not authorized to select a signatory." };
  const { data: s } = await createAdminClient().from("entity_signatories").select("id, full_name, employing_entity_id, effective_to, source_document_id").eq("id", p.signatoryId).maybeSingle();
  if (!s || s.employing_entity_id !== p.entityId || s.effective_to) return { ok: false, error: "That person is not a current signatory of the confirmed entity." };
  const written = await recordAuditEvent({ actorUserId: p.actorUserId, action: SELECTED_SIGNATORY_ACTION, entityType: "staff_onboarding", entityId: p.onboardingId, metadata: { signatoryId: p.signatoryId, entityId: p.entityId, signatoryName: s.full_name, hasSourceDocument: Boolean(s.source_document_id) } });
  return written.ok ? { ok: true } : { ok: false, error: "The selection could not be recorded, so nothing was saved. Try again." };
}
