import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasContractingEntityRecorded } from "./contractingEntityGate";
import { getCurrentUser, isSuperAdmin, type CurrentUser } from "@/lib/portal/roles";
import { hasCapability } from "@/lib/workflow/engine";
import { PAYMENT_CAPABILITIES } from "@/lib/payments/paymentPermissions";
import { resolveActorIdentities, formatActorLabel } from "@/lib/portal/actorIdentity";
import {
  assessEstablishment,
  messageForAmountDueError,
  NON_USD_AMOUNT_DUE_ENABLED,
  validateOverrideInput,
  type EstablishAssessment,
} from "./amountDueRules";

// Enquiry-to-booking M2a — the server side of "establish the amount due from an accepted quotation" and the Super Admin override.
//
// What this module does, and does NOT do:
//   * Every write goes through ONE database function (migration 0166), each a single transaction: establish_enquiry_amount_due, override_enquiry_amount_due.
//   * It never writes a stage, and it imports no email, notification, payment, booking or Crew Support code. Establishing an amount due does not send an
//     email, create a payment, obligation, receivable, invoice or booking, or accept anything.
//   * Authorisation is checked FIRST in every exported function; the database functions re-check the actor's role as defence in depth.

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const LIVE_STATUSES = ["draft", "ready", "sent", "accepted"] as const;

function canManageAmount(user: CurrentUser | null): user is CurrentUser {
  return Boolean(user) && hasCapability(user, PAYMENT_CAPABILITIES, "manage_project_amount");
}

export type LedgerRow = {
  id: string;
  enquiryId: string;
  enquiryReference: string | null;
  kind: "established" | "override";
  quotationReference: string | null;
  amountBefore: number | null;
  sourceBefore: string | null;
  amountAfter: number;
  sourceAfter: string;
  quotationCurrency: string | null;
  quotationTotal: number | null;
  fxRateToUsd: number | null;
  fxRateEffectiveFrom: string | null;
  fxRateNote: string | null;
  category: string | null;
  reason: string | null;
  evidenceReference: string | null;
  actorLabel: string;
  createdAt: string;
};

export type ActiveQuotation = {
  id: string;
  reference: string;
  status: string;
  version: number;
  currency: string;
  total: number;
  acceptedAt: string | null;
  acceptedVia: string | null;
  usdTotal: number | null;
  fxLockedAt: string | null;
};

export type QuotationHistoryRow = { id: string; reference: string; version: number; status: string; currency: string; total: number; supersedesId: string | null; createdAt: string };

export type AmountDuePanel = {
  enquiry: { id: string; reference: string; paymentCountry: "GH" | "QA" | null; isCrewSupport: boolean; amountDue: number | null; amountDueSource: string | null; amountDueQuotationId: string | null; amountPaid: number | null };
  activeQuotation: ActiveQuotation | null;
  history: QuotationHistoryRow[];
  attachable: { id: string; reference: string; status: string; currency: string; total: number; party: string }[];
  entityRecorded: boolean;
  marketCurrency: string | null;
  assessment: EstablishAssessment;
  directoryMismatch: boolean;
  events: LedgerRow[];
  viewer: { isSuperAdmin: boolean };
};

// Is there an active (draft, sent or accepted) ORIGINAL ordinary quotation for this enquiry? Used to keep the existing typed amount-due action away from
// enquiries that now have a quotation workflow. Read-only; no authorisation needed to ask a yes/no question that gates a write elsewhere.
// Throws if the question cannot be answered, so a caller that uses it as a safety guard fails CLOSED rather than assuming "no quotation".
export async function hasActiveOrdinaryQuotation(enquiryId: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("client_quotations")
    .select("id")
    .eq("enquiry_id", enquiryId)
    .is("crew_support_request_id", null)
    .eq("is_variation", false)
    .in("status", [...LIVE_STATUSES])
    .limit(1);
  if (error) throw new Error(`could not check for an active quotation: ${error.message}`);
  return (data ?? []).length > 0;
}

type EventRow = {
  id: string; enquiry_id: string; kind: "established" | "override"; quotation_id: string | null; amount_before: number | null; source_before: string | null;
  amount_after: number; source_after: string; quotation_currency: string | null; quotation_total: number | null; fx_rate_to_usd: number | null;
  fx_rate_effective_from: string | null; fx_rate_note: string | null; category: string | null; reason: string | null; evidence_reference: string | null;
  actor_id: string; created_at: string;
};
const EVENT_COLUMNS = "id, enquiry_id, kind, quotation_id, amount_before, source_before, amount_after, source_after, quotation_currency, quotation_total, fx_rate_to_usd, fx_rate_effective_from, fx_rate_note, category, reason, evidence_reference, actor_id, created_at";

async function toLedgerRows(rows: EventRow[]): Promise<LedgerRow[]> {
  if (rows.length === 0) return [];
  const db = createAdminClient();
  const [actors, enquiries, quotations] = await Promise.all([
    resolveActorIdentities(rows.map((r) => r.actor_id)),
    db.from("enquiries").select("id, reference_number").in("id", [...new Set(rows.map((r) => r.enquiry_id))]),
    db.from("client_quotations").select("id, quotation_reference").in("id", [...new Set(rows.map((r) => r.quotation_id).filter((x): x is string => Boolean(x)))]),
  ]);
  const enq = new Map((enquiries.data ?? []).map((e: { id: string; reference_number: string }) => [e.id, e.reference_number]));
  const quo = new Map((quotations.data ?? []).map((q: { id: string; quotation_reference: string }) => [q.id, q.quotation_reference]));
  return rows.map((r) => ({
    id: r.id,
    enquiryId: r.enquiry_id,
    enquiryReference: enq.get(r.enquiry_id) ?? null,
    kind: r.kind,
    quotationReference: r.quotation_id ? quo.get(r.quotation_id) ?? null : null,
    amountBefore: r.amount_before == null ? null : Number(r.amount_before),
    sourceBefore: r.source_before,
    amountAfter: Number(r.amount_after),
    sourceAfter: r.source_after,
    quotationCurrency: r.quotation_currency,
    quotationTotal: r.quotation_total == null ? null : Number(r.quotation_total),
    fxRateToUsd: r.fx_rate_to_usd == null ? null : Number(r.fx_rate_to_usd),
    fxRateEffectiveFrom: r.fx_rate_effective_from,
    fxRateNote: r.fx_rate_note,
    category: r.category,
    reason: r.reason,
    evidenceReference: r.evidence_reference,
    actorLabel: formatActorLabel(actors.get(r.actor_id)),
    createdAt: r.created_at,
  }));
}

// Everything the enquiry's "Quotation and amount due" panel shows. Read-only. Null when the viewer may not see financial controls.
export async function getAmountDuePanel(enquiryId: string, now: Date = new Date()): Promise<AmountDuePanel | null> {
  const user = await getCurrentUser();
  if (!canManageAmount(user)) return null;
  const db = createAdminClient();
  // Production's service_role has NO read access to currencies, exchange_rates or payment_country_config (migration 0024), so those three are read through the
  // signed-in session exactly as the existing payments code does. Every other table here is read with the admin client. A test enforces this split.
  const session = await createClient();

  const { data: e } = await db
    .from("enquiries")
    .select("id, reference_number, commercial_intent, payment_country, amount_due, amount_due_source, amount_due_quotation_id, amount_paid, contact_id")
    .eq("id", enquiryId)
    .maybeSingle();
  if (!e) return null;

  const { data: quotes } = await db
    .from("client_quotations")
    .select("id, quotation_reference, status, version, currency, total, supersedes_id, created_at, accepted_at, accepted_via, usd_total, fx_currency, fx_rate_to_usd, fx_locked_at, crew_support_request_id, is_variation, enquiry_id, contact_id")
    .eq("enquiry_id", enquiryId)
    .order("version", { ascending: true });
  const list = quotes ?? [];
  const live = list.find((q) => q.crew_support_request_id == null && !q.is_variation && (LIVE_STATUSES as readonly string[]).includes(q.status)) ?? null;

  let itemsTotal = 0;
  let itemCount = 0;
  if (live) {
    const { data: items } = await db.from("client_quotation_items").select("line_total").eq("quotation_id", live.id);
    itemCount = (items ?? []).length;
    itemsTotal = (items ?? []).reduce((s: number, i: { line_total: number }) => s + Number(i.line_total), 0);
  }

  const [entityRecorded, marketRow, attachable] = await Promise.all([
    hasContractingEntityRecorded({ quotationId: live?.id ?? null, enquiryId }),
    e.payment_country ? session.from("payment_country_config").select("default_currency_code").eq("country", e.payment_country).maybeSingle() : Promise.resolve({ data: null }),
    !live && e.commercial_intent !== "creative_crew_support"
      ? db.from("client_quotations").select("id, quotation_reference, status, currency, total, prospect_name, profiles!client_profile_id(full_name)").is("enquiry_id", null).is("crew_support_request_id", null).in("status", ["draft", "sent"]).order("created_at", { ascending: false }).limit(50)
      : Promise.resolve({ data: [] }),
  ]);
  const marketCurrency = (marketRow.data as { default_currency_code: string } | null)?.default_currency_code ?? null;

  let rates: { current: { rateToUsd: number; effectiveFrom: string; note: string | null } | null; previousRateToUsd: number | null } = { current: null, previousRateToUsd: null };
  if (live && live.currency !== "USD" && !live.fx_locked_at) {
    const { data: rr } = await session.from("exchange_rates").select("rate_to_usd, effective_from, reason").eq("currency_code", live.currency).order("effective_from", { ascending: false }).limit(2);
    const rows = rr ?? [];
    rates = { current: rows[0] ? { rateToUsd: Number(rows[0].rate_to_usd), effectiveFrom: rows[0].effective_from, note: rows[0].reason } : null, previousRateToUsd: rows[1] ? Number(rows[1].rate_to_usd) : null };
  }

  const assessment = assessEstablishment({
    now,
    enquiry: { id: e.id, commercialIntent: e.commercial_intent, paymentCountry: e.payment_country, amountDue: e.amount_due == null ? null : Number(e.amount_due), amountDueSource: e.amount_due_source, amountDueQuotationId: e.amount_due_quotation_id, amountPaid: e.amount_paid == null ? null : Number(e.amount_paid) },
    quotation: live
      ? { id: live.id, enquiryId: live.enquiry_id, crewSupportRequestId: live.crew_support_request_id, status: live.status, currency: live.currency, total: Number(live.total), acceptedAt: live.accepted_at, acceptedVia: live.accepted_via, fxLockedAt: live.fx_locked_at, usdTotal: live.usd_total == null ? null : Number(live.usd_total), fxRateToUsd: live.fx_rate_to_usd == null ? null : Number(live.fx_rate_to_usd), itemsTotal, itemCount }
      : null,
    entityRecorded,
    marketCurrency,
    rates,
    // The release safeguard is read HERE (the importer's binding) so there is exactly one switch and a test can exercise both states.
    nonUsdEnabled: NON_USD_AMOUNT_DUE_ENABLED,
  });

  const { data: ev } = await db.from("enquiry_amount_events").select(EVENT_COLUMNS).eq("enquiry_id", enquiryId).order("seq", { ascending: false }).limit(50);

  return {
    enquiry: { id: e.id, reference: e.reference_number, paymentCountry: e.payment_country, isCrewSupport: e.commercial_intent === "creative_crew_support", amountDue: e.amount_due == null ? null : Number(e.amount_due), amountDueSource: e.amount_due_source, amountDueQuotationId: e.amount_due_quotation_id, amountPaid: e.amount_paid == null ? null : Number(e.amount_paid) },
    activeQuotation: live ? { id: live.id, reference: live.quotation_reference, status: live.status, version: live.version, currency: live.currency, total: Number(live.total), acceptedAt: live.accepted_at, acceptedVia: live.accepted_via, usdTotal: live.usd_total == null ? null : Number(live.usd_total), fxLockedAt: live.fx_locked_at } : null,
    history: list.filter((q) => q.crew_support_request_id == null).map((q) => ({ id: q.id, reference: q.quotation_reference, version: q.version, status: q.status, currency: q.currency, total: Number(q.total), supersedesId: q.supersedes_id, createdAt: q.created_at })),
    attachable: ((attachable.data ?? []) as unknown as { id: string; quotation_reference: string; status: string; currency: string; total: number; prospect_name: string | null; profiles: { full_name: string | null } | null }[]).map((q) => ({ id: q.id, reference: q.quotation_reference, status: q.status, currency: q.currency, total: Number(q.total), party: q.profiles?.full_name ?? q.prospect_name ?? "" })),
    entityRecorded,
    marketCurrency,
    assessment,
    directoryMismatch: Boolean(live?.contact_id && e.contact_id && live.contact_id !== e.contact_id),
    events: await toLedgerRows((ev ?? []) as EventRow[]),
    viewer: { isSuperAdmin: isSuperAdmin(user) },
  };
}

export async function establishAmountDue(p: {
  enquiryId: string;
  quotationId: string;
  expectedRateToUsd: number | null;
  expectedRateEffectiveFrom: string | null;
  acknowledgeRateJump: boolean;
}): Promise<Result<{ amountDue: number; noop: boolean }>> {
  const user = await getCurrentUser();
  if (!canManageAmount(user)) return { ok: false, error: "Not authorized." };
  if (!p.enquiryId || !p.quotationId) return { ok: false, error: "Invalid request." };

  const db = createAdminClient();
  // Release safeguard: no amount due from a non-USD quotation until the payment-page wording fix (P1) is deployed.
  const { data: q } = await db.from("client_quotations").select("currency").eq("id", p.quotationId).maybeSingle();
  if (!q) return { ok: false, error: messageForAmountDueError("ordift:quotation_not_found") };
  if (q.currency !== "USD" && !NON_USD_AMOUNT_DUE_ENABLED) return { ok: false, error: messageForAmountDueError("ordift:non_usd_disabled") };

  const { data, error } = await db.rpc("establish_enquiry_amount_due", {
    p_enquiry_id: p.enquiryId,
    p_quotation_id: p.quotationId,
    p_actor: user.id,
    p_expected_rate: p.expectedRateToUsd,
    p_expected_effective: p.expectedRateEffectiveFrom,
    p_ack_rate_jump: p.acknowledgeRateJump,
  });
  if (error) return { ok: false, error: messageForAmountDueError(error.message) };
  const r = data as { noop: boolean; amountDue: number };
  return { ok: true, value: { amountDue: Number(r.amountDue), noop: Boolean(r.noop) } };
}

export async function overrideAmountDue(p: {
  enquiryId: string;
  newAmountUsd: number;
  category: string;
  reason: string;
  evidence: string;
  typedReference: string;
}): Promise<Result<{ amountDue: number }>> {
  const user = await getCurrentUser();
  if (!canManageAmount(user) || !isSuperAdmin(user)) return { ok: false, error: "Only a Super Admin can override an amount due." };
  if (!p.enquiryId) return { ok: false, error: "Invalid request." };

  const db = createAdminClient();
  const { data: e } = await db.from("enquiries").select("reference_number, amount_due, amount_paid, commercial_intent").eq("id", p.enquiryId).maybeSingle();
  if (!e) return { ok: false, error: messageForAmountDueError("ordift:enquiry_not_found") };
  if (e.commercial_intent === "creative_crew_support") return { ok: false, error: messageForAmountDueError("ordift:crew_support_excluded") };

  const checked = validateOverrideInput({
    newAmountUsd: p.newAmountUsd,
    currentAmountUsd: e.amount_due == null ? null : Number(e.amount_due),
    amountPaidUsd: e.amount_paid == null ? null : Number(e.amount_paid),
    category: p.category,
    reason: p.reason,
    evidence: p.evidence,
    typedReference: p.typedReference,
    enquiryReference: e.reference_number,
  });
  if (!checked.ok) return checked;

  const { data, error } = await db.rpc("override_enquiry_amount_due", {
    p_enquiry_id: p.enquiryId,
    p_actor: user.id,
    p_new_amount_usd: p.newAmountUsd,
    p_category: p.category,
    p_reason: p.reason,
    p_evidence: p.evidence.trim() || null,
  });
  if (error) return { ok: false, error: messageForAmountDueError(error.message) };
  return { ok: true, value: { amountDue: Number((data as { amountDue: number }).amountDue) } };
}

// The reviewable register: every establishment and override, newest first. Super Admin only.
export async function listAmountEvents(f: { enquiryReference?: string; kind?: "established" | "override"; from?: string; to?: string; limit?: number } = {}): Promise<Result<LedgerRow[]>> {
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user)) return { ok: false, error: "Only a Super Admin can open the override register." };
  const db = createAdminClient();
  let enquiryId: string | null = null;
  if (f.enquiryReference?.trim()) {
    const { data } = await db.from("enquiries").select("id").ilike("reference_number", f.enquiryReference.trim()).maybeSingle();
    if (!data) return { ok: true, value: [] };
    enquiryId = data.id;
  }
  let q = db.from("enquiry_amount_events").select(EVENT_COLUMNS).order("seq", { ascending: false }).limit(Math.min(Math.max(f.limit ?? 200, 1), 500));
  if (enquiryId) q = q.eq("enquiry_id", enquiryId);
  if (f.kind) q = q.eq("kind", f.kind);
  if (f.from) q = q.gte("created_at", f.from);
  if (f.to) q = q.lte("created_at", f.to);
  const { data, error } = await q;
  if (error) return { ok: false, error: "The register could not be loaded." };
  return { ok: true, value: await toLedgerRows((data ?? []) as EventRow[]) };
}
