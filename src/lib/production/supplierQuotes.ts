import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeWithSuperAdminOverride, OPERATIONS_CAPABILITIES } from "@/lib/organization/authority";
import { logActivity } from "@/lib/admin/activityLog";
import { computeQuoteTotal } from "./quoteMath";

// Ordift Production Services — Supplier Quotes (2026-09-07) — a
// supplier's priced offer for a specific production engagement.
// reference_type/reference_id mirror discount_redemptions.reference_type/
// reference_id and payment_obligations.source_type/source_reference —
// the same established polymorphic-reference pattern this codebase
// already uses twice, rather than a hard FK to any one booking/
// enquiry/project table (Production Services has no dedicated
// "project" entity yet; a quote typically anchors to the enquiry the
// engagement came through).
//
// CRITICAL SAFETY RULE: nothing in this module can commit or book a
// supplier, or trigger any payment. A status transition to
// "approved_internally" or even "committed" is purely a record of a
// staff decision — it never calls into payables/payment code, never
// creates a payment_obligation, and never sends anything to a
// supplier. Actually engaging a supplier remains a separate, explicit,
// human action outside this module's scope in V1 — see the module doc
// comment on productionBudgets.ts for how a budget's own "committed"
// status works the same way.
//
// Authorization: operations.coordinate, same as suppliers.ts. RLS is
// staff-read-only — supplier quote figures (subtotal, tax, deposit
// terms) are never exposed publicly.

export type ProductionSupplierQuoteStatus = "draft" | "received" | "under_review" | "approved_internally" | "rejected" | "expired" | "superseded" | "committed";

export type ProductionSupplierQuote = {
  id: string;
  supplierId: string;
  referenceType: string;
  referenceId: string;
  description: string;
  originalCurrencyCode: string;
  supplierSubtotal: number;
  taxAmount: number | null;
  quoteTotal: number;
  validUntil: string | null;
  depositRequired: boolean;
  depositAmount: number | null;
  depositPercentage: number | null;
  cancellationTerms: string | null;
  sourceReference: string | null;
  status: ProductionSupplierQuoteStatus;
  internalNotes: string | null;
  createdAt: string;
};

const STATUSES: ProductionSupplierQuoteStatus[] = ["draft", "received", "under_review", "approved_internally", "rejected", "expired", "superseded", "committed"];

async function authorize(actorUserId: string) {
  return authorizeWithSuperAdminOverride(actorUserId, OPERATIONS_CAPABILITIES.coordinate);
}

export async function listQuotesForReference(actorUserId: string, referenceType: string, referenceId: string): Promise<ProductionSupplierQuote[]> {
  const auth = await authorize(actorUserId);
  if (!auth.ok) return [];

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("production_supplier_quotes")
    .select("id, supplier_id, reference_type, reference_id, description, original_currency_code, supplier_subtotal, tax_amount, quote_total, valid_until, deposit_required, deposit_amount, deposit_percentage, cancellation_terms, source_reference, status, internal_notes, created_at")
    .eq("reference_type", referenceType)
    .eq("reference_id", referenceId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[production] failed to load supplier quotes", error.message);
    return [];
  }
  return (data ?? []).map((q) => ({
    id: q.id,
    supplierId: q.supplier_id,
    referenceType: q.reference_type,
    referenceId: q.reference_id,
    description: q.description,
    originalCurrencyCode: q.original_currency_code,
    supplierSubtotal: Number(q.supplier_subtotal),
    taxAmount: q.tax_amount === null ? null : Number(q.tax_amount),
    quoteTotal: Number(q.quote_total),
    validUntil: q.valid_until,
    depositRequired: q.deposit_required,
    depositAmount: q.deposit_amount === null ? null : Number(q.deposit_amount),
    depositPercentage: q.deposit_percentage === null ? null : Number(q.deposit_percentage),
    cancellationTerms: q.cancellation_terms,
    sourceReference: q.source_reference,
    status: q.status,
    internalNotes: q.internal_notes,
    createdAt: q.created_at,
  }));
}

function mapQuoteRow(q: {
  id: string;
  supplier_id: string;
  reference_type: string;
  reference_id: string;
  description: string;
  original_currency_code: string;
  supplier_subtotal: number;
  tax_amount: number | null;
  quote_total: number;
  valid_until: string | null;
  deposit_required: boolean;
  deposit_amount: number | null;
  deposit_percentage: number | null;
  cancellation_terms: string | null;
  source_reference: string | null;
  status: string;
  internal_notes: string | null;
  created_at: string;
}): ProductionSupplierQuote {
  return {
    id: q.id,
    supplierId: q.supplier_id,
    referenceType: q.reference_type,
    referenceId: q.reference_id,
    description: q.description,
    originalCurrencyCode: q.original_currency_code,
    supplierSubtotal: Number(q.supplier_subtotal),
    taxAmount: q.tax_amount === null ? null : Number(q.tax_amount),
    quoteTotal: Number(q.quote_total),
    validUntil: q.valid_until,
    depositRequired: q.deposit_required,
    depositAmount: q.deposit_amount === null ? null : Number(q.deposit_amount),
    depositPercentage: q.deposit_percentage === null ? null : Number(q.deposit_percentage),
    cancellationTerms: q.cancellation_terms,
    sourceReference: q.source_reference,
    status: q.status as ProductionSupplierQuoteStatus,
    internalNotes: q.internal_notes,
    createdAt: q.created_at,
  };
}

export async function getSupplierQuoteById(actorUserId: string, quoteId: string): Promise<ProductionSupplierQuote | null> {
  const auth = await authorize(actorUserId);
  if (!auth.ok) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("production_supplier_quotes")
    .select("id, supplier_id, reference_type, reference_id, description, original_currency_code, supplier_subtotal, tax_amount, quote_total, valid_until, deposit_required, deposit_amount, deposit_percentage, cancellation_terms, source_reference, status, internal_notes, created_at")
    .eq("id", quoteId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("[production] failed to load supplier quote", error.message);
    return null;
  }
  return mapQuoteRow(data);
}

// Admin-facing global list — Production Services' own listQuotesForReference()
// is scoped to one engagement; this is the "browse everything" view the
// Production Operations Admin UI needs, with optional status/supplier
// filters. Ordered most-recent-first, same convention as every other
// admin list in this codebase.
export async function listAllSupplierQuotes(actorUserId: string, filters?: { status?: ProductionSupplierQuoteStatus; supplierId?: string }): Promise<ProductionSupplierQuote[]> {
  const auth = await authorize(actorUserId);
  if (!auth.ok) return [];

  const admin = createAdminClient();
  let query = admin
    .from("production_supplier_quotes")
    .select("id, supplier_id, reference_type, reference_id, description, original_currency_code, supplier_subtotal, tax_amount, quote_total, valid_until, deposit_required, deposit_amount, deposit_percentage, cancellation_terms, source_reference, status, internal_notes, created_at")
    .order("created_at", { ascending: false });
  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.supplierId) query = query.eq("supplier_id", filters.supplierId);

  const { data, error } = await query;
  if (error) {
    console.error("[production] failed to load all supplier quotes", error.message);
    return [];
  }
  return (data ?? []).map(mapQuoteRow);
}

export async function createSupplierQuote(params: {
  supplierId: string;
  referenceType: string;
  referenceId: string;
  description: string;
  originalCurrencyCode: string;
  supplierSubtotal: number;
  taxAmount?: number | null;
  validUntil?: string | null;
  depositRequired?: boolean;
  depositAmount?: number | null;
  depositPercentage?: number | null;
  cancellationTerms?: string | null;
  sourceReference?: string | null;
  internalNotes?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const auth = await authorize(params.actorUserId);
  if (!auth.ok) return { ok: false, error: "Not authorized to record supplier quotes." };
  if (!params.description.trim()) return { ok: false, error: "A description is required." };
  if (params.supplierSubtotal <= 0) return { ok: false, error: "Supplier subtotal must be greater than zero." };

  const quoteTotal = computeQuoteTotal(params.supplierSubtotal, params.taxAmount);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("production_supplier_quotes")
    .insert({
      supplier_id: params.supplierId,
      reference_type: params.referenceType,
      reference_id: params.referenceId,
      description: params.description.trim(),
      original_currency_code: params.originalCurrencyCode,
      supplier_subtotal: params.supplierSubtotal,
      tax_amount: params.taxAmount ?? null,
      quote_total: quoteTotal,
      valid_until: params.validUntil ?? null,
      deposit_required: params.depositRequired ?? false,
      deposit_amount: params.depositAmount ?? null,
      deposit_percentage: params.depositPercentage ?? null,
      cancellation_terms: params.cancellationTerms ?? null,
      source_reference: params.sourceReference ?? null,
      status: "draft",
      internal_notes: params.internalNotes ?? null,
      created_by: params.actorUserId,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) {
    console.error("[production] failed to create supplier quote", error?.message);
    return { ok: false, error: "Failed to record the supplier quote." };
  }

  await logActivity({ actorUserId: params.actorUserId, action: "production.supplier_quote.created", entityType: "production_supplier_quote", entityId: data.id, metadata: { supplierId: params.supplierId, referenceType: params.referenceType, referenceId: params.referenceId, quoteTotal } });
  return { ok: true, id: data.id };
}

// Status transition ONLY — never a financial mutation, never a
// supplier commitment/payment trigger. See module doc comment.
export async function setSupplierQuoteStatus(params: { quoteId: string; status: ProductionSupplierQuoteStatus; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorize(params.actorUserId);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage supplier quotes." };
  if (!STATUSES.includes(params.status)) return { ok: false, error: "Unknown quote status." };

  const admin = createAdminClient();
  const { error } = await admin.from("production_supplier_quotes").update({ status: params.status, updated_at: new Date().toISOString() }).eq("id", params.quoteId);
  if (error) {
    console.error("[production] failed to update supplier quote status", error.message);
    return { ok: false, error: "Failed to update the supplier quote." };
  }
  await logActivity({ actorUserId: params.actorUserId, action: "production.supplier_quote.status_changed", entityType: "production_supplier_quote", entityId: params.quoteId, metadata: { status: params.status } });
  return { ok: true };
}
