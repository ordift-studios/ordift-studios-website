import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/app/portal/(dashboard)/collaborator/actions", () => ({ getMyFileDownloadUrlAction: vi.fn() }));
vi.mock("@/app/portal/(dashboard)/collaborator/assignmentWorkActions", () => ({ removeOwnPrivateFileAction: vi.fn(), submitFileForReleaseAction: vi.fn(), submitAllPrivateFilesAction: vi.fn(), withdrawFileFromReviewAction: vi.fn() }));

import EngagementFileList, { type EngagementFileRow } from "./EngagementFileList";

const row = (id: string, releaseStatus: string): EngagementFileRow => ({ id, fileKind: "deliverable", originalFilename: `${id}.jpeg`, sizeBytes: 1000, version: 1, uploadedAt: "2026-10-20T10:00:00Z", displayState: "Active", releaseCategory: "final_gallery", releaseStatus, clientTitle: null, canRemove: true });
const render = (files: EngagementFileRow[]) => renderToStaticMarkup(createElement(EngagementFileList, { files, releaseEngagementId: "eng-1" }));

describe("Submit all for review panel", () => {
  it("is offered when several categorised files are still private", () => {
    const html = render([row("a", "private"), row("b", "private"), row("c", "private")]);
    expect(html).toContain("3 private files are ready to send for review");
    expect(html).toContain("Submit all for review");
  });
  it("is not offered once nothing is left to submit", () => {
    expect(render([row("a", "submitted"), row("b", "submitted")])).not.toContain("Submit all for review");
  });
  it("lives outside the conditional so its result survives the list refresh (source pin)", () => {
    const text = readFileSync(join(process.cwd(), "src/components/portal/EngagementFileList.tsx"), "utf8");
    expect(text).toMatch(/function SubmitAllPanel/);
    expect(text).toMatch(/if \(privateCount <= 1 && !state\) return null/);
    expect(text).toContain("<SubmitAllPanel engagementId=");
    expect(text).toMatch(/PendingNote/);
    expect(text).not.toMatch(/\{releaseEnabled && privateTagged > 1 && \(\s*<ActionForm/);
  });
});
