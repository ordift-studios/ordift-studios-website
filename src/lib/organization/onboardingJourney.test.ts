import { describe, expect, it } from "vitest";
import { buildJourney } from "./onboardingJourney";
import { assessAgreementReadiness } from "@/lib/legal/agreementReadiness";
import { recorded } from "@/lib/legal/agreementReadiness.fixture";

const stages = ["proposed", "approved", "invited", "profile", "payment_setup", "engagement_assigned", "active"];
const reqs = [
  { requirementKey: "instructor_agreement_executed", stage: "profile", requirementType: "agreement", label: "Instructor / Workshop Facilitator Agreement (OS-LGL-010) executed", required: true, status: "pending" },
  { requirementKey: "instructor_payment_setup_completed", stage: "payment_setup", requirementType: "task", label: "Payment destination configured", required: true, status: "pending" },
];
const facts = (o: Partial<Parameters<typeof buildJourney>[0]> = {}) => ({
  pipeline: "external_contractor" as const, stages, stage: "profile", status: "in_progress", personName: "Kwaku Darko Gyimah", isInstructor: true,
  requirements: reqs, agreement: assessAgreementReadiness(recorded), anchors: { requirements: "#section-requirements", stage: "#section-stage" }, ...o,
});

describe("Kwaku's guided journey (INT0001) at the Profile stage", () => {
  const { roadmap, next } = buildJourney(facts());
  it("marks earlier stages done, Profile current, the rest later", () => expect(roadmap.map((s) => s.state)).toEqual(["done", "done", "done", "current", "upcoming", "upcoming", "upcoming"]));
  it("distinguishes blocked (agreement), pending (payment) - persistent item states", () => {
    expect(roadmap[3].items[0]).toMatchObject({ state: "blocked", note: expect.stringContaining("6 legal prerequisites unresolved") });
    expect(roadmap[4].items[0].state).toBe("pending");
  });
  it("the next action is the Founder resolving six prerequisites, each with a full guide; nothing is sent", () => {
    expect(next.actor).toBe("Founder");
    expect(next.title).toBe("Resolve 6 legal prerequisites for OS-LGL-010");
    expect(next.blockers).toHaveLength(6);
    expect(next.blockers.every((b) => b.guide)).toBe(true);
    expect(next.explanation).toContain("Nothing has been sent");
  });
  it("completed requirements and not-applicable ones are shown as such", () => {
    const j = buildJourney(facts({ requirements: [{ ...reqs[0], status: "satisfied" }, { ...reqs[1], status: "not_applicable" }] }));
    expect(j.roadmap[3].items[0].state).toBe("completed");
    expect(j.roadmap[4].items[0].state).toBe("not_applicable");
  });
  it("with nothing blocking, it points at the existing Pipeline & Stage form rather than advancing anything", () => {
    const j = buildJourney(facts({ requirements: [{ ...reqs[0], status: "satisfied" }], agreement: null }));
    expect(j.next.href).toBe("#section-stage");
  });
  it("completed onboarding says nothing more is needed", () => expect(buildJourney(facts({ stage: "active", status: "completed" })).next.title).toBe("Onboarding is complete"));
});
