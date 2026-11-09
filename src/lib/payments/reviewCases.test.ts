import { describe, expect, it, vi } from "vitest";
import { describeResolveError, openReviewCase, REVIEW_REASONS, REVIEW_REASON_LABELS, RESOLUTIONS, validateResolution } from "./reviewCases";

describe("review case rules", () => {
  it("every reason has a plain-language title and explanation", () => { for (const r of REVIEW_REASONS) { expect(REVIEW_REASON_LABELS[r].title.length).toBeGreaterThan(5); expect(REVIEW_REASON_LABELS[r].explain.length).toBeGreaterThan(30); } });
  it("a resolution needs a known choice and a written note", () => {
    for (const r of RESOLUTIONS) expect(validateResolution(r, "Checked the provider dashboard.").ok).toBe(true);
    expect(validateResolution("deleted", "Checked the provider dashboard.").ok).toBe(false);
    expect(validateResolution("other", "short").ok).toBe(false); expect(validateResolution("other", "         ").ok).toBe(false);
  });
  it("database refusals become plain messages, and an unknown one says nothing was changed", () => {
    expect(describeResolveError("ERROR: resolver_not_authorized")).toMatch(/Super Admin/); expect(describeResolveError("case_already_resolved")).toMatch(/already resolved/);
    expect(describeResolveError("weird")).toMatch(/Nothing was changed/);
  });
  it("opening a case never throws: a missing function or a thrown error is logged and reported as false", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const admin = (impl: () => unknown) => ({ rpc: impl }) as never;
    expect(await openReviewCase(admin(async () => ({ error: { message: "no function" } })), "p1", "amount_mismatch", {}, "t")).toBe(false);
    expect(await openReviewCase(admin(async () => { throw new Error("boom"); }), "p1", "amount_mismatch", {}, "t")).toBe(false);
    expect(await openReviewCase(admin(async () => ({ error: null })), "p1", "amount_mismatch", { a: 1 }, "t")).toBe(true);
    spy.mockRestore();
  });
});
