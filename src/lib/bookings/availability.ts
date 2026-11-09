import { validateSegments, type Conflict, type Segment } from "./rules";

// AVAILABILITY CHECK BEFORE A QUOTATION (pure; no I/O). It answers "could this person probably do this?" from the booking schedule and, optionally, from a direct check
// with the person. It is NOT a reservation or a confirmed booking: nobody is held, no booking record is made, and the whole check is repeated from scratch when a booking is
// confirmed (the database re-checks at that moment, whatever this said).

export type AvailabilityState = "available" | "tentative" | "conflicting" | "unverified";
export const NOT_A_RESERVATION = "This is an availability check, not a reservation or a confirmed booking. Nobody is held for this time, and the check is repeated when a booking is confirmed.";
export const STATE_LABEL: Record<AvailabilityState, string> = { available: "Available", tentative: "Tentatively available", conflicting: "Conflicting", unverified: "Unverified" };
export const STATE_MEANING: Record<AvailabilityState, string> = {
  available: "No conflict in the schedule, and the person confirmed directly that they can do it.",
  tentative: "No firm conflict in the schedule, but the person has not confirmed directly (or there is a possible clash to look at).",
  conflicting: "The person already has a firm commitment in this time.",
  unverified: "It could not be checked: something needed is missing or the schedule could not be read.",
};

export const VERIFICATION_METHODS = ["call", "direct_message", "in_person", "email"] as const;
export const VERIFICATION_MAX_AGE_DAYS = 7;
export type AvailabilityVerification = { method: string; reference: string; verifiedOn: string; confirmedWithPerson: boolean };
export type AvailabilityInput = { assigneeId: string | null; segments: Segment[]; conflicts: Conflict[] | null; verification: AvailabilityVerification | null; today: string };
export type AvailabilityAssessment = { state: AvailabilityState; headline: string; reasons: string[]; firm: Conflict[]; soft: Conflict[]; verificationAccepted: boolean; notReservation: true };

const dayMs = 86_400_000;
export function checkVerification(v: AvailabilityVerification | null, today: string): { ok: boolean; problems: string[] } {
  if (!v || (!v.method && !v.reference && !v.verifiedOn && !v.confirmedWithPerson)) return { ok: false, problems: [] };            // nothing offered
  const p: string[] = [];
  if (!(VERIFICATION_METHODS as readonly string[]).includes(v.method)) p.push("choose how you checked with the person");
  if ((v.reference ?? "").trim().length < 10) p.push("say where the check is recorded (at least a short sentence)");
  if (!v.verifiedOn || !/^\d{4}-\d{2}-\d{2}$/.test(v.verifiedOn)) p.push("give the date you checked");
  else if (v.verifiedOn > today) p.push("the date you checked cannot be in the future");
  else if ((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${v.verifiedOn}T00:00:00Z`)) / dayMs > VERIFICATION_MAX_AGE_DAYS) p.push(`the check is older than ${VERIFICATION_MAX_AGE_DAYS} days; ask again`);
  if (!v.confirmedWithPerson) p.push("tick that you checked directly with the assigned person");
  return { ok: p.length === 0, problems: p };
}

export function assessAvailability(i: AvailabilityInput): AvailabilityAssessment {
  const base = { notReservation: true as const, firm: [] as Conflict[], soft: [] as Conflict[], verificationAccepted: false };
  const segErr = validateSegments(i.segments);
  if (segErr) return { ...base, state: "unverified", headline: STATE_LABEL.unverified, reasons: [segErr] };
  if (!i.assigneeId) return { ...base, state: "unverified", headline: STATE_LABEL.unverified, reasons: ["Choose the person who would deliver it. Without a person the schedule cannot be checked."] };
  if (i.conflicts === null) return { ...base, state: "unverified", headline: STATE_LABEL.unverified, reasons: ["The schedule could not be read right now (or booking checks are not switched on). Nothing is assumed free."] };
  const firm = i.conflicts.filter((c) => c.firm), soft = i.conflicts.filter((c) => !c.firm);
  if (firm.length > 0) return { ...base, firm, soft, state: "conflicting", headline: STATE_LABEL.conflicting, reasons: [`${firm.length} firm commitment${firm.length === 1 ? "" : "s"} overlap${firm.length === 1 ? "s" : ""} this time. A direct check with the person does not clear a firm conflict here; it can only be cleared, with a documented check, when a booking is confirmed.`] };
  const ver = checkVerification(i.verification, i.today);
  const reasons: string[] = [];
  if (soft.length > 0) reasons.push(`${soft.length} possible clash${soft.length === 1 ? "" : "es"} (work in progress, not yet confirmed) overlap${soft.length === 1 ? "s" : ""} this time. Look at ${soft.length === 1 ? "it" : "them"} before relying on this.`);
  if (!ver.ok) reasons.push(ver.problems.length ? `The direct check was not accepted: ${ver.problems.join("; ")}.` : "The person has not been asked directly. Check with them (call, message, in person or email) and record it to move this to Available.");
  if (ver.ok && soft.length === 0) return { ...base, firm, soft, verificationAccepted: true, state: "available", headline: STATE_LABEL.available, reasons: ["No conflicts in the schedule, and you recorded a direct check with the assigned person."] };
  return { ...base, firm, soft, verificationAccepted: ver.ok, state: "tentative", headline: STATE_LABEL.tentative, reasons: ["No firm conflict in the schedule.", ...reasons] };
}

// What each kind of viewer may see of a conflict. Staff and admins see what and when; only an admin or Super Admin sees the booking or request reference.
export type ViewConflict = { kind: string; firm: boolean; label: string; from: string; to: string };
const GENERIC: Record<string, string> = { booking: "a confirmed booking", crew_slot: "a Crew Support assignment", leave: "approved leave" };
export function projectConflicts(list: Conflict[], seeReferences: boolean): ViewConflict[] {
  return list.map((c) => ({ kind: c.kind, firm: c.firm, from: c.from, to: c.to, label: seeReferences || c.kind === "leave" ? c.label : GENERIC[c.kind] ?? "a commitment" }));
}
