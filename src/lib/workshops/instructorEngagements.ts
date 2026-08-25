import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { authorizeWithSuperAdminOverride, PEOPLE_CAPABILITIES } from "@/lib/organization/authority";

// Workshop Management V1, Phase B, Part 16 (2026-08-25) — against
// public.workshop_instructor_engagements. Links a workshop to a real
// internal payee (profile) or an external facilitator name, WITHOUT
// forcing every instructor to become staff, and WITHOUT ever touching
// Sanity's public-facing `instructor` document (no public route reads
// this table). Reuses Phase 3.3's payment_obligations for compensation
// — never a second compensation system.

export type WorkshopInstructorEngagement = {
  id: string;
  workshopId: string;
  profileId: string | null;
  externalPayeeName: string | null;
  role: string;
  agreedCompensationAmount: number | null;
  agreedCompensationCurrency: string | null;
  engagementStatus: string;
  paymentObligationId: string | null;
  notes: string | null;
  createdAt: string;
};

const SELECT =
  "id, workshop_id, profile_id, external_payee_name, role, agreed_compensation_amount, agreed_compensation_currency, engagement_status, payment_obligation_id, notes, created_at";

function mapEngagement(r: {
  id: string;
  workshop_id: string;
  profile_id: string | null;
  external_payee_name: string | null;
  role: string;
  agreed_compensation_amount: number | null;
  agreed_compensation_currency: string | null;
  engagement_status: string;
  payment_obligation_id: string | null;
  notes: string | null;
  created_at: string;
}): WorkshopInstructorEngagement {
  return {
    id: r.id,
    workshopId: r.workshop_id,
    profileId: r.profile_id,
    externalPayeeName: r.external_payee_name,
    role: r.role,
    agreedCompensationAmount: r.agreed_compensation_amount,
    agreedCompensationCurrency: r.agreed_compensation_currency,
    engagementStatus: r.engagement_status,
    paymentObligationId: r.payment_obligation_id,
    notes: r.notes,
    createdAt: r.created_at,
  };
}

export async function listInstructorEngagementsForWorkshop(workshopId: string): Promise<WorkshopInstructorEngagement[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("workshop_instructor_engagements").select(SELECT).eq("workshop_id", workshopId).order("created_at");
  if (error) {
    console.error("[workshops] failed to load instructor engagements", error.message);
    return [];
  }
  return (data ?? []).map(mapEngagement);
}

export type CreateEngagementParams = {
  workshopId: string;
  profileId?: string | null;
  externalPayeeName?: string | null;
  role?: string;
  agreedCompensationAmount?: number | null;
  agreedCompensationCurrency?: string | null;
  notes?: string | null;
  actorUserId: string;
};

// PULSE's real enforcement point (people.workshop_engagement.administer)
// — the auditable Super Admin override pattern applies here: if CHIEF
// creates this without holding the capability, the log records that
// explicitly rather than implying PULSE acted.
export async function createInstructorEngagement(params: CreateEngagementParams): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, PEOPLE_CAPABILITIES.workshopEngagementAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage workshop instructor engagements." };
  if (!params.profileId && !params.externalPayeeName) {
    return { ok: false, error: "Provide either an internal profile or an external payee name." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("workshop_instructor_engagements")
    .insert({
      workshop_id: params.workshopId,
      profile_id: params.profileId ?? null,
      external_payee_name: params.externalPayeeName ?? null,
      role: params.role ?? "instructor",
      agreed_compensation_amount: params.agreedCompensationAmount ?? null,
      agreed_compensation_currency: params.agreedCompensationCurrency ?? null,
      notes: params.notes ?? null,
      created_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[workshops] failed to create instructor engagement", error?.message);
    return { ok: false, error: "Failed to create the engagement." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "workshop.instructor_engagement.created",
    entityType: "workshop_instructor_engagement",
    entityId: data.id,
    metadata: {
      workshopId: params.workshopId,
      role: params.role ?? "instructor",
      actedAsSuperAdminOverride: auth.actedAsOverride,
      normalJurisdiction: PEOPLE_CAPABILITIES.workshopEngagementAdminister,
    },
  });

  return { ok: true, id: data.id };
}

// Creates the linked payment_obligations row (Phase 3.3, reused not
// duplicated) for an engagement's agreed compensation — VAULT's
// eventual approval authority over it is unchanged (approvePaymentObligation()
// still requires finance.payment_obligation.approve or Super Admin).
// Creating this obligation never executes a payout — no PayoutProvider
// exists (unchanged from Phase 3.3).
export async function linkEngagementToPaymentObligation(params: {
  engagementId: string;
  actorUserId: string;
}): Promise<{ ok: true; obligationId: string } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, PEOPLE_CAPABILITIES.workshopEngagementAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage workshop instructor engagements." };

  const admin = createAdminClient();
  const { data: engagement } = await admin
    .from("workshop_instructor_engagements")
    .select("profile_id, external_payee_name, role, agreed_compensation_amount, agreed_compensation_currency, workshop_id")
    .eq("id", params.engagementId)
    .maybeSingle();
  if (!engagement) return { ok: false, error: "Engagement not found." };
  if (!engagement.profile_id) {
    return { ok: false, error: "A payment obligation requires a real internal profile — this engagement is with an external payee not yet in the system." };
  }
  if (!engagement.agreed_compensation_amount) {
    return { ok: false, error: "Set an agreed compensation amount first." };
  }

  const { createPaymentObligation } = await import("@/lib/payments/payoutObligations");
  const result = await createPaymentObligation({
    payeeProfileId: engagement.profile_id,
    sourceType: "workshop_instructor",
    sourceReference: engagement.workshop_id,
    description: `Workshop instructor compensation — ${engagement.role}`,
    currency: engagement.agreed_compensation_currency ?? "USD",
    amount: engagement.agreed_compensation_amount,
    actorUserId: params.actorUserId,
  });
  if (!result.ok) return result;

  await admin.from("workshop_instructor_engagements").update({ payment_obligation_id: result.obligationId }).eq("id", params.engagementId);

  return { ok: true, obligationId: result.obligationId };
}
