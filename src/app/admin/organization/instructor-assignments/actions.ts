"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { approveSchedule, closeSchedule, proposeSchedule, updateScheduleRightsAndClearance } from "@/lib/instructors/assignments";
import { RIGHTS_OPTIONS, type RightsMatrix } from "@/lib/instructors/rules";
import { actionFail, actionOk, runAction, type ActionState } from "@/lib/shared/actionState";

// Session Schedules and Rights Matrix. The user is always the session user; the library re-checks authority (propose/edit: people-management; approve: Super Admin only).
const t = (f: FormData, k: string) => String(f.get(k) ?? "");
const refresh = () => revalidatePath("/admin/organization/instructor-assignments");
const pick = <K extends keyof typeof RIGHTS_OPTIONS>(f: FormData, k: K): (typeof RIGHTS_OPTIONS)[K][number] => { const v = t(f, k); return ((RIGHTS_OPTIONS[k] as readonly string[]).includes(v) ? v : "unset") as (typeof RIGHTS_OPTIONS)[K][number]; };

export async function proposeScheduleAction(_p: ActionState, f: FormData): Promise<ActionState> {
  const u = await getCurrentUser(); if (!u) return actionFail("Please sign in again.");
  return runAction(async () => {
    const [profileId, agreementId] = t(f, "instructorAgreement").split("|");
    const r = await proposeSchedule({ actorUserId: u.id, input: { instructorProfileId: profileId ?? "", agreementId: agreementId ?? "", programmeName: t(f, "programmeName"), venue: t(f, "venue"), firstSessionAt: t(f, "firstSessionAt"), lastSessionAt: t(f, "lastSessionAt") || undefined, durationMinutes: Number(t(f, "durationMinutes")), frequency: t(f, "frequency"), responsibilities: t(f, "responsibilities"), compensationReference: t(f, "compensationReference"), workshopId: t(f, "workshopId") || undefined } });
    if (!r.ok) return actionFail(r.error);
    refresh(); return actionOk("Proposed. Nothing is approved: every right starts unset and clearance is pending.");
  }, "propose schedule");
}
export async function saveRightsAction(_p: ActionState, f: FormData): Promise<ActionState> {
  const u = await getCurrentUser(); if (!u) return actionFail("Please sign in again.");
  return runAction(async () => {
    const rights: RightsMatrix = { teachingMaterialsUse: pick(f, "teachingMaterialsUse"), materialOwnership: pick(f, "materialOwnership"), photography: pick(f, "photography"), recording: pick(f, "recording"), participantDataAccess: pick(f, "participantDataAccess"), publicationPromotion: pick(f, "publicationPromotion"), sharingReuseRestrictions: t(f, "sharingReuseRestrictions"), agreementPolicyReferences: t(f, "agreementPolicyReferences"), unresolvedDecisions: t(f, "unresolvedDecisions") };
    const r = await updateScheduleRightsAndClearance({ actorUserId: u.id, scheduleId: t(f, "scheduleId"), rights, regulatoryClearance: t(f, "regulatoryClearance"), regulatoryEvidenceReference: t(f, "regulatoryEvidenceReference") });
    if (!r.ok) return actionFail(r.error);
    refresh(); return actionOk("Saved. A permission left unset, or any decision flagged for management, blocks approval.");
  }, "save rights");
}
export async function approveScheduleAction(_p: ActionState, f: FormData): Promise<ActionState> {
  const u = await getCurrentUser(); if (!u) return actionFail("Please sign in again.");
  return runAction(async () => {
    const r = await approveSchedule({ actorUserId: u.id, scheduleId: t(f, "scheduleId") });
    if (!r.ok) return actionFail(r.unmet?.length ? `${r.error} Still needed: ${r.unmet.join("; ")}.` : r.error);
    refresh(); return actionOk("Approved. Terms are now frozen.");
  }, "approve schedule");
}
export async function closeScheduleAction(_p: ActionState, f: FormData): Promise<ActionState> {
  const u = await getCurrentUser(); if (!u) return actionFail("Please sign in again.");
  return runAction(async () => {
    const r = await closeSchedule({ actorUserId: u.id, scheduleId: t(f, "scheduleId"), to: t(f, "to") === "completed" ? "completed" : "cancelled", note: t(f, "note") });
    if (!r.ok) return actionFail(r.error);
    refresh(); return actionOk("Updated.");
  }, "close schedule");
}
