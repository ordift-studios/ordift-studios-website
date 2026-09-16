import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { hasRole, isSuperAdmin, getCurrentUser } from "@/lib/portal/roles";
import { formatQuotationReference } from "./quotationReference";

// Universal Commercial Rate Card & Quotation System — selling side
// (2026-09-16, migration 0134). A quotation is a formal, versioned
// SNAPSHOT offered to one client or offline prospect — never a live
// recomputation of the existing Pricing engine (corporate_headshot_rates
// etc.), and never a place provider/vendor cost or Ordift margin is
// ever stored (client_quotation_items has no such column by
// construction — see the migration's own comment).

async function requireAdminActor(): Promise<{ ok: true; actorUserId: string } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) {
    return { ok: false, error: "Not authorized to manage quotations." };
  }
  return { ok: true, actorUserId: user.id };
}

export type QuotationLineItemSourceType = "pricing" | "manual" | "adjusted";

export type QuotationLineItemInput = {
  serviceItem: string;
  description?: string | null;
  quantity: number;
  unitBasis: string;
  sellingRate: number;
  discountPercent?: number | null;
  taxPercent?: number | null;
  // Connect Client Quotations to existing Pricing (2026-09-16) — records
  // whether this line came from a real configured Pricing rate, an
  // authorized manual entry, or a Pricing rate that was deliberately
  // adjusted. Defaults to 'manual' (every pre-existing quotation's true
  // origin). sourceReference is a human-readable snapshot label, never a
  // live foreign key — a quotation line must never change because the
  // referenced rate later changes.
  sourceType?: QuotationLineItemSourceType;
  sourceReference?: string | null;
};

export type CreateQuotationParams = {
  clientProfileId?: string | null;
  prospectName?: string | null;
  prospectEmail?: string | null;
  prospectPhone?: string | null;
  prospectCompany?: string | null;
  currency: string;
  validUntil?: string | null;
  paymentBookingTerms?: string | null;
  commercialNotes?: string | null;
  items: QuotationLineItemInput[];
};

export type CreateQuotationResult = { ok: true; quotationId: string; quotationReference: string } | { ok: false; error: string };

// Pure — computes each line's total and the document-level subtotal/
// discount/tax/total. Directly testable without a database; the only
// place this arithmetic exists, reused by both create and any future
// recompute-on-edit path.
export function computeQuotationTotals(items: QuotationLineItemInput[]): {
  lineTotals: number[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
} {
  let subtotal = 0;
  let discountTotal = 0;
  let taxTotal = 0;
  const lineTotals: number[] = [];

  for (const item of items) {
    const gross = item.quantity * item.sellingRate;
    const discount = item.discountPercent ? gross * (item.discountPercent / 100) : 0;
    const afterDiscount = gross - discount;
    const tax = item.taxPercent ? afterDiscount * (item.taxPercent / 100) : 0;
    const lineTotal = afterDiscount + tax;

    subtotal += gross;
    discountTotal += discount;
    taxTotal += tax;
    lineTotals.push(round2(lineTotal));
  }

  return {
    lineTotals,
    subtotal: round2(subtotal),
    discountTotal: round2(discountTotal),
    taxTotal: round2(taxTotal),
    total: round2(subtotal - discountTotal + taxTotal),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function createClientQuotation(params: CreateQuotationParams): Promise<CreateQuotationResult> {
  const auth = await requireAdminActor();
  if (!auth.ok) return auth;

  if (!params.clientProfileId && !params.prospectName) {
    return { ok: false, error: "A quotation needs either a registered Client or a prospect name." };
  }
  if (params.clientProfileId && params.prospectName) {
    return { ok: false, error: "A quotation cannot have both a registered Client and a prospect name." };
  }
  if (params.items.length === 0) {
    return { ok: false, error: "A quotation needs at least one line item." };
  }

  const admin = createAdminClient();
  const { data: seqValue, error: seqError } = await admin.rpc("next_client_quotation_reference_seq");
  if (seqError || seqValue === null || seqValue === undefined) {
    return { ok: false, error: "Failed to generate a quotation reference." };
  }
  const quotationReference = formatQuotationReference(new Date().getFullYear(), Number(seqValue));

  const totals = computeQuotationTotals(params.items);

  const { data: quotation, error: insertError } = await admin
    .from("client_quotations")
    .insert({
      quotation_reference: quotationReference,
      client_profile_id: params.clientProfileId ?? null,
      prospect_name: params.prospectName ?? null,
      prospect_email: params.prospectEmail ?? null,
      prospect_phone: params.prospectPhone ?? null,
      prospect_company: params.prospectCompany ?? null,
      currency: params.currency,
      subtotal: totals.subtotal,
      discount_total: totals.discountTotal,
      tax_total: totals.taxTotal,
      total: totals.total,
      valid_until: params.validUntil ?? null,
      payment_booking_terms: params.paymentBookingTerms ?? null,
      commercial_notes: params.commercialNotes ?? null,
      created_by: auth.actorUserId,
    })
    .select("id")
    .single();
  if (insertError || !quotation) {
    console.error("[commercial] failed to create client_quotation", insertError?.message);
    return { ok: false, error: "Failed to create the quotation." };
  }

  const itemRows = params.items.map((item, i) => ({
    quotation_id: quotation.id,
    service_item: item.serviceItem,
    description: item.description ?? null,
    quantity: item.quantity,
    unit_basis: item.unitBasis,
    selling_rate: item.sellingRate,
    discount_percent: item.discountPercent ?? null,
    tax_percent: item.taxPercent ?? null,
    line_total: totals.lineTotals[i],
    sort_order: i,
    source_type: item.sourceType ?? "manual",
    source_reference: item.sourceReference ?? null,
  }));
  const { error: itemsError } = await admin.from("client_quotation_items").insert(itemRows);
  if (itemsError) {
    console.error("[commercial] failed to insert client_quotation_items", itemsError.message);
    return { ok: false, error: "Failed to save quotation line items." };
  }

  await logActivity({
    actorUserId: auth.actorUserId,
    action: "client_quotation.created",
    entityType: "client_quotation",
    entityId: quotation.id,
    metadata: { quotationReference, total: totals.total, currency: params.currency },
  });

  return { ok: true, quotationId: quotation.id, quotationReference };
}

export type ClientQuotationSummary = {
  id: string;
  quotationReference: string;
  clientProfileId: string | null;
  clientName: string | null;
  prospectName: string | null;
  prospectCompany: string | null;
  status: string;
  currency: string;
  total: number;
  validUntil: string | null;
  createdAt: string;
};

export async function listClientQuotations(): Promise<ClientQuotationSummary[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("client_quotations")
    .select("id, quotation_reference, client_profile_id, prospect_name, prospect_company, status, currency, total, valid_until, created_at, profiles!client_profile_id(full_name)")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[commercial] failed to list client_quotations", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    quotationReference: r.quotation_reference,
    clientProfileId: r.client_profile_id,
    clientName: (r.profiles as unknown as { full_name: string | null } | null)?.full_name ?? null,
    prospectName: r.prospect_name,
    prospectCompany: r.prospect_company,
    status: r.status,
    currency: r.currency,
    total: r.total,
    validUntil: r.valid_until,
    createdAt: r.created_at,
  }));
}

export type ClientQuotationDetail = ClientQuotationSummary & {
  prospectEmail: string | null;
  prospectPhone: string | null;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  paymentBookingTerms: string | null;
  commercialNotes: string | null;
  version: number;
  items: {
    id: string;
    serviceItem: string;
    description: string | null;
    quantity: number;
    unitBasis: string;
    sellingRate: number;
    discountPercent: number | null;
    taxPercent: number | null;
    lineTotal: number;
    sourceType: QuotationLineItemSourceType;
    sourceReference: string | null;
  }[];
};

export async function getClientQuotation(id: string): Promise<ClientQuotationDetail | null> {
  const admin = createAdminClient();
  const [{ data: quotation, error: quotationError }, { data: items, error: itemsError }] = await Promise.all([
    admin
      .from("client_quotations")
      .select(
        "id, quotation_reference, client_profile_id, prospect_name, prospect_email, prospect_phone, prospect_company, status, currency, subtotal, discount_total, tax_total, total, valid_until, payment_booking_terms, commercial_notes, version, created_at, profiles!client_profile_id(full_name)"
      )
      .eq("id", id)
      .maybeSingle(),
    admin
      .from("client_quotation_items")
      .select("id, service_item, description, quantity, unit_basis, selling_rate, discount_percent, tax_percent, line_total, source_type, source_reference")
      .eq("quotation_id", id)
      .order("sort_order", { ascending: true }),
  ]);
  // Production fix (2026-09-16) — a query error here (e.g. the
  // ambiguous-embed bug this same fix corrects) previously fell through
  // silently to `!quotation` -> null -> the page's own notFound(),
  // which read to a user as "my new quotation vanished" rather than a
  // genuine, debuggable error. Logged loudly now, same convention as
  // every other query in this codebase.
  if (quotationError) console.error("[commercial] failed to load client_quotation", quotationError.message);
  if (itemsError) console.error("[commercial] failed to load client_quotation_items", itemsError.message);
  if (!quotation) return null;

  return {
    id: quotation.id,
    quotationReference: quotation.quotation_reference,
    clientProfileId: quotation.client_profile_id,
    clientName: (quotation.profiles as unknown as { full_name: string | null } | null)?.full_name ?? null,
    prospectName: quotation.prospect_name,
    prospectCompany: quotation.prospect_company,
    prospectEmail: quotation.prospect_email,
    prospectPhone: quotation.prospect_phone,
    status: quotation.status,
    currency: quotation.currency,
    subtotal: quotation.subtotal,
    discountTotal: quotation.discount_total,
    taxTotal: quotation.tax_total,
    total: quotation.total,
    validUntil: quotation.valid_until,
    paymentBookingTerms: quotation.payment_booking_terms,
    commercialNotes: quotation.commercial_notes,
    version: quotation.version,
    createdAt: quotation.created_at,
    items: (items ?? []).map((i) => ({
      id: i.id,
      serviceItem: i.service_item,
      description: i.description,
      quantity: i.quantity,
      unitBasis: i.unit_basis,
      sellingRate: i.selling_rate,
      discountPercent: i.discount_percent,
      taxPercent: i.tax_percent,
      lineTotal: i.line_total,
      sourceType: i.source_type as QuotationLineItemSourceType,
      sourceReference: i.source_reference,
    })),
  };
}

const VALID_STATUS_TRANSITIONS: Record<string, readonly string[]> = {
  draft: ["sent", "superseded"],
  sent: ["accepted", "declined", "expired", "superseded"],
  accepted: [],
  declined: [],
  expired: [],
  superseded: [],
};

export function isValidQuotationStatusTransition(from: string, to: string): boolean {
  return (VALID_STATUS_TRANSITIONS[from] ?? []).includes(to);
}

export async function updateQuotationStatus(params: { quotationId: string; status: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireAdminActor();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data: current } = await admin.from("client_quotations").select("status").eq("id", params.quotationId).maybeSingle();
  if (!current) return { ok: false, error: "Quotation not found." };
  if (!isValidQuotationStatusTransition(current.status, params.status)) {
    return { ok: false, error: `Cannot move a quotation from ${current.status} to ${params.status}.` };
  }

  const { error } = await admin.from("client_quotations").update({ status: params.status }).eq("id", params.quotationId).eq("status", current.status);
  if (error) {
    console.error("[commercial] failed to update client_quotation status", error.message);
    return { ok: false, error: "Failed to update status." };
  }

  await logActivity({
    actorUserId: auth.actorUserId,
    action: "client_quotation.status_changed",
    entityType: "client_quotation",
    entityId: params.quotationId,
    metadata: { from: current.status, to: params.status },
  });
  return { ok: true };
}

// Associates an offline prospect's quotation with a genuine registered
// Client account WITHOUT creating a duplicate identity or a duplicate
// quotation — moves this exact row's ownership, preserves its full
// history (version/supersedes_id/created_at all untouched). Refuses if
// the quotation is already linked to a client (a real registered
// client's own quotation is never re-pointed to a different account).
export async function associateProspectQuotationWithClient(params: { quotationId: string; clientProfileId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireAdminActor();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data: current } = await admin.from("client_quotations").select("client_profile_id, prospect_name").eq("id", params.quotationId).maybeSingle();
  if (!current) return { ok: false, error: "Quotation not found." };
  if (current.client_profile_id) return { ok: false, error: "This quotation is already associated with a registered Client." };
  if (!current.prospect_name) return { ok: false, error: "This quotation has no prospect to associate." };

  const { error } = await admin
    .from("client_quotations")
    .update({ client_profile_id: params.clientProfileId, prospect_name: null, prospect_email: null, prospect_phone: null, prospect_company: null })
    .eq("id", params.quotationId)
    .is("client_profile_id", null);
  if (error) {
    console.error("[commercial] failed to associate quotation with client", error.message);
    return { ok: false, error: "Failed to associate the quotation with this Client." };
  }

  await logActivity({
    actorUserId: auth.actorUserId,
    action: "client_quotation.associated_with_client",
    entityType: "client_quotation",
    entityId: params.quotationId,
    metadata: { clientProfileId: params.clientProfileId, formerProspectName: current.prospect_name },
  });
  return { ok: true };
}
