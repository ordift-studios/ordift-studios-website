"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { logActivity } from "@/lib/admin/activityLog";

// Ordift Organizational & Administrative Architecture V1, Phase 3, Parts
// B and D (2026-08-25). Every write to authority_grants goes through
// this file — the table has no authenticated insert/update/delete RLS
// policy at all (service-role only), matching the positions/departments/
// member_numbers precedent.
//
// Deliberate scope decision for this phase: every grant/revoke action
// here is Super-Admin-only, including creating a time-bound delegation.
// The spec's Part 6 describes an Executive Admin or Director *using*
// delegated authority, not necessarily *creating* new delegations
// themselves — allowing that would need its own privilege-escalation
// safeguards (e.g. "you may only delegate authority you currently
// hold") this phase doesn't build. Flagged as a deferred item in the
// Phase 3 report rather than guessed at.
async function requireSuperAdmin() {
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user)) {
    throw new Error("Only a Super Admin can manage Executive Admin, Director-tier, or delegated authority.");
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
export async function createDelegationAction(formData: FormData): Promise<void> {
  const currentUser = await requireSuperAdmin();

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
