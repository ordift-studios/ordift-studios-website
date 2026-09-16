"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import {
  createClientQuotation,
  updateQuotationStatus,
  associateProspectQuotationWithClient,
  type QuotationLineItemInput,
} from "@/lib/commercial/clientQuotations";
import { suggestCorporateHeadshotQuotationLine, type CorporateHeadshotQuoteSuggestion } from "@/lib/commercial/pricingCatalog";
import type { CorporateProductSlug } from "@/lib/pricing/corporateHeadshotPricing";

export type ActionState = { ok: boolean; error?: string } | null;
// Create-specific result — deliberately does NOT call redirect() from
// inside this action (2026-09-16 Production fix). redirect() throws
// NEXT_REDIRECT, and calling it inside a useActionState-bound action
// races React's own state-commit machinery on this Next version — the
// real Production symptom was "Creating…" never resolving into either
// the new quotation page or a visible error, landing on a blank
// screen instead. Every other create-flow in this codebase (e.g.
// inviteCollaboratorAction) already avoids this exact combination by
// returning a plain result and letting the CLIENT navigate — this
// follows the same proven pattern instead of inventing a new one.
export type CreateQuotationState = { ok: true; quotationId: string; quotationReference: string } | { ok: false; error: string } | null;

// Client Quotations admin actions (2026-09-16 Universal Commercial Rate
// Card & Quotation System). All authorization lives inside
// clientQuotations.ts itself (requireAdminActor()) — these are thin
// FormData-parsing wrappers, same convention as every other admin
// action in this codebase.
export async function createQuotationAction(_prev: CreateQuotationState, formData: FormData): Promise<CreateQuotationState> {
  const clientProfileId = String(formData.get("clientProfileId") ?? "").trim() || null;
  const prospectName = String(formData.get("prospectName") ?? "").trim() || null;
  const prospectEmail = String(formData.get("prospectEmail") ?? "").trim() || null;
  const prospectPhone = String(formData.get("prospectPhone") ?? "").trim() || null;
  const prospectCompany = String(formData.get("prospectCompany") ?? "").trim() || null;
  const currency = String(formData.get("currency") ?? "").trim();
  const validUntil = String(formData.get("validUntil") ?? "").trim() || null;
  const paymentBookingTerms = String(formData.get("paymentBookingTerms") ?? "").trim() || null;
  const commercialNotes = String(formData.get("commercialNotes") ?? "").trim() || null;

  const items: QuotationLineItemInput[] = [];
  let i = 0;
  while (formData.get(`items[${i}][serviceItem]`) !== null) {
    const serviceItem = String(formData.get(`items[${i}][serviceItem]`) ?? "").trim();
    const quantity = Number(formData.get(`items[${i}][quantity]`) ?? 0);
    const unitBasis = String(formData.get(`items[${i}][unitBasis]`) ?? "").trim();
    const sellingRate = Number(formData.get(`items[${i}][sellingRate]`) ?? 0);
    const discountPercentRaw = String(formData.get(`items[${i}][discountPercent]`) ?? "").trim();
    const taxPercentRaw = String(formData.get(`items[${i}][taxPercent]`) ?? "").trim();
    const description = String(formData.get(`items[${i}][description]`) ?? "").trim() || null;
    const sourceTypeRaw = String(formData.get(`items[${i}][sourceType]`) ?? "").trim();
    const sourceType = sourceTypeRaw === "pricing" || sourceTypeRaw === "adjusted" ? sourceTypeRaw : "manual";
    const sourceReference = String(formData.get(`items[${i}][sourceReference]`) ?? "").trim() || null;
    if (serviceItem && unitBasis && quantity > 0 && sellingRate >= 0) {
      items.push({
        serviceItem,
        description,
        quantity,
        unitBasis,
        sellingRate,
        discountPercent: discountPercentRaw ? Number(discountPercentRaw) : null,
        taxPercent: taxPercentRaw ? Number(taxPercentRaw) : null,
        sourceType,
        sourceReference,
      });
    }
    i++;
  }

  if (!currency) return { ok: false, error: "Currency is required." };
  if (items.length === 0) return { ok: false, error: "Add at least one valid line item." };

  const result = await createClientQuotation({
    clientProfileId,
    prospectName,
    prospectEmail,
    prospectPhone,
    prospectCompany,
    currency,
    validUntil,
    paymentBookingTerms,
    commercialNotes,
    items,
  });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/pricing/quotations");
  return { ok: true, quotationId: result.quotationId, quotationReference: result.quotationReference };
}

// Connect Client Quotations to existing Pricing (2026-09-16, Task C).
// Read-only — computes a suggestion via the real, existing Corporate &
// Headshots pricing engine (never a new formula); the caller still
// decides whether to add it as a line item. Never writes anything.
export async function suggestCorporateHeadshotLineAction(
  _prev: CorporateHeadshotQuoteSuggestion | null,
  formData: FormData
): Promise<CorporateHeadshotQuoteSuggestion> {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) {
    return { ok: false, requiresCustomQuote: false, error: "Not authorized." };
  }
  const marketSlug = String(formData.get("marketSlug") ?? "");
  const marketName = String(formData.get("marketName") ?? "");
  const product = String(formData.get("product") ?? "") as CorporateProductSlug;
  const numberOfPeopleRaw = String(formData.get("numberOfPeople") ?? "").trim();
  if (!marketSlug || !product) return { ok: false, requiresCustomQuote: false, error: "Choose a market and product." };

  return suggestCorporateHeadshotQuotationLine({
    marketSlug,
    marketName,
    product,
    numberOfPeople: numberOfPeopleRaw ? Number(numberOfPeopleRaw) : undefined,
  });
}

export async function updateQuotationStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const quotationId = String(formData.get("quotationId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!quotationId || !status) return { ok: false, error: "Invalid request." };

  const result = await updateQuotationStatus({ quotationId, status });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/admin/pricing/quotations/${quotationId}`);
  revalidatePath("/admin/pricing/quotations");
  return { ok: true };
}

export async function associateQuotationWithClientAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const quotationId = String(formData.get("quotationId") ?? "");
  const clientProfileId = String(formData.get("clientProfileId") ?? "");
  if (!quotationId || !clientProfileId) return { ok: false, error: "Choose a registered Client." };

  const result = await associateProspectQuotationWithClient({ quotationId, clientProfileId });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/admin/pricing/quotations/${quotationId}`);
  return { ok: true };
}
