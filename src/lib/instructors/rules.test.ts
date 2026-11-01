import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { adoptionBlockers, EMPTY_RIGHTS, EMPTY_SAFEGUARDING, scheduleReadiness, sha256Text, unresolvedDecisions, unsetRights, validateSafeguarding, validateScheduleInput } from "./rules";
import { SCHEDULE_SAFEGUARDING_ENABLED } from "./safeguardingGate";

const contacts = { designatedContact: "Named person, role, phone", safeguardingContact: "Named lead, role", escalationContact: "Founder", emergencyInstructions: "Call the local emergency service first" };
const text = "x".repeat(300);

describe("standards adoption blockers", () => {
  it("a complete text with all contacts has no blockers", () => { expect(adoptionBlockers(text, contacts)).toEqual([]); });
  it("every unresolved [[DECISION ...]] placeholder blocks adoption and is listed", () => {
    const t = `${text} [[DECISION: designated contact]] and [[DECISION: out-of-hours route]]`;
    expect(unresolvedDecisions(t)).toHaveLength(2);
    expect(adoptionBlockers(t, contacts).filter((b) => b.startsWith("Unresolved decision"))).toHaveLength(2);
  });
  it("an unclosed marker still blocks", () => { expect(adoptionBlockers(`${text} [[DECISION open`, contacts)[0]).toMatch(/unclosed/); });
  it("each missing contact blocks and nothing is defaulted", () => {
    expect(adoptionBlockers(text, { designatedContact: "", safeguardingContact: " ", escalationContact: "ok-contact", emergencyInstructions: "" })).toHaveLength(3);
  });
  it("hashes the exact text", () => { expect(sha256Text("a")).toBe("ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb"); });
});

describe("schedule input and readiness", () => {
  const ok = { instructorProfileId: "p", agreementId: "a", programmeName: "Photography masterclass", venue: "Studio, Accra", firstSessionAt: "2027-02-01T09:00:00Z", durationMinutes: 120, frequency: "One session", responsibilities: "Deliver the masterclass", compensationReference: "Per Schedule A fee basis" };
  it("accepts complete input and rejects each gap", () => {
    expect(validateScheduleInput(ok).ok).toBe(true);
    for (const bad of [{ programmeName: "x" }, { venue: "" }, { firstSessionAt: "nope" }, { lastSessionAt: "2027-01-01T00:00:00Z" }, { durationMinutes: 5 }, { frequency: "" }, { responsibilities: "short" }, { compensationReference: "" }]) expect(validateScheduleInput({ ...ok, ...bad }).ok, JSON.stringify(bad)).toBe(false);
  });
  it("nothing is ready by default: every right starts unset and is listed", () => {
    expect(unsetRights(EMPTY_RIGHTS)).toHaveLength(6);
    const r = scheduleReadiness({ agreementExecuted: true, standardsAdopted: true, standardsAcknowledged: true, regulatoryClearance: "pending", regulatoryEvidence: null, rights: EMPTY_RIGHTS, coreComplete: true });
    expect(r.filter((x) => !x.met).map((x) => x.key)).toEqual(["regulatory", "rights_set"]);
  });
  it("ready only when every item is met; a flagged decision blocks", () => {
    const rights = { ...EMPTY_RIGHTS, teachingMaterialsUse: "permitted", materialOwnership: "instructor_retains", photography: "not_permitted", recording: "not_permitted", participantDataAccess: "none", publicationPromotion: "not_permitted" } as const;
    const all = (r: typeof EMPTY_RIGHTS) => scheduleReadiness({ agreementExecuted: true, standardsAdopted: true, standardsAcknowledged: true, regulatoryClearance: "confirmed", regulatoryEvidence: "Permit ref 123", rights: r, coreComplete: true }).every((x) => x.met);
    expect(all({ ...EMPTY_RIGHTS, ...rights })).toBe(true);
    expect(all({ ...EMPTY_RIGHTS, ...rights, unresolvedDecisions: "Who owns recordings?" })).toBe(false);
  });
});

describe("schedule safeguarding (proposed 0181; dormant until applied)", () => {
  it("must be decided; participants under 18 need both venue arrangements; no minors needs neither", () => {
    expect(validateSafeguarding({ involvesMinors: null, venueSafeguarding: "", venueEmergency: "" }).ok).toBe(false);
    expect(validateSafeguarding({ involvesMinors: true, venueSafeguarding: "", venueEmergency: "School emergency procedure; 112" }).ok).toBe(false);
    expect(validateSafeguarding({ involvesMinors: true, venueSafeguarding: "School safeguarding lead", venueEmergency: "" }).ok).toBe(false);
    expect(validateSafeguarding({ involvesMinors: true, venueSafeguarding: "School safeguarding lead", venueEmergency: "School emergency procedure; 112" }).ok).toBe(true);
    expect(validateSafeguarding({ involvesMinors: false, venueSafeguarding: "", venueEmergency: "" }).ok).toBe(true);
  });
  it("the readiness checklist is unchanged unless safeguarding data is supplied, and then blocks until met", () => {
    const base = { agreementExecuted: true, standardsAdopted: true, standardsAcknowledged: true, regulatoryClearance: "confirmed", regulatoryEvidence: "REF-12345", rights: { ...EMPTY_RIGHTS }, coreComplete: true };
    expect(scheduleReadiness(base).some((x) => x.key === "safeguarding")).toBe(false);
    expect(scheduleReadiness({ ...base, safeguarding: EMPTY_SAFEGUARDING }).find((x) => x.key === "safeguarding")?.met).toBe(false);
  });
  it("the form is OFF and the code reads no 0181 column while the gate is off", () => {
    const src = readFileSync(path.join(process.cwd(), "src/lib/instructors/assignments.ts"), "utf8");
    expect(SCHEDULE_SAFEGUARDING_ENABLED).toBe(false);
    expect(src).toMatch(/if \(!SCHEDULE_SAFEGUARDING_ENABLED\) return undefined;/);
    expect(src).not.toMatch(/SCOLS = "[^"]*involves_minors/);
  });
});
