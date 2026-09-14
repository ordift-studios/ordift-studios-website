"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";
import { reportAssetIncident } from "@/lib/organization/assets";
import { requestBusinessTravelAuthorization } from "@/lib/organization/businessTravel";
import { submitPortfolioUseRequest } from "@/lib/organization/portfolioUse";

// Employee Self-Service — My Requests (Phase B6 Step 6, 2026-09-15).
// Every submission is always on the caller's own behalf — none of
// these accept a profileId from the form.

export type ActionState = { ok: boolean; error?: string } | null;

export async function reportOwnAssetIncidentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isStaffOrAdmin(currentUser)) return { ok: false, error: "Not authorized." };

  const assignmentId = String(formData.get("assignmentId") ?? "");
  const incidentType = String(formData.get("incidentType") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!assignmentId || !incidentType || !description) return { ok: false, error: "Invalid request." };

  const result = await reportAssetIncident({ assignmentId, profileId: currentUser.id, incidentType, description, actorUserId: currentUser.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/me/requests");
  return { ok: true };
}

export async function requestOwnBusinessTravelAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isStaffOrAdmin(currentUser)) return { ok: false, error: "Not authorized." };

  const destinationCountry = String(formData.get("destinationCountry") ?? "").trim();
  const purpose = String(formData.get("purpose") ?? "").trim();
  const travelStartDate = String(formData.get("travelStartDate") ?? "").trim() || null;
  const travelEndDate = String(formData.get("travelEndDate") ?? "").trim() || null;
  if (!destinationCountry || !purpose) return { ok: false, error: "Invalid request." };

  const result = await requestBusinessTravelAuthorization({ profileId: currentUser.id, destinationCountry, purpose, travelStartDate, travelEndDate, actorUserId: currentUser.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/me/requests");
  return { ok: true };
}

export async function requestOwnPortfolioUseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isStaffOrAdmin(currentUser)) return { ok: false, error: "Not authorized." };

  const description = String(formData.get("description") ?? "").trim();
  if (!description) return { ok: false, error: "A description is required." };

  const result = await submitPortfolioUseRequest({ profileId: currentUser.id, description, actorUserId: currentUser.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/me/requests");
  return { ok: true };
}
