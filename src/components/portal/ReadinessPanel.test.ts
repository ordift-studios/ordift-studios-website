import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/portal/(dashboard)/collaborator/readinessActions", () => ({ submitReadinessAction: vi.fn(), readinessIssueReplyAction: vi.fn(), readinessIssueReportResolvedAction: vi.fn() }));

import ReadinessPanel, { type ReadinessPanelData } from "./ReadinessPanel";

const base: ReadinessPanelData = { engagementId: "e1", serviceFamily: "photography", state: "not_confirmed", startLabel: "Mon 12 Oct 2026, 10:00", timezone: "Asia/Qatar", callTimeKnown: true, latest: null, canRespond: null, issues: [] };
const html = (o: Partial<ReadinessPanelData> = {}) => renderToStaticMarkup(createElement(ReadinessPanel, { data: { ...base, ...o } }));

describe("professional readiness card", () => {
  it("offers the three options, the service-specific checklist, the seven concern areas and remarks", () => {
    const h = html();
    expect(h).toContain("Ready — everything is prepared");
    expect(h).toContain("Need assistance");
    expect(h).toContain("Not ready");
    expect(h).toContain("Batteries, memory cards or media ready?"); // photography
    for (const a of ["Equipment or materials required", "Transport or logistics assistance", "Location access or permit requirements", "Schedule or arrival-time concerns", "Missing client information", "Additional crew or technical support", "Other remarks"]) expect(h).toContain(a);
    expect(h).toContain("Confirm my readiness");
    expect(h).toContain("Starts Mon 12 Oct 2026, 10:00 (Asia/Qatar)");
  });
  it("a design job gets its own checklist, not the photography one", () => {
    const h = html({ serviceFamily: "graphic-design" });
    expect(h).toContain("Brief and source assets received?");
    expect(h).not.toContain("Batteries, memory cards");
  });
  it("tells the professional plainly that saving changes nothing else", () => {
    expect(html()).toMatch(/does not change your assignment, files or payment/);
  });
  it("a changed schedule asks them to re-confirm and does not pre-select the old answer", () => {
    const h = html({ state: "stale", latest: { version: 1, status: "ready", checks: {}, concerns: {}, remarks: null, submittedAt: "2026-10-10T10:00:00Z" } });
    expect(h).toContain("The schedule has changed since you last answered");
    expect(h).not.toMatch(/value="ready"[^>]*checked/);
    expect(h).toContain("Update my answer");
  });
  it("after the start (or when tracking is off) the form is replaced by the reason", () => {
    const h = html({ canRespond: "This assignment has started, so readiness can no longer be updated." });
    expect(h).toContain("has started");
    expect(h).not.toContain("Confirm my readiness");
  });
  it("shows the issue thread with only what it is given, a reply box and 'I've sorted this' — never a close button", () => {
    const issue = { id: "i1", status: "awaiting_professional", kind: "need_assistance", events: [{ id: "a", actorRole: "management", event: "message", body: "A driver is booked for 7:30am.", createdAt: "2026-10-11T10:00:00Z" }] };
    const h = html({ state: "need_assistance", issues: [issue] });
    expect(h).toContain("Awaiting professional confirmation");
    expect(h).toContain("A driver is booked for 7:30am.");
    expect(h).toContain("Reply to management");
    expect(h).toContain("sorted this");
    expect(h).toMatch(/can(&#x27;|')t close it yourself/);
    expect(h).not.toMatch(/Resolve|Close issue/);
  });
  it("a closed issue takes no replies", () => {
    const h = html({ issues: [{ id: "i1", status: "resolved", kind: "need_assistance", events: [] }] });
    expect(h).toContain("Closed by management");
    expect(h).not.toContain("Reply to management");
  });
});
