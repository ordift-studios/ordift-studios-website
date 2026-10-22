import { describe, expect, it } from "vitest";
import { composeInstructorAgreementText, instructorAgreementStage, type InstructorSnapshot } from "./instructorAgreementDocument";
import { missingScheduleATerms, validateScheduleATerms, type ScheduleATerms } from "./instructorAgreementTerms";

const terms: ScheduleATerms = {
  professionalRole: "INSTRUCTOR", businessName: "", nationalityWorkAuthorization: "", addressCountry: "Accra, Ghana", contactPhone: "", primaryExpertise: "Photography",
  qualifications: "", independentStatusRoute: "CONTRACTOR", masterTerm: "ONGOING", masterTerminationNotice: "30 days written notice", regulatoryApprovalStatus: "N/A", specialTerms: "NONE", agreementEffectiveDate: "2026-11-02",
};
const snap: InstructorSnapshot = {
  agreementReference: "ORD-AGR-2026-000099", jurisdiction: "Ghana",
  instructor: { profileId: "k", legalName: "Kwaku Darko Gyimah", memberNumber: "INT0001", email: "kwaku@example.test" },
  contractingEntity: { id: "gh", name: "Ordift Studios", legalName: "Ordift Studios", registrationType: "Registered Business Name", registrationDate: "2018-05-07" },
  signatory: { id: "s", name: "A Signatory", position: "Proprietor", authority: "As stated on the certificate", sourceDocumentId: "d" },
  template: { versionId: "v", contentReference: "legal-masters:x", documentHash: "abc123", templateEffectiveDate: "2026-09-05" },
  scheduleA: terms,
};
const MASTER = "INSTRUCTOR / WORKSHOP FACILITATOR AGREEMENT\n[LEGAL ENTITY / REGISTRATION DETAILS]\n1.1 Agreement.\n";

describe("OS-LGL-010 document composition", () => {
  const r = composeInstructorAgreementText({ masterText: MASTER, masterVersion: "1.0", snapshot: snap });
  it("keeps the controlled master verbatim, then appends the resolved particulars - it never rewrites the master's placeholders", () => {
    expect(r.ok).toBe(true);
    const t = r.ok ? r.text : "";
    expect(t.startsWith(MASTER)).toBe(true);
    expect(t).toContain("[LEGAL ENTITY / REGISTRATION DETAILS]");
  });
  it("states only verified or administrator-stated particulars: Ghana, the confirmed entity, the signatory's recorded authority, the agreement's own effective date", () => {
    const t = r.ok ? r.text : "";
    expect(t).toContain("Ordift Contracting Entity: Ordift Studios, Registered Business Name, registered 2018-05-07");
    expect(t).toContain("Primary Jurisdiction: Ghana");
    expect(t).toContain("For Ordift (Ordift Studios): A Signatory, Proprietor. Authority as recorded from the entity's supporting document: As stated on the certificate");
    expect(t).toContain("Effective Date: 2026-11-02");
    expect(t).toContain("MASTER DOCUMENT SHA-256: abc123");
    expect(t).not.toContain("2026-09-05"); // the template's effective date is never used as the agreement's
  });
  it("shows an unstated OPTIONAL term as 'Not stated' and invents no session, fee or date", () => {
    const t = r.ok ? r.text : "";
    expect(t).toContain("Business / trading name: Not stated");
    expect(t).toContain("No Session Schedule is issued with this Agreement");
    expect(t).not.toMatch(/Instructor fee|Agreed fee|USD|GHS/);
  });
  it("is deterministic (same inputs, same document and hash)", () => {
    const again = composeInstructorAgreementText({ masterText: MASTER, masterVersion: "1.0", snapshot: snap });
    expect(again).toEqual(r);
  });
  it("refuses to compose with any required particular missing, listing exactly which - never filling a guess", () => {
    const bad = composeInstructorAgreementText({ masterText: MASTER, masterVersion: "1.0", snapshot: { ...snap, signatory: { ...snap.signatory, authority: null }, scheduleA: { ...terms, masterTerm: "", specialTerms: "" } } });
    expect(bad).toEqual({ ok: false, missing: ["Authorised signatory (name, position and authority)", "Master term", "Special terms"] });
  });
});

describe("Schedule A terms", () => {
  it("requires the terms that have no verified source and validates the master's own option lists", () => {
    expect(missingScheduleATerms({})).toContain("Primary expertise");
    const v = validateScheduleATerms({ ...terms, independentStatusRoute: "EMPLOYEE", regulatoryApprovalStatus: "MAYBE", professionalRole: "KING" }, "2026-10-30");
    expect(!v.ok && v.errors.length).toBe(3);
  });
  it("the agreement's effective date is explicit and never in the past", () => {
    expect(validateScheduleATerms({ ...terms, agreementEffectiveDate: "2026-09-05" }, "2026-10-30").ok).toBe(false);
    expect(validateScheduleATerms({ ...terms, agreementEffectiveDate: "" }, "2026-10-30").ok).toBe(false);
    expect(validateScheduleATerms(terms, "2026-10-30").ok).toBe(true);
  });
});

describe("agreement stage labels - only genuine execution is Executed", () => {
  it.each([
    ["draft", null, "Draft", false], ["internal_review", null, "Draft — in internal review", false], ["approved_for_issue", null, "Approved for issue — not yet issued", false],
    ["sent", null, "Issued — awaiting signature", false], ["viewed", null, "Issued — awaiting signature (opened by a signatory)", false], ["partially_signed", null, "Partly signed — awaiting the remaining signature", false],
    ["fully_executed", null, "Executed", true], ["fully_executed", "genuine", "Executed", true], ["active", null, "Executed", true],
    ["fully_executed", "controlled_test", "Test signature — not a genuine execution", false], ["declined", null, "Declined", false], ["expired", null, "Expired", false],
  ])("%s / %s -> %s", (status, cls, label, executed) => {
    expect(instructorAgreementStage(status, cls)).toMatchObject({ label, executed });
  });
});

describe("declined and expired are read from the signatories", () => {
  const now = new Date("2026-11-20T00:00:00Z");
  it("a refusal by either signatory reads as Declined, not as awaiting signature", () => {
    expect(instructorAgreementStage("sent", null, [{ status: "declined", linkExpiresAt: "2026-12-01T00:00:00Z" }, { status: "pending", linkExpiresAt: "2026-12-01T00:00:00Z" }], now).label).toBe("Declined by a signatory");
  });
  it("an unsigned signatory whose link has lapsed reads as expired; a fully signed one never does", () => {
    expect(instructorAgreementStage("sent", null, [{ status: "signed", linkExpiresAt: "2026-11-01T00:00:00Z" }, { status: "viewed", linkExpiresAt: "2026-11-10T00:00:00Z" }], now).label).toBe("Signing link expired — not executed");
    expect(instructorAgreementStage("fully_executed", null, [{ status: "signed", linkExpiresAt: "2026-11-01T00:00:00Z" }], now).executed).toBe(true);
  });
});
