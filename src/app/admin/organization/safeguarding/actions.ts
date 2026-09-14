"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManageSafeguarding, escalateSafeguardingConcern, resolveSafeguardingConcern } from "@/lib/organization/safeguarding";

// Safeguarding Concerns workspace actions (Phase B5 Step 9, 2026-09-14).
// Reporting a concern (reportSafeguardingConcern) carries no
// authorization gate by design — it is not exposed here since this
// file only covers the restricted admin-side escalate/resolve path.

export type ActionState = { ok: boolean; error?: string } | null;

async function requireActor(): Promise<{ id: string } | { error: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Not authenticated." };
  if (!(await canManageSafeguarding(currentUser.id))) return { error: "Not authorized to manage safeguarding concerns." };
  return { id: currentUser.id };
}

export async function escalateSafeguardingConcernAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  if ("error" in actor) return { ok: false, error: actor.error };

  const reportId = String(formData.get("reportId") ?? "");
  const escalationNotes = String(formData.get("escalationNotes") ?? "").trim();
  if (!reportId || !escalationNotes) return { ok: false, error: "Invalid request." };

  const result = await escalateSafeguardingConcern({ reportId, escalationNotes, actorUserId: actor.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/organization/safeguarding");
  return { ok: true };
}

export async function resolveSafeguardingConcernAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  if ("error" in actor) return { ok: false, error: actor.error };

  const reportId = String(formData.get("reportId") ?? "");
  const resolutionNotes = String(formData.get("resolutionNotes") ?? "").trim();
  if (!reportId || !resolutionNotes) return { ok: false, error: "Invalid request." };

  const result = await resolveSafeguardingConcern({ reportId, resolutionNotes, actorUserId: actor.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/organization/safeguarding");
  return { ok: true };
}
