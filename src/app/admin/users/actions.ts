"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCurrentUser,
  hasRole,
  isSuperAdmin,
  ADMIN_GRANTED_ONLY_ROLES,
  SUPER_ADMIN_ONLY_ROLES,
  type RoleSlug,
} from "@/lib/portal/roles";
import { logActivity } from "@/lib/admin/activityLog";
import { getActiveSuperAdminCount } from "@/lib/portal/adminData";
import {
  assignUserToProject,
  updateAssignmentStatus,
  searchProjects,
  getAssignmentsForUser,
  type ProjectEntityType,
  type AssignmentStatus,
  type ProjectSearchResult,
  type AdminProjectAssignment,
} from "@/lib/admin/projectAssignments";
import { getActivityForEntity, type ActivityLogEntry } from "@/lib/admin/activityLog";
import { siteUrl } from "@/lib/shared/env";
import { assignClassification } from "@/lib/portal/memberNumbers";

// ============================================================
// Read-only data fetchers — thin server-action wrappers so the client
// component (search, expand-to-detail) can call server-only lib code
// without a page reload. Same requireAdmin() gate as every mutation
// below; these don't mutate anything themselves.
// ============================================================
export async function searchProjectsAction(query: string): Promise<ProjectSearchResult[]> {
  await requireAdmin();
  return searchProjects(query);
}

export async function getAssignmentsForUserAction(userId: string): Promise<AdminProjectAssignment[]> {
  await requireAdmin();
  return getAssignmentsForUser(userId);
}

export async function getAccessHistoryForUserAction(userId: string): Promise<ActivityLogEntry[]> {
  await requireAdmin();
  return getActivityForEntity("user", userId);
}

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || !hasRole(user, "admin")) {
    throw new Error("Not authorized.");
  }
  return user;
}

function isGrantableRole(value: string): value is RoleSlug {
  return (ADMIN_GRANTED_ONLY_ROLES as string[]).includes(value);
}

function requiresSuperAdmin(role: RoleSlug): boolean {
  return (SUPER_ADMIN_ONLY_ROLES as string[]).includes(role);
}

export async function grantRoleAction(formData: FormData): Promise<void> {
  const currentUser = await requireAdmin();

  const userId = String(formData.get("userId") ?? "");
  const roleSlug = String(formData.get("role") ?? "");
  if (!userId || !isGrantableRole(roleSlug)) return;

  // Admin and Super Admin are the two highest-risk grants — reserved for
  // Super Admins specifically, so an ordinary Admin can build out the
  // team (staff/contractor/model/vendor) but can't create more admins.
  if (requiresSuperAdmin(roleSlug) && !isSuperAdmin(currentUser)) {
    console.warn("[admin] non-super-admin attempted to grant", roleSlug);
    return;
  }

  const admin = createAdminClient();
  const { data: role } = await admin.from("roles").select("id").eq("slug", roleSlug).single();
  if (!role) return;

  const { error } = await admin
    .from("user_roles")
    .upsert({ user_id: userId, role_id: role.id }, { onConflict: "user_id,role_id", ignoreDuplicates: true });
  if (error) {
    console.error("[admin] grant role failed", error.message);
  } else {
    await logActivity({
      actorUserId: currentUser.id,
      action: "role.grant",
      entityType: "user",
      entityId: userId,
      metadata: { role: roleSlug },
    });
  }

  revalidatePath("/admin/users");
}

export async function revokeRoleAction(formData: FormData): Promise<void> {
  const currentUser = await requireAdmin();

  const userId = String(formData.get("userId") ?? "");
  const roleSlug = String(formData.get("role") ?? "");
  if (!userId || !isGrantableRole(roleSlug)) return;

  if (requiresSuperAdmin(roleSlug) && !isSuperAdmin(currentUser)) {
    console.warn("[admin] non-super-admin attempted to revoke", roleSlug);
    return;
  }

  // Refuse to let an admin remove their own admin access from this
  // screen — the only way to end up with zero admins would be through
  // this exact self-service action, and there's no recovery path once
  // that happens (the Admin platform itself requires the admin role).
  if ((roleSlug === "admin" || roleSlug === "super_admin") && userId === currentUser.id) {
    console.warn("[admin] refused self-revoke of admin-tier role", currentUser.id, roleSlug);
    return;
  }

  // Lockout protection: removing super_admin from anyone must never
  // bring the number of ACTIVE super admins to zero. Checked here
  // (system-wide), not just the self-revoke case above, so Admin A
  // can't zero out Super Admin B either when B is the last one.
  if (roleSlug === "super_admin") {
    const activeCount = await getActiveSuperAdminCount();
    if (activeCount <= 1) {
      console.warn("[admin] refused to remove the last active Super Admin", userId);
      return;
    }
  }

  const admin = createAdminClient();
  const { data: role } = await admin.from("roles").select("id").eq("slug", roleSlug).single();
  if (!role) return;

  const { error } = await admin.from("user_roles").delete().eq("user_id", userId).eq("role_id", role.id);
  if (error) {
    console.error("[admin] revoke role failed", error.message);
  } else {
    await logActivity({
      actorUserId: currentUser.id,
      action: "role.revoke",
      entityType: "user",
      entityId: userId,
      metadata: { role: roleSlug },
    });
  }

  revalidatePath("/admin/users");
}

// ============================================================
// Access status — suspend / reactivate / deactivate / restore.
// One action, since all four are the same shape: change
// profiles.access_status, mirror it into Supabase Auth's own ban
// (belt-and-suspenders — RLS already blocks data access via
// private.has_role(), but banning also stops a new session from being
// issued at all), and record why.
// ============================================================
const AUTH_BAN_DURATION = "876000h"; // ~100 years — Supabase's convention for "indefinite"

export async function updateAccessStatusAction(formData: FormData): Promise<{ error?: string }> {
  const currentUser = await requireAdmin();

  const userId = String(formData.get("userId") ?? "");
  const newStatus = String(formData.get("status") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!userId || !["active", "suspended", "deactivated"].includes(newStatus)) {
    return { error: "Invalid request." };
  }

  if (userId === currentUser.id && newStatus !== "active") {
    return { error: "You can't suspend or deactivate your own account from this screen." };
  }

  const admin = createAdminClient();
  const { data: targetRoles } = await admin
    .from("user_roles")
    .select("roles(slug)")
    .eq("user_id", userId);
  const targetIsSuperAdmin = (targetRoles ?? []).some(
    (r) => (r.roles as unknown as { slug: string } | null)?.slug === "super_admin"
  );

  if (targetIsSuperAdmin && newStatus !== "active") {
    if (!isSuperAdmin(currentUser)) {
      return { error: "Only a Super Admin can suspend or deactivate another Super Admin." };
    }
    const activeCount = await getActiveSuperAdminCount();
    if (activeCount <= 1) {
      return { error: "Refused — this is the last active Super Admin. Promote another account first." };
    }
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      access_status: newStatus,
      access_status_reason: reason,
      access_status_changed_at: new Date().toISOString(),
      access_status_changed_by: currentUser.id,
    })
    .eq("id", userId);
  if (profileError) {
    console.error("[admin] failed to update access_status", profileError.message);
    return { error: "Failed to update access status." };
  }

  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: newStatus === "active" ? "none" : AUTH_BAN_DURATION,
  });
  if (authError) {
    // Not fatal to the RLS-level enforcement (private.has_role() already
    // blocks a suspended/deactivated profile), but worth surfacing —
    // the Auth-level ban is defense in depth, not the primary gate.
    console.error("[admin] failed to sync Auth ban state", authError.message);
  }

  await logActivity({
    actorUserId: currentUser.id,
    action: "access_status.change",
    entityType: "user",
    entityId: userId,
    metadata: { status: newStatus, reason },
  });

  revalidatePath("/admin/users");
  return {};
}

export async function setAccessExpiryAction(formData: FormData): Promise<{ error?: string }> {
  const currentUser = await requireAdmin();

  const userId = String(formData.get("userId") ?? "");
  const expiresAtRaw = String(formData.get("expiresAt") ?? "").trim();
  if (!userId) return { error: "Invalid request." };

  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw).toISOString() : null;

  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ access_expires_at: expiresAt }).eq("id", userId);
  if (error) {
    console.error("[admin] failed to set access_expires_at", error.message);
    return { error: "Failed to update expiry." };
  }

  await logActivity({
    actorUserId: currentUser.id,
    action: "access_expiry.change",
    entityType: "user",
    entityId: userId,
    metadata: { accessExpiresAt: expiresAt },
  });

  revalidatePath("/admin/users");
  return {};
}

// ============================================================
// Operational title / engagement type — staff_details, repurposed by
// migration 0009 for any internal account, not only `staff`.
// ============================================================
export async function updateCollaboratorDetailsAction(formData: FormData): Promise<{ error?: string }> {
  const currentUser = await requireAdmin();

  const userId = String(formData.get("userId") ?? "");
  const operationalTitleId = String(formData.get("operationalTitleId") ?? "").trim() || null;
  const engagementTypeId = String(formData.get("engagementTypeId") ?? "").trim() || null;
  if (!userId) return { error: "Invalid request." };

  const admin = createAdminClient();
  const { error } = await admin.from("staff_details").upsert(
    {
      id: userId,
      operational_title_id: operationalTitleId,
      engagement_type_id: engagementTypeId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (error) {
    console.error("[admin] failed to update staff_details", error.message);
    return { error: "Failed to update collaborator details." };
  }

  await logActivity({
    actorUserId: currentUser.id,
    action: "collaborator_details.change",
    entityType: "user",
    entityId: userId,
    metadata: { operationalTitleId, engagementTypeId },
  });

  revalidatePath("/admin/users");
  return {};
}

// ============================================================
// Account Classification / Member Number — Super Admin only, since
// this determines a person's identity number, not just a descriptive
// label. Only changes anything if the classification is actually
// different from the current one (see assignClassification() —
// reclassifying to the same classification is a no-op, never
// generates a new number).
// ============================================================
export async function reclassifyUserAction(formData: FormData): Promise<{ error?: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isSuperAdmin(currentUser)) return { error: "Only a Super Admin can change an account's classification." };

  const userId = String(formData.get("userId") ?? "");
  const classificationId = String(formData.get("classificationId") ?? "").trim();
  if (!userId || !classificationId) return { error: "Choose a classification." };

  const result = await assignClassification(userId, classificationId, currentUser.id);
  if (!result.ok) return { error: result.error };

  revalidatePath("/admin/users");
  return {};
}

// ============================================================
// Project assignments
// ============================================================
export async function assignToProjectAction(formData: FormData): Promise<{ error?: string }> {
  const currentUser = await requireAdmin();

  const userId = String(formData.get("userId") ?? "");
  const entityType = String(formData.get("entityType") ?? "") as ProjectEntityType;
  const entityId = String(formData.get("entityId") ?? "");
  const roleNote = String(formData.get("roleNote") ?? "").trim() || null;
  const accessExpiresAtRaw = String(formData.get("accessExpiresAt") ?? "").trim();
  if (!userId || !entityId || (entityType !== "enquiry" && entityType !== "workshop_registration")) {
    return { error: "Invalid request." };
  }

  const result = await assignUserToProject({
    userId,
    entityType,
    entityId,
    assignedBy: currentUser.id,
    roleNote,
    accessExpiresAt: accessExpiresAtRaw ? new Date(accessExpiresAtRaw).toISOString() : null,
  });

  revalidatePath("/admin/users");
  return result.ok ? {} : { error: result.error };
}

export async function updateAssignmentStatusAction(formData: FormData): Promise<{ error?: string }> {
  const currentUser = await requireAdmin();

  const assignmentId = String(formData.get("assignmentId") ?? "");
  const status = String(formData.get("status") ?? "") as AssignmentStatus;
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!assignmentId || !status) return { error: "Invalid request." };

  const result = await updateAssignmentStatus({ assignmentId, status, actorUserId: currentUser.id, reason });

  revalidatePath("/admin/users");
  return result.ok ? {} : { error: result.error };
}

// ============================================================
// Invite collaborator — the correct entry point for any new internal
// account (staff/contractor/model/vendor/admin/super_admin). Never
// grants `client` (that stays exclusive to the public self-service
// signup form), and unlike public signup, sends a real Supabase Auth
// invite email so the person sets their own password. Until Resend/
// custom SMTP is configured, this email carries Supabase's default
// branding — same known gap already flagged for every other auth
// email, fixed by the same change.
// ============================================================
export async function inviteCollaboratorAction(formData: FormData): Promise<{ error?: string }> {
  const currentUser = await requireAdmin();

  const email = String(formData.get("email") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  const operationalTitleId = String(formData.get("operationalTitleId") ?? "").trim() || null;
  const engagementTypeId = String(formData.get("engagementTypeId") ?? "").trim() || null;
  const classificationId = String(formData.get("classificationId") ?? "").trim() || null;

  if (!email || !fullName || !isGrantableRole(role) || !classificationId) {
    return { error: "Fill in name, email, role, and account classification." };
  }
  if (requiresSuperAdmin(role) && !isSuperAdmin(currentUser)) {
    return { error: "Only a Super Admin can invite an Admin or Super Admin." };
  }

  // Supabase's invite email never sets a password — the recipient is
  // meant to click through and set one. Redirecting to a plain sign-in
  // form (as this used to) is a dead end: the invite link's session
  // token gets silently consumed by the client SDK's own URL-detection
  // on page load, but nothing on that page reads it or prompts for a
  // password, so the account is left permanently password-less and
  // every later login attempt fails with "Invalid email or password" —
  // indistinguishable, from the outside, from a broken account.
  // /portal/reset-password already parses this exact hash-token format
  // (ResetPasswordForm.tsx — it doesn't care whether the link was typed
  // "invite" or "recovery") and walks the person through setting one,
  // so it's the correct destination for both flows.
  const admin = createAdminClient();
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: `${siteUrl()}/portal/reset-password`,
  });
  if (inviteError || !invited.user) {
    console.error("[admin] invite failed", inviteError?.message);
    return { error: inviteError?.message ?? "Couldn't send the invite." };
  }

  const { data: roleRow } = await admin.from("roles").select("id").eq("slug", role).single();
  if (roleRow) {
    await admin
      .from("user_roles")
      .upsert({ user_id: invited.user.id, role_id: roleRow.id }, { onConflict: "user_id,role_id", ignoreDuplicates: true });
  }

  if (operationalTitleId || engagementTypeId) {
    await admin.from("staff_details").upsert(
      { id: invited.user.id, operational_title_id: operationalTitleId, engagement_type_id: engagementTypeId },
      { onConflict: "id" }
    );
  }

  const classificationResult = await assignClassification(invited.user.id, classificationId, currentUser.id);

  await logActivity({
    actorUserId: currentUser.id,
    action: "collaborator.invited",
    entityType: "user",
    entityId: invited.user.id,
    metadata: {
      email,
      role,
      memberNumber: classificationResult.ok ? classificationResult.formattedNumber : null,
    },
  });

  revalidatePath("/admin/users");
  return {};
}
