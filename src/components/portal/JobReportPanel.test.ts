import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/portal/(dashboard)/collaborator/assignmentWorkActions", () => ({ submitJobReportAction: vi.fn() }));
import JobReportPanel from "./JobReportPanel";

describe("job report form never pre-fills the scheduled date as the actual date", () => {
  const html = renderToStaticMarkup(createElement(JobReportPanel, { engagementId: "e1", serviceFamily: "photography", reports: [], scheduledDate: "2026-10-12" }));
  it("shows the scheduled date as a hint only", () => {
    expect(html).toContain("The system shows 2026-10-12 as the scheduled date");
    expect(html).toContain("It is not filled in for you");
  });
  it("leaves the actual-date field empty and required", () => {
    const input = html.match(/<input[^>]*name="actualServiceDate"[^>]*>/)![0];
    expect(input).toContain("required");
    expect(input).not.toMatch(/value="2026-10-12"/);
    expect(input).not.toMatch(/value="[0-9]/);
  });
  it("a correction form keeps the previously reported date", () => {
    const withReport = renderToStaticMarkup(createElement(JobReportPanel, { engagementId: "e1", serviceFamily: "photography", scheduledDate: "2026-10-12", reports: [{ id: "r1", version: 1, correctionReason: null, actualServiceDate: "2026-10-10", actualStartTime: null, actualEndTime: null, completionStatus: "completed", wentSmoothly: null, answers: {}, incidents: null, clientRequests: null, additionalServices: null, outstandingWork: null, remarks: null, submittedAt: "2026-10-13T10:00:00Z" }] }));
    expect(withReport).toContain('value="2026-10-10"');
  });
});
