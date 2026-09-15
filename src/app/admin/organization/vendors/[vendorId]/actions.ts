"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManageOnboarding, startExternalWorkforceOnboarding, advanceOnboardingStage, completeStaffOnboarding, correctOnboardingRelationshipClassification } from "@/lib/organization/onboarding";
import { updateOnboardingRequirement, authorizeOnboardingRequirementOverride, type RequirementStatus } from "@/lib/organization/onboardingRequirements";
import { upsertVendorProfile, setVendorProfileStatus } from "@/lib/vendors/vendorProfiles";
import { requestVendorDocumentUploadAuthorization, recordVendorDocument, reviewVendorDocument } from "@/lib/vendors/vendorDocuments";
import { createPayeeProfile } from "@/lib/payables/payeeProfiles";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OnboardingPipeline } from "@/lib/organization/onboardingStages";

export type ActionState = { ok: boolean; error?: string } | null;

async function requireVendorAdmin() {
  const user = await getCurrentUser();
  if (!user || !(await canManageOnboarding(user.id))) throw new Error("Not authorized.");
  return user;
}

function revalidateVendor(vendorId: string) {
  revalidatePath(`/admin/organization/vendors/${vendorId}`);
  revalidatePath("/admin/organization/vendors");
}

export async function recordVendorCompanyProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireVendorAdmin();
    const vendorId = String(formData.get("vendorId") ?? "");
    const companyName = String(formData.get("companyName") ?? "");
    const relationshipJurisdictionId = String(formData.get("relationshipJurisdictionId") ?? "").trim() || null;
    const result = await upsertVendorProfile({ profileId: vendorId, companyName, relationshipJurisdictionId, actorUserId: user.id });
    if (!result.ok) return { ok: false, error: result.error };
    revalidateVendor(vendorId);
    return { ok: true };
  } catch {
    return { ok: false, error: "You are not authorized to do this." };
  }
}

// Starts external-workforce onboarding for this vendor — also sets
// staff_details.engagement_type_id to vendor_supplier if not already
// set (Lady Anim-Tetey and any other account granted the vendor role
// directly, rather than through inviteCollaboratorAction, has no
// staff_details row yet, and the vendor requirement catalog only
// applies once engagement_type resolves to 'vendor_supplier' — see
// onboardingRequirements.ts's applicableEngagementTypeSlugs).
export async function startVendorOnboardingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireVendorAdmin();
    const vendorId = String(formData.get("vendorId") ?? "");
    const admin = createAdminClient();
    const { data: vendorEngagementType } = await admin.from("engagement_types").select("id").eq("slug", "vendor_supplier").single();
    if (!vendorEngagementType) return { ok: false, error: "vendor_supplier engagement type is missing reference data." };

    const { error: staffDetailsError } = await admin
      .from("staff_details")
      .upsert({ id: vendorId, engagement_type_id: vendorEngagementType.id }, { onConflict: "id" });
    if (staffDetailsError) return { ok: false, error: "Failed to set engagement classification." };

    const result = await startExternalWorkforceOnboarding({ profileId: vendorId, engagementTypeSlug: "vendor_supplier", actorUserId: user.id });
    if (!result.ok) return { ok: false, error: result.error };
    revalidateVendor(vendorId);
    return { ok: true };
  } catch {
    return { ok: false, error: "You are not authorized to do this." };
  }
}

// Vendor QA correction (2026-09-15) — repairs an onboarding record
// that was mistakenly started on the employee pipeline (e.g. via the
// generic Users "Start Onboarding" requisition picker before the
// requisition-engagementTypeSlug fallback fix). Also sets
// staff_details.engagement_type_id to vendor_supplier, exactly like
// startVendorOnboardingAction above, since correcting the
// staff_onboarding row alone would leave the requirement catalog
// unable to resolve the right engagement type.
export async function correctVendorOnboardingClassificationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireVendorAdmin();
    const vendorId = String(formData.get("vendorId") ?? "");
    const onboardingId = String(formData.get("onboardingId") ?? "");
    const reason = String(formData.get("reason") ?? "");
    const acknowledgeExistingProgress = formData.get("acknowledgeExistingProgress") === "on";
    const admin = createAdminClient();
    const { data: vendorEngagementType } = await admin.from("engagement_types").select("id").eq("slug", "vendor_supplier").single();
    if (!vendorEngagementType) return { ok: false, error: "vendor_supplier engagement type is missing reference data." };

    const { error: staffDetailsError } = await admin
      .from("staff_details")
      .upsert({ id: vendorId, engagement_type_id: vendorEngagementType.id }, { onConflict: "id" });
    if (staffDetailsError) return { ok: false, error: "Failed to set engagement classification." };

    const result = await correctOnboardingRelationshipClassification({ onboardingId, engagementTypeSlug: "vendor_supplier", reason, actorUserId: user.id, acknowledgeExistingProgress });
    if (!result.ok) return { ok: false, error: result.error };
    revalidateVendor(vendorId);
    return { ok: true };
  } catch {
    return { ok: false, error: "You are not authorized to do this." };
  }
}

export async function advanceVendorOnboardingStageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireVendorAdmin();
    const vendorId = String(formData.get("vendorId") ?? "");
    const onboardingId = String(formData.get("onboardingId") ?? "");
    const toStage = String(formData.get("toStage") ?? "");
    const result = await advanceOnboardingStage({ onboardingId, toStage, actorUserId: user.id });
    if (!result.ok) return { ok: false, error: result.error };
    revalidateVendor(vendorId);
    return { ok: true };
  } catch {
    return { ok: false, error: "You are not authorized to do this." };
  }
}

export async function completeVendorOnboardingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireVendorAdmin();
    const vendorId = String(formData.get("vendorId") ?? "");
    const onboardingId = String(formData.get("onboardingId") ?? "");
    const result = await completeStaffOnboarding({ onboardingId, actorUserId: user.id });
    if (!result.ok) return { ok: false, error: result.error };
    revalidateVendor(vendorId);
    return { ok: true };
  } catch {
    return { ok: false, error: "You are not authorized to do this." };
  }
}

export async function updateVendorRequirementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireVendorAdmin();
    const vendorId = String(formData.get("vendorId") ?? "");
    const onboardingId = String(formData.get("onboardingId") ?? "");
    const pipeline = String(formData.get("pipeline") ?? "") as OnboardingPipeline;
    const requirementKey = String(formData.get("requirementKey") ?? "");
    const status = String(formData.get("status") ?? "") as RequirementStatus;
    const notes = String(formData.get("notes") ?? "").trim() || null;
    const result = await updateOnboardingRequirement({ onboardingId, pipeline, requirementKey, status, notes, actorUserId: user.id });
    if (!result.ok) return { ok: false, error: result.error };
    revalidateVendor(vendorId);
    return { ok: true };
  } catch {
    return { ok: false, error: "You are not authorized to do this." };
  }
}

// Controlled defer/waive path (Vendor Completion Phase, Part 3) —
// reuses authorizeOnboardingRequirementOverride() verbatim, the same
// mechanism already governing staff onboarding deferrals. Suitable for
// BOTH the controlled test vendor (reason should explicitly say so)
// and a legitimate future real-vendor exception — this is never a
// test-only backdoor, exactly per the explicit instruction.
export async function deferVendorRequirementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireVendorAdmin();
    const vendorId = String(formData.get("vendorId") ?? "");
    const onboardingId = String(formData.get("onboardingId") ?? "");
    const pipeline = String(formData.get("pipeline") ?? "") as OnboardingPipeline;
    const requirementKey = String(formData.get("requirementKey") ?? "");
    const reason = String(formData.get("reason") ?? "");
    const result = await authorizeOnboardingRequirementOverride({ onboardingId, pipeline, requirementKey, reason, actorUserId: user.id });
    if (!result.ok) return { ok: false, error: result.error };
    revalidateVendor(vendorId);
    return { ok: true };
  } catch {
    return { ok: false, error: "You are not authorized to do this." };
  }
}

// Vendor QA correction (2026-09-15) — split into two thin actions
// around the direct-to-Storage signed-URL flow (see vendorDocuments.ts's
// header comment for why the original single-action upload silently
// failed on any real file). requestVendorDocumentUploadAuthorizationAction
// only issues a signed URL/token; the browser then PUTs the file bytes
// straight to Supabase Storage; recordVendorDocumentUploadAction writes
// the metadata row only after that upload has genuinely succeeded.
export type RequestVendorDocumentUploadResult = { ok: true; signedUrl: string; token: string; path: string } | { ok: false; error: string };

export async function requestVendorDocumentUploadAuthorizationAction(params: { vendorId: string; originalFilename: string }): Promise<RequestVendorDocumentUploadResult> {
  try {
    const user = await requireVendorAdmin();
    if (!params.vendorId || !params.originalFilename) return { ok: false, error: "Missing file." };
    return requestVendorDocumentUploadAuthorization({ vendorProfileId: params.vendorId, originalFilename: params.originalFilename, actorUserId: user.id });
  } catch {
    return { ok: false, error: "You are not authorized to do this." };
  }
}

export type RecordVendorDocumentUploadResult = { ok: true } | { ok: false; error: string };

export async function recordVendorDocumentUploadAction(params: {
  vendorId: string;
  storagePath: string;
  documentType: string;
  notes?: string | null;
}): Promise<RecordVendorDocumentUploadResult> {
  try {
    const user = await requireVendorAdmin();
    if (!params.vendorId || !params.storagePath || !params.documentType) return { ok: false, error: "Missing upload details." };
    const result = await recordVendorDocument({ vendorProfileId: params.vendorId, storagePath: params.storagePath, documentType: params.documentType, notes: params.notes ?? null, actorUserId: user.id });
    if (!result.ok) return { ok: false, error: result.error };
    revalidateVendor(params.vendorId);
    return { ok: true };
  } catch {
    return { ok: false, error: "You are not authorized to do this." };
  }
}

export async function reviewVendorDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireVendorAdmin();
    const vendorId = String(formData.get("vendorId") ?? "");
    const documentId = String(formData.get("documentId") ?? "");
    const status = String(formData.get("status") ?? "") as "approved" | "rejected";
    const result = await reviewVendorDocument({ documentId, status, actorUserId: user.id });
    if (!result.ok) return { ok: false, error: result.error };
    revalidateVendor(vendorId);
    return { ok: true };
  } catch {
    return { ok: false, error: "You are not authorized to do this." };
  }
}

export async function setVendorStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireVendorAdmin();
    const vendorId = String(formData.get("vendorId") ?? "");
    const status = String(formData.get("status") ?? "") as "pending" | "active" | "inactive";
    const result = await setVendorProfileStatus({ vendorProfileId: vendorId, status, actorUserId: user.id });
    if (!result.ok) return { ok: false, error: result.error };
    revalidateVendor(vendorId);
    return { ok: true };
  } catch {
    return { ok: false, error: "You are not authorized to do this." };
  }
}

// Bridges to Universal Payables — createPayeeProfile() itself is
// Finance-tier-gated (independently re-checked inside), not
// canManageOnboarding; a vendor-onboarding admin without Finance
// capability will see that function's own "Not authorized" error,
// which is correct — payee classification remains Finance's decision,
// this button only offers the entry point from the vendor's own page.
export async function createVendorPayeeProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "Not authorized." };
    const vendorId = String(formData.get("vendorId") ?? "");
    const companyName = String(formData.get("companyName") ?? "").trim() || null;
    const result = await createPayeeProfile({ profileId: vendorId, category: "vendor", companyName, actorUserId: user.id });
    if (!result.ok) return { ok: false, error: result.error };
    revalidateVendor(vendorId);
    return { ok: true };
  } catch {
    return { ok: false, error: "You are not authorized to do this." };
  }
}
