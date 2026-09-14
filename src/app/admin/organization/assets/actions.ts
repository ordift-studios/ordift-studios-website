"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManageAssets, registerAsset, assignAsset, updateAssetStatus, type AssetStatus } from "@/lib/organization/assets";

// Assets & Equipment registry actions (Phase B5 Step 6, 2026-09-14).
// Same coarse authorization boundary as every other HR action in this
// engagement, via canManageAssets() — no new authorization concept.

export type ActionState = { ok: boolean; error?: string } | null;

async function requireActor(): Promise<{ id: string } | { error: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Not authenticated." };
  if (!(await canManageAssets(currentUser.id))) return { error: "Not authorized to manage company assets." };
  return { id: currentUser.id };
}

export async function registerAssetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  if ("error" in actor) return { ok: false, error: actor.error };

  const assetIdentifier = String(formData.get("assetIdentifier") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim() || null;
  const acknowledgementRequired = formData.get("acknowledgementRequired") === "true";
  if (!assetIdentifier || !description) return { ok: false, error: "An asset identifier and description are required." };

  const result = await registerAsset({ assetIdentifier, description, category, acknowledgementRequired, actorUserId: actor.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/organization/assets");
  return { ok: true };
}

export async function assignAssetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  if ("error" in actor) return { ok: false, error: actor.error };

  const assetId = String(formData.get("assetId") ?? "");
  const profileId = String(formData.get("profileId") ?? "");
  const issueCondition = String(formData.get("issueCondition") ?? "").trim() || null;
  if (!assetId || !profileId) return { ok: false, error: "Invalid request." };

  const result = await assignAsset({ assetId, profileId, issueCondition, actorUserId: actor.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/organization/assets");
  return { ok: true };
}

export async function updateAssetStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  if ("error" in actor) return { ok: false, error: actor.error };

  const assetId = String(formData.get("assetId") ?? "");
  const status = String(formData.get("status") ?? "") as AssetStatus;
  if (!assetId || !["in_stock", "under_repair", "retired", "disposed"].includes(status)) return { ok: false, error: "Invalid request." };

  const result = await updateAssetStatus({ assetId, status, actorUserId: actor.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/organization/assets");
  return { ok: true };
}
