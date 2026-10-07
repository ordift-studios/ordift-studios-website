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
import { statusAfterCommercialAcceptance } from "./commitmentRules";
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
  enquiryId: string;
  requestId: string;
  lines: (EditableLine & { id: string; sourceType: string; noGovernedRate: boolean; lineTotal: number })[];
};

const QUOTE_COLUMNS =
  "id, quotation_reference, status, currency, subtotal, discount_total, tax_total, total, valid_until, payment_booking_terms, commercial_notes, fx_currency, fx_rate_to_usd, fx_locked_at, usd_total, issued_at, accepted_at, accepted_via, acceptance_channel, acceptance_evidence, accepted_by_name, acceptance_received_at, is_test, enquiry_id, crew_support_request_id";

export async function getCrewSupportQuotation(requestId: string): Promise<QuotationAdminView | null> {
  const admin = createAdminClient();
  const { data: q } = await admin.from("client_quotations").select(QUOTE_COLUMNS).eq("crew_support_request_id", requestId).in("status", ["draft", "ready", "sent", "accepted"]).maybeSingle();
  if (!q) return null;
  const { data: items } = await admin
    .from("client_quotation_items")
    .select("id, requirement_id, service_item, description, quantity, unit_basis, selling_rate, discount_percent, tax_percent, line_total, source_type, source_reference, governed_unit_price, adjustment_reason, no_governed_rate")
    .eq("quotation_id", q.id)
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
export async function saveCrewSupportQuotationDraft(params: { quotationId: string; lines: EditableLine[]; validUntil: string | null; terms: string | null; internalNotes: string | null; fxCurrency: string | null; actorUserId: string }): Promise<Result> {
  const admin = createAdminClient();
  const { data: q } = await admin.from("client_quotations").select("id, status, quotation_reference, crew_support_request_id").eq("id", params.quotationId).maybeSingle();
  if (!q || !q.crew_support_request_id) return { ok: false, error: "Quotation not found." };
  if (q.status !== "draft") return { ok: false, error: "Only a draft can be edited. Return it to draft first." };
  const resolved = validateAndResolveLines(params.lines);
  if (!resolved.ok) return resolved;

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
    valid_until: params.validUntil || null, payment_booking_terms: params.terms?.trim() || null, commercial_notes: params.internalNotes?.trim() || null, fx_currency: fxCurrency, updated_at: new Date().toISOString(),
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
export async function markQuotationReady(params: { quotationId: string; actorUserId: string }): Promise<Result> {
  const quote = await adminQuotationById(params.quotationId);
  if (!quote) return { ok: false, error: "Quotation not found." };
  const check = canMarkReady({ status: quote.status, total: quote.total, lineCount: quote.lines.length, validUntil: quote.validUntil, today: new Date().toISOString().slice(0, 10) });
  if (!check.ok) return { ok: false, error: check.reason };
  const resolved = validateAndResolveLines(quote.lines);
  if (!resolved.ok) return resolved;
  const { data, error } = await createAdminClient().from("client_quotations").update({ status: "ready", reviewed_at: new Date().toISOString(), reviewed_by: params.actorUserId, updated_at: new Date().toISOString() }).eq("id", params.quotationId).eq("status", "draft").select("id");
  if (error || !data?.length) return { ok: false, error: "The quotation changed — refresh and try again." };
  await logActivity({ actorUserId: params.actorUserId, action: "crew_support.quotation_ready", entityType: "crew_support_request", entityId: quote.requestId, metadata: { quotationId: quote.id, quotationReference: quote.reference, total: quote.total } });
  return { ok: true };
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
  const { data } = await createAdminClient().from("client_quotations").select("crew_support_request_id").eq("id", quotationId).maybeSingle();
  return data?.crew_support_request_id ? getCrewSupportQuotation(data.crew_support_request_id as string).then((q) => (q?.id === quotationId ? q : null)) : null;
}

export async function issueCrewSupportQuotation(params: { quotationId: string; actorUserId: string }): Promise<Result> {
  const quote = await adminQuotationById(params.quotationId);
  if (!quote) return { ok: false, error: "Quotation not found." };
  if (quote.status !== "ready") return { ok: false, error: "Only a quotation marked Ready can be issued." };
  const detail = await getCrewSupportDetail(quote.requestId);
  if (!detail || detail.request.status !== "quote_preparation") return { ok: false, error: "The request must be in Quote preparation to issue its quotation." };

  let fxRate: number | null = null;
  if (quote.fxCurrency) {
    fxRate = await getCurrentRate(quote.fxCurrency);
    if (!fxRate) return { ok: false, error: `No exchange rate is configured for ${quote.fxCurrency}. Remove the local-currency display or add a rate first.` };
  }
  const now = new Date().toISOString();
  const { data, error } = await createAdminClient().from("client_quotations").update({
    status: "sent", issued_at: now, issued_by: params.actorUserId, usd_total: quote.total, fx_rate_to_usd: fxRate, fx_locked_at: fxRate ? now : null, updated_at: now,
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

  if (detail.request.status === "quote_preparation") {
    const moved = await commitCrewSupportStatus({ requestId: quote.requestId, from: "quote_preparation", to: "quoted", actorUserId: params.actorUserId, automatic: true, reason: `Quotation ${quote.reference} issued` });
    if (!moved.ok) warnings.push(`Request status: ${moved.error}`);
  }
  await syncEnquiryStage({ enquiryId: quote.enquiryId, event: "quote_issued", actorUserId: params.actorUserId, requestId: quote.requestId });
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

  // Where does the request go next? Conditional agreement: with no separate
  // agreement required, the accepted quotation + its terms are the contract
  // and the request moves straight on to payment; if an agreement is
  // required it waits in agreement_pending until that agreement is executed.
  const detail = await getCrewSupportDetail(quote.requestId);
  if (detail?.request.status === "quoted") {
    const snapshot = await getCommitmentSnapshot(quote.requestId);
    const target = snapshot ? statusAfterCommercialAcceptance(snapshot.agreementAssessment) : "agreement_pending";
    const reason = target === "payment_pending" ? `Quotation ${quote.reference} accepted; no separate agreement required — the accepted quotation and its terms are the contract` : `Quotation ${quote.reference} accepted; a separate agreement is required`;
    const moved = await commitCrewSupportStatus({ requestId: quote.requestId, from: "quoted", to: target, actorUserId: params.actorUserId, automatic: true, reason });
    if (!moved.ok) warnings.push(`Request status: ${moved.error}`);
  }
  await notifyCrewSupportEvent({ requestId: quote.requestId, eventKey: `quote_accepted:${quote.id}`, template: "quote_accepted", triggeredBy: params.actorUserId, extraVars: { quotationReference: quote.reference } });
  return { ok: true, warnings };
}

// ---------------------------------------------------------- client portal
export async function getClientQuotationViewForEnquiry(enquiryId: string, userId: string): Promise<ClientQuotationView | null> {
  const admin = createAdminClient();
  const { data: enquiry } = await admin.from("enquiries").select("user_id").eq("id", enquiryId).maybeSingle();
  if (!enquiry || enquiry.user_id !== userId) return null;
  const { data: q } = await admin
    .from("client_quotations")
    .select("id, quotation_reference, status, currency, subtotal, discount_total, tax_total, total, valid_until, payment_booking_terms, issued_at, accepted_at, usd_total, fx_currency, fx_rate_to_usd, fx_locked_at")
    .eq("enquiry_id", enquiryId).not("crew_support_request_id", "is", null).in("status", ["sent", "accepted"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!q) return null;
  const { data: items } = await admin.from("client_quotation_items").select("service_item, description, quantity, unit_basis, selling_rate, discount_percent, tax_percent, line_total").eq("quotation_id", q.id).order("sort_order");
  return toClientQuotationView(q as never, (items ?? []) as never);
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
