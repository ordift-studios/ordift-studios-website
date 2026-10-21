import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The panel's server actions pull in server-only modules; the notice is pure display, so stub them.
vi.mock("./releaseActions", () => ({ reviewFileAction: vi.fn(), releaseFilesAction: vi.fn(), reviewFileDownloadUrlAction: vi.fn(), previewUrlsAction: vi.fn(), reviewFilesAction: vi.fn(), notifyReleasedFilesAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./ReviewFileLink", () => ({ default: ({ label }: { label: string }) => label }));

import AssignmentWorkPanel, { type AssignmentWork } from "./AssignmentWorkPanel";
import { ASSIGNEE_NOTICE_TITLE } from "@/lib/crewSupport/fileRelease";

const FOUNDER = "founder-id";
const OTHER = "independent-id";
const empty: AssignmentWork = { slotId: "s1", label: "Photographer", assigneeId: FOUNDER, engagementId: "e1", serviceFamily: "photography", reports: [], files: [] };
const render = (viewerId: string, work: AssignmentWork[] = [empty], canReview = true) =>
  renderToStaticMarkup(createElement(AssignmentWorkPanel, { requestId: "r1", work, canReview, isTest: false, viewerId }));

describe("standing self-review notice", () => {
  it("shows to the assigned professional with no files and no report", () => {
    const html = render(FOUNDER);
    expect(html).toContain(ASSIGNEE_NOTICE_TITLE);
    expect(html).toContain("cannot review, approve or release your own files");
    expect(html).toContain("Nothing uploaded yet.");
  });
  it("shows regardless of whether the viewer holds the review permission", () => {
    expect(render(FOUNDER, [empty], false)).toContain(ASSIGNEE_NOTICE_TITLE);
  });
  it("does not show to an administrator who is not the assigned professional", () => {
    expect(render(OTHER)).not.toContain(ASSIGNEE_NOTICE_TITLE);
  });
  it("shows once per job, and only for the job they are assigned to", () => {
    const second: AssignmentWork = { ...empty, slotId: "s2", label: "Videographer", assigneeId: OTHER };
    const html = render(FOUNDER, [empty, second]);
    expect(html.split(ASSIGNEE_NOTICE_TITLE).length - 1).toBe(1);
  });
  it("is not duplicated by the per-file notice when files are in review", () => {
    const file = { id: "f1", originalFilename: "a.jpg", releaseStatus: "submitted", releaseCategory: "thank_you_image", clientTitle: "A", clientDescription: null, releaseReviewNote: null, releasedAt: null, uploadedBy: FOUNDER, submittedForReleaseBy: FOUNDER } as unknown as AssignmentWork["files"][number];
    const html = render(FOUNDER, [{ ...empty, files: [file] }]);
    expect(html.split(ASSIGNEE_NOTICE_TITLE).length - 1).toBe(1);
    expect(html).not.toContain("You can&#x27;t review or release your own work");
    expect(html).not.toContain(">Approve<"); // controls stay hidden for own files
    expect(html).not.toContain("notifyClient");
  });
  it("an independent reviewer still sees the controls for someone else's file, with the email box unticked", () => {
    const file = { id: "f1", originalFilename: "a.jpg", releaseStatus: "approved", releaseCategory: "thank_you_image", clientTitle: "A", clientDescription: null, releaseReviewNote: null, releasedAt: null, uploadedBy: FOUNDER, submittedForReleaseBy: FOUNDER } as unknown as AssignmentWork["files"][number];
    const html = render(OTHER, [{ ...empty, files: [file] }]);
    expect(html).toContain("Release selected to the client");
    expect(html).toMatch(/name="notifyClient"(?![^>]*checked)/);
  });
});
