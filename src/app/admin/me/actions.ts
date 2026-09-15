"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isStaffOrAdmin, isSuperAdmin } from "@/lib/portal/roles";
import { recordPolicyAcknowledgement } from "@/lib/organization/policyAcknowledgements";
import { resolveDeferredRequirementForProfile } from "@/lib/organization/onboardingRequirements";
import { recordFounderSelfAdministeredEmploymentTerms, WORK_PATTERN_TYPES, type WorkPatternType } from "@/lib/organization/employmentTermsHistory";

// Employee Self-Service — My Workspace landing page (Phase B5 Step 15,
// 2026-09-14). Self-acknowledgement only — recordPolicyAcknowledgement()
// itself still independently verifies the caller isn't acting on
// someone else's behalf, but this action never accepts a profileId
// from the form at all, so it can only ever record for the caller.

export type ActionState = { ok: boolean; error?: string } | null;

export async function acknowledgeOwnPolicyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isStaffOrAdmin(currentUser)) return { ok: false, error: "Not authorized." };

  const documentVersionId = String(formData.get("documentVersionId") ?? "");
  if (!documentVersionId) return { ok: false, error: "Invalid request." };

  const result = await recordPolicyAcknowledgement({
    profileId: currentUser.id,
    documentVersionId,
    method: "digital_click_through",
    actorUserId: currentUser.id,
  });
  if (!result.ok) return { ok: false, error: result.error };

  // Best-effort — a controlled onboarding deferral (2026-09-15,
  // onboardingRequirements.ts) is a separate concern from this genuine
  // acknowledgement; a failure here must never undo or block the
  // evidence already recorded above. Re-verifies EVERY applicable
  // policy is acknowledged before resolving anything — this single
  // acknowledgement alone never resolves it if others remain.
  try {
    await resolveDeferredRequirementForProfile({ profileId: currentUser.id, requirementKey: "policies_acknowledged" });
  } catch (err) {
    console.error("[admin me] failed to resolve deferred policies_acknowledged requirement", err);
  }

  revalidatePath("/admin/me");
  return { ok: true };
}

// Founder/CEO self-administration (Workforce/Employee Self-Service
// Phase, 2026-09-15) — never accepts a profileId or actorUserId from
// the form, exactly like acknowledgeOwnPolicyAction above: this can
// only ever record for the caller's own profile, and
// recordFounderSelfAdministeredEmploymentTerms() itself independently
// re-enforces actor === profile and Super Admin, so this action is not
// the only thing standing between it and misuse.
export async function recordOwnFounderEmploymentTermsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isSuperAdmin(currentUser)) return { ok: false, error: "Not authorized." };

  const employingEntityId = String(formData.get("employingEntityId") ?? "").trim() || null;
  const employmentJurisdictionId = String(formData.get("employmentJurisdictionId") ?? "").trim() || null;
  const workLocation = String(formData.get("workLocation") ?? "").trim() || null;
  const effectiveFrom = String(formData.get("effectiveFrom") ?? "").trim();
  const workPattern = String(formData.get("workPattern") ?? "").trim() || null;
  const workPatternTypeRaw = String(formData.get("workPatternType") ?? "").trim();
  const workPatternType: WorkPatternType | null = (WORK_PATTERN_TYPES as readonly string[]).includes(workPatternTypeRaw) ? (workPatternTypeRaw as WorkPatternType) : null;
  const basicSalaryRaw = String(formData.get("basicSalary") ?? "").trim();
  const currency = String(formData.get("currency") ?? "").trim() || null;
  if (!effectiveFrom) return { ok: false, error: "A commencement date is required." };
  const basicSalary = basicSalaryRaw ? Number(basicSalaryRaw) : null;
  if (basicSalaryRaw && (basicSalary === null || Number.isNaN(basicSalary))) return { ok: false, error: "Invalid salary amount." };

  const result = await recordFounderSelfAdministeredEmploymentTerms({
    profileId: currentUser.id,
    effectiveFrom,
    actorUserId: currentUser.id,
    changes: {
      employingEntityId,
      employmentJurisdictionId,
      workLocation,
      workPattern,
      workPatternType,
      basicSalary,
      currency,
    },
  });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/me");
  return { ok: true };
}
