import { describe, expect, it } from "vitest";
import { assessDraft, projectBooking, type AssessInput, type CurrentBooking } from "./panel";
import { projectPanel, type BookingSettings } from "./rules";

const settings: BookingSettings = { version: 1, status: "provisional", thresholds: { QAR: 5000 }, alwaysCategories: ["videography"], escalators: ["multi_day_assignment"] };
const seg = { startsAt: "2026-12-01T06:00:00.000Z", endsAt: "2026-12-01T10:00:00.000Z", timezone: "Asia/Qatar", kind: "on_site" as const, location: "Doha studio" };
const base = (o: Partial<AssessInput> = {}): AssessInput => ({
  quotation: { currency: "QAR", total: 2000, paymentCondition: "deposit", depositPercent: 50, termsText: "A 50% deposit is required to confirm the booking." },
  activities: ["photography"], settings, entityEligible: true, hasExecutedAgreement: false, amountDueUsd: 600, verifiedPaidUsd: 100, segments: [seg], escalators: [], clarification: null, conflicts: [], resolutions: [], assigneeId: "p1", today: "2026-11-08", ...o,
});

describe("assessDraft (what the confirm screen shows before an attempt)", () => {
  it("a deposit that is not yet verified blocks, and names the figures to a Super Admin", () => {
    const a = assessDraft(base()); expect(a.blockers.join(" ")).toMatch(/USD 300\.00/); expect(a.payment?.outstandingUsd).toBe(500);
  });
  it("an Admin is given the SAME blocker with no amounts at all", () => {
    const a = assessDraft(base()); const admin = projectPanel(a, { id: "a", roles: ["admin"] }, null) as { blockers: string[] };
    expect(admin.blockers).toContain("The payment the quotation requires has not been verified yet."); expect(JSON.stringify(admin)).not.toMatch(/USD|300|600|\d\.\d\d/);
  });
  it("fully verified, consistent terms, a schedule, no conflicts: nothing blocks", () => { expect(assessDraft(base({ verifiedPaidUsd: 300 })).blockers).toEqual([]); });
  it("a category that always needs an agreement blocks until an executed agreement is linked", () => {
    expect(assessDraft(base({ verifiedPaidUsd: 300, activities: ["videography"] })).blockers.join(" ")).toMatch(/executed agreement is required/);
    expect(assessDraft(base({ verifiedPaidUsd: 300, activities: ["videography"], hasExecutedAgreement: true })).blockers).toEqual([]);
  });
  it("an ineligible entity blocks even with an executed agreement", () => { expect(assessDraft(base({ verifiedPaidUsd: 300, entityEligible: false, hasExecutedAgreement: true })).blockers.join(" ")).toMatch(/cannot override an unlicensed activity/); });
  it("a multi-day schedule is detected and requires an agreement when the settings define it", () => {
    const day2 = { ...seg, startsAt: "2026-12-02T06:00:00.000Z", endsAt: "2026-12-02T10:00:00.000Z" };
    const a = assessDraft(base({ verifiedPaidUsd: 300, segments: [seg, day2] })); expect(a.agreement.reasons).toContain("escalator:multi_day_assignment"); expect(a.blockers.join(" ")).toMatch(/agreement is required/);
  });
  it("approved leave is unavailable: no resolution, however well documented, clears it", () => {
    const c = [{ key: "leave:1", kind: "leave" as const, firm: true, overridable: false, label: "approved leave", from: "2026-12-01", to: "2026-12-01" }];
    expect(assessDraft(base({ verifiedPaidUsd: 300, conflicts: c })).blockers.join(" ")).toMatch(/approved leave at this time and is unavailable/);
    const ok = { key: "leave:1", kind: "availability_verified", verifiedWithProfileId: "p1", method: "call", reference: "call on 7 Nov, agreed in WhatsApp", verifiedOn: "2026-11-07" };
    expect(assessDraft(base({ verifiedPaidUsd: 300, conflicts: c, resolutions: [ok] })).blockers.join(" ")).toMatch(/unavailable/);
    expect(assessDraft(base({ verifiedPaidUsd: 300, conflicts: c, resolutions: [{ ...ok, kind: "reason_only" }] })).blockers.join(" ")).toMatch(/unavailable/);
  });
  it("terms that contradict the structured condition block until the client's written confirmation is recorded", () => {
    const q = { ...base().quotation, termsText: "Full payment is required in advance." };
    expect(assessDraft(base({ verifiedPaidUsd: 300, quotation: q })).blockers.join(" ")).toMatch(/contradicts its own terms/);
    expect(assessDraft(base({ verifiedPaidUsd: 300, quotation: q, clarification: { kind: "client_confirmed_in_writing", evidence: "Client email of 6 Nov confirms 50% deposit" } })).blockers).toEqual([]);
  });
});

describe("projectBooking (what each level may see of the booking record)", () => {
  const b: CurrentBooking = { id: "c1", version: 2, kind: "confirmed", assignedProfileId: "p1", assignedLabel: "M-1 — Sara", confirmedAt: "2026-11-08T10:00:00Z", reason: null, basis: "internal note", segments: [seg], settingsVersion: 1,
    payment: { condition: "deposit", depositPercent: 50, requiredUsd: 300, verifiedPaidUsd: 300, outstandingUsd: 300 }, agreementRequired: true, agreementReasons: ["category:videography"], conflictsReviewed: 2, clarification: { kind: "client_confirmed_in_writing", evidence: "secret evidence text" } };
  it("Super Admin: everything; Admin: schedule and person with no amounts, condition or note; staff: nothing", () => {
    expect(projectBooking(b, "super_admin")).toEqual(b);
    const a = projectBooking(b, "admin")!; expect(a.segments).toEqual(b.segments); expect(a.assignedLabel).toBe("M-1 — Sara");
    expect(JSON.stringify(a)).not.toMatch(/internal note|secret evidence text|300|"deposit"|depositPercent":50/); expect(a.payment).toEqual({ condition: null, depositPercent: null, requiredUsd: null, verifiedPaidUsd: null, outstandingUsd: null });
    expect(projectBooking(b, "staff")).toBeNull(); expect(projectBooking(null, "super_admin")).toBeNull();
  });
});
