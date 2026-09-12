"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { reserveCorporateIdentity, approveCorporateIdentityLocalPart } from "@/lib/organization/reserveCorporateIdentity";
import { normalizeRequestedLocalPart } from "@/lib/organization/corporateEmail";
import { createDepartmentRequest } from "@/lib/organization/departmentRequests";
import { createRecruitmentRequisition, createAndApproveFounderDirectHire } from "@/lib/recruitment/requisitions";
import type { Jurisdiction } from "@/lib/organization/authority";
import { requestCorporateIdentityProvisioning, provisionCorporateIdentity } from "@/lib/organization/corporateProvisioning";
import { mockProvisioningProvider } from "@/lib/organization/provisioningProvider";

// Ordift Organizational & Administrative Architecture V1, Phase 3.3
// (2026-08-25). Super-Admin-only, matching this whole foundation's
// current enforcement reality: nobody occupies any GR.9 Position yet,
// so no jurisdiction capability (technology.identity.reserve, etc.) has
// a real holder to widen these gates to — same "capability is real and
// enforced, but only Super Admin can exercise it today" pattern already
// used for PRIME's operations.administer in Phase 3.2.
async function requireSuperAdmin() {
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user)) {
    throw new Error("Only a Super Admin can manage this.");
  }
  return user;
}

export async function reserveCorporateIdentityAction(formData: FormData): Promise<void> {
  const currentUser = await requireSuperAdmin();

  const profileId = String(formData.get("profileId") ?? "").trim();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const middleNamesRaw = String(formData.get("middleNames") ?? "").trim();
  const surname = String(formData.get("surname") ?? "").trim();
  const additionalRaw = String(formData.get("additionalVerifiedNames") ?? "").trim();
  if (!profileId || !firstName || !surname) return;

  const result = await reserveCorporateIdentity({
    profileId,
    name: {
      firstName,
      middleNames: middleNamesRaw ? middleNamesRaw.split(/\s+/) : [],
      surname,
      additionalVerifiedNames: additionalRaw ? additionalRaw.split(/\s+/) : [],
    },
    reservedBy: currentUser.id,
  });
  if (!result.ok) {
    console.error("[admin operations] failed to reserve corporate identity", result.error);
  }

  revalidatePath("/admin/operations");
}

// Founder/Super-Admin direct typo-correction capability (2026-09-10) —
// narrow, on purpose: this is for fixing a genuine data-entry mistake
// on a still-unprovisioned reservation (e.g. "mbadjectives" instead of
// "mbadjei"), not a general identity-management tool. Reuses the
// existing approveCorporateIdentityLocalPart() mutation/audit logic
// wholesale rather than duplicating it — that function's own
// reserved-only guard (added alongside this action) is what actually
// enforces "only while reserved/unprovisioned"; this action's own job
// is Super-Admin gating (via the same requireSuperAdmin() every other
// action on this page already uses — no parallel permission system)
// and translating a plain typed address into the request/approval
// diff-trail shape that function expects, with a fixed, honest
// approvalReason rather than a free-text one, so every correction made
// through this specific flow is identifiable as such in the audit
// trail.
export async function correctCorporateIdentityLocalPartAction(params: {
  identityId: string;
  currentLocalPart: string;
  newLocalPart: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const currentUser = await requireSuperAdmin();

  const validation = normalizeRequestedLocalPart(params.newLocalPart);
  if (!validation.ok) return { ok: false, error: validation.error };

  if (validation.value === params.currentLocalPart) {
    return { ok: false, error: "The new address is the same as the current one." };
  }

  const result = await approveCorporateIdentityLocalPart({
    identityId: params.identityId,
    requestedLocalPart: params.currentLocalPart,
    approvedLocalPart: validation.value,
    approvalReason: "Founder/Super Admin correction — data-entry typo fixed on an unprovisioned reservation.",
    actorUserId: currentUser.id,
  });

  revalidatePath("/admin/operations");
  return result;
}

// Google Workspace Corporate Email, Milestone 1B (2026-09-10) — the
// internal provisioning foundation, MOCK PROVIDER ONLY. Both actions
// below require Super Admin twice over: requireSuperAdmin() here
// (matching every other action on this page) and, independently,
// isSuperAdminId() inside corporateProvisioning.ts itself — the same
// defense-in-depth already used for correctCorporateIdentityLocalPartAction
// above. `mockProvisioningProvider` is imported directly and passed in
// explicitly — this file has no code path that could pass a different,
// real provider, and no real provider implementation exists anywhere
// in this codebase yet.
export async function requestCorporateIdentityProvisioningAction(params: { identityId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const currentUser = await requireSuperAdmin();
  const result = await requestCorporateIdentityProvisioning({
    identityId: params.identityId,
    provisioningType: "licensed_mailbox",
    actorUserId: currentUser.id,
  });
  revalidatePath("/admin/operations");
  return result;
}

export async function provisionCorporateIdentityMockAction(params: { identityId: string }): Promise<{ ok: true; externalId: string } | { ok: false; error: string }> {
  const currentUser = await requireSuperAdmin();
  const result = await provisionCorporateIdentity({
    identityId: params.identityId,
    provider: mockProvisioningProvider,
    actorUserId: currentUser.id,
  });
  revalidatePath("/admin/operations");
  return result;
}

export async function createDepartmentRequestAction(formData: FormData): Promise<void> {
  const currentUser = await requireSuperAdmin();

  const title = String(formData.get("title") ?? "").trim();
  const requestType = String(formData.get("requestType") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const requestingDepartmentId = String(formData.get("requestingDepartmentId") ?? "").trim() || null;
  const requestingJurisdiction = (String(formData.get("requestingJurisdiction") ?? "").trim() || null) as Jurisdiction | null;
  const servicingDepartmentId = String(formData.get("servicingDepartmentId") ?? "").trim() || null;
  const servicingJurisdiction = (String(formData.get("servicingJurisdiction") ?? "").trim() || null) as Jurisdiction | null;
  if (!title || !requestType) return;

  const result = await createDepartmentRequest({
    title,
    requestType,
    description,
    requestingDepartmentId,
    requestingJurisdiction,
    servicingDepartmentId,
    servicingJurisdiction,
    requestedBy: currentUser.id,
  });
  if (!result.ok) {
    console.error("[admin operations] failed to create department request", result.error);
  }

  revalidatePath("/admin/operations");
}

export async function createRecruitmentRequisitionAction(formData: FormData): Promise<void> {
  const currentUser = await requireSuperAdmin();

  const title = String(formData.get("title") ?? "").trim();
  const departmentId = String(formData.get("departmentId") ?? "").trim() || null;
  const gradeId = String(formData.get("gradeId") ?? "").trim() || null;
  const headcountRaw = String(formData.get("headcount") ?? "1").trim();
  const justification = String(formData.get("justification") ?? "").trim() || null;
  if (!title) return;

  const result = await createRecruitmentRequisition({
    title,
    requestingDepartmentId: departmentId,
    departmentId,
    gradeId,
    headcount: Number(headcountRaw) || 1,
    justification,
    requestedBy: currentUser.id,
  });
  if (!result.ok) {
    console.error("[admin operations] failed to create recruitment requisition", result.error);
  }

  revalidatePath("/admin/operations");
}

// Founder Direct Hire (E.5 Stage 2M, Part 2) — requireSuperAdmin() here
// is the coarse page-level gate; the REAL enforcement ("unauthorized
// users cannot manufacture Founder-direct hires") lives inside
// createRecruitmentRequisition() itself, which independently requires
// isSuperAdminId() for hireOrigin: 'founder_direct_hire' regardless of
// how it's called. Not a bypass of decideRequisition() — this is
// createRecruitmentRequisition() + decideRequisition() in sequence,
// both unchanged, exposed as one deliberate workflow.
export async function createFounderDirectHireAction(formData: FormData): Promise<void> {
  const currentUser = await requireSuperAdmin();

  const directHireProfileId = String(formData.get("directHireProfileId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const requestedPositionId = String(formData.get("requestedPositionId") ?? "").trim() || null;
  const departmentId = String(formData.get("departmentId") ?? "").trim() || null;
  const gradeId = String(formData.get("gradeId") ?? "").trim() || null;
  const engagementTypeId = String(formData.get("engagementTypeId") ?? "").trim() || null;
  const employingEntityId = String(formData.get("employingEntityId") ?? "").trim() || null;
  const employmentJurisdictionId = String(formData.get("employmentJurisdictionId") ?? "").trim() || null;
  const workLocation = String(formData.get("workLocation") ?? "").trim() || null;
  const preferredStartDate = String(formData.get("preferredStartDate") ?? "").trim() || null;
  const justification = String(formData.get("justification") ?? "").trim() || null;
  if (!directHireProfileId || !title) return;

  const result = await createAndApproveFounderDirectHire({
    title,
    directHireProfileId,
    requestedPositionId,
    departmentId,
    gradeId,
    engagementTypeId,
    employingEntityId,
    employmentJurisdictionId,
    workLocation,
    preferredStartDate,
    justification,
    requestedBy: currentUser.id,
  });
  if (!result.ok) {
    console.error("[admin operations] failed to create Founder Direct Hire", result.error);
  }

  revalidatePath("/admin/operations");
}
