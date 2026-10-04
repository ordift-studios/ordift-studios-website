"use server";

import { revalidatePath } from "next/cache";
import { actionOk, actionFail, type ActionState } from "@/lib/shared/actionState";
import { getCurrentUser } from "@/lib/portal/roles";
import {
  createPersonalSessionRateVersion,
  setPricingMarketActive,
  createSubjectCategoryMultiplierVersion,
  createAdditionalRetouchRateVersion,
} from "@/lib/pricing/personalSessionPricing";
import { createDiscountCode, setDiscountCodeActive, recordManualDiscount, deleteDiscountCode, type DeleteDiscountCodeResult } from "@/lib/pricing/discounts";
import {
  createGraphicDesignDeliverableRateVersion,
  createGraphicDesignComplexityFactorVersion,
  createGraphicDesignAddonRateVersion,
  createGraphicDesignPercentageVersion,
  type GraphicDesignDeliverableSlug,
  type GraphicDesignComplexity,
  type GraphicDesignAddonSlug,
  type GraphicDesignPercentageSlug,
} from "@/lib/pricing/graphicDesignPricing";
import {
  createContentCreationPackageRateVersion,
  createContentCreationRetainerRateVersion,
  createContentCreationAddonRateVersion,
  createContentCreationPercentageVersion,
  type ContentCreationPackageSlug,
  type ContentCreationRetainerSlug,
  type ContentCreationAddonSlug,
  type ContentCreationPercentageSlug,
} from "@/lib/pricing/contentCreationPricing";
import {
  createBrandingTierRateVersion,
  createBrandingRevisionMinimumVersion,
  createBrandingPercentageVersion,
  type BrandingTierSlug,
  type BrandingPercentageSlug,
} from "@/lib/pricing/brandingPricing";
import {
  createRateVersion as createProductionRateVersion,
  createPercentageVersion as createProductionPercentageVersion,
  type ProductionServicesRateSlug,
  type ProductionServicesPercentageSlug,
} from "@/lib/pricing/productionServicesPricing";
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
  type AddonSlug,
  type PercentageSlug,
} from "@/lib/pricing/weddingEventPricing";
import { saveTierRate, type TierRateSaveState } from "./tierRateSave";

// Ordift Pricing Engine V1 (2026-09-06) — thin Server Action wrappers.
// All real authorization/validation/audit logic lives in
// src/lib/pricing/* (authorizeWithSuperAdminOverride + logActivity),
// matching the established Payables pattern — these actions only read
// the current session and hand off to it, same shape as every other
// admin Server Action in this codebase.

export async function createPersonalSessionRateVersionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");

  const marketSlug = String(formData.get("marketSlug") ?? "");
  const durationHours = Number(formData.get("durationHours"));
  const priceUsd = Number(formData.get("priceUsd"));
  const signatureRetouchedImages = Number(formData.get("signatureRetouchedImages"));
  const professionallyEditedImages = Number(formData.get("professionallyEditedImages"));
  if (!marketSlug || ![1, 2, 3, 4].includes(durationHours) || !Number.isFinite(priceUsd)) return actionFail("Enter valid values and try again.");

  const result = await createPersonalSessionRateVersion({
    marketSlug,
    durationHours: durationHours as 1 | 2 | 3 | 4,
    priceUsd,
    signatureRetouchedImages,
    professionallyEditedImages,
    actorUserId: user.id,
  });
  if (!result.ok) {
    console.error("[admin] failed to create personal session rate version", result.error);
    return actionFail(result.error);
  }

  revalidatePath("/admin/pricing");
  return actionOk("unchanged" in result && result.unchanged ? "No change — the active value is already this." : "Saved — now active.");
}

export async function setPricingMarketActiveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");

  const marketSlug = String(formData.get("marketSlug") ?? "");
  const active = formData.get("active") === "true";
  if (!marketSlug) return actionFail("Enter valid values and try again.");

  const result = await setPricingMarketActive({ marketSlug, active: !active, actorUserId: user.id });
  if (!result.ok) {
    console.error("[admin] failed to update pricing market", result.error);
    return actionFail(result.error);
  }

  revalidatePath("/admin/pricing");
  return actionOk("unchanged" in result && result.unchanged ? "No change — the active value is already this." : "Saved — now active.");
}

export async function createDiscountCodeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");

  const code = String(formData.get("code") ?? "");
  const value = Number(formData.get("value"));
  const reason = String(formData.get("reason") ?? "");
  if (!code || !Number.isFinite(value)) return actionFail("Enter a code and a valid percentage.");

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
  if (!result.ok) {
    console.error("[admin] failed to create discount code", result.error);
    return actionFail(result.error);
  }

  revalidatePath("/admin/pricing");
  return actionOk("Discount code created (inactive).");
}

export async function setDiscountCodeActiveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");

  const discountCodeId = String(formData.get("discountCodeId") ?? "");
  const active = formData.get("active") === "true";
  if (!discountCodeId) return actionFail("Enter valid values and try again.");

  const result = await setDiscountCodeActive({ discountCodeId, active: !active, actorUserId: user.id });
  if (!result.ok) {
    console.error("[admin] failed to update discount code", result.error);
    return actionFail(result.error);
  }

  revalidatePath("/admin/pricing");
  return actionOk("unchanged" in result && result.unchanged ? "No change — the active value is already this." : "Saved — now active.");
}

// Discount Lifecycle Refinement (2026-09-07) — called directly from
// DeleteDiscountButton.tsx's client-side type-to-confirm flow (same
// established pattern as deletePortfolioProjectAction), not a plain
// <form action>, so the caller can distinguish "deleted" from
// "archived instead" and show the right message.
// ============================================================
// Branding & Creative Strategy Pricing V1 (2026-09-07)
// ============================================================

export async function createBrandingTierRateVersionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");

  const marketSlug = String(formData.get("marketSlug") ?? "");
  const tierSlug = String(formData.get("tierSlug") ?? "");
  const priceUsd = Number(formData.get("priceUsd"));
  if (!marketSlug || !tierSlug || !Number.isFinite(priceUsd)) return actionFail("Enter valid values and try again.");

  const result = await createBrandingTierRateVersion({ marketSlug, tierSlug: tierSlug as BrandingTierSlug, priceUsd, actorUserId: user.id });
  if (!result.ok) {
    console.error("[admin] failed to create branding tier rate version", result.error);
    return actionFail(result.error);
  }

  revalidatePath("/admin/pricing");
  return actionOk("unchanged" in result && result.unchanged ? "No change — the active value is already this." : "Saved — now active.");
}

export async function createBrandingRevisionMinimumVersionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");

  const marketSlug = String(formData.get("marketSlug") ?? "");
  const minimumUsd = Number(formData.get("minimumUsd"));
  if (!marketSlug || !Number.isFinite(minimumUsd)) return actionFail("Enter valid values and try again.");

  const result = await createBrandingRevisionMinimumVersion({ marketSlug, minimumUsd, actorUserId: user.id });
  if (!result.ok) {
    console.error("[admin] failed to create branding revision minimum version", result.error);
    return actionFail(result.error);
  }

  revalidatePath("/admin/pricing");
  return actionOk("unchanged" in result && result.unchanged ? "No change — the active value is already this." : "Saved — now active.");
}

export async function createBrandingPercentageVersionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");

  const percentageSlug = String(formData.get("percentageSlug") ?? "");
  const percentage = Number(formData.get("percentage"));
  if (!percentageSlug || !Number.isFinite(percentage)) return actionFail("Enter valid values and try again.");

  const result = await createBrandingPercentageVersion({ percentageSlug: percentageSlug as BrandingPercentageSlug, percentage, actorUserId: user.id });
  if (!result.ok) {
    console.error("[admin] failed to create branding percentage version", result.error);
    return actionFail(result.error);
  }

  revalidatePath("/admin/pricing");
  return actionOk("unchanged" in result && result.unchanged ? "No change — the active value is already this." : "Saved — now active.");
}

// ============================================================
// Production Services Pricing V1 (2026-09-07)
// ============================================================

export async function createProductionRateVersionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");

  const marketSlug = String(formData.get("marketSlug") ?? "");
  const rateSlug = String(formData.get("rateSlug") ?? "");
  const priceUsd = Number(formData.get("priceUsd"));
  if (!marketSlug || !rateSlug || !Number.isFinite(priceUsd)) return actionFail("Enter valid values and try again.");

  const result = await createProductionRateVersion({ marketSlug, rateSlug: rateSlug as ProductionServicesRateSlug, priceUsd, actorUserId: user.id });
  if (!result.ok) {
    console.error("[admin] failed to create production services rate version", result.error);
    return actionFail(result.error);
  }

  revalidatePath("/admin/pricing");
  return actionOk("unchanged" in result && result.unchanged ? "No change — the active value is already this." : "Saved — now active.");
}

export async function createProductionPercentageVersionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");

  const percentageSlug = String(formData.get("percentageSlug") ?? "");
  const percentage = Number(formData.get("percentage"));
  if (!percentageSlug || !Number.isFinite(percentage)) return actionFail("Enter valid values and try again.");

  const result = await createProductionPercentageVersion({ percentageSlug: percentageSlug as ProductionServicesPercentageSlug, percentage, actorUserId: user.id });
  if (!result.ok) {
    console.error("[admin] failed to create production services percentage version", result.error);
    return actionFail(result.error);
  }

  revalidatePath("/admin/pricing");
  return actionOk("unchanged" in result && result.unchanged ? "No change — the active value is already this." : "Saved — now active.");
}

export async function deleteDiscountCodeAction(discountCodeId: string): Promise<DeleteDiscountCodeResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const result = await deleteDiscountCode({ discountCodeId, actorUserId: user.id });
  revalidatePath("/admin/pricing");
  return result;
}

// Pricing Engine V1.1 (2026-09-06)

export async function createSubjectCategoryMultiplierVersionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");

  const subjectCategorySlug = String(formData.get("subjectCategorySlug") ?? "");
  const priceMultiplier = Number(formData.get("priceMultiplier"));
  if (!subjectCategorySlug || !Number.isFinite(priceMultiplier)) return actionFail("Enter valid values and try again.");

  const result = await createSubjectCategoryMultiplierVersion({ subjectCategorySlug, priceMultiplier, actorUserId: user.id });
  if (!result.ok) {
    console.error("[admin] failed to create subject category multiplier version", result.error);
    return actionFail(result.error);
  }

  revalidatePath("/admin/pricing");
  return actionOk("unchanged" in result && result.unchanged ? "No change — the active value is already this." : "Saved — now active.");
}

export async function createAdditionalRetouchRateVersionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");

  const marketSlug = String(formData.get("marketSlug") ?? "");
  const pricePerImageUsd = Number(formData.get("pricePerImageUsd"));
  if (!marketSlug || !Number.isFinite(pricePerImageUsd)) return actionFail("Enter valid values and try again.");

  const result = await createAdditionalRetouchRateVersion({ marketSlug, pricePerImageUsd, actorUserId: user.id });
  if (!result.ok) {
    console.error("[admin] failed to create additional retouch rate version", result.error);
    return actionFail(result.error);
  }

  revalidatePath("/admin/pricing");
  return actionOk("unchanged" in result && result.unchanged ? "No change — the active value is already this." : "Saved — now active.");
}

// Manual, admin-only percentage discount — never exposed to the public
// calculator. reason and a reference (what this discount applies to)
// are both required, matching the exact audit fields the business
// requirement specifies; recordManualDiscount() itself performs the
// authorization check and writes both the discount_redemptions audit
// row and the activity_log entry.
export async function applyManualDiscountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");

  const originalAmountUsd = Number(formData.get("originalAmountUsd"));
  const value = Number(formData.get("value"));
  const referenceType = String(formData.get("referenceType") ?? "enquiry");
  const referenceId = String(formData.get("referenceId") ?? "").trim() || null;
  const reason = String(formData.get("reason") ?? "");
  if (!Number.isFinite(originalAmountUsd) || !Number.isFinite(value)) return actionFail("Nothing was saved — check the details and try again.");

  const result = await recordManualDiscount({
    originalAmountUsd,
    discountType: "percentage",
    value,
    referenceType,
    referenceId,
    actorUserId: user.id,
    reason,
  });
  if (!result.ok) {
    console.error("[admin] failed to apply manual discount", result.error);
    return actionFail(result.error);
  }

  revalidatePath("/admin/pricing");
  return actionOk("Applied.");
}

// Corporate & Headshots Pricing V1 (2026-09-06) — thin wrappers, same
// shape as every action above: read the session, hand off to the lib
// function (which performs authorization + unchanged-value-skip +
// append-only versioning + activity logging), then revalidate.

export async function createCorporateHeadshotRateVersionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");

  const marketSlug = String(formData.get("marketSlug") ?? "");
  const productSlug = String(formData.get("productSlug") ?? "");
  const priceUsd = Number(formData.get("priceUsd"));
  const signatureRetouchedImages = Number(formData.get("signatureRetouchedImages"));
  if (!marketSlug || (productSlug !== "individual_headshot" && productSlug !== "executive_portrait") || !Number.isFinite(priceUsd)) return actionFail("Enter valid values and try again.");

  const result = await createCorporateHeadshotRateVersion({
    marketSlug,
    productSlug,
    priceUsd,
    signatureRetouchedImages,
    actorUserId: user.id,
  });
  if (!result.ok) {
    console.error("[admin] failed to create corporate headshot rate version", result.error);
    return actionFail(result.error);
  }

  revalidatePath("/admin/pricing");
  return actionOk("unchanged" in result && result.unchanged ? "No change — the active value is already this." : "Saved — now active.");
}

export async function createCorporateTeamTierRateVersionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");

  const marketSlug = String(formData.get("marketSlug") ?? "");
  const tierSlug = String(formData.get("tierSlug") ?? "");
  const pricePerPersonUsd = Number(formData.get("pricePerPersonUsd"));
  if (!marketSlug || !["2-5", "6-10", "11-25", "26-50"].includes(tierSlug) || !Number.isFinite(pricePerPersonUsd)) return actionFail("Enter valid values and try again.");

  const result = await createCorporateTeamTierRateVersion({
    marketSlug,
    tierSlug: tierSlug as "2-5" | "6-10" | "11-25" | "26-50",
    pricePerPersonUsd,
    actorUserId: user.id,
  });
  if (!result.ok) {
    console.error("[admin] failed to create corporate team tier rate version", result.error);
    return actionFail(result.error);
  }

  revalidatePath("/admin/pricing");
  return actionOk("unchanged" in result && result.unchanged ? "No change — the active value is already this." : "Saved — now active.");
}

export async function createCorporateMinimumBookingVersionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");

  const marketSlug = String(formData.get("marketSlug") ?? "");
  const minimumAmountUsd = Number(formData.get("minimumAmountUsd"));
  if (!marketSlug || !Number.isFinite(minimumAmountUsd)) return actionFail("Enter valid values and try again.");

  const result = await createCorporateMinimumBookingVersion({ marketSlug, minimumAmountUsd, actorUserId: user.id });
  if (!result.ok) {
    console.error("[admin] failed to create corporate minimum booking version", result.error);
    return actionFail(result.error);
  }

  revalidatePath("/admin/pricing");
  return actionOk("unchanged" in result && result.unchanged ? "No change — the active value is already this." : "Saved — now active.");
}

export async function createCorporateRetouchRateVersionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");

  const marketSlug = String(formData.get("marketSlug") ?? "");
  const pricePerImageUsd = Number(formData.get("pricePerImageUsd"));
  if (!marketSlug || !Number.isFinite(pricePerImageUsd)) return actionFail("Enter valid values and try again.");

  const result = await createCorporateRetouchRateVersion({ marketSlug, pricePerImageUsd, actorUserId: user.id });
  if (!result.ok) {
    console.error("[admin] failed to create corporate retouch rate version", result.error);
    return actionFail(result.error);
  }

  revalidatePath("/admin/pricing");
  return actionOk("unchanged" in result && result.unchanged ? "No change — the active value is already this." : "Saved — now active.");
}

const CORPORATE_PRIORITY_SCOPES: CorporatePriorityDeliveryScopeSlug[] = ["individual_headshot", "executive_portrait", "team_2_5", "team_6_10", "team_11_25", "team_26_50"];

// Corporate Priority Delivery correction (2026-09-06): now takes an
// explicit scopeSlug — the percentage varies by product/team-tier.
export async function createCorporatePriorityDeliveryVersionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");

  const scopeSlug = String(formData.get("scopeSlug") ?? "");
  const multiplierPercentage = Number(formData.get("multiplierPercentage"));
  if (!CORPORATE_PRIORITY_SCOPES.includes(scopeSlug as CorporatePriorityDeliveryScopeSlug) || !Number.isFinite(multiplierPercentage)) return actionFail("Enter valid values and try again.");

  const result = await createCorporatePriorityDeliveryVersion({ scopeSlug: scopeSlug as CorporatePriorityDeliveryScopeSlug, multiplierPercentage, actorUserId: user.id });
  if (!result.ok) {
    console.error("[admin] failed to create corporate priority delivery version", result.error);
    return actionFail(result.error);
  }

  revalidatePath("/admin/pricing");
  return actionOk("unchanged" in result && result.unchanged ? "No change — the active value is already this." : "Saved — now active.");
}

// ============================================================
// Weddings & Events Pricing V1 (2026-09-06)
// ============================================================

export async function createWeddingEventTierRateVersionAction(_prev: TierRateSaveState, formData: FormData): Promise<TierRateSaveState> {
  const user = await getCurrentUser();
  return saveTierRate(formData, user?.id ?? null, createWeddingEventTierRateVersion, () => revalidatePath("/admin/pricing"));
}

export async function createWeddingEventPriorityDeliveryVersionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");

  const category = String(formData.get("category") ?? "");
  const tierSlug = String(formData.get("tierSlug") ?? "");
  const multiplierPercentage = Number(formData.get("multiplierPercentage"));
  if ((category !== "wedding" && category !== "event") || !tierSlug || !Number.isFinite(multiplierPercentage)) return actionFail("Enter valid values and try again.");

  const result = await createWeddingEventPriorityDeliveryVersion({ category: category as WeddingEventCategory, tierSlug, multiplierPercentage, actorUserId: user.id });
  if (!result.ok) {
    console.error("[admin] failed to create wedding/event priority delivery version", result.error);
    return actionFail(result.error);
  }

  revalidatePath("/admin/pricing");
  return actionOk("unchanged" in result && result.unchanged ? "No change — the active value is already this." : "Saved — now active.");
}

export async function createWeddingEventAddonRateVersionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");

  const marketSlug = String(formData.get("marketSlug") ?? "");
  const addonSlug = String(formData.get("addonSlug") ?? "");
  const priceUsd = Number(formData.get("priceUsd"));
  if (!marketSlug || !addonSlug || !Number.isFinite(priceUsd)) return actionFail("Enter valid values and try again.");

  const result = await createWeddingEventAddonRateVersion({ marketSlug, addonSlug: addonSlug as AddonSlug, priceUsd, actorUserId: user.id });
  if (!result.ok) {
    console.error("[admin] failed to create wedding/event addon rate version", result.error);
    return actionFail(result.error);
  }

  revalidatePath("/admin/pricing");
  return actionOk("unchanged" in result && result.unchanged ? "No change — the active value is already this." : "Saved — now active.");
}

export async function createWeddingEventPercentageRateVersionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");

  const percentageSlug = String(formData.get("percentageSlug") ?? "");
  const percentage = Number(formData.get("percentage"));
  if (!percentageSlug || !Number.isFinite(percentage)) return actionFail("Enter valid values and try again.");

  const result = await createWeddingEventPercentageRateVersion({ percentageSlug: percentageSlug as PercentageSlug, percentage, actorUserId: user.id });
  if (!result.ok) {
    console.error("[admin] failed to create wedding/event percentage rate version", result.error);
    return actionFail(result.error);
  }

  revalidatePath("/admin/pricing");
  return actionOk("unchanged" in result && result.unchanged ? "No change — the active value is already this." : "Saved — now active.");
}

// ============================================================
// Commercial & Advertising Pricing V1 (2026-09-07)
// ============================================================

export async function createCommercialCreativeFeeRateVersionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");

  const marketSlug = String(formData.get("marketSlug") ?? "");
  const serviceMode = String(formData.get("serviceMode") ?? "");
  const scopeSlug = String(formData.get("scopeSlug") ?? "");
  const priceUsd = Number(formData.get("priceUsd"));
  if (!marketSlug || !serviceMode || !scopeSlug || !Number.isFinite(priceUsd)) return actionFail("Enter valid values and try again.");

  const result = await createCommercialCreativeFeeRateVersion({
    marketSlug,
    serviceMode: serviceMode as CommercialServiceMode,
    scopeSlug: scopeSlug as CommercialScopeSlug,
    priceUsd,
    actorUserId: user.id,
  });
  if (!result.ok) {
    console.error("[admin] failed to create commercial creative fee rate version", result.error);
    return actionFail(result.error);
  }

  revalidatePath("/admin/pricing");
  return actionOk("unchanged" in result && result.unchanged ? "No change — the active value is already this." : "Saved — now active.");
}

export async function createCommercialCatalogueBaseRateVersionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");

  const marketSlug = String(formData.get("marketSlug") ?? "");
  const priceUsd = Number(formData.get("priceUsd"));
  if (!marketSlug || !Number.isFinite(priceUsd)) return actionFail("Enter valid values and try again.");

  const result = await createCommercialCatalogueBaseRateVersion({ marketSlug, priceUsd, actorUserId: user.id });
  if (!result.ok) {
    console.error("[admin] failed to create commercial catalogue base rate version", result.error);
    return actionFail(result.error);
  }

  revalidatePath("/admin/pricing");
  return actionOk("unchanged" in result && result.unchanged ? "No change — the active value is already this." : "Saved — now active.");
}

export async function createCommercialCatalogueMinimumVersionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");

  const marketSlug = String(formData.get("marketSlug") ?? "");
  const minimumUsd = Number(formData.get("minimumUsd"));
  if (!marketSlug || !Number.isFinite(minimumUsd)) return actionFail("Enter valid values and try again.");

  const result = await createCommercialCatalogueMinimumVersion({ marketSlug, minimumUsd, actorUserId: user.id });
  if (!result.ok) {
    console.error("[admin] failed to create commercial catalogue minimum version", result.error);
    return actionFail(result.error);
  }

  revalidatePath("/admin/pricing");
  return actionOk("unchanged" in result && result.unchanged ? "No change — the active value is already this." : "Saved — now active.");
}

export async function createCommercialPostProductionRateVersionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");

  const itemSlug = String(formData.get("itemSlug") ?? "");
  const priceUsd = Number(formData.get("priceUsd"));
  const isFromPrice = formData.get("isFromPrice") === "true";
  if (!itemSlug || !Number.isFinite(priceUsd)) return actionFail("Enter valid values and try again.");

  const result = await createCommercialPostProductionRateVersion({ itemSlug: itemSlug as CommercialPostProductionItemSlug, priceUsd, isFromPrice, actorUserId: user.id });
  if (!result.ok) {
    console.error("[admin] failed to create commercial post-production rate version", result.error);
    return actionFail(result.error);
  }

  revalidatePath("/admin/pricing");
  return actionOk("unchanged" in result && result.unchanged ? "No change — the active value is already this." : "Saved — now active.");
}

export async function createCommercialPercentageVersionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");

  const percentageSlug = String(formData.get("percentageSlug") ?? "");
  const percentage = Number(formData.get("percentage"));
  if ((percentageSlug !== "priority_postproduction" && percentageSlug !== "licensing_floor") || !Number.isFinite(percentage)) return actionFail("Enter valid values and try again.");

  const result = await createCommercialPercentageVersion({ percentageSlug, percentage, actorUserId: user.id });
  if (!result.ok) {
    console.error("[admin] failed to create commercial percentage version", result.error);
    return actionFail(result.error);
  }

  revalidatePath("/admin/pricing");
  return actionOk("unchanged" in result && result.unchanged ? "No change — the active value is already this." : "Saved — now active.");
}

export async function createCommercialLicensingFactorVersionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");

  const factorType = String(formData.get("factorType") ?? "");
  const factorSlug = String(formData.get("factorSlug") ?? "");
  const factorValue = Number(formData.get("factorValue"));
  if (!["usage", "duration", "territory", "exclusivity"].includes(factorType) || !factorSlug || !Number.isFinite(factorValue)) return actionFail("Enter valid values and try again.");

  const result = await createCommercialLicensingFactorVersion({ factorType: factorType as "usage" | "duration" | "territory" | "exclusivity", factorSlug, factorValue, actorUserId: user.id });
  if (!result.ok) {
    console.error("[admin] failed to create commercial licensing factor version", result.error);
    return actionFail(result.error);
  }

  revalidatePath("/admin/pricing");
  return actionOk("unchanged" in result && result.unchanged ? "No change — the active value is already this." : "Saved — now active.");
}

export async function createCommercialReviewThresholdVersionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");

  const marketSlug = String(formData.get("marketSlug") ?? "");
  const reviewUsd = Number(formData.get("reviewUsd"));
  const mandatoryUsd = Number(formData.get("mandatoryUsd"));
  if (!marketSlug || !Number.isFinite(reviewUsd) || !Number.isFinite(mandatoryUsd)) return actionFail("Enter valid values and try again.");

  const result = await createCommercialReviewThresholdVersion({ marketSlug, reviewUsd, mandatoryUsd, actorUserId: user.id });
  if (!result.ok) {
    console.error("[admin] failed to create commercial review threshold version", result.error);
    return actionFail(result.error);
  }

  revalidatePath("/admin/pricing");
  return actionOk("unchanged" in result && result.unchanged ? "No change — the active value is already this." : "Saved — now active.");
}

// ============================================================
// Graphic Design Pricing V1 (2026-09-07)
// ============================================================

export async function createGraphicDesignDeliverableRateVersionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");

  const marketSlug = String(formData.get("marketSlug") ?? "");
  const deliverableSlug = String(formData.get("deliverableSlug") ?? "");
  const priceUsd = Number(formData.get("priceUsd"));
  if (!marketSlug || !deliverableSlug || !Number.isFinite(priceUsd)) return actionFail("Enter valid values and try again.");

  const result = await createGraphicDesignDeliverableRateVersion({ marketSlug, deliverableSlug: deliverableSlug as GraphicDesignDeliverableSlug, priceUsd, actorUserId: user.id });
  if (!result.ok) {
    console.error("[admin] failed to create graphic design deliverable rate version", result.error);
    return actionFail(result.error);
  }

  revalidatePath("/admin/pricing");
  return actionOk("unchanged" in result && result.unchanged ? "No change — the active value is already this." : "Saved — now active.");
}

export async function createGraphicDesignComplexityFactorVersionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");

  const complexity = String(formData.get("complexity") ?? "");
  const factor = Number(formData.get("factor"));
  if ((complexity !== "standard" && complexity !== "enhanced" && complexity !== "bespoke") || !Number.isFinite(factor)) return actionFail("Enter valid values and try again.");

  const result = await createGraphicDesignComplexityFactorVersion({ complexity: complexity as GraphicDesignComplexity, factor, actorUserId: user.id });
  if (!result.ok) {
    console.error("[admin] failed to create graphic design complexity factor version", result.error);
    return actionFail(result.error);
  }

  revalidatePath("/admin/pricing");
  return actionOk("unchanged" in result && result.unchanged ? "No change — the active value is already this." : "Saved — now active.");
}

export async function createGraphicDesignAddonRateVersionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");

  const marketSlug = String(formData.get("marketSlug") ?? "");
  const addonSlug = String(formData.get("addonSlug") ?? "");
  const priceUsd = Number(formData.get("priceUsd"));
  if (!marketSlug || !addonSlug || !Number.isFinite(priceUsd)) return actionFail("Enter valid values and try again.");

  const result = await createGraphicDesignAddonRateVersion({ marketSlug, addonSlug: addonSlug as GraphicDesignAddonSlug, priceUsd, actorUserId: user.id });
  if (!result.ok) {
    console.error("[admin] failed to create graphic design addon rate version", result.error);
    return actionFail(result.error);
  }

  revalidatePath("/admin/pricing");
  return actionOk("unchanged" in result && result.unchanged ? "No change — the active value is already this." : "Saved — now active.");
}

export async function createGraphicDesignPercentageVersionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");

  const percentageSlug = String(formData.get("percentageSlug") ?? "");
  const percentage = Number(formData.get("percentage"));
  if (!percentageSlug || !Number.isFinite(percentage)) return actionFail("Enter valid values and try again.");

  const result = await createGraphicDesignPercentageVersion({ percentageSlug: percentageSlug as GraphicDesignPercentageSlug, percentage, actorUserId: user.id });
  if (!result.ok) {
    console.error("[admin] failed to create graphic design percentage version", result.error);
    return actionFail(result.error);
  }

  revalidatePath("/admin/pricing");
  return actionOk("unchanged" in result && result.unchanged ? "No change — the active value is already this." : "Saved — now active.");
}

// ============================================================
// Content Creation Pricing V1 (2026-09-07)
// ============================================================

export async function createContentCreationPackageRateVersionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");

  const marketSlug = String(formData.get("marketSlug") ?? "");
  const packageSlug = String(formData.get("packageSlug") ?? "");
  const priceUsd = Number(formData.get("priceUsd"));
  if (!marketSlug || !packageSlug || !Number.isFinite(priceUsd)) return actionFail("Enter valid values and try again.");

  const result = await createContentCreationPackageRateVersion({ marketSlug, packageSlug: packageSlug as ContentCreationPackageSlug, priceUsd, actorUserId: user.id });
  if (!result.ok) {
    console.error("[admin] failed to create content creation package rate version", result.error);
    return actionFail(result.error);
  }

  revalidatePath("/admin/pricing");
  return actionOk("unchanged" in result && result.unchanged ? "No change — the active value is already this." : "Saved — now active.");
}

export async function createContentCreationRetainerRateVersionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");

  const marketSlug = String(formData.get("marketSlug") ?? "");
  const retainerSlug = String(formData.get("retainerSlug") ?? "");
  const priceUsd = Number(formData.get("priceUsd"));
  if (!marketSlug || !retainerSlug || !Number.isFinite(priceUsd)) return actionFail("Enter valid values and try again.");

  const result = await createContentCreationRetainerRateVersion({ marketSlug, retainerSlug: retainerSlug as ContentCreationRetainerSlug, priceUsd, actorUserId: user.id });
  if (!result.ok) {
    console.error("[admin] failed to create content creation retainer rate version", result.error);
    return actionFail(result.error);
  }

  revalidatePath("/admin/pricing");
  return actionOk("unchanged" in result && result.unchanged ? "No change — the active value is already this." : "Saved — now active.");
}

export async function createContentCreationAddonRateVersionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");

  const marketSlug = String(formData.get("marketSlug") ?? "");
  const addonSlug = String(formData.get("addonSlug") ?? "");
  const priceUsd = Number(formData.get("priceUsd"));
  if (!marketSlug || !addonSlug || !Number.isFinite(priceUsd)) return actionFail("Enter valid values and try again.");

  const result = await createContentCreationAddonRateVersion({ marketSlug, addonSlug: addonSlug as ContentCreationAddonSlug, priceUsd, actorUserId: user.id });
  if (!result.ok) {
    console.error("[admin] failed to create content creation addon rate version", result.error);
    return actionFail(result.error);
  }

  revalidatePath("/admin/pricing");
  return actionOk("unchanged" in result && result.unchanged ? "No change — the active value is already this." : "Saved — now active.");
}

export async function createContentCreationPercentageVersionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");

  const percentageSlug = String(formData.get("percentageSlug") ?? "");
  const percentage = Number(formData.get("percentage"));
  if (!percentageSlug || !Number.isFinite(percentage)) return actionFail("Enter valid values and try again.");

  const result = await createContentCreationPercentageVersion({ percentageSlug: percentageSlug as ContentCreationPercentageSlug, percentage, actorUserId: user.id });
  if (!result.ok) {
    console.error("[admin] failed to create content creation percentage version", result.error);
    return actionFail(result.error);
  }

  revalidatePath("/admin/pricing");
  return actionOk("unchanged" in result && result.unchanged ? "No change — the active value is already this." : "Saved — now active.");
}
