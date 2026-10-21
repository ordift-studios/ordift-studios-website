import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./releaseActions", () => ({ previewUrlsAction: vi.fn(), reviewFilesAction: vi.fn(), reviewFileAction: vi.fn(), releaseFilesAction: vi.fn(), reviewFileDownloadUrlAction: vi.fn(), notifyReleasedFilesAction: vi.fn() }));
vi.mock("./founderSelfReviewActions", () => ({ openFounderExceptionAction: vi.fn(), closeFounderExceptionAction: vi.fn(), founderViewerUrlAction: vi.fn(), founderSelfReviewDecideAction: vi.fn(), founderSelfReleaseAction: vi.fn() }));

import FounderSelfReviewPanel from "./FounderSelfReviewPanel";
import AssignmentWorkPanel, { type AssignmentWork } from "./AssignmentWorkPanel";
import { toGalleryFile, type GalleryFile } from "@/lib/crewSupport/fileReview";
import { LINKED_LOGIN_MESSAGE, type FounderContext } from "@/lib/crewSupport/founderSelfReviewRules";

const FOUNDER = "founder";
const SECOND = "second-login";
const src = (id: string, status = "submitted") => ({ id, originalFilename: `${id}.jpeg`, clientTitle: `Title ${id}`, mimeType: "image/jpeg", sizeBytes: 1000, fileKind: "deliverable", releaseStatus: status, releaseCategory: "final_gallery", releaseReviewNote: null, purgedAt: null, retain: false, backupConfirmedAt: null, uploadedBy: FOUNDER, submittedForReleaseBy: FOUNDER });
const rows = (): GalleryFile[] => [src("a"), src("b", "approved")].map((s) => toGalleryFile(s, FOUNDER, FOUNDER));
const render = (context: FounderContext) => renderToStaticMarkup(createElement(FounderSelfReviewPanel, { requestId: "r1", engagementId: "e1", context, files: rows() }));

describe("Founder self-review panel", () => {
  it("renders nothing for someone the exception does not apply to", () => expect(render({ state: "not_applicable" })).toBe(""));
  it("tells the second Founder-controlled login it is not an independent reviewer, with no controls", () => {
    const html = render({ state: "linked_login", message: LINKED_LOGIN_MESSAGE });
    expect(html).toContain("Not an independent reviewer");
    expect(html).toContain("common control");
    expect(html).not.toMatch(/<button|<textarea|<input/);
  });
  it("explains an unavailable exception without offering to open it", () => {
    const html = render({ state: "unavailable", reason: "The self-review exception is not currently authorized for the Founder identity." });
    expect(html).toContain("not available");
    expect(html).not.toContain("<button");
  });
  it("when available, states the policy, requires a justification and an acknowledgement, and the open button starts disabled", () => {
    const html = render({ state: "available", founderIdentityId: "f", holderId: "h" });
    expect(html).toContain("ORDIFT-POL-FSR-001");
    expect(html).toContain("Founder Self-Review &amp; Client Deliverable Release Exception");
    expect(html).toContain("You must open each image in the review viewer");
    expect(html.toLowerCase()).toContain("does not make you independent");
    expect(html).toContain("my second login is not an independent reviewer");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Open the Founder self-review exception/);
    expect(html).toContain("Nothing is released by approving, and the client is never emailed by either");
  });
  it("when open, shows the justification on record, the process steps, and per-image 'opened' status — with no decision available before an image is opened", () => {
    const html = render({ state: "open", exception: { id: "x", openedAt: "2026-10-22T08:00:00Z", expiresAt: "2026-10-29T08:00:00Z", justification: "I am the sole photographer here." }, viewedFileIds: [] });
    expect(html).toContain("acting as both performer and reviewer");
    expect(html).toContain("I am the sole photographer here.");
    expect(html).toContain("Not opened yet — open it to enable a decision");
    // only the already-approved image is selectable (for a SEPARATE release declaration); the unopened one is not
    expect(html).toContain("Select all eligible (1)");
    expect(html).not.toContain('aria-label="Select Title a"');
    expect(html).toContain("Close this exception");
  });
  it("an image opened in the viewer is shown as opened and becomes selectable", () => {
    const html = render({ state: "open", exception: { id: "x", openedAt: "2026-10-22T08:00:00Z", expiresAt: "2026-10-29T08:00:00Z", justification: "I am the sole photographer here." }, viewedFileIds: ["a"] });
    expect(html).toContain("Opened in the review viewer");
    expect(html).toContain('aria-label="Select Title a"');
  });
  it("approval and release are separate actions with separate confirmations (source pin)", () => {
    const text = readFileSync(join(process.cwd(), "src/app/admin/crew-support/FounderSelfReviewPanel.tsx"), "utf8");
    expect(text).toContain("founderSelfReviewDecideAction");
    expect(text).toContain("founderSelfReleaseAction");
    expect(text).toContain("FSR_REVIEW_CONFIRMATION");
    expect(text).toContain("FSR_RELEASE_CONFIRMATION");
    expect(text).not.toMatch(/notifyClient|sendFilesReadyEmail|files ready/i);
    expect(text.match(/typedCount: true/g)).toHaveLength(4);
    expect(text.match(/listAllNames: true/g)).toHaveLength(4);
  });
});

describe("assignment panel integration", () => {
  const work = (founder: AssignmentWork["founder"], viewerFiles: AssignmentWork["files"] = []): AssignmentWork => ({ slotId: "s1", label: "Photographer", assigneeId: FOUNDER, engagementId: "e1", serviceFamily: "photography", reports: [], files: viewerFiles, founder });
  const render2 = (viewer: string, w: AssignmentWork) => renderToStaticMarkup(createElement(AssignmentWorkPanel, { requestId: "r1", work: [w], canReview: true, isTest: false, viewerId: viewer }));
  const file = (id: string, status: string) => ({ id, originalFilename: `${id}.jpeg`, releaseStatus: status, releaseCategory: "final_gallery", clientTitle: `T ${id}`, clientDescription: null, releaseReviewNote: null, releasedAt: "2026-10-22T09:00:00Z", uploadedBy: FOUNDER, submittedForReleaseBy: FOUNDER, fileKind: "deliverable", purgedAt: null, mimeType: "image/jpeg", sizeBytes: 1, retain: false, backupConfirmedAt: null }) as unknown as AssignmentWork["files"][number];

  it("the Founder sees the governed panel and still sees the standing self-review notice", () => {
    const html = render2(FOUNDER, work({ state: "available", founderIdentityId: "f", holderId: "h" }));
    expect(html).toContain("ORDIFT-POL-FSR-001");
    expect(html).toContain("You are the assigned professional on this job");
  });
  it("no other viewer sees the panel", () => {
    expect(render2("someone", work({ state: "not_applicable" }))).not.toContain("ORDIFT-POL-FSR-001");
  });
  it("the second login sees the not-independent notice and every file is blocked for it", () => {
    const html = render2(SECOND, work({ state: "linked_login", message: LINKED_LOGIN_MESSAGE }, [file("a", "submitted")]));
    expect(html).toContain("Not an independent reviewer");
    expect(html).not.toContain('aria-label="Select T a"');
    expect(html).toContain("Select all eligible (0)");
  });
  it("a self-released file keeps the client email as its own, opt-in step", () => {
    const w = { ...work({ state: "available", founderIdentityId: "f", holderId: "h" }, [file("a", "released")]), selfReleasedIds: ["a"] };
    const html = render2(FOUNDER, w);
    expect(html).toContain("Email the client about these files");
    expect(html).toContain("client email: not sent");
  });
  it("without the exception, the Founder's own released file does not offer the email (unchanged behaviour)", () => {
    const html = render2(FOUNDER, work({ state: "not_applicable" }, [file("a", "released")]));
    expect(html).not.toContain("Email the client about these files");
  });
});
