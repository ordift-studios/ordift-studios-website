import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./approvalActions", () => ({ startReviewAction: async () => null, registerMasterAction: async () => null, recordFounderApprovalAction: async () => null }));
import FounderApprovalPanel from "./FounderApprovalPanel";
import type { FounderApprovalView } from "@/lib/legal/founderApprovalActions";

type Found = Extract<FounderApprovalView, { found: true }>;
const H = "ab".repeat(32);
const base = (o: Partial<Found> = {}, t: Partial<Found["target"]> = {}): Found => ({
  found: true, code: "OS-LGL-014", title: "Client Service Terms & General Booking Agreement", registered: true,
  target: { id: "v11", version: "1.1", status: "legal_review", docxSha256: H, pdfSha256: "cd".repeat(32), documentHash: H, contentReference: "legal-masters:x", approvedAt: null, approvedBy: null, createdAt: "2026-11-10T08:00:00Z", ...t },
  versions: [
    { id: "vA", version: "1.0", status: "approved", role: "historical_placeholder", note: "Historical placeholder: a status label seeded on 8 Sep 2026 with no text, no approval date and no evidence on record. It is not a verified approval and is not used as the baseline.", approvedBy: "Legal Counsel", approvedAt: null, effectiveDate: null },
    { id: "vB", version: "1.0", status: "active", role: "active_baseline", note: "The active version: the live Master Booking Terms. It is the comparison baseline.", approvedBy: "Management", approvedAt: null, effectiveDate: "2025-01-01" },
    { id: "v11", version: "1.1", status: "legal_review", role: "target", note: "The version being reviewed.", approvedBy: null, approvedAt: null, effectiveDate: null },
  ],
  preconditions: [{ key: "in_review", label: "The version is in legal review", ok: true, detail: "Current status: legal_review." }],
  record: null, founder: { hasActiveFounder: true, viewerIsFounder: true }, ...o,
});
const html = (v: Found) => renderToStaticMarkup(createElement(FounderApprovalPanel, { view: v }));

describe("FounderApprovalPanel", () => {
  it("always says whose approval this is, and never offers to activate, publish or issue", () => {
    const h = html(base());
    expect(h).toContain("It is not a written approval issued by counsel");
    expect(h).toMatch(/does not activate, publish or issue/);
    const buttons = [...h.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
    expect(buttons).toEqual(["Record my Founder approval"]);                                      // no activate / publish / issue control exists on this screen
    expect(h).not.toMatch(/approved by counsel|counsel approved this/i);
  });
  it("distinguishes the active baseline, the historical placeholder and the version under review", () => {
    const h = html(base());
    expect(h).toContain("Active baseline (comparison)"); expect(h).toContain("Historical placeholder"); expect(h).toContain("This version (under review)");
    expect(h).toMatch(/not a verified approval/);
  });
  it("shows the approval form with the exact sentence and the hash prefix to compare, for the Founder when everything is ready", () => {
    const h = html(base());
    expect(h).toContain("Record my Founder approval"); expect(h).toContain("approve OS-LGL-014 1.1"); expect(h).toContain(H.slice(0, 12));
  });
  it("offers only the step that applies: start review for a draft, register for an unregistered master", () => {
    const draft = html(base({ registered: false, preconditions: [{ key: "in_review", label: "x", ok: false, detail: "Start the legal review first (step 1)." }] }, { status: "draft", contentReference: null }));
    expect(draft).toContain("Start the legal review"); expect(draft).not.toContain("Record my Founder approval");
    const unreg = html(base({ registered: false, preconditions: [{ key: "registered", label: "x", ok: false, detail: "Register" }] }, { contentReference: null }));
    expect(unreg).toContain("Verify and register the stored master"); expect(unreg).not.toContain("Record my Founder approval");
  });
  it("is read-only for a Super Admin who is not the Founder, and when no Founder identity exists", () => {
    const other = html(base({ founder: { hasActiveFounder: true, viewerIsFounder: false } }));
    expect(other).toContain("Only the Founder can"); expect(other).not.toContain("Record my Founder approval");
    const none = html(base({ founder: { hasActiveFounder: false, viewerIsFounder: false } }));
    expect(none).toContain("No active Founder identity");
  });
  it("after approval shows the stored record (consultation, advice, hash, confirmation) and no form", () => {
    const record = { versionId: "v11", recordedAt: "2026-11-20T10:00:00Z", actorProfileId: "f", actorLabel: "member INT0001", metadata: {
      consultation: { date: "2026-11-18", startTime: "10:00", endTime: "11:20", timezone: "Asia/Qatar", counselName: "Counsel Name", counselFirm: "Not stated", identityCheckNote: "Called back." },
      advice: { recommendations: "Reword 12.3.", amendmentsRequested: "12.3 reworded.", conclusion: "content_subject_to_recorded_amendments", conclusionNote: "Content subject to those changes." },
      document: { version: "1.1", docxSha256: H, pdfSha256: "cd".repeat(32), reviewedDraftSha256: "f".repeat(64), textRelation: "reviewed_text_with_recorded_amendments" },
      confirmation: { typedHashPrefix: H.slice(0, 12), typedSentence: "approve OS-LGL-014 1.1" } } };
    const h = html(base({ record }, { status: "approved", approvedAt: "2026-11-20T10:00:00Z", approvedBy: "Founder, on advice of counsel (telephone consultation 2026-11-18)" }));
    expect(h).toContain("The recorded Founder approval"); expect(h).toContain("member INT0001"); expect(h).toContain("Reword 12.3."); expect(h).toContain("Not activated, not published, not issued.");
    expect(h).not.toContain("Record my Founder approval");
  });
});
