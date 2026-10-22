import { describe, expect, it } from "vitest";
import { contributorStatusLayers, type LayerFacts } from "./contributorStatusLayers";

const kwaku: LayerFacts = {
  onboarding: { stage: "profile", status: "in_progress" },
  requirements: [
    { requirementType: "task", label: "Complete profile", required: true, status: "pending" },
    { requirementType: "agreement", label: "Instructor agreement", required: true, status: "pending" },
  ],
  engagementCount: 0,
  hasPayeeProfile: false,
  agreementOnHold: true,
};
const by = (l: ReturnType<typeof contributorStatusLayers>, k: string) => l.find((x) => x.key === k)!;

describe("contributor status layers - five separate answers", () => {
  it("Kwaku today: only profile onboarding is under way; nothing else is claimed", () => {
    const l = contributorStatusLayers(kwaku);
    expect(l.map((x) => x.key)).toEqual(["profile", "readiness", "engagement", "agreement", "payment"]);
    expect(by(l, "profile")).toMatchObject({ state: "in_progress" });
    expect(by(l, "profile").summary).toContain("“profile” step");
    expect(by(l, "readiness").state).toBe("not_started");
    expect(by(l, "engagement").state).toBe("not_started");
    expect(by(l, "agreement").state).toBe("on_hold");
    expect(by(l, "payment").state).toBe("not_started");
  });
  it("finishing onboarding does NOT make them ready, engaged, signed or payable", () => {
    const l = contributorStatusLayers({ ...kwaku, onboarding: { stage: "active", status: "completed" } });
    expect(by(l, "profile").state).toBe("done");
    expect(by(l, "readiness").state).toBe("in_progress"); // a separate Ordift decision
    expect(by(l, "engagement").state).toBe("not_started");
    expect(by(l, "agreement").state).toBe("on_hold");
    expect(by(l, "payment").state).toBe("not_started");
  });
  it("an agreement counts only when every agreement requirement is satisfied on record", () => {
    const base = { ...kwaku, agreementOnHold: false };
    expect(by(contributorStatusLayers(base), "agreement").state).toBe("not_started");
    const signed = { ...base, requirements: base.requirements.map((r) => (r.requirementType === "agreement" ? { ...r, status: "satisfied" } : r)) };
    expect(by(contributorStatusLayers(signed), "agreement").state).toBe("done");
    expect(by(contributorStatusLayers({ ...base, requirements: [] }), "agreement").state).toBe("not_applicable");
  });
  it("engagements and payout details are reported separately and never imply payment approval", () => {
    const l = contributorStatusLayers({ ...kwaku, engagementCount: 2, hasPayeeProfile: true });
    expect(by(l, "engagement").summary).toContain("2 engagements");
    expect(by(l, "payment").summary).toContain("approved separately");
  });
  it("no onboarding record at all is shown honestly as not started", () => {
    const l = contributorStatusLayers({ ...kwaku, onboarding: null, requirements: [] });
    expect(by(l, "profile").state).toBe("not_started");
  });
});
