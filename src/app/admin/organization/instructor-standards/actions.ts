"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { adoptStandards, createStandardsDraft, retireStandards, updateStandardsDraft } from "@/lib/instructors/standards";
import { actionFail, actionOk, runAction, type ActionState } from "@/lib/shared/actionState";

// Independent Instructor Standards: Super Admin only (re-checked inside the library). The user is always the session user.
async function admin() { const u = await getCurrentUser(); return u && isSuperAdmin(u) ? u : null; }
const DENIED = "Only a Super Admin can manage the instructor standards.";
const t = (f: FormData, k: string) => String(f.get(k) ?? "");
const contacts = (f: FormData) => ({ designatedContact: t(f, "designatedContact"), safeguardingContact: t(f, "safeguardingContact"), escalationContact: t(f, "escalationContact"), emergencyInstructions: t(f, "emergencyInstructions") });
const refresh = () => revalidatePath("/admin/organization/instructor-standards");

export async function createStandardsDraftAction(_p: ActionState, f: FormData): Promise<ActionState> {
  const u = await admin(); if (!u) return actionFail(DENIED);
  return runAction(async () => { const r = await createStandardsDraft({ actorUserId: u.id, versionLabel: t(f, "versionLabel"), title: t(f, "title"), bodyText: t(f, "bodyText"), contacts: contacts(f) }); if (!r.ok) return actionFail(r.error); refresh(); return actionOk("Draft saved. It is not visible to instructors until it is adopted."); }, "create standards draft");
}
export async function updateStandardsDraftAction(_p: ActionState, f: FormData): Promise<ActionState> {
  const u = await admin(); if (!u) return actionFail(DENIED);
  return runAction(async () => { const r = await updateStandardsDraft({ actorUserId: u.id, versionId: t(f, "versionId"), title: t(f, "title"), bodyText: t(f, "bodyText"), contacts: contacts(f) }); if (!r.ok) return actionFail(r.error); refresh(); return actionOk("Draft updated."); }, "update standards draft");
}
export async function adoptStandardsAction(_p: ActionState, f: FormData): Promise<ActionState> {
  const u = await admin(); if (!u) return actionFail(DENIED);
  return runAction(async () => {
    const r = await adoptStandards({ actorUserId: u.id, versionId: t(f, "versionId"), note: t(f, "note") });
    if (!r.ok) return actionFail(r.blockers?.length ? `${r.error} ${r.blockers.join(" ")}` : r.error);
    refresh(); return actionOk(`Adopted (SHA-256 ${r.sha256.slice(0, 12)}…). Independent instructors can now read and acknowledge this version.`);
  }, "adopt standards");
}
export async function retireStandardsAction(_p: ActionState, f: FormData): Promise<ActionState> {
  const u = await admin(); if (!u) return actionFail(DENIED);
  return runAction(async () => { const r = await retireStandards({ actorUserId: u.id, versionId: t(f, "versionId") }); if (!r.ok) return actionFail(r.error); refresh(); return actionOk("Retired. Until a new version is adopted, no instructor can be assigned."); }, "retire standards");
}
