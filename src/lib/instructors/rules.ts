import { createHash } from "node:crypto";

// INDEPENDENT-INSTRUCTOR FRAMEWORK - pure rules (no I/O). The database (migration 0180) enforces the same rules; these give early, readable errors.
export const DECISION_MARKER = "[[DECISION";
export const sha256Text = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");
export const unresolvedDecisions = (text: string): string[] => Array.from(text.matchAll(/\[\[DECISION[^\]]*\]\]/g)).map((m) => m[0]);

export type StandardsContacts = { designatedContact: string; safeguardingContact: string; escalationContact: string; emergencyInstructions: string };
// Adoption needs: the full text with no unresolved decision, and every contact recorded by management. Nothing is ever filled in for them.
export function adoptionBlockers(text: string, c: StandardsContacts): string[] {
  const out: string[] = [];
  const open = unresolvedDecisions(text);
  if (text.includes(DECISION_MARKER) && open.length === 0) out.push("The text still contains an unclosed [[DECISION marker.");
  for (const d of open) out.push(`Unresolved decision in the text: ${d}`);
  const need: [string, string][] = [["designated Ordift contact", c.designatedContact], ["safeguarding contact", c.safeguardingContact], ["escalation contact", c.escalationContact], ["emergency instructions", c.emergencyInstructions]];
  for (const [label, v] of need) if ((v ?? "").trim().length < 5) out.push(`The ${label} is not recorded.`);
  if (text.trim().length < 200) out.push("The standards text is too short to adopt.");
  return out;
}

export const ACKNOWLEDGEMENT_CONSENT = "I have read and understood the Independent Instructor Standards shown above (this exact version) and I agree to follow them in my work for Ordift Studios as an independent instructor.";

export const RIGHTS_OPTIONS = {
  teachingMaterialsUse: ["unset", "permitted", "not_permitted"],
  materialOwnership: ["unset", "instructor_retains", "assigned_to_ordift", "licensed_to_ordift"],
  photography: ["unset", "permitted", "not_permitted"],
  recording: ["unset", "permitted", "not_permitted"],
  participantDataAccess: ["unset", "none", "limited_to_session", "data_processing_terms_required"],
  publicationPromotion: ["unset", "permitted", "not_permitted"],
} as const;
export type RightsMatrix = { [K in keyof typeof RIGHTS_OPTIONS]: (typeof RIGHTS_OPTIONS)[K][number] } & { sharingReuseRestrictions: string; agreementPolicyReferences: string; unresolvedDecisions: string };
export const RIGHTS_LABELS: Record<keyof typeof RIGHTS_OPTIONS, string> = {
  teachingMaterialsUse: "Use of the instructor's teaching materials", materialOwnership: "Ownership of instructor-created materials", photography: "Photography of the session",
  recording: "Audio / video recording of the session", participantDataAccess: "Participant-data access", publicationPromotion: "Publication and promotional use",
};
export const EMPTY_RIGHTS: RightsMatrix = { teachingMaterialsUse: "unset", materialOwnership: "unset", photography: "unset", recording: "unset", participantDataAccess: "unset", publicationPromotion: "unset", sharingReuseRestrictions: "", agreementPolicyReferences: "", unresolvedDecisions: "" };
export const unsetRights = (m: RightsMatrix): string[] => (Object.keys(RIGHTS_OPTIONS) as (keyof typeof RIGHTS_OPTIONS)[]).filter((k) => m[k] === "unset").map((k) => RIGHTS_LABELS[k]);

export type ScheduleInput = { instructorProfileId: string; agreementId: string; programmeName: string; venue: string; timezone?: string; firstSessionAt: string; lastSessionAt?: string; durationMinutes: number; frequency: string; responsibilities: string; compensationReference: string; workshopId?: string; engagementId?: string };
export function validateScheduleInput(i: ScheduleInput): { ok: true } | { ok: false; error: string } {
  const len = (s: string | undefined, min: number, max: number) => (s ?? "").trim().length >= min && (s ?? "").trim().length <= max;
  if (!i.instructorProfileId || !i.agreementId) return { ok: false, error: "Choose the instructor and the framework agreement." };
  if (!len(i.programmeName, 3, 200)) return { ok: false, error: "Enter the workshop or programme (3 to 200 characters)." };
  if (!len(i.venue, 3, 300)) return { ok: false, error: "Enter the venue or delivery location." };
  const first = Date.parse(i.firstSessionAt); if (!Number.isFinite(first)) return { ok: false, error: "Enter the first session date and time." };
  if (i.lastSessionAt) { const last = Date.parse(i.lastSessionAt); if (!Number.isFinite(last) || last < first) return { ok: false, error: "The last session cannot be before the first." }; }
  if (!Number.isInteger(i.durationMinutes) || i.durationMinutes < 15 || i.durationMinutes > 1440) return { ok: false, error: "The duration must be 15 to 1,440 minutes." };
  if (!len(i.frequency, 3, 200)) return { ok: false, error: "Enter the frequency (for example one session, or weekly for 4 weeks)." };
  if (!len(i.responsibilities, 10, 2000)) return { ok: false, error: "Describe the instructor's assigned responsibilities (at least 10 characters)." };
  if (!len(i.compensationReference, 3, 300)) return { ok: false, error: "Enter the compensation reference (the agreed fee basis or payment obligation). Do not invent a figure." };
  return { ok: true };
}

export type ReadinessItem = { key: string; label: string; met: boolean; detail?: string };
export function scheduleReadiness(f: { agreementExecuted: boolean; standardsAdopted: boolean; standardsAcknowledged: boolean; regulatoryClearance: string; regulatoryEvidence: string | null; rights: RightsMatrix; coreComplete: boolean }): ReadinessItem[] {
  const unset = unsetRights(f.rights);
  return [
    { key: "agreement", label: "Framework agreement fully executed (both signatures)", met: f.agreementExecuted },
    { key: "standards_adopted", label: "Independent Instructor Standards adopted by management", met: f.standardsAdopted },
    { key: "standards_ack", label: "Instructor has acknowledged the adopted standards", met: f.standardsAcknowledged },
    { key: "regulatory", label: "Regulatory clearance (or a documented reason none is required) recorded with a reference", met: ["confirmed", "not_required"].includes(f.regulatoryClearance) && (f.regulatoryEvidence ?? "").trim().length >= 5 },
    { key: "rights_set", label: "Every Rights Matrix permission decided", met: unset.length === 0, detail: unset.length ? `Unset: ${unset.join("; ")}` : undefined },
    { key: "rights_flags", label: "No unresolved rights decision flagged for management", met: f.rights.unresolvedDecisions.trim().length === 0 },
    { key: "core", label: "Programme, venue, dates, duration, frequency, responsibilities and compensation reference present", met: f.coreComplete },
  ];
}
