import { describe, expect, it } from "vitest";
import { questionsFor, validateJobReport, type JobReportInput } from "./jobReportRules";
import { RELEASE_CATEGORIES, clientFilePath, deliverableKeyFor, managementActions, professionalActions, transition, validateSubmitForRelease } from "./fileRelease";

const base: JobReportInput = { serviceFamily: "photography", actualServiceDate: "2026-10-12", actualStartTime: "10:00", actualEndTime: "21:00", completionStatus: "completed", wentSmoothly: true, answers: { onTime: "yes", conditions: "good", editingRemaining: "full" }, incidents: "", clientRequests: "", additionalServices: "", outstandingWork: "Edit the full gallery", remarks: "", };

describe("job report questionnaire", () => {
  it("is service-specific and short", () => {
    expect(questionsFor("photography").map((q) => q.id)).toContain("editingRemaining");
    expect(questionsFor("videography")).toEqual(questionsFor("photography"));
    expect(questionsFor("graphic-design").map((q) => q.id)).toContain("revisions");
    expect(questionsFor("other").length).toBeLessThanOrEqual(4);
    for (const f of ["photography", "graphic-design", "other"]) expect(questionsFor(f).length).toBeLessThanOrEqual(6);
  });
});

describe("validateJobReport", () => {
  const today = "2026-10-13";
  it("accepts a complete report, including a historical service date", () => {
    expect(validateJobReport(base, today, false).ok).toBe(true);
    expect(validateJobReport({ ...base, actualServiceDate: "2026-09-01" }, today, false).ok).toBe(true);
  });
  it("rejects a future date, a bad date, a bad status and bad times", () => {
    expect(validateJobReport({ ...base, actualServiceDate: "2026-12-01" }, today, false).ok).toBe(false);
    expect(validateJobReport({ ...base, actualServiceDate: "12/10/2026" }, today, false).ok).toBe(false);
    expect(validateJobReport({ ...base, completionStatus: "done" }, today, false).ok).toBe(false);
    expect(validateJobReport({ ...base, actualStartTime: "25:00" }, today, false).ok).toBe(false);
    expect(validateJobReport({ ...base, actualEndTime: "" , actualStartTime: ""}, today, false).ok).toBe(true);
  });
  it("answers must belong to the service's own questions and use valid options", () => {
    expect(validateJobReport({ ...base, answers: { nonsense: "yes" } }, today, false).ok).toBe(false);
    expect(validateJobReport({ ...base, answers: { conditions: "amazing" } }, today, false).ok).toBe(false);
    expect(validateJobReport({ ...base, answers: { onTime: "" } }, today, false)).toMatchObject({ ok: true });
  });
  it("a partial or not-performed report must explain what was not done", () => {
    expect(validateJobReport({ ...base, completionStatus: "partial", outstandingWork: "", remarks: "" }, today, false).ok).toBe(false);
    expect(validateJobReport({ ...base, completionStatus: "partial", outstandingWork: "", remarks: "Client cut the evening short" }, today, false).ok).toBe(true);
  });
  it("a correction needs a reason; the original is kept", () => {
    expect(validateJobReport(base, today, true).ok).toBe(false);
    expect(validateJobReport({ ...base, correctionReason: "Wrong finish time entered" }, today, true).ok).toBe(true);
  });
  it("limits free text", () => {
    expect(validateJobReport({ ...base, remarks: "x".repeat(2001) }, today, false).ok).toBe(false);
  });
});

describe("file release workflow", () => {
  it("every file starts private and can only reach the client through submit → approve → release", () => {
    expect(transition("private", "release", "management").ok).toBe(false);
    expect(transition("private", "approve", "management").ok).toBe(false);
    const s = transition("private", "submit", "professional");
    expect(s).toEqual({ ok: true, to: "submitted" });
    expect(transition("submitted", "release", "management").ok).toBe(false); // must be approved first
    expect(transition("submitted", "approve", "management")).toEqual({ ok: true, to: "approved" });
    expect(transition("approved", "release", "management")).toEqual({ ok: true, to: "released" });
  });
  it("roles are separate: a professional can't approve or release; management can't submit on their behalf", () => {
    expect(transition("submitted", "approve", "professional").ok).toBe(false);
    expect(transition("approved", "release", "professional").ok).toBe(false);
    expect(transition("private", "submit", "management").ok).toBe(false);
  });
  it("changes requested returns it to the professional, who resubmits; a released file can't be re-released or pulled back here", () => {
    expect(transition("submitted", "request_changes", "management")).toEqual({ ok: true, to: "changes_requested" });
    expect(transition("changes_requested", "submit", "professional")).toEqual({ ok: true, to: "submitted" });
    expect(transition("released", "release", "management").ok).toBe(false);
    expect(transition("released", "withdraw_from_review", "professional").ok).toBe(false);
    expect(transition("released", "request_changes", "management").ok).toBe(false);
  });
  it("lists the next actions for each side", () => {
    expect(professionalActions("private")).toEqual(["submit"]);
    expect(professionalActions("submitted")).toEqual(["withdraw_from_review"]);
    expect(managementActions("submitted")).toEqual(["approve", "request_changes", "reject"]);
    expect(managementActions("approved")).toEqual(["request_changes", "release", "reject"]);
    expect(managementActions("released")).toEqual([]);
  });
  it("early thank-you images and sneak peeks are their own categories, mapped to client deliverable categories", () => {
    expect(deliverableKeyFor("thank_you_image")).toBe("thank-you-images");
    expect(deliverableKeyFor("sneak_peek")).toBe("sneak-peeks");
    expect(deliverableKeyFor("final_gallery")).toBe("final-gallery");
    expect(RELEASE_CATEGORIES.length).toBe(9);
  });
  it("requires a category and a client-recognisable title; the client path is an authorised portal route", () => {
    expect(validateSubmitForRelease({ category: "thank_you_image", title: "Thank-you image 1", description: "" }).ok).toBe(true);
    expect(validateSubmitForRelease({ category: "nope", title: "x", description: "" }).ok).toBe(false);
    expect(validateSubmitForRelease({ category: "sneak_peek", title: "x", description: "" }).ok).toBe(false);
    expect(clientFilePath("abc")).toBe("/portal/client/files/abc/download");
  });
});
