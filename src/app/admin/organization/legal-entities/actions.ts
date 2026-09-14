"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { isSuperAdmin } from "@/lib/portal/roles";
import { createEmployingEntity, setEmployingEntityActive, verifyEmployingEntity } from "@/lib/organization/legalEntities";

// Legal Entities registry actions (Phase B6 Step 1, 2026-09-15). Every
// action independently re-checks Super Admin — nav visibility is never
// the security boundary, and createEmployingEntity()/etc. each also
// re-check internally regardless of what this file does.

export type ActionState = { ok: boolean; error?: string } | null;

async function requireSuperAdminActor(): Promise<{ id: string } | { error: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Not authenticated." };
  if (!isSuperAdmin(currentUser)) return { error: "Only Super Admin may manage legal entities." };
  return { id: currentUser.id };
}

export async function createEmployingEntityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireSuperAdminActor();
  if ("error" in actor) return { ok: false, error: actor.error };

  const legalName = String(formData.get("legalName") ?? "").trim();
  const tradingName = String(formData.get("tradingName") ?? "").trim() || null;
  const jurisdictionId = String(formData.get("jurisdictionId") ?? "").trim() || null;
  const registrationType = String(formData.get("registrationType") ?? "").trim() || null;
  const registrationDate = String(formData.get("registrationDate") ?? "").trim() || null;
  const effectiveFrom = String(formData.get("effectiveFrom") ?? "").trim() || null;
  const defaultCurrency = String(formData.get("defaultCurrency") ?? "").trim() || null;
  if (!legalName) return { ok: false, error: "A legal name is required." };

  const result = await createEmployingEntity({ legalName, tradingName, jurisdictionId, registrationType, registrationDate, effectiveFrom, defaultCurrency, actorUserId: actor.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/organization/legal-entities");
  return { ok: true };
}

export async function setEmployingEntityActiveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireSuperAdminActor();
  if ("error" in actor) return { ok: false, error: actor.error };

  const entityId = String(formData.get("entityId") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (!entityId) return { ok: false, error: "Invalid request." };

  const result = await setEmployingEntityActive({ entityId, active, actorUserId: actor.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/organization/legal-entities");
  return { ok: true };
}

export async function verifyEmployingEntityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireSuperAdminActor();
  if ("error" in actor) return { ok: false, error: actor.error };

  const entityId = String(formData.get("entityId") ?? "");
  if (!entityId) return { ok: false, error: "Invalid request." };

  const result = await verifyEmployingEntity({ entityId, actorUserId: actor.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/organization/legal-entities");
  return { ok: true };
}
