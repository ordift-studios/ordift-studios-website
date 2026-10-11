import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("./readinessAdminActions", () => {
  const f = vi.fn();
  return { assignFollowUpAction: f, disableAction: f, enrolAction: f, manageIssueAction: f, postIssueMessageAction: f, recordNoticeAction: f, rescheduleAction: f, setManagerAction: f, setTimezoneAction: f };
});

import ScheduleReadinessPanel, { type ReadinessSlotData } from "./ScheduleReadinessPanel";
import type { AdminReadinessView } from "@/lib/crewSupport/readiness";
import { SELF_ISSUE_MESSAGE } from "@/lib/crewSupport/readinessRules";

const FOUNDER = "founder", OTHER = "other-admin";
const ctx = { engagementId: "e1", slotId: "s1", requestId: "r1", assigneeId: FOUNDER, slotStatus: "assigned", slotAccepted: true, engagementStatus: "engagement_active", requestStatus: "confirmed", isTest: false, serviceFamily: "photography", reference: "CSR-1", startDate: "2026-10-12", endDate: "2026-10-12", callTime: "10:00", finishTime: "21:00", timezone: { timezone: "Asia/Qatar", source: "market" as const }, startMs: Date.parse("2026-10-12T07:00:00Z"), callTimeKnown: true, endMs: Date.parse("2026-10-12T21:00:00Z"), scheduleVersion: 1 };
const view = (o: Partial<AdminReadinessView> = {}): AdminReadinessView => ({ context: ctx, enrolled: false, readinessId: null, enrolmentSource: null, enrolledAt: null, disabledAt: null, disabledReason: null, responsibleManagerId: null, state: "not_confirmed", flagNoResponse: false, responses: [], issues: [], enrolBlocker: null, ...o });
const slot = (v: AdminReadinessView): ReadinessSlotData => ({ engagementId: "e1", label: "Photographer", assigneeId: FOUNDER, view: v, actualDates: [] });
const issue = { id: "i1", kind: "need_assistance", status: "open", raisedAt: "2026-10-11T10:00:00Z", acknowledgedAt: null, assignedTo: null, followUpAction: null, professionalReportedResolvedAt: null, professionalConfirmedAt: null, resolutionNote: null, resolvedAt: null, events: [
  { id: "ev1", event: "raised", visibility: "shared", actorId: FOUNDER, actorRole: "professional", body: "Reported: Need assistance", createdAt: "2026-10-11T10:00:00Z" },
  { id: "ev2", event: "message", visibility: "internal", actorId: OTHER, actorRole: "management", body: "Driver costs QAR 80", createdAt: "2026-10-11T11:00:00Z" }] };
const parties = [{ kind: "professional" as const, profileId: FOUNDER, label: "Founder" }, { kind: "client" as const, profileId: null, label: "the client" }];
const render = (viewerId: string, v: AdminReadinessView, o: { isManagement?: boolean; changes?: Parameters<typeof ScheduleReadinessPanel>[0]["changes"] } = {}) =>
  renderToStaticMarkup(createElement(ScheduleReadinessPanel, { requestId: "r1", slots: [slot(v)], changes: o.changes ?? [], parties, managers: [{ id: OTHER, label: "Other Admin" }, { id: FOUNDER, label: "Founder" }], viewerId, isManagement: o.isManagement ?? true, canManageIssues: true, flagHours: 12 }));

describe("management schedule & readiness panel", () => {
  it("shows scheduled, timezone (with source) and actual-date lines separately, and says nothing is sent", () => {
    const html = render(OTHER, view());
    expect(html).toContain("Scheduled");
    expect(html).toContain("Asia/Qatar");
    expect(html).toContain("market default");
    expect(html).toContain("Actual service date");
    expect(html).toContain("Never rescheduled");
    expect(html).toMatch(/sends any email or notification/);
  });
  it("an un-enrolled assignment shows no form-like state and offers manual enrolment to management only", () => {
    expect(render(OTHER, view())).toContain("Turn on readiness tracking");
    expect(render(OTHER, view(), { isManagement: false })).not.toContain("Turn on readiness tracking");
    expect(render(OTHER, view({ enrolBlocker: "QA/test assignments can't be enrolled." }))).toContain("test assignments can&#x27;t be enrolled");
  });
  it("the reschedule form requires the 'who was told' record, per person, and never implies automatic notification", () => {
    const html = render(OTHER, view());
    expect(html).toContain("Who have you told?");
    expect(html).toContain("Ordift sends nothing");
    expect(html).toContain("Founder");
    expect(html).toContain("the client");
    expect(html).toContain('name="partyCount" value="2"');
    expect(html).toContain("Not yet");
    expect(render(OTHER, view(), { isManagement: false })).not.toContain("Who have you told?");
  });
  it("history shows who was and was not told, and the not-yet-told entry offers to record it", () => {
    const changes = [{ id: "c1", kind: "reschedule", reason: "Client moved it", changedAt: "2026-10-11T12:00:00Z", changedBy: OTHER, previous: { start_date: "2026-10-10", end_date: "2026-10-10", call_time: "10:00", finish_time: null, event_timezone: null }, new: { start_date: "2026-10-12", end_date: "2026-10-12", call_time: "10:00", finish_time: null, event_timezone: null },
      parties: [{ kind: "professional", profileId: FOUNDER, label: "Founder", notice: { method: "phone", informedAt: "2026-10-11T09:00:00Z", note: null, recordedAt: "2026-10-11T12:01:00Z" } }, { kind: "client", profileId: null, label: "the client", notice: null }] }];
    const html = render(OTHER, view(), { changes });
    expect(html).toContain("Founder was told by Phone call");
    expect(html).toContain("the client is not yet recorded as told");
    expect(html).toContain("Record that they were told");
    expect(html).toContain("2026-10-10");
  });
  it("shows the 12-hour no-answer flag and the answered state", () => {
    expect(render(OTHER, view({ enrolled: true, readinessId: "x", enrolledAt: "2026-10-11T00:00:00Z", enrolmentSource: "manual", flagNoResponse: true }))).toContain("No answer — starts within 12h");
    expect(render(OTHER, view({ enrolled: true, readinessId: "x", enrolledAt: "2026-10-11T00:00:00Z", enrolmentSource: "manual", state: "ready" }))).toContain("Ready");
  });
  it("issues: an independent administrator gets the controls and sees internal notes marked internal", () => {
    const html = render(OTHER, view({ enrolled: true, readinessId: "x", enrolledAt: "2026-10-11T00:00:00Z", enrolmentSource: "manual", issues: [issue] }));
    expect(html).toContain("Acknowledge");
    expect(html).toContain("Resolve &amp; close");
    expect(html).toContain("INTERNAL (professional can&#x27;t see)");
    expect(html).toContain("Driver costs QAR 80");
  });
  it("issues: the assigned professional (even as Super Admin) sees the restriction and NO management controls on their own issue", () => {
    const html = render(FOUNDER, view({ enrolled: true, readinessId: "x", enrolledAt: "2026-10-11T00:00:00Z", enrolmentSource: "manual", issues: [issue] }));
    expect(html).toContain(SELF_ISSUE_MESSAGE.replace("'", "&#x27;"));
    expect(html).not.toContain("Acknowledge");
    expect(html).not.toContain("Resolve &amp; close");
    expect(html).not.toContain("Save follow-up");
  });
  it("the responsible-manager picker never offers the assigned professional", () => {
    const html = render(OTHER, view({ enrolled: true, readinessId: "x", enrolledAt: "2026-10-11T00:00:00Z", enrolmentSource: "manual" }));
    const picker = html.slice(html.indexOf('name="managerId"'), html.indexOf("</select>", html.indexOf('name="managerId"')));
    expect(picker).toContain("Other Admin");
    expect(picker).not.toContain("Founder");
  });
});
