"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, PEOPLE_CAPABILITIES } from "@/lib/organization/authority";
import { logActivity } from "@/lib/admin/activityLog";
import { recordBackgroundScreening } from "@/lib/organization/backgroundScreening";
import { BACKGROUND_SCREENING_CATEGORIES, BACKGROUND_SCREENING_STATUSES } from "@/lib/organization/backgroundScreening";
import { updateAccessStatusAction } from "@/app/admin/users/actions";

// Organizational Structure, Authority Grants, Onboarding & Work Email
// V1 (2026-09-07) — Person Detail View actions. Employment/engagement
// STATUS (this file) is deliberately separate from Account/System
// Access Status (src/app/admin/users/actions.ts's
// updateAccessStatusAction, reused unchanged by the page this powers —
// not duplicated here).
const EMPLOYMENT_STATUSES = ["pre_start", "active", "probation", "leave", "suspended", "notice_period", "exited"] as const;

// Security narrowing (2026-09-07) — same people.workforce.administer
// capability as /admin/users' own requireAdmin() (see
// src/app/admin/users/actions.ts) — this file edits the same
// Employment/Access Status workforce data, so it gets the identical
// boundary rather than a looser side door.
async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authorized.");
  const auth = await authorizeWithSuperAdminOverride(user.id, PEOPLE_CAPABILITIES.workforceAdminister);
  if (!auth.ok) throw new Error("Not authorized.");
  return user;
}

export async function setEmploymentStatusAction(formData: FormData): Promise<void> {
  const currentUser = await requireAdmin();

  const profileId = String(formData.get("profileId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (!profileId || !(EMPLOYMENT_STATUSES as readonly string[]).includes(status)) return;

  const admin = createAdminClient();
  const { data: previous } = await admin.from("staff_details").select("employment_status").eq("id", profileId).maybeSingle();

  const { error } = await admin
    .from("staff_details")
    .update({
      employment_status: status,
      employment_status_changed_at: new Date().toISOString(),
      employment_status_changed_by: currentUser.id,
    })
    .eq("id", profileId);
  if (error) {
    console.error("[admin organization] failed to update employment_status", error.message);
    return;
  }

  await logActivity({
    actorUserId: currentUser.id,
    action: "staff_details.employment_status_changed",
    entityType: "user",
    entityId: profileId,
    metadata: { previousStatus: previous?.employment_status ?? null, newStatus: status },
  });

  revalidatePath(`/admin/organization/people/${profileId}`);
}

// Background screening decision — recordBackgroundScreening() itself
// independently enforces Super-Admin-only; this action is just the
// form entry point.
export async function recordBackgroundScreeningAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const jurisdiction = String(formData.get("jurisdiction") ?? "").trim() || null;
  const evidenceReference = String(formData.get("evidenceReference") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!profileId || !(BACKGROUND_SCREENING_CATEGORIES as readonly string[]).includes(category)) return;
  if (!(BACKGROUND_SCREENING_STATUSES as readonly string[]).includes(status)) return;

  const result = await recordBackgroundScreening({
    profileId,
    category,
    status,
    jurisdiction,
    evidenceReference,
    notes,
    actorUserId: currentUser.id,
  });
  if (!result.ok) console.error("[admin organization] failed to record background screening", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

// Thin wrapper so the existing updateAccessStatusAction (which returns
// {error?} for its own client-side ConfirmBar UX in UsersManager.tsx)
// can also be used directly as a plain <form action> here, which
// requires a void-returning action. No logic duplicated — the real
// function is called unmodified.
export async function updateAccessStatusFormAction(formData: FormData): Promise<void> {
  const result = await updateAccessStatusAction(formData);
  if (result.error) console.error("[admin organization] failed to update access status", result.error);
  const profileId = String(formData.get("userId") ?? "").trim();
  if (profileId) revalidatePath(`/admin/organization/people/${profileId}`);
}
