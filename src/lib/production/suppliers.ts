import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeWithSuperAdminOverride, OPERATIONS_CAPABILITIES } from "@/lib/organization/authority";
import { logActivity } from "@/lib/admin/activityLog";

// Ordift Production Services — Supplier Directory Foundation
// (2026-09-07) — the minimum coherent internal procurement record for
// external production suppliers (studios, locations, equipment rental
// houses, crew/freelancers, transport, catering, props, set
// construction, styling, HMU, talent agencies, permit/fixers,
// accommodation, courier/logistics). Deliberately its OWN table, never
// conflated with payee_profiles (0049): a payee_profiles row REQUIRES
// a real platform profile (payee_profiles.id references profiles.id
// on delete cascade), but most production suppliers will never have
// an Ordift account at all. A supplier that IS also a registered payee
// (e.g. a freelance crew member with a portal account) links via the
// optional payeeProfileId below — the two domains stay separate,
// joined only where a real overlap exists.
//
// Authorization: operations.coordinate (OPERATIONS_CAPABILITIES.coordinate)
// — previously DORMANT, wired here for the first time. Deliberately
// NOT finance.payee.administer (that capability governs the payee/
// payment-destination domain specifically) and NOT a new capability
// (the taxonomy already reserved "coordinate" for exactly this kind of
// duty). RLS is staff-read-only with NO public policy at all — supplier
// procurement economics (indicative rates, negotiation notes, internal
// notes) must never be exposed publicly, per the approved spec.

export type ProductionSupplierType =
  | "studio"
  | "location"
  | "equipment_rental"
  | "crew_freelancer"
  | "transport"
  | "catering"
  | "props"
  | "set_construction"
  | "styling"
  | "hair_makeup"
  | "talent_agency"
  | "permit_fixer"
  | "accommodation"
  | "courier_logistics"
  | "other";

export type ProductionSupplier = {
  id: string;
  supplierName: string;
  supplierType: ProductionSupplierType;
  marketSlug: string | null;
  locationNotes: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  currencyCode: string | null;
  indicativeRate: number | null;
  rateUnit: string | null;
  lastVerifiedAt: string | null;
  capabilities: string[] | null;
  availabilityNotes: string | null;
  internalNotes: string | null;
  supportingReference: string | null;
  paymentTerms: string | null;
  payeeProfileId: string | null;
  active: boolean;
  createdAt: string;
};

async function authorize(actorUserId: string) {
  return authorizeWithSuperAdminOverride(actorUserId, OPERATIONS_CAPABILITIES.coordinate);
}

export async function listSuppliersForAdmin(actorUserId: string, filters?: { supplierType?: ProductionSupplierType; activeOnly?: boolean }): Promise<ProductionSupplier[]> {
  const auth = await authorize(actorUserId);
  if (!auth.ok) return [];

  const admin = createAdminClient();
  let query = admin
    .from("production_suppliers")
    .select(
      "id, supplier_name, supplier_type, market_id, pricing_markets(slug), location_notes, contact_name, contact_email, contact_phone, currency_code, indicative_rate, rate_unit, last_verified_at, capabilities, availability_notes, internal_notes, supporting_reference, payment_terms, payee_profile_id, active, created_at"
    )
    .order("supplier_name", { ascending: true });
  if (filters?.supplierType) query = query.eq("supplier_type", filters.supplierType);
  if (filters?.activeOnly) query = query.eq("active", true);

  const { data, error } = await query;
  if (error) {
    console.error("[production] failed to load suppliers", error.message);
    return [];
  }
  return (data ?? []).map((s) => ({
    id: s.id,
    supplierName: s.supplier_name,
    supplierType: s.supplier_type,
    marketSlug: (s.pricing_markets as unknown as { slug: string } | null)?.slug ?? null,
    locationNotes: s.location_notes,
    contactName: s.contact_name,
    contactEmail: s.contact_email,
    contactPhone: s.contact_phone,
    currencyCode: s.currency_code,
    indicativeRate: s.indicative_rate === null ? null : Number(s.indicative_rate),
    rateUnit: s.rate_unit,
    lastVerifiedAt: s.last_verified_at,
    capabilities: s.capabilities,
    availabilityNotes: s.availability_notes,
    internalNotes: s.internal_notes,
    supportingReference: s.supporting_reference,
    paymentTerms: s.payment_terms,
    payeeProfileId: s.payee_profile_id,
    active: s.active,
    createdAt: s.created_at,
  }));
}

export async function createSupplier(params: {
  supplierName: string;
  supplierType: ProductionSupplierType;
  marketSlug?: string | null;
  locationNotes?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  currencyCode?: string | null;
  indicativeRate?: number | null;
  rateUnit?: string | null;
  capabilities?: string[] | null;
  availabilityNotes?: string | null;
  internalNotes?: string | null;
  supportingReference?: string | null;
  paymentTerms?: string | null;
  payeeProfileId?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const auth = await authorize(params.actorUserId);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage the supplier directory." };
  if (!params.supplierName.trim()) return { ok: false, error: "Supplier name is required." };

  const admin = createAdminClient();
  let marketId: string | null = null;
  if (params.marketSlug) {
    const { data } = await admin.from("pricing_markets").select("id").eq("slug", params.marketSlug).maybeSingle();
    marketId = data?.id ?? null;
  }

  const { data, error } = await admin
    .from("production_suppliers")
    .insert({
      supplier_name: params.supplierName.trim(),
      supplier_type: params.supplierType,
      market_id: marketId,
      location_notes: params.locationNotes ?? null,
      contact_name: params.contactName ?? null,
      contact_email: params.contactEmail ?? null,
      contact_phone: params.contactPhone ?? null,
      currency_code: params.currencyCode ?? null,
      indicative_rate: params.indicativeRate ?? null,
      rate_unit: params.rateUnit ?? null,
      capabilities: params.capabilities ?? null,
      availability_notes: params.availabilityNotes ?? null,
      internal_notes: params.internalNotes ?? null,
      supporting_reference: params.supportingReference ?? null,
      payment_terms: params.paymentTerms ?? null,
      payee_profile_id: params.payeeProfileId ?? null,
      created_by: params.actorUserId,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) {
    console.error("[production] failed to create supplier", error?.message);
    return { ok: false, error: "Failed to create the supplier record." };
  }

  await logActivity({ actorUserId: params.actorUserId, action: "production.supplier.created", entityType: "production_supplier", entityId: data.id, metadata: { supplierName: params.supplierName, supplierType: params.supplierType } });
  return { ok: true, id: data.id };
}

export async function setSupplierActive(params: { supplierId: string; active: boolean; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorize(params.actorUserId);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage the supplier directory." };

  const admin = createAdminClient();
  const { error } = await admin.from("production_suppliers").update({ active: params.active, updated_at: new Date().toISOString() }).eq("id", params.supplierId);
  if (error) {
    console.error("[production] failed to update supplier active state", error.message);
    return { ok: false, error: "Failed to update the supplier record." };
  }
  await logActivity({ actorUserId: params.actorUserId, action: "production.supplier.active_changed", entityType: "production_supplier", entityId: params.supplierId, metadata: { active: params.active } });
  return { ok: true };
}
