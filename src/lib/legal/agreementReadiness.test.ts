import { describe, expect, it } from "vitest";
import { assessAgreementReadiness, type AgreementReadinessInput } from "./agreementReadiness";
import { recorded } from "./agreementReadiness.fixture";

const by = (r: ReturnType<typeof assessAgreementReadiness>, k: string) => r.checks.find((c) => c.key === k)!;

describe("OS-LGL-010 as actually recorded is NOT issuable, and nothing is invented", () => {
  const r = assessAgreementReadiness(recorded);
  it("blocks issue and lists exactly what is unresolved", () => {
    expect(r.canIssue).toBe(false);
    expect(r.unresolved.map((m) => `${m.key}:${m.state}`)).toEqual([
      "approval_date:missing", "content_reference:missing", "review_clauses:missing", "activation:missing", "effective_date:missing", "contracting_entity:needs_confirmation", "signatory:missing",
    ]);
  });
  it("what IS recorded is verified: approver, stored masters, and Ghana from the requisition (no re-entry)", () => {
    for (const k of ["approval_recorded", "master_files", "jurisdiction"]) expect(by(r, k).state).toBe("verified");
    // the seeded registry label is shown for what it is, never as a verified, dated legal approval
    expect(by(r, "approval_recorded").label).toBe("Registry status");
    expect(by(r, "approval_recorded").detail).toContain("seeded label");
    expect(by(r, "approval_recorded").detail).toContain("not a verified legal approval");
    expect(by(r, "jurisdiction").detail).toContain("Founder-approved requisition");
  });
  it("offers the Ghana entity as the candidate but requires confirmation, and never borrows the Qatar signatory", () => {
    expect(by(r, "contracting_entity").detail).toContain("Ordift Studios (Ghana)");
    expect(by(r, "signatory").detail).toContain("No authorised signatory is recorded for Ordift Studios.");
    expect(by(r, "signatory").detail).toContain("no recorded filename or fingerprint");
    expect(by(r, "signatory").actionKey).toBe("add_signatory"); // upload + record are both offered in the step
    expect(by(r, "signatory").detail).not.toContain("Myredlive");
    expect(r.context.entity?.name).toBe("Ordift Studios");
    expect(r.context.candidates.map((c) => c.jurisdiction)).toEqual(["Ghana"]);
  });
  it("every unresolved item explains what, why, where, who and how", () => {
    for (const c of r.unresolved) for (const f of ["what", "why", "source", "who", "how"] as const) expect(c.guide![f].length).toBeGreaterThan(3);
  });
  it("the approval date item says plainly that the date is unverified and where to resolve it, and does not borrow a package date", () => {
    const a = by(r, "approval_date");
    expect(a.label).toBe("Verify historical legal approval");
    expect(a.actionKey).toBe("attest_approval");
    expect(a.detail).toContain("another document set's approval date is not borrowed");
    expect(a.detail).toContain("creation date is not proof of approval");
    expect(a.detail).toContain("carries no approval date and no evidence");
    expect(a.guide!.source).toContain("never earlier than the version's creation");
    expect(a.guide!.how).toContain("independently");
  });
  it("the content reference is derived from the stored master but reported as not yet registered", () => {
    expect(by(r, "content_reference").detail).toContain("1c6843353206");
    expect(by(r, "content_reference").actionKey).toBe("register_master");
    expect(by(r, "content_reference").state).toBe("missing");
  });
});

describe("it becomes issuable only when every fact is genuinely recorded", () => {
  const full: AgreementReadinessInput = {
    ...recorded,
    version: { ...recorded.version!, status: "active", activatedAt: "2026-10-30T09:00:00Z", effectiveDate: "2026-10-30", contentReference: "legal-masters:x" },
    attestation: { approvalDate: "2026-09-18", counselName: "Counsel Name", counselFirm: "Firm", verifiedAt: "2026-10-29T10:00:00Z", verifiedByLabel: "member 0001", identityCheck: { method: "call_back_independent_number", checkedOn: "2026-10-22" }, approvalDateInEvidence: true },
    registrationCheck: { unresolvedMarkers: 0 },
    confirmedEntityId: "gh",
    entityCandidates: [{ ...recorded.entityCandidates[0], signatories: [{ id: "s2", fullName: "Authorised Person", position: "Proprietor", authority: "As stated", sourceDocumentId: "d2", profileId: null }] }],
  };
  it("all verified -> canIssue, and the approval date is shown as attested, distinct from the verification date", () => {
    const r = assessAgreementReadiness(full);
    expect(r.canIssue).toBe(true);
    expect(by(r, "approval_date").detail).toContain("dated 2026-09-18");
    expect(by(r, "approval_date").detail).toContain("registry's creation date of 2026-09-08");
    expect(by(r, "approval_date").detail).toContain("identity was checked independently by the administrator: Call-back to a number obtained independently");
    expect(by(r, "approval_date").detail).toContain("has not itself inspected counsel's document or verified counsel's identity");
    expect(by(r, "approval_date").detail).toContain("Recorded on 2026-10-29");
    expect(by(r, "approval_date").detail).toContain("administrator attestation");
    expect(by(r, "approval_date").detail).toContain("member 0001");
  });
  it("an effective date earlier than the approval date is rejected, including one on the creation date (8 Sep) before counsel's 18 Sep confirmation", () => {
    expect(by(assessAgreementReadiness({ ...full, version: { ...full.version!, effectiveDate: "2026-09-01" } }), "effective_date").state).toBe("missing");
    expect(by(assessAgreementReadiness({ ...full, version: { ...full.version!, effectiveDate: "2026-09-08" } }), "effective_date").state).toBe("missing");
    expect(by(assessAgreementReadiness({ ...full, version: { ...full.version!, effectiveDate: "2026-09-18" } }), "effective_date").state).toBe("verified");
  });
  it("an attestation recorded before identity checks existed is still shown, and says so plainly (compatibility)", () => {
    const legacy = assessAgreementReadiness({ ...full, attestation: { ...full.attestation!, identityCheck: null } });
    expect(by(legacy, "approval_date").state).toBe("verified");
    expect(by(legacy, "approval_date").detail).toContain("No independent counsel-identity check is on record");
  });
  it("tells the reader when the readable evidence does not mention the attested date", () => {
    expect(by(assessAgreementReadiness({ ...full, attestation: { ...full.attestation!, approvalDateInEvidence: false } }), "approval_date").detail).toContain("does not mention this date");
  });
  it("a stamped registry approval is shown as such, not as a seeded label", () => {
    const r2 = assessAgreementReadiness({ ...full, version: { ...full.version!, approvedAt: "2026-09-18T10:00:00Z" } });
    expect(by(r2, "approval_recorded").detail).toContain("approval stamp from the registry");
  });
  it("an unverified entity is never accepted as the contracting party", () => {
    const r = assessAgreementReadiness({ ...full, entityCandidates: [{ ...full.entityCandidates[0], verified: false }] });
    expect(by(r, "contracting_entity").state).toBe("missing");
    expect(r.canIssue).toBe(false);
  });
  it("no current version -> blocked", () => expect(assessAgreementReadiness({ ...full, version: null }).canIssue).toBe(false));
});
