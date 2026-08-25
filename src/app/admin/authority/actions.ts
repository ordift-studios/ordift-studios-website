"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isSuperAdmin, isStaffOrAdmin } from "@/lib/portal/roles";
import { logActivity } from "@/lib/admin/activityLog";
import { validateDelegationAuthority } from "@/lib/organization/authority";

// Ordift Organizational & Administrative Architecture V1, Phase 3, Parts
// B and D (2026-08-25). Every write to authority_grants goes through
// this file — the table has no authenticated insert/update/delete RLS
// policy at all (service-role only), matching the positions/departments/
// member_numbers precedent.
//
// Granting Executive Admin or standing Director-tier (department_admin)
// authority remains Super-Admin-only, unchanged (grantExecutiveAdminAction/
// grantDepartmentAuthorityAction below) — those are appointments, not
// something delegation logic should ever be able to produce.
async function requireSuperAdmin() {
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user)) {
    throw new Error("Only a Super Admin can manage Executive Admin or Director-tier authority.");
  }
  return user;
}

export async function grantExecutiveAdminAction(formData: FormData): Promise<void> {
  const currentUser = await requireSuperAdmin();

  const profileId = String(formData.get("profileId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!profileId) return;

  const admin = createAdminClient();
  const { error } = await admin.from("authority_grants").insert({
    profile_id: profileId,
    authority: "executive_admin",
    scope_department_id: null,
    granted_by: currentUser.id,
    reason,
    expires_at: null,
  });
  if (error) {
    console.error("[admin authority] failed to grant executive admin", error.message);
    return;
  }

  await logActivity({
    actorUserId: currentUser.id,
    action: "executive_admin.grant",
    entityType: "user",
    entityId: profileId,
    metadata: { reason },
  });

  revalidatePath("/admin/authority");
}

export async function grantDepartmentAuthorityAction(formData: FormData): Promise<void> {
  const currentUser = await requireSuperAdmin();

  const profileId = String(formData.get("profileId") ?? "").trim();
  const departmentId = String(formData.get("departmentId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!profileId || !departmentId) return;

  const admin = createAdminClient();
  const { error } = await admin.from("authority_grants").insert({
    profile_id: profileId,
    authority: "department_admin",
    scope_department_id: departmentId,
    granted_by: currentUser.id,
    reason,
    expires_at: null,
  });
  if (error) {
    console.error("[admin authority] failed to grant department authority", error.message);
    return;
  }

  await logActivity({
    actorUserId: currentUser.id,
    action: "department_admin.grant",
    entityType: "user",
    entityId: profileId,
    metadata: { departmentId, reason },
  });

  revalidatePath("/admin/authority");
}

// A delegation is the same table, distinguished only by having an
// expiry — see 0042's header comment. authority is free text (any
// specific WorkflowCapability name, e.g. "approve_bank_transfer") so
// this form doesn't need updating every time that TS union grows.
// Phase 3.4, Part 12 (2026-08-25): widened from Super-Admin-only.
// validateDelegationAuthority() is the real boundary — Super Admin
// passes unconditionally (the ultimate authority); anyone else may
// only delegate an authority they themselves currently, actively hold,
// within the same scope they hold it in (never upward, never
// sideways, never a standing tier). The page rendering this form
// remains Super-Admin-only-visible for now (no GR.9/Director position
// is occupied yet), but the enforcement itself is real and independent
// of that — see authority.test.ts for the invariant proven directly.
export async function createDelegationAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isStaffOrAdmin(currentUser)) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const authority = String(formData.get("authority") ?? "").trim();
  const departmentId = String(formData.get("departmentId") ?? "").trim() || null;
  const reason = String(formData.get("reason") ?? "").trim();
  const expiresAtRaw = String(formData.get("expiresAt") ?? "").trim();
  if (!profileId || !authority || !reason || !expiresAtRaw) return;

  const expiresAt = new Date(expiresAtRaw);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    console.error("[admin authority] delegation expiry must be a valid future date", expiresAtRaw);
    return;
  }

  const validation = await validateDelegationAuthority({
    grantorProfileId: currentUser.id,
    requestedAuthority: authority,
    requestedScopeDepartmentId: departmentId,
  });
  if (!validation.ok) {
    console.error("[admin authority] delegation refused", validation.error);
    return;
  }

  const admin = createAdminClient();
  const { error } = await admin.from("authority_grants").insert({
    profile_id: profileId,
    authority,
    scope_department_id: departmentId,
    granted_by: currentUser.id,
    reason,
    expires_at: expiresAt.toISOString(),
  });
  if (error) {
    console.error("[admin authority] failed to create delegation", error.message);
    return;
  }

  await logActivity({
    actorUserId: currentUser.id,
    action: "delegation.create",
    entityType: "user",
    entityId: profileId,
    metadata: { authority, departmentId, reason, expiresAt: expiresAt.toISOString() },
  });

  revalidatePath("/admin/authority");
}

export async function revokeAuthorityGrantAction(formData: FormData): Promise<void> {
  const currentUser = await requireSuperAdmin();

  const grantId = String(formData.get("grantId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!grantId) return;

  const admin = createAdminClient();
  const { data: grant, error: fetchError } = await admin
    .from("authority_grants")
    .select("profile_id, authority, revoked_at")
    .eq("id", grantId)
    .maybeSingle();
  if (fetchError || !grant || grant.revoked_at) return;

  const { error } = await admin
    .from("authority_grants")
    .update({ revoked_at: new Date().toISOString(), revoked_by: currentUser.id, revoked_reason: reason })
    .eq("id", grantId);
  if (error) {
    console.error("[admin authority] failed to revoke grant", error.message);
    return;
  }

  const actionByAuthority: Record<string, string> = {
    executive_admin: "executive_admin.revoke",
    department_admin: "department_admin.revoke",
  };

  await logActivity({
    actorUserId: currentUser.id,
    action: actionByAuthority[grant.authority] ?? "delegation.revoke",
    entityType: "user",
    entityId: grant.profile_id,
    metadata: { grantId, authority: grant.authority, reason },
  });

  revalidatePath("/admin/authority");
}
