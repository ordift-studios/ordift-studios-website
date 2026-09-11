"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManageOnboarding, advanceOnboardingStage, completeStaffOnboarding } from "@/lib/organization/onboarding";
import { updateOnboardingRequirement, type RequirementStatus } from "@/lib/organization/onboardingRequirements";
import type { OnboardingPipeline } from "@/lib/organization/onboardingStages";

// Onboarding Workspace (E.5 Stage 2I, 2026-09-11) — Parts A/E/G/J.
// Every action here shares the exact same coarse authorization
// boundary as the pre-existing onboarding actions in
// src/app/admin/users/actions.ts (Super Admin, or a holder of
// operations.administer) via canManageOnboarding() — no new
// authorization concept, no Executive/Department visibility rule
// invented. The real gating (stage requirements, terminal-stage +
// required-requirement completion checks) lives inside
// advanceOnboardingStage()/completeStaffOnboarding() themselves
// (src/lib/organization/onboarding.ts), not here — this file is only
// the same kind of coarse "are you allowed to call this at all" gate
// every other onboarding action already uses.

export type ActionState = { ok: boolean; error?: string } | null;

async function requireOnboardingActor(): Promise<{ id: string } | { error: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Not authenticated." };
  if (!(await canManageOnboarding(currentUser.id))) return { error: "Not authorized to manage onboarding." };
  return { id: currentUser.id };
}

export async function advanceOnboardingStageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireOnboardingActor();
  if ("error" in actor) return { ok: false, error: actor.error };

  const onboardingId = String(formData.get("onboardingId") ?? "");
  const toStage = String(formData.get("toStage") ?? "");
  if (!onboardingId || !toStage) return { ok: false, error: "Invalid request." };

  const result = await advanceOnboardingStage({ onboardingId, toStage, actorUserId: actor.id });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/admin/organization/onboarding/${onboardingId}`);
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function completeOnboardingFromWorkspaceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireOnboardingActor();
  if ("error" in actor) return { ok: false, error: actor.error };

  const onboardingId = String(formData.get("onboardingId") ?? "");
  if (!onboardingId) return { ok: false, error: "Invalid request." };

  const result = await completeStaffOnboarding({ onboardingId, actorUserId: actor.id });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/admin/organization/onboarding/${onboardingId}`);
  revalidatePath("/admin/users");
  return { ok: true };
}

const REQUIREMENT_STATUSES: readonly RequirementStatus[] = ["pending", "satisfied", "waived", "not_applicable"];

export async function updateOnboardingRequirementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireOnboardingActor();
  if ("error" in actor) return { ok: false, error: actor.error };

  const onboardingId = String(formData.get("onboardingId") ?? "");
  const pipeline = String(formData.get("pipeline") ?? "") as OnboardingPipeline;
  const requirementKey = String(formData.get("requirementKey") ?? "");
  const status = String(formData.get("status") ?? "") as RequirementStatus;
  const notes = String(formData.get("notes") ?? "").trim() || undefined;
  const physicalOriginalReceived = formData.get("physicalOriginalReceived") === "on";
  const verifiedNow = formData.get("verifiedNow") === "on";
  if (!onboardingId || !requirementKey || !REQUIREMENT_STATUSES.includes(status)) {
    return { ok: false, error: "Invalid request." };
  }

  const result = await updateOnboardingRequirement({
    onboardingId,
    pipeline,
    requirementKey,
    status,
    actorUserId: actor.id,
    notes,
    physicalOriginalReceived,
    verifiedNow,
  });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/admin/organization/onboarding/${onboardingId}`);
  return { ok: true };
}
