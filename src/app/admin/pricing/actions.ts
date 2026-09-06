"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import {
  createPersonalSessionRateVersion,
  setPricingMarketActive,
  createSubjectCategoryMultiplierVersion,
  createAdditionalRetouchRateVersion,
} from "@/lib/pricing/personalSessionPricing";
import { createDiscountCode, setDiscountCodeActive, recordManualDiscount } from "@/lib/pricing/discounts";
import {
  createCorporateHeadshotRateVersion,
  createCorporateTeamTierRateVersion,
  createCorporateMinimumBookingVersion,
  createCorporateRetouchRateVersion,
  createCorporatePriorityDeliveryVersion,
  type CorporatePriorityDeliveryScopeSlug,
} from "@/lib/pricing/corporateHeadshotPricing";
import {
  createCommercialCreativeFeeRateVersion,
  createCommercialCatalogueBaseRateVersion,
  createCommercialCatalogueMinimumVersion,
  createCommercialPostProductionRateVersion,
  createCommercialPercentageVersion,
  createCommercialLicensingFactorVersion,
  createCommercialReviewThresholdVersion,
  type CommercialServiceMode,
  type CommercialScopeSlug,
  type CommercialPostProductionItemSlug,
} from "@/lib/pricing/commercialPricing";
import {
  createWeddingEventTierRateVersion,
  createWeddingEventPriorityDeliveryVersion,
  createWeddingEventAddonRateVersion,
  createWeddingEventPercentageRateVersion,
  type WeddingEventCategory,
  type ServiceMode,
  type AddonSlug,
  type PercentageSlug,
} from "@/lib/pricing/weddingEventPricing";

// Ordift Pricing Engine V1 (2026-09-06) — thin Server Action wrappers.
// All real authorization/validation/audit logic lives in
// src/lib/pricing/* (authorizeWithSuperAdminOverride + logActivity),
// matching the established Payables pattern — these actions only read
// the current session and hand off to it, same shape as every other
// admin Server Action in this codebase.

export async function createPersonalSessionRateVersionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const marketSlug = String(formData.get("marketSlug") ?? "");
  const durationHours = Number(formData.get("durationHours"));
  const priceUsd = Number(formData.get("priceUsd"));
  const signatureRetouchedImages = Number(formData.get("signatureRetouchedImages"));
  const professionallyEditedImages = Number(formData.get("professionallyEditedImages"));
  if (!marketSlug || ![1, 2, 3, 4].includes(durationHours) || !Number.isFinite(priceUsd)) return;

  const result = await createPersonalSessionRateVersion({
    marketSlug,
    durationHours: durationHours as 1 | 2 | 3 | 4,
    priceUsd,
    signatureRetouchedImages,
    professionallyEditedImages,
    actorUserId: user.id,
  });
  if (!result.ok) console.error("[admin] failed to create personal session rate version", result.error);

  revalidatePath("/admin/pricing");
}

export async function setPricingMarketActiveAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const marketSlug = String(formData.get("marketSlug") ?? "");
  const active = formData.get("active") === "true";
  if (!marketSlug) return;

  const result = await setPricingMarketActive({ marketSlug, active: !active, actorUserId: user.id });
  if (!result.ok) console.error("[admin] failed to update pricing market", result.error);

  revalidatePath("/admin/pricing");
}

export async function createDiscountCodeAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const code = String(formData.get("code") ?? "");
  const value = Number(formData.get("value"));
  const reason = String(formData.get("reason") ?? "");
  if (!code || !Number.isFinite(value)) return;

  const result = await createDiscountCode({
    code,
    discountType: "percentage",
    value,
    validFrom: new Date().toISOString(),
    validTo: null,
    maxUses: null,
    maxUsesPerClient: null,
    reason,
    actorUserId: user.id,
  });
  if (!result.ok) console.error("[admin] failed to create discount code", result.error);

  revalidatePath("/admin/pricing");
}

export async function setDiscountCodeActiveAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const discountCodeId = String(formData.get("discountCodeId") ?? "");
  const active = formData.get("active") === "true";
  if (!discountCodeId) return;

  const result = await setDiscountCodeActive({ discountCodeId, active: !active, actorUserId: user.id });
  if (!result.ok) console.error("[admin] failed to update discount code", result.error);

  revalidatePath("/admin/pricing");
}

// Pricing Engine V1.1 (2026-09-06)

export async function createSubjectCategoryMultiplierVersionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const subjectCategorySlug = String(formData.get("subjectCategorySlug") ?? "");
  const priceMultiplier = Number(formData.get("priceMultiplier"));
  if (!subjectCategorySlug || !Number.isFinite(priceMultiplier)) return;

  const result = await createSubjectCategoryMultiplierVersion({ subjectCategorySlug, priceMultiplier, actorUserId: user.id });
  if (!result.ok) console.error("[admin] failed to create subject category multiplier version", result.error);

  revalidatePath("/admin/pricing");
}

export async function createAdditionalRetouchRateVersionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const marketSlug = String(formData.get("marketSlug") ?? "");
  const pricePerImageUsd = Number(formData.get("pricePerImageUsd"));
  if (!marketSlug || !Number.isFinite(pricePerImageUsd)) return;

  const result = await createAdditionalRetouchRateVersion({ marketSlug, pricePerImageUsd, actorUserId: user.id });
  if (!result.ok) console.error("[admin] failed to create additional retouch rate version", result.error);

  revalidatePath("/admin/pricing");
}

// Manual, admin-only percentage discount — never exposed to the public
// calculator. reason and a reference (what this discount applies to)
// are both required, matching the exact audit fields the business
// requirement specifies; recordManualDiscount() itself performs the
// authorization check and writes both the discount_redemptions audit
// row and the activity_log entry.
export async function applyManualDiscountAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const originalAmountUsd = Number(formData.get("originalAmountUsd"));
  const value = Number(formData.get("value"));
  const referenceType = String(formData.get("referenceType") ?? "enquiry");
  const referenceId = String(formData.get("referenceId") ?? "").trim() || null;
  const reason = String(formData.get("reason") ?? "");
  if (!Number.isFinite(originalAmountUsd) || !Number.isFinite(value)) return;

  const result = await recordManualDiscount({
    originalAmountUsd,
    discountType: "percentage",
    value,
    referenceType,
    referenceId,
    actorUserId: user.id,
    reason,
  });
  if (!result.ok) console.error("[admin] failed to apply manual discount", result.error);

  revalidatePath("/admin/pricing");
}

// Corporate & Headshots Pricing V1 (2026-09-06) — thin wrappers, same
// shape as every action above: read the session, hand off to the lib
// function (which performs authorization + unchanged-value-skip +
// append-only versioning + activity logging), then revalidate.

export async function createCorporateHeadshotRateVersionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const marketSlug = String(formData.get("marketSlug") ?? "");
  const productSlug = String(formData.get("productSlug") ?? "");
  const priceUsd = Number(formData.get("priceUsd"));
  const signatureRetouchedImages = Number(formData.get("signatureRetouchedImages"));
  if (!marketSlug || (productSlug !== "individual_headshot" && productSlug !== "executive_portrait") || !Number.isFinite(priceUsd)) return;

  const result = await createCorporateHeadshotRateVersion({
    marketSlug,
    productSlug,
    priceUsd,
    signatureRetouchedImages,
    actorUserId: user.id,
  });
  if (!result.ok) console.error("[admin] failed to create corporate headshot rate version", result.error);

  revalidatePath("/admin/pricing");
}

export async function createCorporateTeamTierRateVersionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const marketSlug = String(formData.get("marketSlug") ?? "");
  const tierSlug = String(formData.get("tierSlug") ?? "");
  const pricePerPersonUsd = Number(formData.get("pricePerPersonUsd"));
  if (!marketSlug || !["2-5", "6-10", "11-25", "26-50"].includes(tierSlug) || !Number.isFinite(pricePerPersonUsd)) return;

  const result = await createCorporateTeamTierRateVersion({
    marketSlug,
    tierSlug: tierSlug as "2-5" | "6-10" | "11-25" | "26-50",
    pricePerPersonUsd,
    actorUserId: user.id,
  });
  if (!result.ok) console.error("[admin] failed to create corporate team tier rate version", result.error);

  revalidatePath("/admin/pricing");
}

export async function createCorporateMinimumBookingVersionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const marketSlug = String(formData.get("marketSlug") ?? "");
  const minimumAmountUsd = Number(formData.get("minimumAmountUsd"));
  if (!marketSlug || !Number.isFinite(minimumAmountUsd)) return;

  const result = await createCorporateMinimumBookingVersion({ marketSlug, minimumAmountUsd, actorUserId: user.id });
  if (!result.ok) console.error("[admin] failed to create corporate minimum booking version", result.error);

  revalidatePath("/admin/pricing");
}

export async function createCorporateRetouchRateVersionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const marketSlug = String(formData.get("marketSlug") ?? "");
  const pricePerImageUsd = Number(formData.get("pricePerImageUsd"));
  if (!marketSlug || !Number.isFinite(pricePerImageUsd)) return;

  const result = await createCorporateRetouchRateVersion({ marketSlug, pricePerImageUsd, actorUserId: user.id });
  if (!result.ok) console.error("[admin] failed to create corporate retouch rate version", result.error);

  revalidatePath("/admin/pricing");
}

const CORPORATE_PRIORITY_SCOPES: CorporatePriorityDeliveryScopeSlug[] = ["individual_headshot", "executive_portrait", "team_2_5", "team_6_10", "team_11_25", "team_26_50"];

// Corporate Priority Delivery correction (2026-09-06): now takes an
// explicit scopeSlug — the percentage varies by product/team-tier.
export async function createCorporatePriorityDeliveryVersionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const scopeSlug = String(formData.get("scopeSlug") ?? "");
  const multiplierPercentage = Number(formData.get("multiplierPercentage"));
  if (!CORPORATE_PRIORITY_SCOPES.includes(scopeSlug as CorporatePriorityDeliveryScopeSlug) || !Number.isFinite(multiplierPercentage)) return;

  const result = await createCorporatePriorityDeliveryVersion({ scopeSlug: scopeSlug as CorporatePriorityDeliveryScopeSlug, multiplierPercentage, actorUserId: user.id });
  if (!result.ok) console.error("[admin] failed to create corporate priority delivery version", result.error);

  revalidatePath("/admin/pricing");
}

// ============================================================
// Weddings & Events Pricing V1 (2026-09-06)
// ============================================================

export async function createWeddingEventTierRateVersionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const marketSlug = String(formData.get("marketSlug") ?? "");
  const category = String(formData.get("category") ?? "");
  const serviceMode = String(formData.get("serviceMode") ?? "");
  const tierSlug = String(formData.get("tierSlug") ?? "");
  const priceUsd = Number(formData.get("priceUsd"));
  if (!marketSlug || (category !== "wedding" && category !== "event") || !tierSlug || !Number.isFinite(priceUsd)) return;

  const result = await createWeddingEventTierRateVersion({
    marketSlug,
    category: category as WeddingEventCategory,
    serviceMode: serviceMode as ServiceMode,
    tierSlug,
    priceUsd,
    actorUserId: user.id,
  });
  if (!result.ok) console.error("[admin] failed to create wedding/event tier rate version", result.error);

  revalidatePath("/admin/pricing");
}

export async function createWeddingEventPriorityDeliveryVersionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const category = String(formData.get("category") ?? "");
  const tierSlug = String(formData.get("tierSlug") ?? "");
  const multiplierPercentage = Number(formData.get("multiplierPercentage"));
  if ((category !== "wedding" && category !== "event") || !tierSlug || !Number.isFinite(multiplierPercentage)) return;

  const result = await createWeddingEventPriorityDeliveryVersion({ category: category as WeddingEventCategory, tierSlug, multiplierPercentage, actorUserId: user.id });
  if (!result.ok) console.error("[admin] failed to create wedding/event priority delivery version", result.error);

  revalidatePath("/admin/pricing");
}

export async function createWeddingEventAddonRateVersionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const marketSlug = String(formData.get("marketSlug") ?? "");
  const addonSlug = String(formData.get("addonSlug") ?? "");
  const priceUsd = Number(formData.get("priceUsd"));
  if (!marketSlug || !addonSlug || !Number.isFinite(priceUsd)) return;

  const result = await createWeddingEventAddonRateVersion({ marketSlug, addonSlug: addonSlug as AddonSlug, priceUsd, actorUserId: user.id });
  if (!result.ok) console.error("[admin] failed to create wedding/event addon rate version", result.error);

  revalidatePath("/admin/pricing");
}

export async function createWeddingEventPercentageRateVersionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const percentageSlug = String(formData.get("percentageSlug") ?? "");
  const percentage = Number(formData.get("percentage"));
  if (!percentageSlug || !Number.isFinite(percentage)) return;

  const result = await createWeddingEventPercentageRateVersion({ percentageSlug: percentageSlug as PercentageSlug, percentage, actorUserId: user.id });
  if (!result.ok) console.error("[admin] failed to create wedding/event percentage rate version", result.error);

  revalidatePath("/admin/pricing");
}

// ============================================================
// Commercial & Advertising Pricing V1 (2026-09-07)
// ============================================================

export async function createCommercialCreativeFeeRateVersionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const marketSlug = String(formData.get("marketSlug") ?? "");
  const serviceMode = String(formData.get("serviceMode") ?? "");
  const scopeSlug = String(formData.get("scopeSlug") ?? "");
  const priceUsd = Number(formData.get("priceUsd"));
  if (!marketSlug || !serviceMode || !scopeSlug || !Number.isFinite(priceUsd)) return;

  const result = await createCommercialCreativeFeeRateVersion({
    marketSlug,
    serviceMode: serviceMode as CommercialServiceMode,
    scopeSlug: scopeSlug as CommercialScopeSlug,
    priceUsd,
    actorUserId: user.id,
  });
  if (!result.ok) console.error("[admin] failed to create commercial creative fee rate version", result.error);

  revalidatePath("/admin/pricing");
}

export async function createCommercialCatalogueBaseRateVersionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const marketSlug = String(formData.get("marketSlug") ?? "");
  const priceUsd = Number(formData.get("priceUsd"));
  if (!marketSlug || !Number.isFinite(priceUsd)) return;

  const result = await createCommercialCatalogueBaseRateVersion({ marketSlug, priceUsd, actorUserId: user.id });
  if (!result.ok) console.error("[admin] failed to create commercial catalogue base rate version", result.error);

  revalidatePath("/admin/pricing");
}

export async function createCommercialCatalogueMinimumVersionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const marketSlug = String(formData.get("marketSlug") ?? "");
  const minimumUsd = Number(formData.get("minimumUsd"));
  if (!marketSlug || !Number.isFinite(minimumUsd)) return;

  const result = await createCommercialCatalogueMinimumVersion({ marketSlug, minimumUsd, actorUserId: user.id });
  if (!result.ok) console.error("[admin] failed to create commercial catalogue minimum version", result.error);

  revalidatePath("/admin/pricing");
}

export async function createCommercialPostProductionRateVersionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const itemSlug = String(formData.get("itemSlug") ?? "");
  const priceUsd = Number(formData.get("priceUsd"));
  const isFromPrice = formData.get("isFromPrice") === "true";
  if (!itemSlug || !Number.isFinite(priceUsd)) return;

  const result = await createCommercialPostProductionRateVersion({ itemSlug: itemSlug as CommercialPostProductionItemSlug, priceUsd, isFromPrice, actorUserId: user.id });
  if (!result.ok) console.error("[admin] failed to create commercial post-production rate version", result.error);

  revalidatePath("/admin/pricing");
}

export async function createCommercialPercentageVersionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const percentageSlug = String(formData.get("percentageSlug") ?? "");
  const percentage = Number(formData.get("percentage"));
  if ((percentageSlug !== "priority_postproduction" && percentageSlug !== "licensing_floor") || !Number.isFinite(percentage)) return;

  const result = await createCommercialPercentageVersion({ percentageSlug, percentage, actorUserId: user.id });
  if (!result.ok) console.error("[admin] failed to create commercial percentage version", result.error);

  revalidatePath("/admin/pricing");
}

export async function createCommercialLicensingFactorVersionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const factorType = String(formData.get("factorType") ?? "");
  const factorSlug = String(formData.get("factorSlug") ?? "");
  const factorValue = Number(formData.get("factorValue"));
  if (!["usage", "duration", "territory", "exclusivity"].includes(factorType) || !factorSlug || !Number.isFinite(factorValue)) return;

  const result = await createCommercialLicensingFactorVersion({ factorType: factorType as "usage" | "duration" | "territory" | "exclusivity", factorSlug, factorValue, actorUserId: user.id });
  if (!result.ok) console.error("[admin] failed to create commercial licensing factor version", result.error);

  revalidatePath("/admin/pricing");
}

export async function createCommercialReviewThresholdVersionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const marketSlug = String(formData.get("marketSlug") ?? "");
  const reviewUsd = Number(formData.get("reviewUsd"));
  const mandatoryUsd = Number(formData.get("mandatoryUsd"));
  if (!marketSlug || !Number.isFinite(reviewUsd) || !Number.isFinite(mandatoryUsd)) return;

  const result = await createCommercialReviewThresholdVersion({ marketSlug, reviewUsd, mandatoryUsd, actorUserId: user.id });
  if (!result.ok) console.error("[admin] failed to create commercial review threshold version", result.error);

  revalidatePath("/admin/pricing");
}
