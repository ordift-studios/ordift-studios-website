import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { getCurrentRate } from "@/lib/payments/currency";
import { computeQuotationTotals, insertQuotationItems, type QuotationLineItemInput } from "@/lib/commercial/clientQuotations";
import { formatQuotationReference } from "@/lib/commercial/quotationReference";
import { commitCrewSupportStatus, getCrewSupportDetail, syncEnquiryStage } from "./admin";
import { proposeQuoteLines, inclusiveDays, type ProposalRequirement } from "./quotePricing";
import { getActiveCrewSupportRates, getActiveModifierPercent } from "./rates";
import { notifyCrewSupportEvent } from "./notifications";
import { getCommitmentSnapshot } from "./commitmentData";
import { getAgreementWorkflowStatus } from "./agreementTemplates";
import { statusAfterCommercialAcceptance } from "./commitmentRules";
import { describePaymentCondition, validatePaymentCondition, type PaymentCondition } from "./paymentCondition";
import { buildProjectSnapshot, isProjectSnapshot, snapshotGap, type ProjectSnapshot } from "./quotationSnapshot";
import { SERVICE_FAMILIES } from "./config";
import { canMarkReady, toClientQuotationView, validateAcceptance, validateAndResolveLines, validateStaffAcceptance, type ClientQuotationView, type EditableLine, type ResolvedLine } from "./quotationRules";

// Crew Support quotation workflow (Phase 2). Callers MUST have checked
// canManageCrewSupport() (admin actions) or ownership (client acceptance).
// Selling price only — no crew cost, pay or margin is read or written here.

type Result<T = object> = ({ ok: true; warnings?: string[] } & T) | { ok: false; error: string };

export type QuotationAdminView = {
  id: string;
  reference: string;
  status: "draft" | "ready" | "sent" | "accepted" | "declined" | "expired" | "superseded";
  currency: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  validUntil: string | null;
  terms: string | null;
  internalNotes: string | null;
  fxCurrency: string | null;
  fxRate: number | null;
  fxLockedAt: string | null;
  usdTotal: number | null;
  issuedAt: string | null;
  acceptedAt: string | null;
  acceptedVia: "client_portal" | "staff_recorded" | null;
  acceptanceChannel: string | null;
  acceptanceEvidence: string | null;
  acceptedByName: string | null;
  acceptanceReceivedAt: string | null;
  isTest: boolean;
  version: number;
  isVariation: boolean;
  supersedesId: string | null;
  paymentCondition: "none" | "deposit" | "full";
  depositPercent: number | null;
  enquiryId: string;
  requestId: string;
  lines: (EditableLine & { id: string; sourceType: string; noGovernedRate: boolean; lineTotal: number })[];
};

const QUOTE_COLUMNS =
  "id, quotation_reference, status, currency, subtotal, discount_total, tax_total, total, valid_until, payment_booking_terms, commercial_notes, fx_currency, fx_rate_to_usd, fx_locked_at, usd_total, issued_at, accepted_at, accepted_via, acceptance_channel, acceptance_evidence, accepted_by_name, acceptance_received_at, is_test, enquiry_id, crew_support_request_id, version, is_variation, supersedes_id, payment_condition, deposit_percent";

// The quotation that is IN FORCE or being worked on for a request: the
// live original (draft / ready / issued / accepted); if the original has
// been replaced by an accepted variation, that variation. A pending
// variation is separate (getCrewSupportVariation).
export async function getCrewSupportQuotation(requestId: string): Promise<QuotationAdminView | null> {
  const admin = createAdminClient();
  const { data: rows } = await admin.from("client_quotations").select(QUOTE_COLUMNS).eq("crew_support_request_id", requestId).in("status", ["draft", "ready", "sent", "accepted"]).order("created_at", { ascending: false });
  const list = (rows ?? []) as unknown as Record<string, unknown>[];
  const original = list.find((r) => !r.is_variation);
  const acceptedVariation = list.find((r) => r.is_variation && r.status === "accepted");
  const chosen = original ?? acceptedVariation;
  return chosen ? buildQuotationView(chosen) : null;
}

// A replacement quotation proposed after the original was accepted — not
// yet in force until the client accepts it.
export async function getCrewSupportVariation(requestId: string): Promise<QuotationAdminView | null> {
  const { data } = await createAdminClient().from("client_quotations").select(QUOTE_COLUMNS).eq("crew_support_request_id", requestId).eq("is_variation", true).in("status", ["draft", "ready", "sent"]).maybeSingle();
  return data ? buildQuotationView(data as unknown as Record<string, unknown>) : null;
}

async function buildQuotationView(q: Record<string, unknown>): Promise<QuotationAdminView> {
  const admin = createAdminClient();
  const { data: items } = await admin
    .from("client_quotation_items")
    .select("id, requirement_id, service_item, description, quantity, unit_basis, selling_rate, discount_percent, tax_percent, line_total, source_type, source_reference, governed_unit_price, adjustment_reason, no_governed_rate")
    .eq("quotation_id", q.id as string)
    .order("sort_order");
  return {
    id: q.id as string,
    reference: q.quotation_reference as string,
    status: q.status as QuotationAdminView["status"],
    currency: q.currency as string,
    subtotal: Number(q.subtotal),
    discountTotal: Number(q.discount_total),
    taxTotal: Number(q.tax_total),
    total: Number(q.total),
    validUntil: (q.valid_until as string | null) ?? null,
    terms: (q.payment_booking_terms as string | null) ?? null,
    internalNotes: (q.commercial_notes as string | null) ?? null,
    fxCurrency: (q.fx_currency as string | null) ?? null,
    fxRate: q.fx_rate_to_usd === null ? null : Number(q.fx_rate_to_usd),
    fxLockedAt: (q.fx_locked_at as string | null) ?? null,
    usdTotal: q.usd_total === null ? null : Number(q.usd_total),
    issuedAt: (q.issued_at as string | null) ?? null,
    acceptedAt: (q.accepted_at as string | null) ?? null,
    acceptedVia: (q.accepted_via as QuotationAdminView["acceptedVia"]) ?? null,
    acceptanceChannel: (q.acceptance_channel as string | null) ?? null,
    acceptanceEvidence: (q.acceptance_evidence as string | null) ?? null,
    acceptedByName: (q.accepted_by_name as string | null) ?? null,
    acceptanceReceivedAt: (q.acceptance_received_at as string | null) ?? null,
    isTest: Boolean(q.is_test),
    version: Number(q.version ?? 1),
    isVariation: Boolean(q.is_variation),
    supersedesId: (q.supersedes_id as string | null) ?? null,
    paymentCondition: ((q.payment_condition as string | undefined) ?? "none") as QuotationAdminView["paymentCondition"],
    depositPercent: q.deposit_percent == null ? null : Number(q.deposit_percent),
    enquiryId: q.enquiry_id as string,
    requestId: q.crew_support_request_id as string,
    lines: (items ?? []).map((i) => ({
      id: i.id as string,
      requirementId: (i.requirement_id as string | null) ?? null,
      serviceItem: i.service_item as string,
      description: (i.description as string | null) ?? "",
      quantity: Number(i.quantity),
      unitBasis: i.unit_basis as string,
      sellingRate: Number(i.selling_rate),
      discountPercent: i.discount_percent === null ? null : Number(i.discount_percent),
      taxPercent: i.tax_percent === null ? null : Number(i.tax_percent),
      governedUnitPrice: i.governed_unit_price === null ? null : Number(i.governed_unit_price),
      adjustmentReason: (i.adjustment_reason as string | null) ?? "",
      sourceReference: (i.source_reference as string | null) ?? null,
      sourceType: i.source_type as string,
      noGovernedRate: Boolean(i.no_governed_rate),
      lineTotal: Number(i.line_total),
    })),
  };
}

function toItemInputs(lines: ResolvedLine[]): QuotationLineItemInput[] {
  return lines.map((l) => ({
    serviceItem: l.serviceItem.trim(),
    description: l.description.trim() || null,
    quantity: l.quantity,
    unitBasis: l.unitBasis,
    sellingRate: l.sellingRate,
    discountPercent: l.discountPercent,
    taxPercent: l.taxPercent,
    sourceType: l.sourceType,
    sourceReference: l.sourceReference,
    requirementId: l.requirementId,
    governedUnitPrice: l.governedUnitPrice,
    adjustmentReason: l.adjustmentReason.trim() || null,
    noGovernedRate: l.noGovernedRate,
  }));
}

// ---------------------------------------------------------------- prepare
export async function prepareCrewSupportQuotation(params: { requestId: string; marketSlug: string; actorUserId: string }): Promise<Result<{ quotationId: string }>> {
  const detail = await getCrewSupportDetail(params.requestId);
  if (!detail) return { ok: false, error: "Request not found." };
  const status = detail.request.status;
  if (status !== "availability_review" && status !== "quote_preparation") return { ok: false, error: "A quotation can be prepared once the request is in Availability review." };
  if (await getCrewSupportQuotation(params.requestId)) return { ok: false, error: "This request already has a quotation." };

  const admin = createAdminClient();
  const { data: market } = await admin.from("pricing_markets").select("id, name, slug").eq("slug", params.marketSlug).eq("active", true).maybeSingle();
  if (!market) return { ok: false, error: "Choose a pricing market for this quotation." };
  const { data: enquiry } = await admin.from("enquiries").select("id, user_id").eq("id", detail.request.enquiry_id).maybeSingle();
  if (!enquiry) return { ok: false, error: "The linked enquiry could not be found." };

  const r = detail.request as Record<string, unknown>;
  const requirements: ProposalRequirement[] = detail.requirements.map((q) => ({ id: q.id, titleId: q.operational_title_id, roleLabel: q.role_label, quantity: q.quantity }));
  const rates = await getActiveCrewSupportRates(params.marketSlug);
  const urgent = r.urgency === "urgent";
  const urgentPct = urgent ? await getActiveModifierPercent("urgent_uplift_percent", params.marketSlug) : null;
  const proposed = proposeQuoteLines({ requirements, days: inclusiveDays(String(r.start_date), String(r.end_date)), rates, marketName: market.name as string, urgent, urgentUpliftPercent: urgentPct });
  const items: QuotationLineItemInput[] = proposed.map((p) => ({
    serviceItem: p.serviceItem, description: p.description, quantity: p.quantity, unitBasis: p.unitBasis, sellingRate: p.sellingRate, sourceType: p.sourceType, sourceReference: p.sourceReference,
    requirementId: p.requirementId, governedUnitPrice: p.governedUnitPrice, adjustmentReason: null, noGovernedRate: p.noGovernedRate,
  }));
  const totals = computeQuotationTotals(items);

  const { data: seq, error: seqError } = await admin.rpc("next_client_quotation_reference_seq");
  if (seqError || seq === null || seq === undefined) return { ok: false, error: "Failed to generate a quotation reference." };
  const reference = formatQuotationReference(new Date().getFullYear(), Number(seq));

  const { data: quote, error } = await admin
    .from("client_quotations")
    .insert({
      quotation_reference: reference,
      client_profile_id: enquiry.user_id ?? null,
      prospect_name: enquiry.user_id ? null : (r.requester_name as string),
      prospect_email: enquiry.user_id ? null : (r.requester_email as string),
      prospect_phone: enquiry.user_id ? null : (r.requester_phone as string),
      prospect_company: enquiry.user_id ? null : ((r.requester_company as string | null) ?? null),
      currency: "USD",
      subtotal: totals.subtotal, discount_total: totals.discountTotal, tax_total: totals.taxTotal, total: totals.total,
      enquiry_id: enquiry.id, crew_support_request_id: params.requestId, is_test: Boolean(r.is_test), created_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !quote) {
    console.error("[crew-support] failed to create quotation", error?.message);
    return { ok: false, error: "Failed to create the quotation (is one already in progress for this request?)." };
  }
  const itemsResult = await insertQuotationItems(admin, quote.id as string, items, totals);
  if (!itemsResult.ok) {
    await admin.from("client_quotations").delete().eq("id", quote.id).eq("status", "draft");
    return { ok: false, error: itemsResult.error };
  }
  await logActivity({ actorUserId: params.actorUserId, action: "crew_support.quotation_prepared", entityType: "crew_support_request", entityId: params.requestId, metadata: { quotationId: quote.id, quotationReference: reference, market: params.marketSlug, governedLines: proposed.filter((p) => p.sourceType === "pricing").length, manualLines: proposed.filter((p) => p.noGovernedRate).length } });

  const warnings: string[] = [];
  if (status === "availability_review") {
    const moved = await commitCrewSupportStatus({ requestId: params.requestId, from: "availability_review", to: "quote_preparation", actorUserId: params.actorUserId, automatic: true, reason: "Quotation prepared" });
    if (!moved.ok) warnings.push(`The quotation was created, but the request status could not be updated: ${moved.error}`);
  }
  return { ok: true, quotationId: quote.id as string, warnings };
}

// ------------------------------------------------------------------ draft
export async function saveCrewSupportQuotationDraft(params: { quotationId: string; lines: EditableLine[]; validUntil: string | null; terms: string | null; internalNotes: string | null; fxCurrency: string | null; paymentCondition?: string; depositPercent?: number | null; actorUserId: string }): Promise<Result> {
  const admin = createAdminClient();
  const { data: q } = await admin.from("client_quotations").select("id, status, quotation_reference, crew_support_request_id").eq("id", params.quotationId).maybeSingle();
  if (!q || !q.crew_support_request_id) return { ok: false, error: "Quotation not found." };
  if (q.status !== "draft") return { ok: false, error: "Only a draft can be edited. Return it to draft first." };
  const resolved = validateAndResolveLines(params.lines);
  if (!resolved.ok) return resolved;
  const condition = validatePaymentCondition({ condition: params.paymentCondition ?? "none", depositPercent: params.depositPercent ?? null });
  if (!condition.ok) return { ok: false, error: condition.reason };

  let fxCurrency: string | null = params.fxCurrency && params.fxCurrency !== "USD" ? params.fxCurrency : null;
  if (fxCurrency) {
    const { data: cur } = await admin.from("currencies").select("code").eq("code", fxCurrency).eq("is_active", true).maybeSingle();
    if (!cur) fxCurrency = null;
  }
  const items = toItemInputs(resolved.lines);
  const totals = computeQuotationTotals(items);

  const { data: oldItems } = await admin.from("client_quotation_items").select("*").eq("quotation_id", params.quotationId);
  const { error: delError } = await admin.from("client_quotation_items").delete().eq("quotation_id", params.quotationId);
  if (delError) return { ok: false, error: "Could not save the quotation lines. Please try again." };
  const inserted = await insertQuotationItems(admin, params.quotationId, items, totals);
  if (!inserted.ok) {
    if (oldItems?.length) await admin.from("client_quotation_items").insert(oldItems.map((o) => { const { created_at: _c, ...rest } = o as Record<string, unknown>; void _c; return rest; }));
    return { ok: false, error: "Could not save the quotation lines — your previous version was kept." };
  }
  const { error } = await admin.from("client_quotations").update({
    subtotal: totals.subtotal, discount_total: totals.discountTotal, tax_total: totals.taxTotal, total: totals.total,
    valid_until: params.validUntil || null, payment_booking_terms: params.terms?.trim() || null, commercial_notes: params.internalNotes?.trim() || null, fx_currency: fxCurrency, payment_condition: condition.condition, deposit_percent: condition.depositPercent, updated_at: new Date().toISOString(),
  }).eq("id", params.quotationId).eq("status", "draft");
  if (error) return { ok: false, error: "Could not save the quotation. Please try again." };

  const adjusted = resolved.lines.filter((l) => l.sourceType === "adjusted").map((l) => ({ item: l.serviceItem, governed: l.governedUnitPrice, selling: l.sellingRate, reason: l.adjustmentReason.trim() }));
  await logActivity({ actorUserId: params.actorUserId, action: "crew_support.quotation_saved", entityType: "crew_support_request", entityId: q.crew_support_request_id as string, metadata: { quotationId: params.quotationId, quotationReference: q.quotation_reference, total: totals.total, overrides: adjusted, manualLines: resolved.lines.filter((l) => l.noGovernedRate).length } });
  return { ok: true };
}

export async function discardCrewSupportQuotationDraft(params: { quotationId: string; actorUserId: string }): Promise<Result> {
  const admin = createAdminClient();
  const { data: q } = await admin.from("client_quotations").select("status, quotation_reference, crew_support_request_id").eq("id", params.quotationId).maybeSingle();
  if (!q?.crew_support_request_id) return { ok: false, error: "Quotation not found." };
  if (q.status !== "draft") return { ok: false, error: "Only a draft that was never issued can be discarded." };
  const { error } = await admin.from("client_quotations").delete().eq("id", params.quotationId).eq("status", "draft");
  if (error) return { ok: false, error: "Could not discard the draft." };
  await logActivity({ actorUserId: params.actorUserId, action: "crew_support.quotation_discarded", entityType: "crew_support_request", entityId: q.crew_support_request_id as string, metadata: { quotationReference: q.quotation_reference } });
  return { ok: true };
}

// ------------------------------------------------------------ ready/issue
// The client-visible event details for this request, built from the
// request itself (so nothing is typed twice). Frozen onto the quotation at
// issue; also used live while the quotation is still a draft.
export async function projectSnapshotForRequest(requestId: string): Promise<ProjectSnapshot | null> {
  const detail = await getCrewSupportDetail(requestId);
  if (!detail) return null;
  const family = SERVICE_FAMILIES.find((f) => f.value === String(detail.request.service_family));
  return buildProjectSnapshot(detail.request, detail.requirements, `Creative Crew Support — ${family?.label ?? String(detail.request.service_family)}`);
}

// A quotation must not be sent to a client while the request depends on a
// separate agreement that the platform cannot produce — the client would
// accept into a dead end. Returns the reason, or null if it is fine.
async function agreementDeadEnd(requestId: string): Promise<string | null> {
  const { data } = await createAdminClient().from("crew_support_requests").select("agreement_required, agreement_required_reason").eq("id", requestId).maybeSingle();
  if (!data?.agreement_required) return null;
  const workflow = await getAgreementWorkflowStatus().catch(() => null);
  if (workflow && workflow.available) return null;
  return `This request is marked as needing a separate agreement${data.agreement_required_reason ? ` (${data.agreement_required_reason})` : ""}, but ${workflow ? workflow.explanation : "the agreement templates could not be checked."} Clear the requirement (Commitment readiness) before issuing.`;
}

export async function markQuotationReady(params: { quotationId: string; actorUserId: string }): Promise<Result> {
  const quote = await adminQuotationById(params.quotationId);
  if (!quote) return { ok: false, error: "Quotation not found." };
  const deadEnd = await agreementDeadEnd(quote.requestId);
  if (deadEnd) return { ok: false, error: deadEnd };
  const snapshot = await projectSnapshotForRequest(quote.requestId);
  const check = canMarkReady({ status: quote.status, total: quote.total, lineCount: quote.lines.length, validUntil: quote.validUntil, today: new Date().toISOString().slice(0, 10), terms: quote.terms, eventGap: snapshot ? snapshotGap(snapshot) : "the request details could not be loaded" });
  if (!check.ok) return { ok: false, error: check.reason };
  const resolved = validateAndResolveLines(quote.lines);
  if (!resolved.ok) return resolved;
  const { data, error } = await createAdminClient().from("client_quotations").update({ status: "ready", reviewed_at: new Date().toISOString(), reviewed_by: params.actorUserId, updated_at: new Date().toISOString() }).eq("id", params.quotationId).eq("status", "draft").select("id");
  if (error || !data?.length) return { ok: false, error: "The quotation changed — refresh and try again." };
  await logActivity({ actorUserId: params.actorUserId, action: "crew_support.quotation_ready", entityType: "crew_support_request", entityId: quote.requestId, metadata: { quotationId: quote.id, quotationReference: quote.reference, total: quote.total } });
  return { ok: true };
}

// A material change to an ISSUED (not yet accepted) quotation is a NEW
// VERSION, never an edit: the issued row is kept as 'superseded' (with its
// frozen terms and event details), a new draft is created copying its
// lines/terms with version + 1 and supersedes_id set, and the request goes
// back to Quote preparation until the new version is issued. An accepted
// quotation is never revised here — it is a signed-off commercial record.
export async function reviseCrewSupportQuotation(params: { quotationId: string; actorUserId: string }): Promise<Result<{ quotationId: string; reference: string }>> {
  const quote = await adminQuotationById(params.quotationId);
  if (!quote) return { ok: false, error: "Quotation not found." };
  if (quote.status === "accepted") return { ok: false, error: "This quotation has been accepted and can't be revised. Cancel the request and start a new one, or have Finance handle an adjustment — the accepted record is preserved." };
  if (quote.status !== "sent") return { ok: false, error: quote.status === "draft" || quote.status === "ready" ? "This quotation hasn't been issued — edit it directly." : `A ${quote.status} quotation can't be revised.` };
  const detail = await getCrewSupportDetail(quote.requestId);
  if (!detail) return { ok: false, error: "Request not found." };
  if (quote.isVariation) {
    if (["declined", "cancelled", "completed"].includes(detail.request.status)) return { ok: false, error: "This request is closed." };
  } else if (detail.request.status !== "quoted") {
    return { ok: false, error: "Only a request in “Quote issued” can have its quotation revised." };
  }

  const admin = createAdminClient();
  const { data: original } = await admin.from("client_quotations").select("client_profile_id, prospect_name, prospect_email, prospect_phone, prospect_company, currency, version, is_test").eq("id", quote.id).maybeSingle();
  if (!original) return { ok: false, error: "Quotation not found." };
  const { data: seq, error: seqError } = await admin.rpc("next_client_quotation_reference_seq");
  if (seqError || seq === null || seq === undefined) return { ok: false, error: "Failed to generate a quotation reference." };
  const reference = formatQuotationReference(new Date().getFullYear(), Number(seq));

  // Supersede the issued version FIRST (only one live quotation may exist per request).
  const now = new Date().toISOString();
  const { data: superseded, error: supError } = await admin.from("client_quotations").update({ status: "superseded", updated_at: now }).eq("id", quote.id).eq("status", "sent").select("id");
  if (supError || !superseded?.length) return { ok: false, error: "The quotation changed — refresh and try again." };

  const items: QuotationLineItemInput[] = quote.lines.map((l) => ({
    serviceItem: l.serviceItem, description: l.description, quantity: l.quantity, unitBasis: l.unitBasis, sellingRate: l.sellingRate, discountPercent: l.discountPercent, taxPercent: l.taxPercent,
    sourceType: l.sourceType as QuotationLineItemInput["sourceType"], sourceReference: l.sourceReference, requirementId: l.requirementId, governedUnitPrice: l.governedUnitPrice, adjustmentReason: l.adjustmentReason || null, noGovernedRate: l.noGovernedRate,
  }));
  const totals = computeQuotationTotals(items);
  const { data: revision, error } = await admin.from("client_quotations").insert({
    quotation_reference: reference,
    client_profile_id: original.client_profile_id, prospect_name: original.prospect_name, prospect_email: original.prospect_email, prospect_phone: original.prospect_phone, prospect_company: original.prospect_company,
    currency: original.currency, subtotal: totals.subtotal, discount_total: totals.discountTotal, tax_total: totals.taxTotal, total: totals.total,
    valid_until: null, payment_booking_terms: quote.terms, commercial_notes: quote.internalNotes,
    payment_condition: quote.paymentCondition, deposit_percent: quote.depositPercent,
    version: Number(original.version) + 1, supersedes_id: quote.isVariation ? quote.supersedesId : quote.id, is_variation: quote.isVariation,
    enquiry_id: quote.enquiryId, crew_support_request_id: quote.requestId, is_test: Boolean(original.is_test), created_by: params.actorUserId,
  }).select("id").single();
  const itemsResult = revision ? await insertQuotationItems(admin, revision.id as string, items, totals) : ({ ok: false, error: "insert failed" } as const);
  if (error || !revision || !itemsResult.ok) {
    // Compensate: put the issued version back so the client's quotation is not lost.
    if (revision) await admin.from("client_quotations").delete().eq("id", revision.id).eq("status", "draft");
    await admin.from("client_quotations").update({ status: "sent", updated_at: new Date().toISOString() }).eq("id", quote.id).eq("status", "superseded");
    console.error("[crew-support] failed to create quotation revision", error?.message);
    return { ok: false, error: "Could not create the new version; the issued quotation was left unchanged." };
  }

  // Revising an original returns the request to Quote preparation; revising
  // a pending variation leaves the request exactly where it is.
  const moved = quote.isVariation ? ({ ok: true } as const) : await commitCrewSupportStatus({ requestId: quote.requestId, from: "quoted", to: "quote_preparation", actorUserId: params.actorUserId, automatic: true, reason: `Quotation ${quote.reference} revised as ${reference}` });
  await logActivity({ actorUserId: params.actorUserId, action: "crew_support.quotation_revised", entityType: "crew_support_request", entityId: quote.requestId, metadata: { supersededQuotationId: quote.id, supersededReference: quote.reference, newQuotationId: revision.id, newReference: reference, version: Number(original.version) + 1 } });
  return { ok: true, quotationId: revision.id as string, reference, warnings: moved.ok ? [] : [`Request status: ${moved.error}`] };
}

export async function returnQuotationToDraft(params: { quotationId: string; actorUserId: string }): Promise<Result> {
  const quote = await adminQuotationById(params.quotationId);
  if (!quote || quote.status !== "ready") return { ok: false, error: "Only a ready quotation can be returned to draft." };
  const { data, error } = await createAdminClient().from("client_quotations").update({ status: "draft", reviewed_at: null, reviewed_by: null, updated_at: new Date().toISOString() }).eq("id", params.quotationId).eq("status", "ready").select("id");
  if (error || !data?.length) return { ok: false, error: "The quotation changed — refresh and try again." };
  await logActivity({ actorUserId: params.actorUserId, action: "crew_support.quotation_returned_to_draft", entityType: "crew_support_request", entityId: quote.requestId, metadata: { quotationId: quote.id, quotationReference: quote.reference } });
  return { ok: true };
}

async function adminQuotationById(quotationId: string): Promise<QuotationAdminView | null> {
  const { data } = await createAdminClient().from("client_quotations").select(QUOTE_COLUMNS).eq("id", quotationId).not("crew_support_request_id", "is", null).maybeSingle();
  return data ? buildQuotationView(data as unknown as Record<string, unknown>) : null;
}

export async function issueCrewSupportQuotation(params: { quotationId: string; actorUserId: string }): Promise<Result> {
  const quote = await adminQuotationById(params.quotationId);
  if (!quote) return { ok: false, error: "Quotation not found." };
  if (quote.status !== "ready") return { ok: false, error: "Only a quotation marked Ready can be issued." };
  const detail = await getCrewSupportDetail(quote.requestId);
  if (!detail) return { ok: false, error: "Request not found." };
  if (quote.isVariation) {
    if (["declined", "cancelled", "completed"].includes(detail.request.status)) return { ok: false, error: "This request is closed — a variation can't be issued." };
  } else if (detail.request.status !== "quote_preparation") {
    return { ok: false, error: "The request must be in Quote preparation to issue its quotation." };
  }

  let fxRate: number | null = null;
  if (quote.fxCurrency) {
    fxRate = await getCurrentRate(quote.fxCurrency);
    if (!fxRate) return { ok: false, error: `No exchange rate is configured for ${quote.fxCurrency}. Remove the local-currency display or add a rate first.` };
  }
  const deadEnd = await agreementDeadEnd(quote.requestId);
  if (deadEnd) return { ok: false, error: deadEnd };
  // Freeze the event details being quoted for. Issuing is blocked if the
  // request no longer carries them (a gap must be fixed, not guessed).
  const projectSnapshot = await projectSnapshotForRequest(quote.requestId);
  const gap = projectSnapshot ? snapshotGap(projectSnapshot) : "the request details could not be loaded";
  if (gap) return { ok: false, error: `The quotation can't be issued because ${gap} on the request.` };
  const now = new Date().toISOString();
  const { data, error } = await createAdminClient().from("client_quotations").update({
    status: "sent", issued_at: now, issued_by: params.actorUserId, usd_total: quote.total, fx_rate_to_usd: fxRate, fx_locked_at: fxRate ? now : null, project_snapshot: projectSnapshot, updated_at: now,
  }).eq("id", params.quotationId).eq("status", "ready").select("id");
  if (error || !data?.length) return { ok: false, error: "The quotation changed — refresh and try again." };
  await logActivity({ actorUserId: params.actorUserId, action: "crew_support.quotation_issued", entityType: "crew_support_request", entityId: quote.requestId, metadata: { quotationId: quote.id, quotationReference: quote.reference, total: quote.total, fxCurrency: quote.fxCurrency, fxRate } });
  return completeIssue({ quotationId: params.quotationId, actorUserId: params.actorUserId });
}

// Idempotent: safe to run again to finish a partially-synchronised issue.
export async function completeIssue(params: { quotationId: string; actorUserId: string | null }): Promise<Result> {
  const quote = await adminQuotationById(params.quotationId);
  if (!quote || (quote.status !== "sent" && quote.status !== "accepted")) return { ok: false, error: "This quotation hasn't been issued." };
  const detail = await getCrewSupportDetail(quote.requestId);
  if (!detail) return { ok: false, error: "Request not found." };
  const warnings: string[] = [];

  // A variation is issued to a request that is already past quoting: it
  // changes neither the request status nor the CRM stage.
  if (!quote.isVariation && detail.request.status === "quote_preparation") {
    const moved = await commitCrewSupportStatus({ requestId: quote.requestId, from: "quote_preparation", to: "quoted", actorUserId: params.actorUserId, automatic: true, reason: `Quotation ${quote.reference} issued` });
    if (!moved.ok) warnings.push(`Request status: ${moved.error}`);
  }
  if (!quote.isVariation) await syncEnquiryStage({ enquiryId: quote.enquiryId, event: "quote_issued", actorUserId: params.actorUserId, requestId: quote.requestId });
  const local = quote.fxCurrency && quote.fxRate && quote.usdTotal != null ? `about ${quote.fxCurrency} ${(Math.round(quote.usdTotal * quote.fxRate * 100) / 100).toFixed(2)}, at an exchange rate fixed when the quotation was issued` : undefined;
  await notifyCrewSupportEvent({
    requestId: quote.requestId, eventKey: `quote_issued:${quote.id}`, template: "quote_issued", triggeredBy: params.actorUserId,
    extraVars: { quotationReference: quote.reference, totalText: `USD ${(quote.usdTotal ?? quote.total).toFixed(2)}`, localEquivalentText: local, validUntil: quote.validUntil },
  });
  return { ok: true, warnings };
}

// ------------------------------------------------------------- acceptance
type Acceptance =
  | { via: "client_portal"; userId: string }
  | { via: "staff_recorded"; actorUserId: string; channel: string; evidence: string; acceptedByName: string; receivedAtIso: string };

async function finalizeAcceptance(quote: QuotationAdminView, acceptance: Acceptance): Promise<Result<{ alreadyAccepted?: boolean }>> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const update: Record<string, unknown> =
    acceptance.via === "client_portal"
      ? { status: "accepted", accepted_at: now, accepted_via: "client_portal", accepted_by_profile_id: acceptance.userId, updated_at: now }
      : { status: "accepted", accepted_at: now, accepted_via: "staff_recorded", acceptance_channel: acceptance.channel, acceptance_evidence: acceptance.evidence.trim(), accepted_by_name: acceptance.acceptedByName.trim(), acceptance_received_at: acceptance.receivedAtIso, acceptance_recorded_by: acceptance.actorUserId, updated_at: now };
  const { data, error } = await admin.from("client_quotations").update(update).eq("id", quote.id).eq("status", "sent").select("id");
  if (error) return { ok: false, error: "Could not record the acceptance. Please try again." };
  if (!data?.length) return { ok: true, alreadyAccepted: true };

  await logActivity({
    actorUserId: acceptance.via === "client_portal" ? acceptance.userId : acceptance.actorUserId,
    action: "crew_support.quotation_accepted", entityType: "crew_support_request", entityId: quote.requestId,
    metadata: acceptance.via === "client_portal"
      ? { quotationId: quote.id, quotationReference: quote.reference, via: "client_portal", summary: "Accepted directly by the client in the portal" }
      : { quotationId: quote.id, quotationReference: quote.reference, via: "staff_recorded", channel: acceptance.channel, evidence: acceptance.evidence.trim(), acceptedByName: acceptance.acceptedByName.trim(), receivedAt: acceptance.receivedAtIso, recordedBy: acceptance.actorUserId, summary: `Acceptance recorded by staff on behalf of the client (${acceptance.channel})` },
  });
  const done = await completeAcceptance({ quotationId: quote.id, actorUserId: acceptance.via === "client_portal" ? acceptance.userId : acceptance.actorUserId });
  return done.ok ? { ok: true, warnings: done.warnings } : done;
}

export async function acceptQuotationAsClient(params: { quotationId: string; userId: string }): Promise<Result<{ alreadyAccepted?: boolean }>> {
  const quote = await adminQuotationById(params.quotationId);
  if (!quote) return { ok: false, error: "Quotation not found." };
  const { data: enquiry } = await createAdminClient().from("enquiries").select("user_id").eq("id", quote.enquiryId).maybeSingle();
  if (!enquiry || enquiry.user_id !== params.userId) return { ok: false, error: "Quotation not found." };
  const check = validateAcceptance({ status: quote.status, validUntil: quote.validUntil, today: new Date().toISOString().slice(0, 10) });
  if (!check.ok) return quote.status === "accepted" ? { ok: true, alreadyAccepted: true } : { ok: false, error: check.reason };
  return finalizeAcceptance(quote, { via: "client_portal", userId: params.userId });
}

export async function recordStaffAcceptance(params: { quotationId: string; channel: string; evidence: string; acceptedByName: string; receivedAt: string; actorUserId: string }): Promise<Result<{ alreadyAccepted?: boolean }>> {
  const quote = await adminQuotationById(params.quotationId);
  if (!quote) return { ok: false, error: "Quotation not found." };
  const status = validateAcceptance({ status: quote.status, validUntil: quote.validUntil, today: new Date().toISOString().slice(0, 10) });
  if (!status.ok) return { ok: false, error: status.reason };
  const staff = validateStaffAcceptance({ channel: params.channel, evidence: params.evidence, acceptedByName: params.acceptedByName, receivedAt: params.receivedAt, now: new Date(), issuedAt: quote.issuedAt });
  if (!staff.ok) return { ok: false, error: staff.reason };
  return finalizeAcceptance(quote, { via: "staff_recorded", actorUserId: params.actorUserId, channel: params.channel, evidence: params.evidence, acceptedByName: params.acceptedByName, receivedAtIso: staff.receivedAtIso });
}

// THE single writer of amount_due for Crew Support enquiries: the accepted
// quotation's USD total, recorded WITH its provenance (amount_due_source =
// accepted_quotation, amount_due_quotation_id = this quotation). Idempotent:
// a retry converges to the same state, never overwrites the amount of a
// different quotation, and never creates a second receivable (amount_due is
// one value on the enquiry, written only by a conditional update).
export async function completeAcceptance(params: { quotationId: string; actorUserId: string | null }): Promise<Result> {
  const quote = await adminQuotationById(params.quotationId);
  if (!quote || quote.status !== "accepted") return { ok: false, error: "This quotation hasn't been accepted." };
  if (quote.usdTotal == null) return { ok: false, error: "The accepted quotation has no USD reference total." };
  const admin = createAdminClient();
  const warnings: string[] = [];

  if (quote.isVariation) {
    const reassigned = await applyAcceptedVariation(quote, params.actorUserId);
    if (!reassigned.ok) return reassigned;
    warnings.push(...reassigned.warnings);
  } else {
    const { data: current } = await admin.from("enquiries").select("amount_due, amount_due_quotation_id").eq("id", quote.enquiryId).maybeSingle();
    if (current?.amount_due_quotation_id && current.amount_due_quotation_id !== quote.id) {
      warnings.push("The amount due is already established by a different accepted quotation and was left unchanged.");
    } else {
      const { data: changed, error } = await admin
        .from("enquiries")
        .update({ amount_due: quote.usdTotal, amount_due_source: "accepted_quotation", amount_due_quotation_id: quote.id })
        .eq("id", quote.enquiryId)
        .or(`amount_due_quotation_id.is.null,amount_due_quotation_id.eq.${quote.id}`)
        .or(`amount_due.is.null,amount_due.neq.${quote.usdTotal},amount_due_quotation_id.is.null`)
        .select("id");
      if (error) return { ok: false, error: "The quotation was accepted but the amount due could not be set. Use “Complete acceptance” to retry." };
      if (changed?.length) {
        await logActivity({ actorUserId: params.actorUserId, action: "enquiry.amount_due_set", entityType: "enquiry", entityId: quote.enquiryId, metadata: { amountDue: quote.usdTotal, source: "accepted_quotation", quotationId: quote.id, quotationReference: quote.reference } });
      }
    }

  }

  // Where does the request go next? Conditional agreement: with no separate
  // agreement required, the accepted quotation + its terms are the contract
  // and the request moves straight on to payment; if an agreement is
  // required it waits in agreement_pending until that agreement is executed.
  const detail = await getCrewSupportDetail(quote.requestId);
  if (!quote.isVariation && detail?.request.status === "quoted") {
    const snapshot = await getCommitmentSnapshot(quote.requestId);
    const target = snapshot ? statusAfterCommercialAcceptance(snapshot.agreementAssessment) : "agreement_pending";
    const reason = target === "payment_pending" ? `Quotation ${quote.reference} accepted; no separate agreement required — the accepted quotation and its terms are the contract` : `Quotation ${quote.reference} accepted; a separate agreement is required`;
    const moved = await commitCrewSupportStatus({ requestId: quote.requestId, from: "quoted", to: target, actorUserId: params.actorUserId, automatic: true, reason });
    if (!moved.ok) warnings.push(`Request status: ${moved.error}`);
  }
  await notifyCrewSupportEvent({ requestId: quote.requestId, eventKey: `quote_accepted:${quote.id}`, template: "quote_accepted", triggeredBy: params.actorUserId, extraVars: { quotationReference: quote.reference, variation: quote.isVariation } });
  return { ok: true, warnings };
}

// A variation takes effect ONLY when the client has accepted it. At that
// moment (and idempotently, so a retry is safe):
//   - the amount due is re-pointed from the original accepted quotation to
//     the variation (amount, source and quotation link move together);
//   - the original accepted quotation becomes 'superseded' — its row,
//     lines and terms are never edited, so history is preserved;
//   - the payment status is recomputed by the existing payments module, and
//     any money already received beyond the new total is flagged for
//     Finance (nothing is refunded or written off automatically).
async function applyAcceptedVariation(quote: QuotationAdminView, actorUserId: string | null): Promise<Result<{ warnings: string[] }> & { warnings: string[] }> {
  const admin = createAdminClient();
  const warnings: string[] = [];
  const { data: prior } = await admin.from("client_quotations").select("id, quotation_reference, usd_total").eq("crew_support_request_id", quote.requestId).eq("status", "accepted").neq("id", quote.id).maybeSingle();

  const guard = [`amount_due_quotation_id.is.null`, `amount_due_quotation_id.eq.${quote.id}`, ...(prior ? [`amount_due_quotation_id.eq.${prior.id}`] : [])].join(",");
  const { data: changed, error } = await admin
    .from("enquiries")
    .update({ amount_due: quote.usdTotal, amount_due_source: "accepted_quotation", amount_due_quotation_id: quote.id })
    .eq("id", quote.enquiryId)
    .or(guard)
    .select("id");
  if (error) return { ok: false, error: "The variation was accepted but the amount due could not be updated. Use “Complete acceptance” to retry.", warnings };
  if (!changed?.length) warnings.push("The amount due is tied to a different quotation and was left unchanged — Finance should review.");

  if (prior) {
    const { error: supError } = await admin.from("client_quotations").update({ status: "superseded", updated_at: new Date().toISOString() }).eq("id", prior.id).eq("status", "accepted");
    if (supError) return { ok: false, error: "The variation was accepted but the original could not be marked superseded. Use “Complete acceptance” to retry.", warnings };
    await logActivity({ actorUserId, action: "crew_support.variation_accepted", entityType: "crew_support_request", entityId: quote.requestId, metadata: { variationId: quote.id, variationReference: quote.reference, supersededId: prior.id, supersededReference: prior.quotation_reference, previousUsdTotal: prior.usd_total == null ? null : Number(prior.usd_total), newUsdTotal: quote.usdTotal } });
  }

  try {
    const { syncEntityPaymentStatus } = await import("@/lib/payments/gatewaySync");
    await syncEntityPaymentStatus("enquiry", quote.enquiryId);
  } catch (e) {
    console.error("[crew-support] payment status resync after variation failed", e);
    warnings.push("The payment status could not be recomputed automatically — Finance should check it.");
  }
  const { data: money } = await admin.from("enquiries").select("amount_due, amount_paid").eq("id", quote.enquiryId).maybeSingle();
  if (money && Number(money.amount_paid ?? 0) > Number(money.amount_due ?? 0) + 0.005) {
    warnings.push(`USD ${(Number(money.amount_paid) - Number(money.amount_due)).toFixed(2)} more has been received than the new total — Finance should review a credit or refund (none was made automatically).`);
  }
  return { ok: true, warnings };
}

// Creates a VARIATION: a complete replacement quotation proposed after the
// original was accepted. It starts as a draft copy (version + 1,
// supersedes_id -> the accepted original), goes through the same
// ready / issue steps, and only replaces the original if the client accepts.
export async function createCrewSupportVariation(params: { requestId: string; actorUserId: string }): Promise<Result<{ quotationId: string; reference: string }>> {
  const detail = await getCrewSupportDetail(params.requestId);
  if (!detail) return { ok: false, error: "Request not found." };
  if (["declined", "cancelled", "completed"].includes(detail.request.status)) return { ok: false, error: "This request is closed." };
  const base = await getCrewSupportQuotation(params.requestId);
  if (!base || base.status !== "accepted") return { ok: false, error: "A variation can only be raised against an accepted quotation." };
  if (await getCrewSupportVariation(params.requestId)) return { ok: false, error: "A variation is already in progress for this request." };

  const admin = createAdminClient();
  const { data: original } = await admin.from("client_quotations").select("client_profile_id, prospect_name, prospect_email, prospect_phone, prospect_company, currency, is_test, version").eq("id", base.id).maybeSingle();
  if (!original) return { ok: false, error: "Quotation not found." };
  const { data: seq, error: seqError } = await admin.rpc("next_client_quotation_reference_seq");
  if (seqError || seq === null || seq === undefined) return { ok: false, error: "Failed to generate a quotation reference." };
  const reference = formatQuotationReference(new Date().getFullYear(), Number(seq));
  const items: QuotationLineItemInput[] = base.lines.map((l) => ({
    serviceItem: l.serviceItem, description: l.description, quantity: l.quantity, unitBasis: l.unitBasis, sellingRate: l.sellingRate, discountPercent: l.discountPercent, taxPercent: l.taxPercent,
    sourceType: l.sourceType as QuotationLineItemInput["sourceType"], sourceReference: l.sourceReference, requirementId: l.requirementId, governedUnitPrice: l.governedUnitPrice, adjustmentReason: l.adjustmentReason || null, noGovernedRate: l.noGovernedRate,
  }));
  const totals = computeQuotationTotals(items);
  const { data: variation, error } = await admin.from("client_quotations").insert({
    quotation_reference: reference,
    client_profile_id: original.client_profile_id, prospect_name: original.prospect_name, prospect_email: original.prospect_email, prospect_phone: original.prospect_phone, prospect_company: original.prospect_company,
    currency: original.currency, subtotal: totals.subtotal, discount_total: totals.discountTotal, tax_total: totals.taxTotal, total: totals.total,
    valid_until: null, payment_booking_terms: base.terms, commercial_notes: base.internalNotes,
    payment_condition: base.paymentCondition, deposit_percent: base.depositPercent,
    version: Number(original.version) + 1, supersedes_id: base.id, is_variation: true,
    enquiry_id: base.enquiryId, crew_support_request_id: params.requestId, is_test: Boolean(original.is_test), created_by: params.actorUserId,
  }).select("id").single();
  if (error || !variation) {
    console.error("[crew-support] failed to create variation", error?.message);
    return { ok: false, error: "Could not create the variation (is one already in progress?)." };
  }
  const itemsResult = await insertQuotationItems(admin, variation.id as string, items, totals);
  if (!itemsResult.ok) {
    await admin.from("client_quotations").delete().eq("id", variation.id).eq("status", "draft");
    return { ok: false, error: itemsResult.error };
  }
  await logActivity({ actorUserId: params.actorUserId, action: "crew_support.variation_created", entityType: "crew_support_request", entityId: params.requestId, metadata: { variationId: variation.id, variationReference: reference, replacesId: base.id, replacesReference: base.reference } });
  return { ok: true, quotationId: variation.id as string, reference };
}

// ---------------------------------------------------------- client portal
export async function getClientQuotationViewForEnquiry(enquiryId: string, userId: string): Promise<ClientQuotationView | null> {
  const admin = createAdminClient();
  const { data: enquiry } = await admin.from("enquiries").select("user_id").eq("id", enquiryId).maybeSingle();
  if (!enquiry || enquiry.user_id !== userId) return null;
  const { data: q } = await admin
    .from("client_quotations")
    .select("id, quotation_reference, status, currency, subtotal, discount_total, tax_total, total, valid_until, payment_booking_terms, issued_at, accepted_at, usd_total, fx_currency, fx_rate_to_usd, fx_locked_at, project_snapshot, payment_condition, deposit_percent, is_variation, supersedes_id")
    .eq("enquiry_id", enquiryId).not("crew_support_request_id", "is", null).in("status", ["sent", "accepted"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!q) return null;
  const { data: items } = await admin.from("client_quotation_items").select("service_item, description, quantity, unit_basis, selling_rate, discount_percent, tax_percent, line_total").eq("quotation_id", q.id).order("sort_order");
  let replacesReference: string | null = null;
  if (q.is_variation && q.supersedes_id) {
    const { data: prior } = await admin.from("client_quotations").select("quotation_reference").eq("id", q.supersedes_id).maybeSingle();
    replacesReference = (prior?.quotation_reference as string | null) ?? null;
  }
  return toClientQuotationView({ ...(q as never as Record<string, unknown>), replaces_reference: replacesReference } as never, (items ?? []) as never);
}

export async function getClientQuotationIdForEnquiry(enquiryId: string, userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: enquiry } = await admin.from("enquiries").select("user_id").eq("id", enquiryId).maybeSingle();
  if (!enquiry || enquiry.user_id !== userId) return null;
  const { data: q } = await admin.from("client_quotations").select("id").eq("enquiry_id", enquiryId).not("crew_support_request_id", "is", null).in("status", ["sent", "accepted"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (q?.id as string | undefined) ?? null;
}


// Quotations issued to this client that are still waiting for them. The
// portal surfaces these on the dashboard and inside the project, because
// a quotation tab nobody is pointed at is a quotation nobody accepts
// (Crew Support QA, 2026-10-07: the client could not find it). Ownership
// is the enquiry's user_id, checked server-side; only whitelisted fields
// are returned.
export type AwaitingQuotation = { enquiryId: string; reference: string; currency: string; total: number; validUntil: string | null };

export async function listQuotationsAwaitingAcceptance(userId: string): Promise<AwaitingQuotation[]> {
  const admin = createAdminClient();
  const { data: enquiries } = await admin.from("enquiries").select("id").eq("user_id", userId);
  const ids = (enquiries ?? []).map((e) => e.id as string);
  if (ids.length === 0) return [];
  const { data: quotes } = await admin
    .from("client_quotations")
    .select("enquiry_id, quotation_reference, currency, total, valid_until")
    .in("enquiry_id", ids).not("crew_support_request_id", "is", null).eq("status", "sent").order("issued_at", { ascending: false });
  const today = new Date().toISOString().slice(0, 10);
  return (quotes ?? [])
    .filter((q) => !q.valid_until || (q.valid_until as string) >= today)
    .map((q) => ({ enquiryId: q.enquiry_id as string, reference: q.quotation_reference as string, currency: q.currency as string, total: Number(q.total), validUntil: (q.valid_until as string | null) ?? null }));
}

// Extra, client-visible context for the PRINTABLE quotation of a Crew
// Support quotation (null for any other quotation, so the generic printout
// is unchanged). Issued quotations print the snapshot frozen at issue; a
// draft previews the request's current details.
export type CrewQuotationPrintExtras = { issuedAt: string | null; version: number; requestReference: string; project: ProjectSnapshot | null; status: string; paymentConditionText: string | null; isVariation: boolean };

export async function getCrewQuotationPrintExtras(quotationId: string): Promise<CrewQuotationPrintExtras | null> {
  const admin = createAdminClient();
  const { data: q } = await admin.from("client_quotations").select("crew_support_request_id, issued_at, version, status, project_snapshot, payment_condition, deposit_percent, usd_total, total, is_variation").eq("id", quotationId).maybeSingle();
  if (!q?.crew_support_request_id) return null;
  const { data: request } = await admin.from("crew_support_requests").select("reference_number").eq("id", q.crew_support_request_id).maybeSingle();
  const project = isProjectSnapshot(q.project_snapshot) ? q.project_snapshot : await projectSnapshotForRequest(q.crew_support_request_id as string);
  return { issuedAt: (q.issued_at as string | null) ?? null, version: Number(q.version ?? 1), requestReference: (request?.reference_number as string | undefined) ?? "", project, status: q.status as string, paymentConditionText: describePaymentCondition(((q.payment_condition as string | undefined) ?? "none") as PaymentCondition, q.deposit_percent == null ? null : Number(q.deposit_percent), q.usd_total == null ? Number(q.total) : Number(q.usd_total)), isVariation: Boolean(q.is_variation) };
}
