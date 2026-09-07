import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeWithSuperAdminOverride, isSuperAdminId, STRATEGY_CAPABILITIES } from "@/lib/organization/authority";
import { logActivity } from "@/lib/admin/activityLog";

// Ordift Partnerships & Collaborations V1 (2026-09-07) — the
// opportunity/case layer. Authorization: STRATEGY_CAPABILITIES.
// partnershipOpportunityAdminister for ordinary CRUD/lifecycle moves;
// concession APPROVAL specifically routes through
// resolveConcessionApprovalRequirement() (valueEconomics.ts) — see
// approveConcession() in valueAssessments.ts, not here.

export type PartnershipOpportunityStatus = "opportunity" | "qualification" | "value_assessment" | "proposed_terms" | "internal_review" | "decision" | "agreement" | "signatures" | "active" | "deliverables" | "completion" | "outcome_review";
export type PartnershipDecisionOutcome = "commercially_acceptable" | "strategic_exception" | "convert_to_paid_proposal" | "declined";

export type PartnershipType = { id: string; key: string; label: string; sortOrder: number };

export type PartnershipOpportunity = {
  id: string;
  partnershipTypeId: string;
  status: PartnershipOpportunityStatus;
  decisionOutcome: PartnershipDecisionOutcome | null;
  counterpartName: string;
  counterpartOrganisation: string | null;
  counterpartContactEmail: string | null;
  counterpartContactPhone: string | null;
  marketSlug: string | null;
  referenceType: string | null;
  referenceId: string | null;
  summary: string | null;
  notes: string | null;
  // Referral Payable Bridge (2026-09-07) — optional link to an
  // existing payee profile for this opportunity's counterpart, used
  // only by approveReferralCommissionForPayment() (referralCommissions.ts)
  // to confirm a real payment destination exists before a referral
  // commission may be submitted to Payables. Never auto-created here.
  payeeProfileId: string | null;
  createdAt: string;
  updatedAt: string;
};

async function authorize(actorUserId: string) {
  return authorizeWithSuperAdminOverride(actorUserId, STRATEGY_CAPABILITIES.partnershipOpportunityAdminister);
}

export async function listPartnershipTypes(): Promise<PartnershipType[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("partnership_types").select("id, key, label, sort_order").eq("active", true).order("sort_order");
  if (error) {
    console.error("[partnerships] failed to load partnership types", error.message);
    return [];
  }
  return (data ?? []).map((t) => ({ id: t.id, key: t.key, label: t.label, sortOrder: t.sort_order }));
}

function mapOpportunityRow(o: {
  id: string;
  partnership_type_id: string;
  status: string;
  decision_outcome: string | null;
  counterpart_name: string;
  counterpart_organisation: string | null;
  counterpart_contact_email: string | null;
  counterpart_contact_phone: string | null;
  pricing_markets: { slug: string } | null;
  reference_type: string | null;
  reference_id: string | null;
  summary: string | null;
  notes: string | null;
  payee_profile_id: string | null;
  created_at: string;
  updated_at: string;
}): PartnershipOpportunity {
  return {
    id: o.id,
    partnershipTypeId: o.partnership_type_id,
    status: o.status as PartnershipOpportunityStatus,
    decisionOutcome: o.decision_outcome as PartnershipDecisionOutcome | null,
    counterpartName: o.counterpart_name,
    counterpartOrganisation: o.counterpart_organisation,
    counterpartContactEmail: o.counterpart_contact_email,
    counterpartContactPhone: o.counterpart_contact_phone,
    marketSlug: (o.pricing_markets as unknown as { slug: string } | null)?.slug ?? null,
    referenceType: o.reference_type,
    referenceId: o.reference_id,
    summary: o.summary,
    notes: o.notes,
    payeeProfileId: o.payee_profile_id,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
  };
}

const OPPORTUNITY_SELECT = "id, partnership_type_id, status, decision_outcome, counterpart_name, counterpart_organisation, counterpart_contact_email, counterpart_contact_phone, pricing_markets(slug), reference_type, reference_id, summary, notes, payee_profile_id, created_at, updated_at";

export async function listOpportunitiesForAdmin(actorUserId: string, filters?: { status?: PartnershipOpportunityStatus }): Promise<PartnershipOpportunity[]> {
  const auth = await authorize(actorUserId);
  if (!auth.ok) return [];

  const admin = createAdminClient();
  let query = admin.from("partnership_opportunities").select(OPPORTUNITY_SELECT).order("created_at", { ascending: false });
  if (filters?.status) query = query.eq("status", filters.status);

  const { data, error } = await query;
  if (error) {
    console.error("[partnerships] failed to load opportunities", error.message);
    return [];
  }
  return (data ?? []).map((row) => mapOpportunityRow(row as unknown as Parameters<typeof mapOpportunityRow>[0]));
}

export async function getOpportunityById(actorUserId: string, opportunityId: string): Promise<PartnershipOpportunity | null> {
  const auth = await authorize(actorUserId);
  if (!auth.ok) return null;

  const admin = createAdminClient();
  const { data, error } = await admin.from("partnership_opportunities").select(OPPORTUNITY_SELECT).eq("id", opportunityId).maybeSingle();
  if (error || !data) {
    if (error) console.error("[partnerships] failed to load opportunity", error.message);
    return null;
  }
  return mapOpportunityRow(data as unknown as Parameters<typeof mapOpportunityRow>[0]);
}

export async function createOpportunity(params: {
  partnershipTypeId: string;
  counterpartName: string;
  counterpartOrganisation?: string | null;
  counterpartContactEmail?: string | null;
  counterpartContactPhone?: string | null;
  marketSlug?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  summary?: string | null;
  notes?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const auth = await authorize(params.actorUserId);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage partnership opportunities." };
  if (!params.counterpartName.trim()) return { ok: false, error: "Counterpart name is required." };

  const admin = createAdminClient();
  let marketId: string | null = null;
  if (params.marketSlug) {
    const { data } = await admin.from("pricing_markets").select("id").eq("slug", params.marketSlug).maybeSingle();
    marketId = data?.id ?? null;
  }

  const { data, error } = await admin
    .from("partnership_opportunities")
    .insert({
      partnership_type_id: params.partnershipTypeId,
      status: "opportunity",
      counterpart_name: params.counterpartName.trim(),
      counterpart_organisation: params.counterpartOrganisation ?? null,
      counterpart_contact_email: params.counterpartContactEmail ?? null,
      counterpart_contact_phone: params.counterpartContactPhone ?? null,
      market_id: marketId,
      reference_type: params.referenceType ?? null,
      reference_id: params.referenceId ?? null,
      summary: params.summary ?? null,
      notes: params.notes ?? null,
      created_by: params.actorUserId,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) {
    console.error("[partnerships] failed to create opportunity", error?.message);
    return { ok: false, error: "Failed to create the partnership opportunity." };
  }

  await logActivity({ actorUserId: params.actorUserId, action: "partnerships.opportunity.created", entityType: "partnership_opportunity", entityId: data.id, metadata: { counterpartName: params.counterpartName } });
  return { ok: true, id: data.id };
}

const VALID_STATUSES: PartnershipOpportunityStatus[] = ["opportunity", "qualification", "value_assessment", "proposed_terms", "internal_review", "decision", "agreement", "signatures", "active", "deliverables", "completion", "outcome_review"];
const VALID_DECISIONS: PartnershipDecisionOutcome[] = ["commercially_acceptable", "strategic_exception", "convert_to_paid_proposal", "declined"];

// Moving the lifecycle stage forward (or back to redo a step) is a
// routine authorized action — it never fabricates external agreement.
// Setting decisionOutcome only ever records an INTERNAL decision (see
// module doc comment) — it is not itself client/partner acceptance;
// that remains the separate, governed partnership_agreements stage.
export async function setOpportunityStatus(params: { opportunityId: string; status: PartnershipOpportunityStatus; decisionOutcome?: PartnershipDecisionOutcome | null; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorize(params.actorUserId);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage partnership opportunities." };
  if (!VALID_STATUSES.includes(params.status)) return { ok: false, error: "Unknown status." };
  if (params.decisionOutcome && !VALID_DECISIONS.includes(params.decisionOutcome)) return { ok: false, error: "Unknown decision outcome." };

  const admin = createAdminClient();
  const update: Record<string, unknown> = { status: params.status, updated_at: new Date().toISOString() };
  if (params.decisionOutcome !== undefined) update.decision_outcome = params.decisionOutcome;

  const { error } = await admin.from("partnership_opportunities").update(update).eq("id", params.opportunityId);
  if (error) {
    console.error("[partnerships] failed to update opportunity status", error.message);
    return { ok: false, error: "Failed to update the opportunity." };
  }
  await logActivity({ actorUserId: params.actorUserId, action: "partnerships.opportunity.status_changed", entityType: "partnership_opportunity", entityId: params.opportunityId, metadata: { status: params.status, decisionOutcome: params.decisionOutcome ?? null } });
  return { ok: true };
}

export async function isPartnershipSuperAdmin(actorUserId: string): Promise<boolean> {
  return isSuperAdminId(actorUserId);
}

// Referral Payable Bridge (2026-09-07) — links (or clears) this
// opportunity's counterpart to an existing payee profile. This is
// ONLY a reference: it never creates a payee, verifies payment
// details, or creates a payable — it just records which existing
// payee profile approveReferralCommissionForPayment() (referralCommissions.ts)
// should check for before allowing a referral commission to be
// submitted to Payables.
export async function setOpportunityPayeeProfile(params: { opportunityId: string; payeeProfileId: string | null; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorize(params.actorUserId);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage partnership opportunities." };

  const admin = createAdminClient();
  const { error } = await admin.from("partnership_opportunities").update({ payee_profile_id: params.payeeProfileId, updated_at: new Date().toISOString() }).eq("id", params.opportunityId);
  if (error) {
    console.error("[partnerships] failed to set opportunity payee profile", error.message);
    return { ok: false, error: "Failed to update the payee link." };
  }
  await logActivity({ actorUserId: params.actorUserId, action: "partnerships.opportunity.payee_linked", entityType: "partnership_opportunity", entityId: params.opportunityId, metadata: { payeeProfileId: params.payeeProfileId } });
  return { ok: true };
}
