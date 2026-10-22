import { describe, expect, it } from "vitest";
import { approvalRecordGap, checkActivationPreconditions, proposedEffectiveDate } from "./legalGovernance";

const ok = { status: "approved", approvalDate: "2026-09-05", contentRegistered: true, unresolvedMarkers: 0, effectiveDate: "2026-09-05", today: "2026-10-30", backdatedReason: "Effective from counsel's approval date as the Founder decided." };

describe("template activation policy", () => {
  it("the approval date ordinarily becomes the effective date", () => expect(proposedEffectiveDate("2026-09-05")).toBe("2026-09-05"));
  it("allows activation when every condition holds", () => expect(checkActivationPreconditions(ok)).toEqual({ ok: true }));
  it("refuses without a verified approval date, a registered master, or a clean clause check", () => {
    for (const bad of [{ approvalDate: null }, { contentRegistered: false }, { unresolvedMarkers: null }, { unresolvedMarkers: 2 }, { status: "legal_review" }])
      expect(checkActivationPreconditions({ ...ok, ...bad }).ok).toBe(false);
  });
  it("an effective date before the approval date is refused", () => expect(checkActivationPreconditions({ ...ok, effectiveDate: "2026-09-01" }).ok).toBe(false));
  it("an effective date in the past needs an explicit reason; today or later does not (and activation time is never back-dated)", () => {
    expect(checkActivationPreconditions({ ...ok, backdatedReason: null }).ok).toBe(false);
    expect(checkActivationPreconditions({ ...ok, effectiveDate: "2026-10-30", backdatedReason: null })).toEqual({ ok: true });
  });
  it("flags a version recorded as approved with no stamp and no attestation as a gap", () => {
    expect(approvalRecordGap({ status: "approved", approvedAt: null }, null)).toBe(true);
    expect(approvalRecordGap({ status: "approved", approvedAt: null }, { approvalDate: "2026-09-05" })).toBe(false);
    expect(approvalRecordGap({ status: "approved", approvedAt: "2026-09-05T00:00:00Z" }, null)).toBe(false);
    expect(approvalRecordGap({ status: "draft", approvedAt: null }, null)).toBe(false);
  });
});
