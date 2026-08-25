import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";

// Ordift Organizational & Administrative Architecture V1, Phase 3.3,
// Part F (2026-08-25) — staff onboarding PROCESS tracker, against
// public.staff_onboarding. Deliberately thin: Position/Grade/
// Department/reporting resolution already happens via
// assignStaffPosition() (src/lib/organization/assignPosition.ts), and
// the staff/member number is issued through the existing, untouched
// Phase 2.1 sequential numbering architecture
// (src/lib/portal/memberNumbers.ts) — this module never duplicates
// either. It only tracks which onboarding steps are done for a real,
// already-existing profile.

export type StaffOnboarding = {
  id: string;
  profileId: string;
  recruitmentApplicationId: string | null;
  corporateIdentityId: string | null;
  startDate: string | null;
  status: string;
  policiesAcceptedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

function mapOnboarding(r: {
  id: string;
  profile_id: string;
  recruitment_application_id: string | null;
  corporate_identity_id: string | null;
  start_date: string | null;
  status: string;
  policies_accepted_at: string | null;
  completed_at: string | null;
  created_at: string;
}): StaffOnboarding {
  return {
    id: r.id,
    profileId: r.profile_id,
    recruitmentApplicationId: r.recruitment_application_id,
    corporateIdentityId: r.corporate_identity_id,
    startDate: r.start_date,
    status: r.status,
    policiesAcceptedAt: r.policies_accepted_at,
    completedAt: r.completed_at,
    createdAt: r.created_at,
  };
}

const SELECT = "id, profile_id, recruitment_application_id, corporate_identity_id, start_date, status, policies_accepted_at, completed_at, created_at";

export async function listStaffOnboarding(): Promise<StaffOnboarding[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("staff_onboarding").select(SELECT).order("created_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load staff_onboarding", error.message);
    return [];
  }
  return (data ?? []).map(mapOnboarding);
}

export async function startStaffOnboarding(params: {
  profileId: string;
  recruitmentApplicationId?: string | null;
  startDate?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; onboardingId: string } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("staff_onboarding")
    .insert({
      profile_id: params.profileId,
      recruitment_application_id: params.recruitmentApplicationId ?? null,
      start_date: params.startDate ?? null,
      created_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[organization] failed to start staff_onboarding", error?.message);
    return { ok: false, error: "Failed to start onboarding — a record for this person may already exist." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "staff_onboarding.started",
    entityType: "user",
    entityId: params.profileId,
  });

  return { ok: true, onboardingId: data.id };
}

export async function completeStaffOnboarding(params: {
  onboardingId: string;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: existing } = await admin.from("staff_onboarding").select("profile_id").eq("id", params.onboardingId).maybeSingle();
  if (!existing) return { ok: false, error: "Onboarding record not found." };

  const { error } = await admin
    .from("staff_onboarding")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", params.onboardingId);
  if (error) {
    console.error("[organization] failed to complete staff_onboarding", error.message);
    return { ok: false, error: "Failed to complete onboarding." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "staff_onboarding.completed",
    entityType: "user",
    entityId: existing.profile_id,
  });

  return { ok: true };
}
