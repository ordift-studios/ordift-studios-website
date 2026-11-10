import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// What each kind of viewer actually SEES in the Booking panel, rendered to static HTML (server actions stubbed). The data is already projected by projectPanel; this proves the screen never draws more than it was given.
vi.mock("./bookingActions", () => ({ previewBookingAction: vi.fn(), confirmBookingAction: vi.fn(), cancelBookingAction: vi.fn() }));
import BookingPanel from "./BookingPanel";
import type { BookingPanelData } from "@/lib/bookings/panel";
import { projectPanel, type PanelFull } from "@/lib/bookings/rules";

const full: PanelFull = { blockers: ["Full payment (USD 500.00) must be received before confirmation — USD 0.00 received so far."], operationalBlockers: ["The payment the quotation requires has not been verified yet."],
  conflicts: [{ key: "leave:1", kind: "leave", firm: true, overridable: true, label: "approved leave", from: "2026-12-01", to: "2026-12-02" }], payment: { condition: "full", amountDueUsd: 500, verifiedPaidUsd: 0, outstandingUsd: 500 }, agreement: { required: false, reasons: [] }, confirmation: null };
const seg = { startsAt: "2026-12-01T06:00:00.000Z", endsAt: "2026-12-01T10:00:00.000Z", timezone: "Asia/Qatar", kind: "on_site" as const, location: "Doha studio", platform: null, note: null };
const current = { id: "c1", version: 1, kind: "confirmed" as const, cancellationOutcome: null, assignedProfileId: "p1", assignedLabel: "M-0007 — Sara", confirmedAt: "2026-11-08T10:00:00Z", reason: null, basis: "internal basis note", segments: [seg], settingsVersion: 1,
  payment: { condition: "full" as const, depositPercent: null, requiredUsd: 500, verifiedPaidUsd: 500, outstandingUsd: 0 }, agreementRequired: false, agreementReasons: [], conflictsReviewed: 0, clarification: null };
const data = (roles: string[], over: Partial<BookingPanelData> = {}): BookingPanelData => ({
  level: roles.includes("super_admin") ? "super_admin" : roles.includes("admin") ? "admin" : "staff", enquiry: { id: "e1", reference: "ENQ-2026-000042" },
  quotation: { id: "q1", reference: "Q-9", currency: "QAR", total: 1800, paymentCondition: "full", depositPercent: null, termsText: "Full payment is required in advance." },
  current, assessment: projectPanel(full, { id: roles.includes("staff") ? "p1" : "u", roles }, "p1"), settings: { version: 1, status: "provisional", thresholds: { QAR: 3000 }, alwaysCategories: [], escalators: ["minors", "multi_day_assignment"] },
  assignable: [{ profileId: "p1", label: "M-0007 — Sara" }], canConfirm: roles.includes("super_admin"), agreementReference: null, entityBlockers: [], notifications: [], viewerId: "u", financial: [], money: null, ...over });
const html = (d: BookingPanelData) => renderToStaticMarkup(createElement(BookingPanel, { data: d }));

describe("Booking panel", () => {
  it("a Super Admin sees the figures, the change form and the cancel form", () => {
    const out = html(data(["super_admin"]));
    expect(out).toContain("USD 500.00"); expect(out).toContain("Change this booking"); expect(out).toContain("Cancel this booking"); expect(out).toContain("Check readiness and conflicts"); expect(out).toContain("cancel booking ENQ-2026-000042");
    expect(out).toContain("M-0007 — Sara");
  });
  it("an Admin sees the schedule, the blockers and the conflicts: no amounts, no forms, no booking note", () => {
    const d = data(["admin"], { quotation: undefined, settings: null, assignable: [], canConfirm: false, current: { ...current, basis: null, payment: { condition: null, depositPercent: null, requiredUsd: null, verifiedPaidUsd: null, outstandingUsd: null } } });
    const out = html(d);
    expect(out).toContain("Doha studio"); expect(out).toContain("The payment the quotation requires has not been verified yet."); expect(out).toContain("approved leave"); expect(out).toContain("Only a Super Admin can confirm");
    expect(out).not.toMatch(/USD|500\.00|Change this booking|Cancel this booking|<form|<textarea|Full payment is required in advance|internal basis note/);
  });
  it("staff see only the conflicts on their own assignment", () => {
    const out = html(data(["staff"], { quotation: undefined, settings: null, assignable: [], canConfirm: false, current: null }));
    expect(out).toContain("approved leave"); expect(out).toContain("Your assignment"); expect(out).not.toMatch(/USD|payment|Blockers|<form|Doha studio/i);
  });
  it("before the client accepts, the panel says so and offers nothing", () => {
    const out = html({ ...data(["super_admin"]), notReady: "The client must accept an issued ordinary quotation before this enquiry can be booked.", assessment: null, current: null });
    expect(out).toContain("must accept an issued ordinary quotation"); expect(out).not.toMatch(/<form|Confirm this booking/);
  });
  it("a cancelled booking is shown as cancelled with its reason, and can be booked again", () => {
    const out = html(data(["super_admin"], { current: { ...current, kind: "cancelled", version: 2, reason: "Client withdrew in writing" } }));
    expect(out).toContain("Booking Cancelled — Rescheduling Pending (version 2): Client withdrew in writing"); expect(out).toContain("Confirm this booking"); expect(out).not.toContain("Cancel this booking");
  });
});
