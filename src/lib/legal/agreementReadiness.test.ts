import { describe, expect, it } from "vitest";
import { assessAgreementReadiness, type AgreementReadinessInput } from "./agreementReadiness";
import { buildJourney } from "@/lib/organization/onboardingJourney";

// OS-LGL-010 v1.0 exactly as recorded in Production (2026-10-22): approved by "Legal Counsel", but no approval date, effective date,
// activation date, content reference or document hash; master files stored with checksums.
const recorded: AgreementReadinessInput = {
  code: "OS-LGL-010",
  title: "Instructor / Workshop Facilitator Agreement",
  version: { status: "approved", approvedBy: "Legal Counsel", approvedAt: null, activatedAt: null, effectiveDate: null, contentReference: null, documentHash: null, masterDocxSha256: "1c68433532061921f6e1b5ea776186c5d31ec8e27d4a2a8863ab3454aecc6034", masterPdfSha256: "7014db6" },
  jurisdictionName: null,
  confirmedEntityId: null,
  entityCandidates: [
    { id: "gh", name: "Ordift Studios", jurisdiction: "Ghana", verified: true, hasSignatory: false },
    { id: "qa", name: "Ordift Studios (Qatar)", jurisdiction: "Qatar", verified: true, hasSignatory: true },
  ],
};
const by = (r: ReturnType<typeof assessAgreementReadiness>, k: string) => r.checks.find((c) => c.key === k)!;

describe("OS-LGL-010 as actually recorded is NOT issuable, and nothing is invented", () => {
  const r = assessAgreementReadiness(recorded);
  it("blocks issue and names every missing fact", () => {
    expect(r.canIssue).toBe(false);
    expect(r.missing.map((m) => m.key)).toEqual(["approval_date", "content_reference", "activation", "effective_date", "jurisdiction", "contracting_entity", "signatory"]);
  });
  it("what IS recorded is verified (approver, stored master files)", () => {
    expect(by(r, "approval_recorded").state).toBe("verified");
    expect(by(r, "master_files").state).toBe("verified");
  });
  it("does not assume the Qatar or Ghana entity, and does not borrow the Qatar signatory", () => {
    expect(by(r, "contracting_entity").state).toBe("missing");
    expect(by(r, "signatory").detail).toContain("No contracting entity is confirmed");
  });
});

describe("it becomes issuable only when every fact is genuinely recorded", () => {
  const full: AgreementReadinessInput = {
    ...recorded,
    version: { ...recorded.version!, status: "active", approvedAt: "2026-10-23T08:00:00Z", activatedAt: "2026-10-24T09:00:00Z", effectiveDate: "2026-10-24", contentReference: "legal-import:abc", documentHash: "deadbeef" },
    jurisdictionName: "Ghana",
    confirmedEntityId: "gh",
    entityCandidates: [{ id: "gh", name: "Ordift Studios", jurisdiction: "Ghana", verified: true, hasSignatory: true }],
  };
  it("all verified -> canIssue", () => expect(assessAgreementReadiness(full).canIssue).toBe(true));
  it("an effective date before the approval date is rejected", () => {
    const r = assessAgreementReadiness({ ...full, version: { ...full.version!, effectiveDate: "2026-10-01" } });
    expect(by(r, "effective_date").state).toBe("missing");
    expect(r.canIssue).toBe(false);
  });
  it("an unverified entity is not accepted", () => {
    const r = assessAgreementReadiness({ ...full, entityCandidates: [{ ...full.entityCandidates[0], verified: false }] });
    expect(by(r, "contracting_entity").state).toBe("missing");
  });
  it("no current version -> blocked", () => expect(assessAgreementReadiness({ ...full, version: null }).canIssue).toBe(false));
});

describe("Kwaku's journey (INT0001): Profile stage, agreement blocked", () => {
  const stages = ["proposed", "approved", "invited", "profile", "payment_setup", "engagement_assigned", "active"];
  const facts = (agreement: ReturnType<typeof assessAgreementReadiness> | null) => ({
    pipeline: "external_contractor" as const, stages, stage: "profile", status: "in_progress", personName: "Kwaku Darko Gyimah", engagementTypeLabel: "Instructor", isInstructor: true,
    requirements: [{ requirementKey: "instructor_agreement_executed", stage: "profile", requirementType: "agreement", label: "Instructor agreement executed", required: true, status: "pending" }],
    hasPaymentDetails: false, engagementCount: 0, agreement, agreementsHref: "/admin/legal", legalHref: "/admin/legal",
  });
  it("marks earlier stages done, Profile current, the rest upcoming", () => {
    const { roadmap } = buildJourney(facts(assessAgreementReadiness(recorded)));
    expect(roadmap.map((s) => s.state)).toEqual(["done", "done", "done", "current", "upcoming", "upcoming", "upcoming"]);
  });
  it("the next action is the Founder resolving legal prerequisites, listing each missing item with its fix; nothing is sent", () => {
    const { next } = buildJourney(facts(assessAgreementReadiness(recorded)));
    expect(next.actor).toBe("Founder");
    expect(next.title).toContain("OS-LGL-010");
    expect(next.blockedBy).toHaveLength(7);
    expect(next.explanation).toContain("Nothing has been sent");
    expect(next.href).toBe("/admin/legal");
  });
  it("when legal prerequisites are verified the next action is to prepare the agreement (still a separate authorised step)", () => {
    const ok = assessAgreementReadiness({ ...recorded, version: { ...recorded.version!, status: "active", approvedAt: "2026-10-23T00:00:00Z", activatedAt: "2026-10-24T00:00:00Z", effectiveDate: "2026-10-24", contentReference: "x" }, jurisdictionName: "Ghana", confirmedEntityId: "qa" });
    const { next } = buildJourney(facts(ok));
    expect(next.title).toContain("Prepare");
  });
  it("completed onboarding says nothing more is needed", () => {
    const { next } = buildJourney({ ...facts(null), stage: "active", status: "completed" });
    expect(next.title).toBe("Onboarding is complete");
  });
});
