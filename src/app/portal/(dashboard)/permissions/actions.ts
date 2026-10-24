"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { answerPermissionRequest, withdrawOwnPermission } from "@/lib/portfolio/library";

export type PortalState = { ok: boolean; message: string } | null;

// The signed-in person is the only actor: the request must be addressed to them (re-checked here and by the database). Nothing is preselected.
export async function answerRequestAction(_: PortalState, f: FormData): Promise<PortalState> {
  const u = await getCurrentUser(); if (!u) return { ok: false, message: "Please sign in again." };
  const decision = String(f.get("decision") ?? "");
  if (decision !== "granted" && decision !== "declined") return { ok: false, message: "Choose whether you agree or not." };
  const r = await answerPermissionRequest(u.id, String(f.get("requestId") ?? ""), { decision, destinations: f.getAll("destinations").map(String), restrictions: String(f.get("restrictions") ?? ""), displayName: u.fullName ?? u.email ?? "" });
  revalidatePath("/portal/permissions");
  return r.ok ? { ok: true, message: decision === "granted" ? "Thank you. Your choice is recorded, and you can withdraw it here at any time." : "Thank you. Your choice is recorded. Nothing about your photographs or services changes." } : { ok: false, message: r.error };
}
export async function withdrawAction(_: PortalState, f: FormData): Promise<PortalState> {
  const u = await getCurrentUser(); if (!u) return { ok: false, message: "Please sign in again." };
  const r = await withdrawOwnPermission(u.id, String(f.get("recordId") ?? ""), u.fullName ?? u.email ?? "");
  revalidatePath("/portal/permissions");
  return r.ok ? { ok: true, message: "Withdrawn. Ordift Studios will not use these photographs for promotion from now on." } : { ok: false, message: r.error };
}
