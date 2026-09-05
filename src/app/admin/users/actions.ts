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
import { assignClassification, assignClassificationBySlug } from "@/lib/portal/memberNumbers";
import { setNotificationPreference } from "@/lib/notifications/preferences";
import { assignStaffPosition } from "@/lib/organization/assignPosition";
import { hasJurisdictionAuthority } from "@/lib/organization/authority";
import { startStaffOnboarding, completeStaffOnboarding } from "@/lib/organization/onboarding";

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
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) {
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
// Organizational assignment (Position) — Super Admin only, since
// assigning a Position resolves and writes Department, Craft, and Grade
// together (see assignStaffPosition() in src/lib/organization/assignPosition.ts).
// This is the proper any-staff-member integration point Phase 2 flagged
// as missing: /admin/profile/[id] is self-view only, so a Super Admin
// could previously only run this resolution on their own account.
// Deliberately separate from updateCollaboratorDetailsAction above —
// Operational Title/Engagement Type stay independently editable there
// for accounts that are never given a formal Position (contractors,
// models, vendors — explicitly not staff, per the Ordift Organizational
// & Administrative Architecture V1, Phase 2.1 staff/non-staff separation
// principle). Assigning a Position here overrides whatever Operational
// Title was set independently, matching "Position drives Grade"; if the
// Position is later cleared, Craft/Department/Grade clear with it and
// the independent Title selector is available again to re-set a craft
// for someone stepping back out of formal Position tracking.
// ============================================================
// Phase 3.2 (2026-08-25): widened from Super-Admin-only to also allow a
// holder of the operations.administer capability (PRIME's package) —
// see src/lib/organization/authority.ts. The real, fine-grained
// authorization boundary (self-assignment refused, CHIEF and every
// GR.9 peer executive Position protected) lives inside
// assignStaffPosition() itself, not here — this is only the
// coarse "are you allowed to call this at all" gate.
export async function assignStaffPositionAction(formData: FormData): Promise<{ error?: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Not authenticated." };
  if (!isSuperAdmin(currentUser) && !(await hasJurisdictionAuthority(currentUser.id, "operations", "administer"))) {
    return { error: "Not authorized to change organizational assignments." };
  }

  const userId = String(formData.get("userId") ?? "");
  const positionId = String(formData.get("positionId") ?? "").trim() || null;
  if (!userId) return { error: "Invalid request." };

  const result = await assignStaffPosition({ targetUserId: userId, positionId, actorUserId: currentUser.id });
  if (!result.ok) return { error: result.error };

  revalidatePath("/admin/users");
  return {};
}

// ============================================================
// Staff Onboarding (Phase J.2, 2026-09-05) — TD-056: staff_onboarding
// (public.staff_onboarding, src/lib/organization/onboarding.ts) had
// real schema and backend but no Admin UI action anywhere. Same
// coarse authorization gate as assignStaffPositionAction above (Super
// Admin or operations.administer) — the real, fine-grained boundary
// lives inside startStaffOnboarding()/completeStaffOnboarding()
// themselves (hardened this same phase — they had no authorization
// check of their own before now), not here.
// ============================================================
export async function startStaffOnboardingAction(formData: FormData): Promise<{ error?: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Not authenticated." };
  if (!isSuperAdmin(currentUser) && !(await hasJurisdictionAuthority(currentUser.id, "operations", "administer"))) {
    return { error: "Not authorized to onboard staff." };
  }

  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "Invalid request." };

  const result = await startStaffOnboarding({ profileId: userId, actorUserId: currentUser.id });
  if (!result.ok) return { error: result.error };

  revalidatePath("/admin/users");
  return {};
}

export async function completeStaffOnboardingAction(formData: FormData): Promise<{ error?: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Not authenticated." };
  if (!isSuperAdmin(currentUser) && !(await hasJurisdictionAuthority(currentUser.id, "operations", "administer"))) {
    return { error: "Not authorized to complete staff onboarding." };
  }

  const onboardingId = String(formData.get("onboardingId") ?? "");
  if (!onboardingId) return { error: "Invalid request." };

  const result = await completeStaffOnboarding({ onboardingId, actorUserId: currentUser.id });
  if (!result.ok) return { error: result.error };

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
// New Booking notification opt-in — CRM Lifecycle Automation Phase 1,
// Batch 3 refinement (2026-08-20). Super Admin only, same inline-check
// pattern as reclassifyUserAction directly above: being granted the
// `admin` role must never itself opt someone into this notification,
// so only an explicit Super Admin action can turn it on or off. Super
// Admins themselves are unconditional recipients (resolveNewBookingRecipients())
// and don't go through this preference at all, so this action only
// ever makes sense to call for a target user holding `admin`.
// ============================================================
export async function setNewBookingAlertsAction(formData: FormData): Promise<{ error?: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isSuperAdmin(currentUser)) {
    return { error: "Only a Super Admin can change notification settings." };
  }

  const userId = String(formData.get("userId") ?? "");
  const enabled = String(formData.get("enabled") ?? "") === "true";
  if (!userId) return { error: "Invalid request." };

  const result = await setNotificationPreference(userId, "new_booking", enabled);
  if (!result.ok) return { error: result.error };

  await logActivity({
    actorUserId: currentUser.id,
    action: "notification_preference.change",
    entityType: "user",
    entityId: userId,
    metadata: { category: "new_booking", enabled },
  });

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

// ============================================================
// Invite an existing client to the portal — the intentional counterpart
// to inviteCollaboratorAction() above, and to public self-signup
// (src/app/portal/signup/actions.ts). Use case: a client's business
// record already exists as a guest enquiry/booking (submitted before
// they had an account — the architecture's normal pre-account state,
// not a gap to fix), and staff want to give that same person portal
// access without asking them to sign up separately.
//
// Deliberately narrower than inviteCollaboratorAction(): no role
// parameter exists anywhere in this function's signature or the form
// that calls it — "client" is the only role this code path can ever
// grant, the same hardcoded guarantee public signup already relies on
// (see signUpAction's own doc comment). There is no way to pass a
// different role through this action, by construction, not by a
// runtime check that could be bypassed.
//
// Reuses the exact same secure mechanism as staff/collaborator invites
// (admin.auth.admin.inviteUserByEmail() + the /portal/reset-password
// set-a-password flow) — no plaintext password is ever generated,
// handled, or stored. Supabase's own invite API rejects an email that
// already has an account, so this can't create a duplicate identity —
// the existing error path below surfaces that the same way it already
// does for inviteCollaboratorAction().
//
// On first login, the resulting account picks up its existing guest
// enquiries/bookings automatically via linkGuestRecordsToAccount()
// (src/app/portal/login/actions.ts) — the same linking every self-signup
// client already goes through. No separate linking step is needed here.
export async function inviteClientToPortalAction(formData: FormData): Promise<{ error?: string }> {
  const currentUser = await requireAdmin();

  const email = String(formData.get("email") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();

  if (!email || !fullName) {
    return { error: "Fill in the client's name and email." };
  }

  const admin = createAdminClient();
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: `${siteUrl()}/portal/reset-password`,
  });
  if (inviteError || !invited.user) {
    console.error("[admin] client invite failed", inviteError?.message);
    return { error: inviteError?.message ?? "Couldn't send the invite." };
  }

  const { data: clientRoleRow } = await admin.from("roles").select("id").eq("slug", "client").single();
  if (clientRoleRow) {
    await admin
      .from("user_roles")
      .upsert({ user_id: invited.user.id, role_id: clientRoleRow.id }, { onConflict: "user_id,role_id", ignoreDuplicates: true });
  }

  // Every client account — self-signed-up or admin-invited — gets the
  // same fixed "client" classification, matching signUpAction()'s
  // behavior exactly (never blocks the invite on failure, same posture
  // as every classification assignment in this codebase).
  await assignClassificationBySlug(invited.user.id, "client");

  await logActivity({
    actorUserId: currentUser.id,
    action: "client.invited_to_portal",
    entityType: "user",
    entityId: invited.user.id,
    metadata: { email },
  });

  revalidatePath("/admin/users");
  return {};
}
