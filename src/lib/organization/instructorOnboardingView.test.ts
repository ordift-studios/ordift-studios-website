import { describe, expect, it } from "vitest";
import { buildInstructorOnboardingView, type InstructorOnboardingFacts } from "./instructorOnboardingView";

// SYNTHETIC facts only. Nothing in the builder is specific to any person: every statement below follows from the facts.
const facts = (over: Partial<InstructorOnboardingFacts> = {}): InstructorOnboardingFacts => ({
  onboarding: { stage: "profile", status: "in_progress" }, representativeName: null,
  agreement: { reference: "SYN-1", status: "fully_executed", executed: true, effectiveDate: "2027-01-01", expiryDate: "2027-12-31", ongoing: false, copyAvailable: false },
  standards: { state: "pending", versionLabel: "1.0" }, payment: { profileExists: false, instructionCount: 0, verifiedCount: 0 }, identity: { applicable: true, done: true }, schedules: { total: 0, approved: 0 }, ...over,
});
const get = (f: InstructorOnboardingFacts, key: string) => buildInstructorOnboardingView(f).items.find((i) => i.key === key)!;

describe("payment destination: an administrator's outstanding action is not an instructor failure", () => {
  it("no payee profile -> 'Not yet requested', owned by ORDIFT STUDIOS, nothing needed now", () => {
    const i = get(facts(), "payment");
    expect(i).toMatchObject({ state: "not_yet_requested", stateLabel: "Not yet requested", owner: "ORDIFT STUDIOS", actionNeededNow: false, blocksOnboarding: true, blocksAssignment: false, link: null });
    expect(i.detail).toBe("Not yet requested — ORDIFT STUDIOS will notify you when payment details are required.");
  });
  it("payee profile exists, nothing submitted -> awaiting the instructor, needed now, with the secure page", () => {
    const i = get(facts({ payment: { profileExists: true, instructionCount: 0, verifiedCount: 0 } }), "payment");
    expect(i).toMatchObject({ state: "awaiting_instructor", owner: "You", actionNeededNow: true, link: { href: "/portal/payment-details" } });
    expect(i.nextAction).toMatch(/Never send bank details by email/);
  });
  it("submitted but unverified -> under review (ORDIFT STUDIOS); verified -> completed", () => {
    expect(get(facts({ payment: { profileExists: true, instructionCount: 1, verifiedCount: 0 } }), "payment")).toMatchObject({ state: "under_review", owner: "ORDIFT STUDIOS", actionNeededNow: false });
    expect(get(facts({ payment: { profileExists: true, instructionCount: 1, verifiedCount: 1 } }), "payment").state).toBe("completed");
  });
  it("payment never blocks a workshop assignment on its own, but does block completing onboarding", () => {
    const i = get(facts(), "payment");
    expect([i.blocksOnboarding, i.blocksAssignment]).toEqual([true, false]);
  });
});

describe("agreement", () => {
  it("executed -> completed, with the dates, and says signing does not start workshop work", () => {
    const i = get(facts(), "agreement");
    expect(i.state).toBe("completed");
    expect(i.detail).toContain("Effective 1 January 2027");
    expect(i.detail).toContain("expires 31 December 2027");
    expect(i.detail).toMatch(/does not by itself start any workshop work/);
    expect(i.stateLabel).toBe("Executed");
    expect(i.nextAction).toBeNull();
  });
  it("this release never links to My Agreements (that area needs migration 0193)", () => {
    const i = get(facts({ agreement: { ...facts().agreement, copyAvailable: true } }), "agreement");
    expect(i.link).toBeNull();
  });
  it("issued for signature -> awaiting the instructor, needed now; not issued -> awaiting ORDIFT STUDIOS", () => {
    expect(get(facts({ agreement: { reference: "X", status: "sent", executed: false, effectiveDate: null, expiryDate: null, ongoing: false, copyAvailable: false } }), "agreement")).toMatchObject({ state: "awaiting_instructor", actionNeededNow: true });
    expect(get(facts({ agreement: { reference: null, status: null, executed: false, effectiveDate: null, expiryDate: null, ongoing: false, copyAvailable: false } }), "agreement")).toMatchObject({ state: "awaiting_ordift", owner: "ORDIFT STUDIOS" });
  });
});

describe("instructor standards: required before the first assignment, not immediately", () => {
  it("pending -> action required NOW with one link to the acknowledgment page; blocks assignment but not onboarding", () => {
    expect(get(facts(), "standards")).toMatchObject({ state: "awaiting_instructor", stateLabel: "Action required", actionNeededNow: true, blocksOnboarding: false, blocksAssignment: true, link: { href: "/portal/instructor/standards", label: "Review & acknowledge standards" } });
  });
  it("acknowledged -> completed ('Acknowledged', with the version); not adopted -> awaiting ORDIFT STUDIOS", () => {
    expect(get(facts({ standards: { state: "acknowledged", versionLabel: "1.0" } }), "standards")).toMatchObject({ state: "completed", stateLabel: "Acknowledged", actionNeededNow: false });
    expect(get(facts({ standards: { state: "not_available", versionLabel: null } }), "standards")).toMatchObject({ state: "awaiting_ordift", owner: "ORDIFT STUDIOS" });
  });
});

describe("future workshop items and the whole view", () => {
  it("the programme/schedule/rights item is for a future workshop and agreed jointly", () => {
    expect(get(facts(), "programme")).toMatchObject({ state: "future_workshop", owner: "Both", applicability: "future_workshop", actionNeededNow: false, blocksAssignment: true });
    expect(get(facts({ schedules: { total: 1, approved: 1 } }), "programme").state).toBe("completed");
  });
  it("identity is shown only where the record has it, and never blocks", () => {
    expect(buildInstructorOnboardingView(facts({ identity: { applicable: false, done: false } })).items.some((i) => i.key === "identity")).toBe(false);
    const i = get(facts({ identity: { applicable: true, done: false } }), "identity");
    expect([i.blocksOnboarding, i.blocksAssignment]).toEqual([false, false]);
  });
  it("counts and representative come straight from the facts", () => {
    const v = buildInstructorOnboardingView(facts({ representativeName: "Synthetic Representative" }));
    expect(v.representativeName).toBe("Synthetic Representative");
    expect(v.stageLabel).toBe("Profile");
    expect(v.counts).toEqual({ completed: 2, awaitingYou: 1, awaitingOrdift: 2, later: 1 });
    expect(buildInstructorOnboardingView(facts({ onboarding: { stage: "active", status: "completed" } })).items.find((i) => i.key === "completion")?.state).toBe("completed");
  });
  it("is deterministic and everything person-specific comes from the facts, never from the builder", () => {
    const a = JSON.stringify(buildInstructorOnboardingView(facts()));
    expect(a).toBe(JSON.stringify(buildInstructorOnboardingView(facts())));
    expect(a).not.toMatch(/Synthetic Representative|@/);                                  // nothing person-specific unless the facts supply it
    const b = JSON.stringify(buildInstructorOnboardingView(facts({ representativeName: "Synthetic Representative" })));
    expect(b).toContain("Synthetic Representative");
    expect(JSON.parse(b).items).toEqual(JSON.parse(a).items);                              // the items are identical: the only difference is the supplied name
  });
});
