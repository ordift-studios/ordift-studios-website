import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { authorizeWithSuperAdminOverride, FINANCE_CAPABILITIES } from "@/lib/organization/authority";
import { createPaymentObligation } from "@/lib/payments/payoutObligations";

// Universal Payables System (2026-09-03), Part B — against
// public.engagements (0049_universal_payables.sql). Generalizes the
// workshop_instructor_engagements (0047) pattern to any payee category;
// that table is left completely untouched — see the migration's
// inspection summary for why they stay separate, converging only at
// payment_obligations.

export const ENGAGEMENT_STATUSES = ["draft", "engagement_active", "work_submitted", "work_approved", "completed", "cancelled", "on_hold"] as const;
export type EngagementStatus = (typeof ENGAGEMENT_STATUSES)[number];

// Engagement Lifecycle UI (2026-09-03) — the existing status column
// (unconstrained text, no schema change) gains a real state machine at
// the application layer, matching how every other status-typed field
// in this codebase (workflow_statuses.status, payment_obligations.
// status) is governed: enforced in code, not a DB CHECK/enum. No new
// status value is introduced — every entry below is one of
// ENGAGEMENT_STATUSES above, already live since 0049.
//
// Pure and directly testable, same pure/impure split already used by
// canDelegate()/validateDelegationAuthority() in
// src/lib/organization/authority.ts and
// validateManualPaymentAgainstObligation() in payoutObligations.ts —
// this is the actual thing that prevents an arbitrary status jump
// (e.g. 'draft' straight to 'work_approved', skipping review), which a
// forged form submission could otherwise attempt even though the UI
// only ever renders buttons for valid transitions.
export const ENGAGEMENT_TRANSITIONS: Record<EngagementStatus, { to: EngagementStatus; label: string; requiresConfirmation: boolean }[]> = {
  draft: [
    { to: "engagement_active", label: "Activate Engagement", requiresConfirmation: false },
    { to: "cancelled", label: "Cancel Engagement", requiresConfirmation: true },
  ],
  engagement_active: [
    { to: "work_submitted", label: "Mark Work Submitted", requiresConfirmation: false },
    { to: "on_hold", label: "Put On Hold", requiresConfirmation: false },
    { to: "cancelled", label: "Cancel Engagement", requiresConfirmation: true },
  ],
  work_submitted: [
    { to: "work_approved", label: "Approve Work", requiresConfirmation: true },
    { to: "on_hold", label: "Put On Hold", requiresConfirmation: false },
    { to: "cancelled", label: "Cancel Engagement", requiresConfirmation: true },
  ],
  work_approved: [{ to: "completed", label: "Mark Completed", requiresConfirmation: false }],
  on_hold: [
    { to: "engagement_active", label: "Resume Engagement", requiresConfirmation: false },
    { to: "cancelled", label: "Cancel Engagement", requiresConfirmation: true },
  ],
  completed: [],
  cancelled: [],
};

export function getValidEngagementTransitions(currentStatus: string): { to: EngagementStatus; label: string; requiresConfirmation: boolean }[] {
  return ENGAGEMENT_TRANSITIONS[currentStatus as EngagementStatus] ?? [];
}

export function isValidEngagementTransition(fromStatus: string, toStatus: string): boolean {
  return getValidEngagementTransitions(fromStatus).some((t) => t.to === toStatus);
}

export type Engagement = {
  id: string;
  payeeProfileId: string | null;
  externalPayeeName: string | null;
  payeeName: string | null;
  engagementTypeId: string | null;
  engagementTypeName: string | null;
  operationalTitleId: string | null;
  operationalTitleName: string | null;
  roleNote: string | null;
  entityType: string | null;
  entityId: string | null;
  currency: string | null;
  agreedAmount: number | null;
  startsAt: string | null;
  endsAt: string | null;
  dueDate: string | null;
  status: string;
  notes: string | null;
  paymentObligationId: string | null;
  createdAt: string;
};

const SELECT =
  "id, payee_profile_id, external_payee_name, engagement_type_id, operational_title_id, role_note, entity_type, entity_id, currency, agreed_amount, starts_at, ends_at, due_date, status, notes, payment_obligation_id, created_at, engagement_types(name), operational_titles(name), profiles(full_name)";

type RawEngagementRow = {
  id: string;
  payee_profile_id: string | null;
  external_payee_name: string | null;
  engagement_type_id: string | null;
  operational_title_id: string | null;
  role_note: string | null;
  entity_type: string | null;
  entity_id: string | null;
  currency: string | null;
  agreed_amount: number | null;
  starts_at: string | null;
  ends_at: string | null;
  due_date: string | null;
  status: string;
  notes: string | null;
  payment_obligation_id: string | null;
  created_at: string;
  engagement_types: { name: string } | null;
  operational_titles: { name: string } | null;
  profiles: { full_name: string | null } | null;
};

function mapEngagement(r: RawEngagementRow): Engagement {
  return {
    id: r.id,
    payeeProfileId: r.payee_profile_id,
    externalPayeeName: r.external_payee_name,
    payeeName: r.profiles?.full_name ?? r.external_payee_name,
    engagementTypeId: r.engagement_type_id,
    engagementTypeName: r.engagement_types?.name ?? null,
    operationalTitleId: r.operational_title_id,
    operationalTitleName: r.operational_titles?.name ?? null,
    roleNote: r.role_note,
    entityType: r.entity_type,
    entityId: r.entity_id,
    currency: r.currency,
    agreedAmount: r.agreed_amount,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    dueDate: r.due_date,
    status: r.status,
    notes: r.notes,
    paymentObligationId: r.payment_obligation_id,
    createdAt: r.created_at,
  };
}

export async function listAllEngagements(actorUserId: string): Promise<Engagement[]> {
  const auth = await authorizeWithSuperAdminOverride(actorUserId, FINANCE_CAPABILITIES.payeeAdminister);
  if (!auth.ok) return [];

  const admin = createAdminClient();
  const { data, error } = await admin.from("engagements").select(SELECT).order("created_at", { ascending: false });
  if (error) {
    console.error("[payables] failed to load engagements", error.message);
    return [];
  }
  return (data ?? []).map((r) => mapEngagement(r as unknown as RawEngagementRow));
}

export async function listEngagementsForPayee(payeeProfileId: string): Promise<Engagement[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("engagements").select(SELECT).eq("payee_profile_id", payeeProfileId).order("created_at", { ascending: false });
  if (error) {
    console.error("[payables] failed to load engagements for payee", error.message);
    return [];
  }
  return (data ?? []).map((r) => mapEngagement(r as unknown as RawEngagementRow));
}

export async function getEngagement(engagementId: string): Promise<Engagement | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("engagements").select(SELECT).eq("id", engagementId).maybeSingle();
  if (error || !data) {
    if (error) console.error("[payables] failed to load engagement", error.message);
    return null;
  }
  return mapEngagement(data as unknown as RawEngagementRow);
}

export type CreateEngagementParams = {
  payeeProfileId?: string | null;
  externalPayeeName?: string | null;
  engagementTypeId?: string | null;
  operationalTitleId?: string | null;
  roleNote?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  currency?: string | null;
  agreedAmount?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  actorUserId: string;
};

export async function createEngagement(params: CreateEngagementParams): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.payeeAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to administer engagements." };
  if (!params.payeeProfileId && !params.externalPayeeName) {
    return { ok: false, error: "Provide either an internal payee or an external payee name." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("engagements")
    .insert({
      payee_profile_id: params.payeeProfileId ?? null,
      external_payee_name: params.externalPayeeName ?? null,
      engagement_type_id: params.engagementTypeId ?? null,
      operational_title_id: params.operationalTitleId ?? null,
      role_note: params.roleNote ?? null,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
      currency: params.currency ?? null,
      agreed_amount: params.agreedAmount ?? null,
      starts_at: params.startsAt ?? null,
      ends_at: params.endsAt ?? null,
      due_date: params.dueDate ?? null,
      notes: params.notes ?? null,
      status: "draft",
      created_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[payables] failed to create engagement", error?.message);
    return { ok: false, error: "Failed to create the engagement." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "engagement.created",
    entityType: "engagement",
    entityId: data.id,
    metadata: {
      payeeProfileId: params.payeeProfileId ?? null,
      externalPayeeName: params.externalPayeeName ?? null,
      actedAsSuperAdminOverride: auth.actedAsOverride,
    },
  });

  return { ok: true, id: data.id };
}

// Validates against ENGAGEMENT_TRANSITIONS above — the real
// enforcement point, not merely the UI only rendering valid buttons. A
// forged form submission requesting an out-of-sequence status (e.g.
// 'draft' straight to 'work_approved') is refused here regardless of
// what the client sent, the same defense-in-depth principle this
// codebase applies everywhere authorization and workflow state
// intersect (see workflow_statuses' own app-layer-enforced transitions,
// 0023's header comment).
export async function setEngagementStatus(params: {
  engagementId: string;
  status: EngagementStatus;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.payeeAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to administer engagements." };

  const admin = createAdminClient();
  const { data: existing } = await admin.from("engagements").select("status").eq("id", params.engagementId).maybeSingle();
  if (!existing) return { ok: false, error: "Engagement not found." };
  if (!isValidEngagementTransition(existing.status, params.status)) {
    return { ok: false, error: `Cannot move from "${existing.status}" to "${params.status}" — not a valid transition.` };
  }

  const { error } = await admin.from("engagements").update({ status: params.status }).eq("id", params.engagementId);
  if (error) {
    console.error("[payables] failed to update engagement status", error.message);
    return { ok: false, error: "Failed to update." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "engagement.status_changed",
    entityType: "engagement",
    entityId: params.engagementId,
    metadata: { fromStatus: existing.status, toStatus: params.status, actedAsSuperAdminOverride: auth.actedAsOverride },
  });

  return { ok: true };
}

// Creates (or returns the existing) linked payment_obligations row for
// this engagement's agreed amount — reuses createPaymentObligation()
// directly (payments/payoutObligations.ts), never a second obligations
// table. Mirrors linkEngagementToPaymentObligation() in
// workshops/instructorEngagements.ts exactly, generalized off
// workshop_id. Creating this never itself moves money — the
// obligation still starts 'pending_approval'.
export async function createEngagementPayable(params: {
  engagementId: string;
  description: string;
  actorUserId: string;
}): Promise<{ ok: true; obligationId: string } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.payeeAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to administer engagements." };

  const admin = createAdminClient();
  const { data: engagement } = await admin
    .from("engagements")
    .select("payee_profile_id, external_payee_name, currency, agreed_amount, payment_obligation_id")
    .eq("id", params.engagementId)
    .maybeSingle();
  if (!engagement) return { ok: false, error: "Engagement not found." };
  if (engagement.payment_obligation_id) return { ok: false, error: "This engagement already has a linked payable." };
  if (!engagement.payee_profile_id) {
    return { ok: false, error: "A payable requires a real internal payee profile — this engagement is with an external payee not yet in the system." };
  }
  if (!engagement.agreed_amount || !engagement.currency) {
    return { ok: false, error: "Set an agreed amount and currency first." };
  }

  const result = await createPaymentObligation({
    payeeProfileId: engagement.payee_profile_id,
    sourceType: "engagement",
    sourceReference: params.engagementId,
    description: params.description,
    currency: engagement.currency,
    amount: engagement.agreed_amount,
    actorUserId: params.actorUserId,
  });
  if (!result.ok) return result;

  await admin.from("engagements").update({ payment_obligation_id: result.obligationId }).eq("id", params.engagementId);

  return { ok: true, obligationId: result.obligationId };
}
