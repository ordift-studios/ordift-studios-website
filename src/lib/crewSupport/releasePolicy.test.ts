import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { reviewerConflict } from "./fileRelease";

const FOUNDER = "founder", OTHER = "independent";
describe("separation of duties", () => {
  it("the uploader, the submitter and the assigned professional are all conflicted; an independent person is not", () => {
    expect(reviewerConflict({ reviewerId: FOUNDER, uploadedBy: FOUNDER, submittedBy: null, assigneeId: null })).toBeTruthy();
    expect(reviewerConflict({ reviewerId: FOUNDER, uploadedBy: OTHER, submittedBy: FOUNDER, assigneeId: null })).toBeTruthy();
    expect(reviewerConflict({ reviewerId: FOUNDER, uploadedBy: OTHER, submittedBy: OTHER, assigneeId: FOUNDER })).toBeTruthy(); // assignee, whatever else
    expect(reviewerConflict({ reviewerId: OTHER, uploadedBy: FOUNDER, submittedBy: FOUNDER, assigneeId: FOUNDER })).toBeNull();
  });
  it("an empty reviewer id never matches an empty uploader", () => {
    expect(reviewerConflict({ reviewerId: "", uploadedBy: null, submittedBy: null, assigneeId: null })).toBeNull();
  });
});

describe("client notification is opt-in", () => {
  it("the release form's email checkbox is unticked by default", () => {
    const src = readFileSync("src/app/admin/crew-support/AssignmentWorkPanel.tsx", "utf8");
    expect(src).toMatch(/name="notifyClient" defaultChecked=\{false\}/);
  });
  it("the action sends only when the box was ticked", () => {
    expect(readFileSync("src/app/admin/crew-support/releaseActions.ts", "utf8")).toMatch(/notifyClient: str\(formData, "notifyClient"\) === "on"/);
  });
  it("a job report never touches files, deliverables or email", () => {
    const src = readFileSync("src/lib/crewSupport/jobReports.ts", "utf8");
    for (const forbidden of ["project_files", "deliverables", "dispatchNotification", "sendFilesReadyEmail", "payment_obligations", "setEngagementStatus"]) expect(src).not.toContain(forbidden);
  });
});

import { canRemoveOwnFile } from "./fileRelease";
describe("removing your own upload", () => {
  it("is allowed only while the file is still the professional's private working copy", () => {
    expect(canRemoveOwnFile("private")).toBe(true);
    expect(canRemoveOwnFile("changes_requested")).toBe(true);
    for (const s of ["submitted", "approved", "released", "withdrawn"]) expect(canRemoveOwnFile(s)).toBe(false);
  });
});
