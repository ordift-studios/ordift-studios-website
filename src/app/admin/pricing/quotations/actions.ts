"use server";

import { revalidatePath } from "next/cache";
import {
  createClientQuotation,
  updateQuotationStatus,
  associateProspectQuotationWithClient,
  type QuotationLineItemInput,
} from "@/lib/commercial/clientQuotations";

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
    if (serviceItem && unitBasis && quantity > 0 && sellingRate >= 0) {
      items.push({
        serviceItem,
        description,
        quantity,
        unitBasis,
        sellingRate,
        discountPercent: discountPercentRaw ? Number(discountPercentRaw) : null,
        taxPercent: taxPercentRaw ? Number(taxPercentRaw) : null,
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
