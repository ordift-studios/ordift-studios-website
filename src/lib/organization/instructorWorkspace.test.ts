import { describe, expect, it } from "vitest";
import { buildInstructorWorkspace, type InstructorWorkspaceFacts } from "./instructorWorkspace";
import { INSTRUCTOR_ONBOARDING_REQUIREMENT_CATALOG } from "./onboardingRequirements";
import { assessAgreementReadiness } from "@/lib/legal/agreementReadiness";
import { recorded } from "@/lib/legal/agreementReadiness.fixture";

// Kwaku Darko Gyimah (INT0001) exactly as recorded in Production on 2026-10-22.
const facts = (o: Partial<InstructorWorkspaceFacts> = {}): InstructorWorkspaceFacts => ({
  onboardingId: "b9e46461", personName: "Kwaku Darko Gyimah", memberNumber: "INT0001", engagementTypeName: "Instructor", stage: "profile", status: "in_progress",
  requisitionLinked: true, startDate: "2026-10-26", policies: { registered: 0, acknowledged: 0 },
  requirements: [
    { requirementKey: "instructor_identity_verified", stage: "profile", requirementType: "physical_document", label: "Identity document sighted and verified", required: false, status: "pending" },
    { requirementKey: "instructor_agreement_executed", stage: "active", requirementType: "agreement", label: "Instructor Agreement executed", required: true, status: "pending" },
    { requirementKey: "instructor_payment_setup_completed", stage: "payment_setup", requirementType: "task", label: "Payment destination configured", required: true, status: "pending" },
  ],
  agreement: assessAgreementReadiness(recorded), draftAgreement: null, paymentInstructionCount: 0, ...o,
});

describe("the Profile-stage circular dependency is corrected", () => {
  const req = INSTRUCTOR_ONBOARDING_REQUIREMENT_CATALOG.find((r) => r.requirementKey === "instructor_agreement_executed")!;
  it("the executed-agreement requirement no longer gates the Profile stage", () => expect(req.stage).not.toBe("profile"));
  it("it still gates completion of onboarding (terminal stage), is required, and is still derived from a genuinely executed OS-LGL-010", () => {
    expect(req.stage).toBe("active");
    expect(req.required).toBe(true);
    expect(req.derive).toBeDefined();
  });
  it("the engagement_assigned stage keeps its zero-requirements rule", () => expect(INSTRUCTOR_ONBOARDING_REQUIREMENT_CATALOG.some((r) => r.stage === "engagement_assigned")).toBe(false));
  it("the payment requirement is unchanged (agreement execution is not misrepresented as a payment-details item)", () => {
    expect(INSTRUCTOR_ONBOARDING_REQUIREMENT_CATALOG.find((r) => r.requirementKey === "instructor_payment_setup_completed")!.stage).toBe("payment_setup");
  });
});

describe("Kwaku's workspace, top to bottom", () => {
  const { steps, summary } = buildInstructorWorkspace(facts());
  const by = (k: string) => steps.find((s) => s.key === k)!;
  it("is one numbered path from hiring authorisation to final approval, with every required area present", () => {
    expect(steps.map((s) => s.key)).toEqual(["requisition", "classification", "profile", "jurisdiction_entity", "policies", "template", "signatory", "agreement", "payment", "eligibility", "approval"]);
    expect(steps.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
  it("shows what is done: requisition and classification are completed from existing records", () => {
    expect(by("requisition").state).toBe("completed");
    expect(by("classification")).toMatchObject({ state: "completed", known: expect.arrayContaining(["Engagement type: Instructor", "Member number INT0001"]) });
  });
  it("profile information is NOT blocked by the agreement - it is pending on identity verification only, via the existing requirements form", () => {
    expect(by("profile")).toMatchObject({ state: "pending", blocker: null, missing: ["Identity document not yet verified by staff"], action: { kind: "anchor", href: "#section-requirements" } });
  });
  it("policies are derived from real acknowledgement evidence; with no controlled policies registered the step is not applicable", () => {
    expect(by("policies")).toMatchObject({ state: "not_applicable", known: ["No controlled policy is currently registered"] });
    const w = buildInstructorWorkspace(facts({ policies: { registered: 3, acknowledged: 1 } })).steps.find((s) => s.key === "policies")!;
    expect(w).toMatchObject({ state: "pending", missing: [expect.stringContaining("2 policy acknowledgement(s) outstanding")] });
  });
  it("jurisdiction is known (Ghana) but the entity still needs confirmation, with the embedded form", () => {
    const s = by("jurisdiction_entity");
    expect(s.state).toBe("pending");
    expect(s.forms).toContain("confirm_entity");
    expect(s.known.join(" ")).toContain("Ghana");
  });
  it("the template step lists the exact unresolved legal items and the three embedded actions", () => {
    const s = by("template");
    expect(s.state).toBe("pending");
    expect(s.missing).toEqual(["Verify historical legal approval", "Register controlled master", "Counsel-review clauses resolved", "Activate the template", "Template effective date"]);
    expect(s.forms).toEqual(["attest_approval", "register_master", "activate"]);
  });
  it("the signatory step reports the documentary gap precisely and offers no add form until a stored document exists", () => {
    const s = by("signatory");
    expect(s.state).toBe("pending");
    expect(s.missing).toEqual(["Confirm authorised signatory"]);
    expect(s.checks[0].detail).toContain("no recorded filename or fingerprint");
    expect(s.checks[0].actionKey).toBe("add_signatory");
  });
  it("agreement preparation is blocked, naming what it waits for; eligibility is blocked until execution; nothing is marked ready", () => {
    expect(by("agreement")).toMatchObject({ state: "blocked", forms: [] });
    expect(by("agreement").blocker).toContain("Verify historical legal approval");
    expect(by("eligibility").state).toBe("blocked");
    expect(by("approval").state).toBe("pending");
  });
  it("reports overall completion and the current step", () => {
    expect(summary).toMatchObject({ applicable: 10, completed: 2, percent: 20 });
    expect(steps[summary.currentIndex!].key).toBe("profile");
  });
});

describe("later states", () => {
  it("once every legal prerequisite is verified the agreement step offers to prepare the draft; a draft continues in the same workspace", () => {
    const ready = { ...assessAgreementReadiness(recorded), canIssue: true, unresolved: [] };
    expect(buildInstructorWorkspace(facts({ agreement: ready })).steps.find((s) => s.key === "agreement")).toMatchObject({ state: "pending", forms: ["prepare_agreement"] });
    const withDraft = buildInstructorWorkspace(facts({ agreement: ready, draftAgreement: { id: "agr1", reference: "ORD-AGR-2026-000099", status: "draft", stageLabel: "Draft" } })).steps.find((s) => s.key === "agreement")!;
    expect(withDraft.action).toEqual({ kind: "embedded", label: "Continue below" });
    expect(withDraft.known).toEqual(["Agreement ORD-AGR-2026-000099: Draft"]);
    expect(withDraft.forms).toEqual([]);
  });
  it("an executed agreement completes the agreement and eligibility steps", () => {
    const executed = facts({ requirements: facts().requirements.map((r) => (r.requirementKey === "instructor_agreement_executed" ? { ...r, status: "satisfied" } : r)) });
    const { steps } = buildInstructorWorkspace(executed);
    expect(steps.find((s) => s.key === "agreement")!.state).toBe("completed");
    expect(steps.find((s) => s.key === "eligibility")!.state).toBe("completed");
  });
});

describe("Founder governance record (one verified identity, many entities)", () => {
  it("shows the Ghana entity with no signatory and a note-only record, and the Qatar entity separately, without mixing them", () => {
    const g = assessAgreementReadiness(recorded).context.governance;
    const ghana = g.find((x) => x.jurisdiction === "Ghana")!;
    const qatar = g.find((x) => x.jurisdiction === "Qatar")!;
    expect(ghana).toMatchObject({ signatories: 0, founderIsSignatory: false, storedBasisDocuments: 0, noteOnlyRecords: 1 });
    expect(qatar.signatories).toBe(1);
    expect(qatar.founderIsSignatory).toBe(false); // a signatory exists, but it is not linked to the Founder's verified profile in this fixture
  });
});
