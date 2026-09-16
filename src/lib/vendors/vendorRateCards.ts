import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { canManageOnboarding } from "@/lib/organization/onboarding";

// Vendor commercial/rate-card infrastructure (2026-09-15, OS-LGL-009
// implementation phase, Part 11) — against public.vendor_rate_cards/
// vendor_rate_card_items (migration 0126). Holds ONLY Vendor-side cost
// information. Ordift internal markup, margin, client quotation, and
// client selling price are never read, written, or referenced by any
// function in this module — those remain the Pricing/Quote engine's
// exclusive domain. This module is deliberately only the integration
// point a future quotation/job-costing feature could reference (via a
// vendor_rate_card_items id) — no quotation engine is built here.
//
// Same dual-actor authorization discipline as vendorDocuments.ts: the
// admin client bypasses RLS entirely, so these application-layer
// checks (staff/admin, or the vendor reading their own rows) are the
// real enforcement point.

async function canAccessVendorRateCards(vendorProfileId: string, actorUserId: string): Promise<boolean> {
  if (actorUserId === vendorProfileId) return true;
  return canManageOnboarding(actorUserId);
}

export type VendorRateCard = {
  id: string;
  vendorProfileId: string;
  currency: string;
  effectiveDate: string;
  status: string;
  sourceDocumentId: string | null;
  version: number;
  supersedesId: string | null;
  notes: string | null;
  cancellationReschedulingTerms: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

export type VendorRateCardItem = {
  id: string;
  rateCardId: string;
  serviceItem: string;
  // Free text by design — covers "hour" / "half-day" / "full-day" /
  // "item" / "service" / any other genuine unit a vendor bills by,
  // never a fixed enum that would force an awkward fit.
  unitBasis: string;
  baseCost: number;
  minimumBooking: string | null;
  overtimeRate: number | null;
  equipmentFacilityCharge: number | null;
  addOns: Record<string, unknown>;
  taxTreatment: string | null;
  conditions: string | null;
  createdAt: string;
};

const CARD_SELECT =
  "id, vendor_profile_id, currency, effective_date, status, source_document_id, version, supersedes_id, notes, cancellation_rescheduling_terms, reviewed_by, reviewed_at, created_at";
const ITEM_SELECT = "id, rate_card_id, service_item, unit_basis, base_cost, minimum_booking, overtime_rate, equipment_facility_charge, add_ons, tax_treatment, conditions, created_at";

function mapCard(r: {
  id: string;
  vendor_profile_id: string;
  currency: string;
  effective_date: string;
  status: string;
  source_document_id: string | null;
  version: number;
  supersedes_id: string | null;
  notes: string | null;
  cancellation_rescheduling_terms: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}): VendorRateCard {
  return {
    id: r.id,
    vendorProfileId: r.vendor_profile_id,
    currency: r.currency,
    effectiveDate: r.effective_date,
    status: r.status,
    sourceDocumentId: r.source_document_id,
    version: r.version,
    supersedesId: r.supersedes_id,
    notes: r.notes,
    cancellationReschedulingTerms: r.cancellation_rescheduling_terms,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
    createdAt: r.created_at,
  };
}

function mapItem(r: {
  id: string;
  rate_card_id: string;
  service_item: string;
  unit_basis: string;
  base_cost: number;
  minimum_booking: string | null;
  overtime_rate: number | null;
  equipment_facility_charge: number | null;
  add_ons: Record<string, unknown>;
  tax_treatment: string | null;
  conditions: string | null;
  created_at: string;
}): VendorRateCardItem {
  return {
    id: r.id,
    rateCardId: r.rate_card_id,
    serviceItem: r.service_item,
    unitBasis: r.unit_basis,
    baseCost: r.base_cost,
    minimumBooking: r.minimum_booking,
    overtimeRate: r.overtime_rate,
    equipmentFacilityCharge: r.equipment_facility_charge,
    addOns: r.add_ons ?? {},
    taxTreatment: r.tax_treatment,
    conditions: r.conditions,
    createdAt: r.created_at,
  };
}

export async function listVendorRateCards(vendorProfileId: string, actorUserId: string): Promise<VendorRateCard[]> {
  if (!(await canAccessVendorRateCards(vendorProfileId, actorUserId))) return [];
  const admin = createAdminClient();
  const { data, error } = await admin.from("vendor_rate_cards").select(CARD_SELECT).eq("vendor_profile_id", vendorProfileId).order("effective_date", { ascending: false });
  if (error) {
    console.error("[vendors] failed to load vendor_rate_cards", error.message);
    return [];
  }
  return (data ?? []).map(mapCard);
}

// The vendor's current, in-force rate card — status 'current' AND
// effective_date on or before today (a future-dated card is a real,
// controlled record, just not yet in force — same "not yet found"
// discipline as findApprovedJurisdictionSchedule() in
// employeeAgreementJurisdictionGate.ts).
export async function getCurrentVendorRateCard(vendorProfileId: string, actorUserId: string): Promise<VendorRateCard | null> {
  if (!(await canAccessVendorRateCards(vendorProfileId, actorUserId))) return null;
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await admin
    .from("vendor_rate_cards")
    .select(CARD_SELECT)
    .eq("vendor_profile_id", vendorProfileId)
    .eq("status", "current")
    .lte("effective_date", today)
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? mapCard(data) : null;
}

export async function listVendorRateCardItems(rateCardId: string, actorUserId: string): Promise<VendorRateCardItem[]> {
  const admin = createAdminClient();
  const { data: card } = await admin.from("vendor_rate_cards").select("vendor_profile_id").eq("id", rateCardId).maybeSingle();
  if (!card || !(await canAccessVendorRateCards(card.vendor_profile_id, actorUserId))) return [];

  const { data, error } = await admin.from("vendor_rate_card_items").select(ITEM_SELECT).eq("rate_card_id", rateCardId).order("service_item");
  if (error) {
    console.error("[vendors] failed to load vendor_rate_card_items", error.message);
    return [];
  }
  return (data ?? []).map(mapItem);
}

export type CreateVendorRateCardItemInput = {
  serviceItem: string;
  unitBasis: string;
  baseCost: number;
  minimumBooking?: string | null;
  overtimeRate?: number | null;
  equipmentFacilityCharge?: number | null;
  addOns?: Record<string, unknown>;
  taxTreatment?: string | null;
  conditions?: string | null;
};

// Creates a new rate card version and, in the same call, its items —
// a rate card with no items is a genuinely incomplete submission, so
// this stays one atomic-from-the-caller's-perspective operation rather
// than two separate admin actions that could leave a card stranded
// with zero items. If the vendor already has a 'current' card, it is
// automatically marked 'superseded' (never deleted — supersedes_id
// preserves the chain) — a new upload never overwrites the prior one's
// own rows.
export async function createVendorRateCard(params: {
  vendorProfileId: string;
  currency: string;
  effectiveDate: string;
  sourceDocumentId?: string | null;
  notes?: string | null;
  cancellationReschedulingTerms?: string | null;
  items: CreateVendorRateCardItemInput[];
  actorUserId: string;
}): Promise<{ ok: true; rateCardId: string } | { ok: false; error: string }> {
  if (!(await canManageOnboarding(params.actorUserId))) {
    return { ok: false, error: "Not authorized to record a vendor rate card." };
  }
  if (params.items.length === 0) {
    return { ok: false, error: "At least one rate card item is required." };
  }

  const admin = createAdminClient();
  const previous = await getCurrentVendorRateCard(params.vendorProfileId, params.actorUserId);

  const { data: newCard, error } = await admin
    .from("vendor_rate_cards")
    .insert({
      vendor_profile_id: params.vendorProfileId,
      currency: params.currency,
      effective_date: params.effectiveDate,
      status: "current",
      source_document_id: params.sourceDocumentId ?? null,
      version: (previous?.version ?? 0) + 1,
      supersedes_id: previous?.id ?? null,
      notes: params.notes ?? null,
      cancellation_rescheduling_terms: params.cancellationReschedulingTerms ?? null,
      created_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !newCard) {
    console.error("[vendors] failed to create vendor_rate_card", error?.message);
    return { ok: false, error: "Failed to create the rate card." };
  }

  const { error: itemsError } = await admin.from("vendor_rate_card_items").insert(
    params.items.map((item) => ({
      rate_card_id: newCard.id,
      service_item: item.serviceItem,
      unit_basis: item.unitBasis,
      base_cost: item.baseCost,
      minimum_booking: item.minimumBooking ?? null,
      overtime_rate: item.overtimeRate ?? null,
      equipment_facility_charge: item.equipmentFacilityCharge ?? null,
      add_ons: item.addOns ?? {},
      tax_treatment: item.taxTreatment ?? null,
      conditions: item.conditions ?? null,
    }))
  );
  if (itemsError) {
    console.error("[vendors] failed to create vendor_rate_card_items", itemsError.message);
    return { ok: false, error: "Rate card created but its items failed to save." };
  }

  if (previous) {
    await admin.from("vendor_rate_cards").update({ status: "superseded" }).eq("id", previous.id).eq("status", "current");
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "vendor_rate_card.created",
    entityType: "user",
    entityId: params.vendorProfileId,
    metadata: { rateCardId: newCard.id, version: (previous?.version ?? 0) + 1, itemCount: params.items.length, supersedesId: previous?.id ?? null },
  });

  return { ok: true, rateCardId: newCard.id };
}

// Informational internal-review record (2026-09-16, backlog Phase 1
// Item 2) — deliberately non-blocking: does NOT gate current/superseded
// status or any read path. Records that a staff/admin genuinely looked
// at this card, never a fabricated approval.
export async function reviewVendorRateCard(params: { rateCardId: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageOnboarding(params.actorUserId))) {
    return { ok: false, error: "Not authorized to review a vendor rate card." };
  }
  const admin = createAdminClient();
  const { data: card } = await admin.from("vendor_rate_cards").select("vendor_profile_id").eq("id", params.rateCardId).maybeSingle();
  const { error } = await admin.from("vendor_rate_cards").update({ reviewed_by: params.actorUserId, reviewed_at: new Date().toISOString() }).eq("id", params.rateCardId);
  if (error) {
    console.error("[vendors] failed to record vendor_rate_card review", error.message);
    return { ok: false, error: "Failed to record the review." };
  }
  await logActivity({ actorUserId: params.actorUserId, action: "vendor_rate_card.reviewed", entityType: "user", entityId: card?.vendor_profile_id, metadata: { rateCardId: params.rateCardId } });
  return { ok: true };
}
