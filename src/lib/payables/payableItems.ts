import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { authorizeWithSuperAdminOverride, FINANCE_CAPABILITIES } from "@/lib/organization/authority";

// Universal Payables System (2026-09-03), Part C — against
// public.payable_items (0049_universal_payables.sql). Insert-only in
// this phase (see the migration's table comment) — a
// private.sync_payment_obligation_amount() trigger keeps the parent
// payment_obligations.amount equal to the sum of its items the moment
// any item exists; a Payable with zero items (every existing row
// today, and every future single-amount Payable created directly via
// createPaymentObligation()) is completely unaffected.

export const PAYABLE_ITEM_KINDS = ["fee", "salary", "bonus", "allowance", "reimbursement", "travel", "per_diem", "accommodation", "equipment", "commission", "other"] as const;
export type PayableItemKind = (typeof PAYABLE_ITEM_KINDS)[number];

export type PayableItem = {
  id: string;
  paymentObligationId: string;
  kind: string;
  description: string;
  currency: string;
  amount: number;
  createdAt: string;
};

const SELECT = "id, payment_obligation_id, kind, description, currency, amount, created_at";

function mapItem(r: {
  id: string;
  payment_obligation_id: string;
  kind: string;
  description: string;
  currency: string;
  amount: number;
  created_at: string;
}): PayableItem {
  return {
    id: r.id,
    paymentObligationId: r.payment_obligation_id,
    kind: r.kind,
    description: r.description,
    currency: r.currency,
    amount: r.amount,
    createdAt: r.created_at,
  };
}

export async function listPayableItems(paymentObligationId: string): Promise<PayableItem[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("payable_items").select(SELECT).eq("payment_obligation_id", paymentObligationId).order("created_at");
  if (error) {
    console.error("[payables] failed to load payable_items", error.message);
    return [];
  }
  return (data ?? []).map(mapItem);
}

export type AddPayableItemParams = {
  paymentObligationId: string;
  kind: string;
  description: string;
  amount: number;
  actorUserId: string;
};

// Only ever adds to a 'pending_approval' Payable — once approved, its
// total has been reviewed and signed off; adding a further line item
// after that point would silently change an already-approved amount,
// which this function deliberately refuses (a new Payable, or a
// documented future "amend an approved Payable" flow, is the correct
// path instead — not implemented here, out of scope for this phase).
export async function addPayableItem(params: AddPayableItemParams): Promise<{ ok: true; itemId: string } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.payeeAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to administer payables." };
  if (params.amount <= 0) return { ok: false, error: "Amount must be greater than zero." };

  const admin = createAdminClient();
  const { data: obligation } = await admin.from("payment_obligations").select("status, currency").eq("id", params.paymentObligationId).maybeSingle();
  if (!obligation) return { ok: false, error: "Payable not found." };
  if (obligation.status !== "pending_approval") {
    return { ok: false, error: `Cannot add a line item — this payable is already "${obligation.status}".` };
  }

  const { data, error } = await admin
    .from("payable_items")
    .insert({
      payment_obligation_id: params.paymentObligationId,
      kind: params.kind,
      description: params.description,
      currency: obligation.currency,
      amount: params.amount,
      created_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[payables] failed to add payable_item", error?.message);
    return { ok: false, error: "Failed to add the line item." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "payable_item.added",
    entityType: "payment_obligation",
    entityId: params.paymentObligationId,
    metadata: { kind: params.kind, currency: obligation.currency, amount: params.amount },
  });

  return { ok: true, itemId: data.id };
}
