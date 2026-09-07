"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { createSupplier, updateSupplier, setSupplierActive, type ProductionSupplierType } from "@/lib/production/suppliers";
import { createSupplierQuote, setSupplierQuoteStatus, type ProductionSupplierQuoteStatus } from "@/lib/production/supplierQuotes";
import { createBudgetVersion, setChangeClientApprovalStatus, type ProductionBudgetStatus, type ProductionBudgetLineItem } from "@/lib/production/budgets";

// Production Operations Admin UI (2026-09-07) — thin Server Action
// wrappers over the governed lib functions built in Production
// Services V1, same established pattern as every other Admin
// actions.ts in this codebase: resolve the actor, call the lib
// function (which re-checks authorization and writes the audit log
// itself), revalidate, done. No new authorization logic here.

export async function createSupplierAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const supplierName = String(formData.get("supplierName") ?? "");
  const supplierType = String(formData.get("supplierType") ?? "") as ProductionSupplierType;
  if (!supplierName.trim() || !supplierType) return;

  const capabilitiesRaw = String(formData.get("capabilities") ?? "");
  const capabilities = capabilitiesRaw
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  const result = await createSupplier({
    supplierName,
    supplierType,
    marketSlug: (formData.get("marketSlug") as string) || null,
    contactName: (formData.get("contactName") as string) || null,
    contactEmail: (formData.get("contactEmail") as string) || null,
    contactPhone: (formData.get("contactPhone") as string) || null,
    currencyCode: (formData.get("currencyCode") as string) || null,
    indicativeRate: formData.get("indicativeRate") ? Number(formData.get("indicativeRate")) : null,
    rateUnit: (formData.get("rateUnit") as string) || null,
    capabilities: capabilities.length > 0 ? capabilities : null,
    availabilityNotes: (formData.get("availabilityNotes") as string) || null,
    internalNotes: (formData.get("internalNotes") as string) || null,
    paymentTerms: (formData.get("paymentTerms") as string) || null,
    actorUserId: user.id,
  });
  if (!result.ok) console.error("[admin] failed to create production supplier", result.error);

  revalidatePath("/admin/production/suppliers");
  revalidatePath("/admin/production");
}

export async function updateSupplierAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const supplierId = String(formData.get("supplierId") ?? "");
  if (!supplierId) return;

  const result = await updateSupplier({
    supplierId,
    marketSlug: formData.has("marketSlug") ? ((formData.get("marketSlug") as string) || null) : undefined,
    locationNotes: formData.has("locationNotes") ? ((formData.get("locationNotes") as string) || null) : undefined,
    contactName: formData.has("contactName") ? ((formData.get("contactName") as string) || null) : undefined,
    contactEmail: formData.has("contactEmail") ? ((formData.get("contactEmail") as string) || null) : undefined,
    contactPhone: formData.has("contactPhone") ? ((formData.get("contactPhone") as string) || null) : undefined,
    currencyCode: formData.has("currencyCode") ? ((formData.get("currencyCode") as string) || null) : undefined,
    indicativeRate: formData.has("indicativeRate") ? (formData.get("indicativeRate") ? Number(formData.get("indicativeRate")) : null) : undefined,
    rateUnit: formData.has("rateUnit") ? ((formData.get("rateUnit") as string) || null) : undefined,
    availabilityNotes: formData.has("availabilityNotes") ? ((formData.get("availabilityNotes") as string) || null) : undefined,
    internalNotes: formData.has("internalNotes") ? ((formData.get("internalNotes") as string) || null) : undefined,
    supportingReference: formData.has("supportingReference") ? ((formData.get("supportingReference") as string) || null) : undefined,
    paymentTerms: formData.has("paymentTerms") ? ((formData.get("paymentTerms") as string) || null) : undefined,
    payeeProfileId: formData.has("payeeProfileId") ? ((formData.get("payeeProfileId") as string) || null) : undefined,
    markVerifiedNow: formData.get("markVerifiedNow") === "true",
    actorUserId: user.id,
  });
  if (!result.ok) console.error("[admin] failed to update production supplier", result.error);

  revalidatePath(`/admin/production/suppliers/${supplierId}`);
  revalidatePath("/admin/production/suppliers");
}

export async function setSupplierActiveAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const supplierId = String(formData.get("supplierId") ?? "");
  const active = formData.get("active") === "true";
  if (!supplierId) return;

  const result = await setSupplierActive({ supplierId, active: !active, actorUserId: user.id });
  if (!result.ok) console.error("[admin] failed to update production supplier active state", result.error);

  revalidatePath(`/admin/production/suppliers/${supplierId}`);
  revalidatePath("/admin/production/suppliers");
}

export async function createSupplierQuoteAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const supplierId = String(formData.get("supplierId") ?? "");
  const referenceType = String(formData.get("referenceType") ?? "");
  const referenceId = String(formData.get("referenceId") ?? "");
  const description = String(formData.get("description") ?? "");
  const originalCurrencyCode = String(formData.get("originalCurrencyCode") ?? "");
  const supplierSubtotal = Number(formData.get("supplierSubtotal"));
  if (!supplierId || !referenceType || !referenceId || !description || !originalCurrencyCode || !Number.isFinite(supplierSubtotal)) return;

  const result = await createSupplierQuote({
    supplierId,
    referenceType,
    referenceId,
    description,
    originalCurrencyCode,
    supplierSubtotal,
    taxAmount: formData.get("taxAmount") ? Number(formData.get("taxAmount")) : null,
    validUntil: (formData.get("validUntil") as string) || null,
    depositRequired: formData.get("depositRequired") === "true",
    depositAmount: formData.get("depositAmount") ? Number(formData.get("depositAmount")) : null,
    depositPercentage: formData.get("depositPercentage") ? Number(formData.get("depositPercentage")) : null,
    cancellationTerms: (formData.get("cancellationTerms") as string) || null,
    sourceReference: (formData.get("sourceReference") as string) || null,
    internalNotes: (formData.get("internalNotes") as string) || null,
    actorUserId: user.id,
  });
  if (!result.ok) console.error("[admin] failed to create production supplier quote", result.error);

  revalidatePath("/admin/production/quotes");
  revalidatePath("/admin/production");
}

export async function setSupplierQuoteStatusAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const quoteId = String(formData.get("quoteId") ?? "");
  const status = String(formData.get("status") ?? "") as ProductionSupplierQuoteStatus;
  if (!quoteId || !status) return;

  const result = await setSupplierQuoteStatus({ quoteId, status, actorUserId: user.id });
  if (!result.ok) console.error("[admin] failed to update production supplier quote status", result.error);

  revalidatePath(`/admin/production/quotes/${quoteId}`);
  revalidatePath("/admin/production/quotes");
}

export async function createBudgetVersionAction(formData: FormData): Promise<{ ok: true } | { ok: false; error: string; requiresChangeReason?: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const referenceType = String(formData.get("referenceType") ?? "");
  const referenceId = String(formData.get("referenceId") ?? "");
  const status = String(formData.get("status") ?? "") as ProductionBudgetStatus;
  if (!referenceType || !referenceId || !status) return { ok: false, error: "Reference and status are required." };

  let lineItems: ProductionBudgetLineItem[] = [];
  const lineItemsRaw = formData.get("lineItemsJson");
  if (lineItemsRaw) {
    try {
      lineItems = JSON.parse(String(lineItemsRaw));
    } catch {
      return { ok: false, error: "Line items were not valid — try again." };
    }
  }

  const totalRaw = formData.get("totalUsd");
  const totalUsd = totalRaw && String(totalRaw).trim() !== "" ? Number(totalRaw) : null;

  const result = await createBudgetVersion({
    referenceType,
    referenceId,
    status,
    lineItems,
    contingencyEnabled: formData.get("contingencyEnabled") === "true",
    contingencyPercentage: formData.get("contingencyPercentage") ? Number(formData.get("contingencyPercentage")) : null,
    contingencyAmountUsd: formData.get("contingencyAmountUsd") ? Number(formData.get("contingencyAmountUsd")) : null,
    totalUsd,
    notes: (formData.get("notes") as string) || null,
    changeReason: (formData.get("changeReason") as string) || undefined,
    actorUserId: user.id,
  });

  revalidatePath("/admin/production/budgets");
  revalidatePath("/admin/production");
  if (!result.ok) return result;
  revalidatePath(`/admin/production/budgets/${result.id}`);
  return { ok: true };
}

export async function setChangeClientApprovalStatusAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const changeId = String(formData.get("changeId") ?? "");
  const status = String(formData.get("status") ?? "") as "approved" | "rejected";
  if (!changeId || (status !== "approved" && status !== "rejected")) return;

  const result = await setChangeClientApprovalStatus({ changeId, status, actorUserId: user.id });
  if (!result.ok) console.error("[admin] failed to update budget change approval status", result.error);

  revalidatePath("/admin/production/changes");
  revalidatePath("/admin/production/budgets");
}
