import { describe, expect, it } from "vitest";
import { approvalPreconditions, approvalSentenceFor, approverLabelFor, describeVersion, NOT_COUNSEL_APPROVAL_STATEMENT, sentenceMatches, validateFounderApproval, type FounderApprovalInput } from "./founderApproval";

const HASH = "a".repeat(12) + "b".repeat(52);
const ctx = { today: "2026-11-20", code: "OS-LGL-014", version: "1.1", registeredDocxSha256: HASH };
const good = (o: Partial<FounderApprovalInput> = {}): FounderApprovalInput => ({
  consultationDate: "2026-11-18", startTime: "10:00", endTime: "11:20", timezone: "Asia/Qatar", counselName: "Counsel Name", counselFirm: "Not stated",
  identityCheckNote: "Called back on a number taken from the Bar register.", recommendations: "Counsel recommended tightening clause 12.3 and adding a minors consent line.",
  amendments: "Clause 12.3 reworded; L6 consent line added.", conclusion: "content_subject_to_recorded_amendments", conclusionNote: "Content subject to those two changes.",
  counselAskedToSeeFinalText: false, reconfirmationNote: "", reviewedDraftSha256: "f".repeat(64), textRelation: "reviewed_text_with_recorded_amendments",
  typedHashPrefix: HASH.slice(0, 12), statementAccepted: true, typedSentence: "approve OS-LGL-014 1.1", ...o,
});
const errs = (o: Partial<FounderApprovalInput>, c = ctx) => { const r = validateFounderApproval(good(o), c); return r.ok ? [] : r.errors; };

describe("validateFounderApproval", () => {
  it("accepts a complete record", () => expect(validateFounderApproval(good(), ctx)).toEqual({ ok: true }));
  it("refuses a consultation that has not happened yet, or an invalid date", () => {
    expect(errs({ consultationDate: "2026-11-21" })[0]).toMatch(/future/);
    expect(errs({ consultationDate: "2026-02-31" })[0]).toMatch(/date of the telephone consultation/);
  });
  it("needs call times in order and a real time zone", () => {
    expect(errs({ startTime: "11:00", endTime: "10:00" })[0]).toMatch(/after its start/);
    expect(errs({ startTime: "9am" })[0]).toMatch(/HH:MM/);
    expect(errs({ timezone: "Mars/Base" })[0]).toMatch(/time zone/);
  });
  it("requires counsel details, how identity was checked, and counsel's recommendations and conclusion in words", () => {
    expect(errs({ counselName: "" }).length).toBe(1);
    expect(errs({ identityCheckNote: "ok" }).length).toBe(1);
    expect(errs({ recommendations: "fine" }).length).toBe(1);
    expect(errs({ conclusionNote: "" }).length).toBe(1);
    expect(errs({ amendments: "" }).length).toBe(1);
  });
  it("cannot be recorded on advice that the text is not ready", () => {
    expect(errs({ conclusion: "amendments_needed_before_use" }).join(" ")).toMatch(/cannot be recorded on that advice/);
    expect(errs({ conclusion: "wants_more_time" }).join(" ")).toMatch(/cannot be recorded on that advice/);
    expect(errs({ conclusion: "approved_by_counsel" }).join(" ")).toMatch(/Choose counsel's conclusion/);
  });
  it("needs the follow-up recorded when counsel asked to see the final text", () => {
    expect(errs({ counselAskedToSeeFinalText: true, reconfirmationNote: "" }).join(" ")).toMatch(/asked to see the final text/);
    expect(errs({ counselAskedToSeeFinalText: true, reconfirmationNote: "Second call on 19 Nov; counsel confirmed the final text." })).toEqual([]);
  });
  it("refuses a different text, a bad reviewed-draft hash, and 'amendments incorporated' with none recorded", () => {
    expect(errs({ textRelation: "different_text" }).join(" ")).toMatch(/another consultation/);
    expect(errs({ reviewedDraftSha256: "abc" }).join(" ")).toMatch(/64-character/);
    expect(errs({ textRelation: "reviewed_text_with_recorded_amendments", amendments: "None requested" }).join(" ")).toMatch(/recorded none/);
    expect(errs({ textRelation: "same_text_as_reviewed", amendments: "None requested", conclusion: "content_as_drafted" })).toEqual([]);
  });
  it("requires the person to compare the registered hash, to accept the not-counsel-approval statement, and to type the exact sentence", () => {
    expect(errs({ typedHashPrefix: "000000000000" }).join(" ")).toMatch(/hash check/);
    expect(errs({ statementAccepted: false }).join(" ")).toMatch(/not a written approval issued by counsel/);
    expect(errs({ typedSentence: "approve OS-LGL-014 1.0" })[0]).toMatch(/type exactly: approve OS-LGL-014 1.1/);
    expect(sentenceMatches("  Approve  OS-LGL-014   1.1 ", "OS-LGL-014", "1.1")).toBe(true);
  });
  it("wording never says counsel approved", () => {
    expect(NOT_COUNSEL_APPROVAL_STATEMENT).toMatch(/not a written approval issued by counsel/);
    expect(approverLabelFor("2026-11-18")).toBe("Founder, on advice of counsel (telephone consultation 2026-11-18)");
    expect(approvalSentenceFor("OS-LGL-014", "1.1")).toBe("approve OS-LGL-014 1.1");
  });
});

describe("approvalPreconditions", () => {
  const base = { status: "legal_review", legacyCode: null, approvedAt: null, contentRegistered: true, unresolvedMarkers: 0, storedMasterVerified: true, founderApprovalExists: false, isCurrentActiveVersion: false };
  const open = (o: object) => approvalPreconditions({ ...base, ...o }).filter((p) => !p.ok).map((p) => p.key);
  it("is all clear for a registered version in legal review", () => expect(open({})).toEqual([]));
  it("names what is missing", () => {
    expect(open({ status: "draft" })).toEqual(["in_review"]);
    expect(open({ contentRegistered: false, unresolvedMarkers: null })).toEqual(["registered", "markers"]);
    expect(open({ unresolvedMarkers: 2 })).toEqual(["markers"]);
    expect(open({ storedMasterVerified: false })).toEqual(["integrity"]);
    expect(open({ founderApprovalExists: true })).toEqual(["no_prior"]);
    expect(open({ approvedAt: "2026-11-18T10:00:00Z", status: "approved" }).sort()).toEqual(["in_review", "no_prior"]);
  });
  it("never offers the active baseline or the legacy-mapped row", () => {
    expect(open({ status: "active", isCurrentActiveVersion: true })).toContain("not_baseline");
    expect(open({ legacyCode: "OS-LGL-004" })).toEqual(["not_baseline"]);
  });
});

describe("describeVersion: the historical placeholder is never shown as an approval", () => {
  const rowA = { id: "a", version: "1.0", status: "approved", legacyCode: null, approvedBy: "Legal Counsel", approvedAt: null };
  const rowB = { id: "b", version: "1.0", status: "active", legacyCode: "OS-LGL-004", approvedBy: "Management", approvedAt: null };
  const v11 = { id: "n", version: "1.1", status: "legal_review", legacyCode: null, approvedBy: null, approvedAt: null };
  it("distinguishes baseline, placeholder and target", () => {
    expect(describeVersion(rowB, "b", "n").role).toBe("active_baseline");
    const a = describeVersion(rowA, "b", "n");
    expect(a.role).toBe("historical_placeholder");
    expect(a.note).toMatch(/not a verified approval/);
    expect(describeVersion(v11, "b", "n").role).toBe("target");
  });
});
