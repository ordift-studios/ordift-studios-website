"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { reserveCorporateIdentity } from "@/lib/organization/reserveCorporateIdentity";
import { createDepartmentRequest } from "@/lib/organization/departmentRequests";
import { createRecruitmentRequisition } from "@/lib/recruitment/requisitions";
import type { Jurisdiction } from "@/lib/organization/authority";

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
