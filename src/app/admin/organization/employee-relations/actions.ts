"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import {
  canManageGrievances,
  acknowledgeGrievance,
  resolveGrievance,
  resolveSpeakUpReport,
  type GrievanceResolutionStatus,
} from "@/lib/organization/grievances";

// Employee Relations workspace actions (Phase B5 Step 4, 2026-09-14).
// Grievances and Speak-Up remain genuinely separate workflows (never a
// shared "case" abstraction) — this file just groups their server
// actions the way the page groups their sections.

export type ActionState = { ok: boolean; error?: string } | null;

async function requireGrievanceActor(): Promise<{ id: string } | { error: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Not authenticated." };
  if (!(await canManageGrievances(currentUser.id))) return { error: "Not authorized to manage grievances." };
  return { id: currentUser.id };
}

export async function acknowledgeGrievanceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireGrievanceActor();
  if ("error" in actor) return { ok: false, error: actor.error };

  const grievanceId = String(formData.get("grievanceId") ?? "");
  if (!grievanceId) return { ok: false, error: "Invalid request." };

  const result = await acknowledgeGrievance({ grievanceId, actorUserId: actor.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/organization/employee-relations");
  return { ok: true };
}

export async function resolveGrievanceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireGrievanceActor();
  if ("error" in actor) return { ok: false, error: actor.error };

  const grievanceId = String(formData.get("grievanceId") ?? "");
  const status = String(formData.get("status") ?? "") as GrievanceResolutionStatus;
  const resolutionNotes = String(formData.get("resolutionNotes") ?? "").trim();
  if (!grievanceId || (status !== "resolved" && status !== "escalated") || !resolutionNotes) {
    return { ok: false, error: "Invalid request." };
  }

  const result = await resolveGrievance({ grievanceId, status, resolutionNotes, actorUserId: actor.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/organization/employee-relations");
  return { ok: true };
}

// Speak-Up resolution requires Super Admin specifically (not merely
// operations.administer) — the page already withholds the confidential
// list itself from non-Super-Admin, and this action re-checks
// independently rather than trusting the page's render-time gate.
export async function resolveSpeakUpReportAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { ok: false, error: "Not authenticated." };
  if (!isSuperAdmin(currentUser)) return { ok: false, error: "The Speak-Up channel is Super-Admin-only." };

  const reportId = String(formData.get("reportId") ?? "");
  const resolutionNotes = String(formData.get("resolutionNotes") ?? "").trim();
  if (!reportId || !resolutionNotes) return { ok: false, error: "Invalid request." };

  const result = await resolveSpeakUpReport({ reportId, resolutionNotes, actorUserId: currentUser.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/organization/employee-relations");
  return { ok: true };
}
