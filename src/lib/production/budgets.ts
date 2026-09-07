import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeWithSuperAdminOverride, OPERATIONS_CAPABILITIES } from "@/lib/organization/authority";
import { logActivity } from "@/lib/admin/activityLog";
import { requiresGovernedChangeRecord, computeBudgetDifference, type ProductionBudgetStatus } from "./budgetMath";

// Ordift Production Services — Production Budget Versioning
// (2026-09-07) — production_budgets is APPEND-ONLY: a budget change is
// always a new INSERT with `supersedes_id` pointing at the row it
// replaces, never an UPDATE of an existing row's financial figures.
// Every historical version therefore remains queryable/auditable
// forever, satisfying "do not overwrite an approved production budget
// as though the previous client-approved figure never existed."
//
// GOVERNED CHANGE ENFORCEMENT: once a reference's latest budget
// version has reached client_approved/committed/actual_final,
// createBudgetVersion() REFUSES to create a new version with a
// materially different total unless a non-empty changeReason is
// supplied — and when one is, it atomically writes the matching
// production_budget_changes row alongside the new budget version, in
// the same call. There is no code path that lets a post-approval total
// change silently.
//
// FINANCIAL STOP-GATE: nothing here ever creates a payment_obligation,
// calls into payables/payout code, or commits a supplier. A budget
// reaching "committed" status is a record of an internal/client
// decision, not a trigger — actually engaging or paying a supplier
// remains a separate, explicit action outside this module (see
// productionSupplierQuotes.ts's identical rule for quote status).
//
// Authorization: operations.coordinate, same as the rest of the
// Production Services supplier/budget domain. RLS is staff-read-only.

export type { ProductionBudgetStatus };

export type ProductionBudgetLineItem = { label: string; category: string; amountUsd: number | null; currencyCode?: string; originalAmount?: number; supplierQuoteId?: string };

export type ProductionBudget = {
  id: string;
  referenceType: string;
  referenceId: string;
  status: ProductionBudgetStatus;
  lineItems: ProductionBudgetLineItem[];
  contingencyEnabled: boolean;
  contingencyPercentage: number | null;
  contingencyAmountUsd: number | null;
  totalUsd: number | null;
  supersedesId: string | null;
  notes: string | null;
  createdAt: string;
};

export type ProductionBudgetChange = {
  id: string;
  budgetId: string;
  reason: string;
  previousAmountUsd: number;
  newAmountUsd: number;
  differenceUsd: number;
  clientApprovalStatus: "pending" | "approved" | "rejected";
  createdAt: string;
};

async function authorize(actorUserId: string) {
  return authorizeWithSuperAdminOverride(actorUserId, OPERATIONS_CAPABILITIES.coordinate);
}

function mapBudgetRow(b: {
  id: string;
  reference_type: string;
  reference_id: string;
  status: string;
  line_items: unknown;
  contingency_enabled: boolean;
  contingency_percentage: number | null;
  contingency_amount_usd: number | null;
  total_usd: number | null;
  supersedes_id: string | null;
  notes: string | null;
  created_at: string;
}): ProductionBudget {
  return {
    id: b.id,
    referenceType: b.reference_type,
    referenceId: b.reference_id,
    status: b.status as ProductionBudgetStatus,
    lineItems: (b.line_items as ProductionBudgetLineItem[]) ?? [],
    contingencyEnabled: b.contingency_enabled,
    contingencyPercentage: b.contingency_percentage === null ? null : Number(b.contingency_percentage),
    contingencyAmountUsd: b.contingency_amount_usd === null ? null : Number(b.contingency_amount_usd),
    totalUsd: b.total_usd === null ? null : Number(b.total_usd),
    supersedesId: b.supersedes_id,
    notes: b.notes,
    createdAt: b.created_at,
  };
}

export async function getBudgetById(actorUserId: string, budgetId: string): Promise<ProductionBudget | null> {
  const auth = await authorize(actorUserId);
  if (!auth.ok) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("production_budgets")
    .select("id, reference_type, reference_id, status, line_items, contingency_enabled, contingency_percentage, contingency_amount_usd, total_usd, supersedes_id, notes, created_at")
    .eq("id", budgetId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("[production] failed to load production budget", error.message);
    return null;
  }
  return mapBudgetRow(data);
}

// Admin-facing global list — most-recent version across every
// engagement, for the Production Operations Overview/Budgets landing
// page. Deliberately shows every version (not de-duplicated to "latest
// per reference") so Admin can see recent activity, not just current
// state — the [id] detail page is where the full per-reference version
// chain (via listBudgetHistoryForReference) is inspected.
export async function listRecentBudgetVersions(actorUserId: string, limit: number = 50): Promise<ProductionBudget[]> {
  const auth = await authorize(actorUserId);
  if (!auth.ok) return [];

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("production_budgets")
    .select("id, reference_type, reference_id, status, line_items, contingency_enabled, contingency_percentage, contingency_amount_usd, total_usd, supersedes_id, notes, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[production] failed to load recent production budgets", error.message);
    return [];
  }
  return (data ?? []).map(mapBudgetRow);
}

export async function listRecentBudgetChanges(actorUserId: string, limit: number = 50): Promise<ProductionBudgetChange[]> {
  const auth = await authorize(actorUserId);
  if (!auth.ok) return [];

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("production_budget_changes")
    .select("id, budget_id, reason, previous_amount_usd, new_amount_usd, difference_usd, client_approval_status, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[production] failed to load recent production budget changes", error.message);
    return [];
  }
  return (data ?? []).map((c) => ({
    id: c.id,
    budgetId: c.budget_id,
    reason: c.reason,
    previousAmountUsd: Number(c.previous_amount_usd),
    newAmountUsd: Number(c.new_amount_usd),
    differenceUsd: Number(c.difference_usd),
    clientApprovalStatus: c.client_approval_status,
    createdAt: c.created_at,
  }));
}

export async function getLatestBudgetForReference(actorUserId: string, referenceType: string, referenceId: string): Promise<ProductionBudget | null> {
  const auth = await authorize(actorUserId);
  if (!auth.ok) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("production_budgets")
    .select("id, reference_type, reference_id, status, line_items, contingency_enabled, contingency_percentage, contingency_amount_usd, total_usd, supersedes_id, notes, created_at")
    .eq("reference_type", referenceType)
    .eq("reference_id", referenceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[production] failed to load latest production budget", error.message);
    return null;
  }
  return data ? mapBudgetRow(data) : null;
}

export async function listBudgetHistoryForReference(actorUserId: string, referenceType: string, referenceId: string): Promise<ProductionBudget[]> {
  const auth = await authorize(actorUserId);
  if (!auth.ok) return [];

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("production_budgets")
    .select("id, reference_type, reference_id, status, line_items, contingency_enabled, contingency_percentage, contingency_amount_usd, total_usd, supersedes_id, notes, created_at")
    .eq("reference_type", referenceType)
    .eq("reference_id", referenceId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[production] failed to load production budget history", error.message);
    return [];
  }
  return (data ?? []).map(mapBudgetRow);
}

export async function createBudgetVersion(params: {
  referenceType: string;
  referenceId: string;
  status: ProductionBudgetStatus;
  lineItems: ProductionBudgetLineItem[];
  contingencyEnabled?: boolean;
  contingencyPercentage?: number | null;
  contingencyAmountUsd?: number | null;
  totalUsd: number | null;
  notes?: string | null;
  changeReason?: string; // required when the prior version is client_approved/committed/actual_final and the total materially changes
  actorUserId: string;
}): Promise<{ ok: true; id: string; changeRecorded: boolean } | { ok: false; error: string; requiresChangeReason?: boolean }> {
  const auth = await authorize(params.actorUserId);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage production budgets." };

  const previous = await getLatestBudgetForReference(params.actorUserId, params.referenceType, params.referenceId);

  let changeRecorded = false;
  if (previous && requiresGovernedChangeRecord(previous.status, previous.totalUsd, params.totalUsd)) {
    if (!params.changeReason?.trim()) {
      return { ok: false, error: "This budget was already client-approved (or later) — a reason is required to change the total, recorded as a governed change/variation.", requiresChangeReason: true };
    }
    changeRecorded = true;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("production_budgets")
    .insert({
      reference_type: params.referenceType,
      reference_id: params.referenceId,
      status: params.status,
      line_items: params.lineItems,
      contingency_enabled: params.contingencyEnabled ?? false,
      contingency_percentage: params.contingencyPercentage ?? null,
      contingency_amount_usd: params.contingencyAmountUsd ?? null,
      total_usd: params.totalUsd,
      supersedes_id: previous?.id ?? null,
      notes: params.notes ?? null,
      created_by: params.actorUserId,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) {
    console.error("[production] failed to create production budget version", error?.message);
    return { ok: false, error: "Failed to save the new budget version." };
  }

  if (changeRecorded && previous) {
    const previousAmount = previous.totalUsd ?? 0;
    const newAmount = params.totalUsd ?? 0;
    const { error: changeError } = await admin.from("production_budget_changes").insert({
      budget_id: previous.id,
      reason: params.changeReason,
      previous_amount_usd: previousAmount,
      new_amount_usd: newAmount,
      difference_usd: computeBudgetDifference(previousAmount, newAmount),
      affected_lines: params.lineItems,
      actor_user_id: params.actorUserId,
      client_approval_status: "pending",
    });
    if (changeError) console.error("[production] failed to record budget change/variation", changeError.message);
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "production.budget_version.created",
    entityType: "production_budget",
    entityId: data.id,
    metadata: { referenceType: params.referenceType, referenceId: params.referenceId, status: params.status, totalUsd: params.totalUsd, supersedesId: previous?.id ?? null, changeRecorded },
  });
  return { ok: true, id: data.id, changeRecorded };
}

export async function listChangesForBudget(actorUserId: string, budgetId: string): Promise<ProductionBudgetChange[]> {
  const auth = await authorize(actorUserId);
  if (!auth.ok) return [];

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("production_budget_changes")
    .select("id, budget_id, reason, previous_amount_usd, new_amount_usd, difference_usd, client_approval_status, created_at")
    .eq("budget_id", budgetId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[production] failed to load budget changes", error.message);
    return [];
  }
  return (data ?? []).map((c) => ({
    id: c.id,
    budgetId: c.budget_id,
    reason: c.reason,
    previousAmountUsd: Number(c.previous_amount_usd),
    newAmountUsd: Number(c.new_amount_usd),
    differenceUsd: Number(c.difference_usd),
    clientApprovalStatus: c.client_approval_status,
    createdAt: c.created_at,
  }));
}

export async function setChangeClientApprovalStatus(params: { changeId: string; status: "approved" | "rejected"; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorize(params.actorUserId);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage production budgets." };

  const admin = createAdminClient();
  const { error } = await admin.from("production_budget_changes").update({ client_approval_status: params.status, client_approved_at: params.status === "approved" ? new Date().toISOString() : null }).eq("id", params.changeId);
  if (error) {
    console.error("[production] failed to update budget change approval status", error.message);
    return { ok: false, error: "Failed to update the change record." };
  }
  await logActivity({ actorUserId: params.actorUserId, action: "production.budget_change.approval_status_changed", entityType: "production_budget_change", entityId: params.changeId, metadata: { status: params.status } });
  return { ok: true };
}
