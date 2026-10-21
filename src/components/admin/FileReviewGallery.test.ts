import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import FileReviewGallery, { type GalleryAction } from "./FileReviewGallery";
import { canReviewFile, toGalleryFile, type GalleryFile, type GallerySource } from "@/lib/crewSupport/fileReview";

const FOUNDER = "founder";
const INDEPENDENT = "independent";
const src = (id: string, over: Partial<GallerySource> = {}): GallerySource => ({
  id, originalFilename: `${id}.jpeg`, clientTitle: `Title ${id}`, mimeType: "image/jpeg", sizeBytes: 3 * 1024 * 1024, fileKind: "deliverable", releaseStatus: "submitted",
  releaseCategory: "final_gallery", releaseReviewNote: null, purgedAt: null, retain: false, backupConfirmedAt: null, uploadedBy: FOUNDER, submittedForReleaseBy: FOUNDER, ...over,
});
const rows = (viewer: string): GalleryFile[] => [src("a"), src("b"), src("big", { sizeBytes: 49 * 1024 * 1024 }), src("heic", { mimeType: "image/heic", originalFilename: "x.heic" }), src("raw", { fileKind: "source_raw" }), src("rel", { releaseStatus: "released" })].map((s) => toGalleryFile(s, viewer, FOUNDER));
const approve: GalleryAction = { key: "approve", label: "Approve", tone: "primary", meaning: "m", eligible: (f) => canReviewFile({ fileKind: f.fileKind, releaseStatus: f.releaseStatus, purged: f.purged }, "approve"), run: async () => ({ ok: true, message: "", outcomes: [] }) };
const render = (files: GalleryFile[]) => renderToStaticMarkup(createElement(FileReviewGallery, { files, actions: [approve], fetchUrls: async () => ({ ok: false as const, error: "n/a" }) }));

describe("review gallery (server-rendered state)", () => {
  it("lists every file as a viewable tile with its status and filter tabs with counts", () => {
    const html = render(rows(INDEPENDENT));
    for (const id of ["a", "b", "big", "heic", "raw", "rel"]) expect(html).toContain(`View Title ${id}`);
    expect(html).toContain("Submitted for review");
    expect(html).toContain("Released to the client");
    expect(html).toContain("All (6)");
    expect(html).toContain("Awaiting review (5)");
  });
  it("offers 'select all eligible' only for the files the action can act on (RAW, released and unsupported kinds are excluded)", () => {
    expect(render(rows(INDEPENDENT))).toContain("Select all eligible (4)");
  });
  it("gives the independent reviewer checkboxes only on eligible tiles", () => {
    const html = render(rows(INDEPENDENT));
    expect(html).toContain('aria-label="Select Title a"');
    expect(html).not.toContain('aria-label="Select Title raw"');
    expect(html).not.toContain('aria-label="Select Title rel"');
  });
  it("shows the assigned professional every file but no selection and no actionable control for their own work", () => {
    const html = render(rows(FOUNDER));
    expect(html).toContain("View Title a");
    expect(html).toContain("Select all eligible (0)");
    expect(html).not.toContain('aria-label="Select Title a"');
    expect(html).toContain("Can&#x27;t act on own work");
  });
  it("handles large and unsupported files without trying to load them", () => {
    const html = render(rows(INDEPENDENT));
    expect(html).toContain("Large file (49.0 MB) — click to view");
    expect(html).toContain("No preview for this file type");
  });
  it("keeps upload classification and release status visible as separate facts", () => {
    const html = render(rows(INDEPENDENT));
    expect(html).toContain("Deliverable");
    expect(html).toContain("Source (RAW)");
  });
  it("embeds no storage path, bucket, or signed link in the page before the browser asks for one", () => {
    const html = render(rows(INDEPENDENT));
    expect(html).not.toMatch(/project-media|storage_path|signed|token=|<img/);
  });
  it("has no action buttons until something is selected (nothing can be applied by accident)", () => {
    expect(render(rows(INDEPENDENT))).not.toContain(">Approve");
  });
});

describe("Uploads & Approvals page wiring", () => {
  const page = readFileSync(join(process.cwd(), "src/app/admin/payables/engagements/[id]/media/page.tsx"), "utf8");
  it("shows the gallery and explains the three different kinds of action", () => {
    expect(page).toContain("MediaReviewGallery");
    expect(page).toContain("what-the-buttons-mean");
    expect(page).toContain("Approving does not show anything to the client");
  });
  it("no longer renders retention buttons as bare per-row controls", () => {
    expect(page).not.toMatch(/Mark Final Approved|confirmProjectFileBackupAction|promoteProjectFileToFinalApprovedAction/);
  });
  it("the retention wrapper separates client approval from retention in its labels", () => {
    const wrapper = readFileSync(join(process.cwd(), "src/app/admin/payables/engagements/[id]/media/MediaReviewGallery.tsx"), "utf8");
    expect(wrapper).toContain("NOT the same as 'final version'");
    expect(wrapper).toContain("attestation");
  });
});
