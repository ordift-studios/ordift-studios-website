import { describe, expect, it } from "vitest";
import { PREP, planResize } from "./qrPortfolioImagePrep";

describe("browser-side preparation of a photograph for the QR portfolio", () => {
  it("leaves a photograph that already fits completely untouched", () => {
    expect(planResize(2560, 1700, 3 * 1024 * 1024, "image/jpeg")).toEqual({ action: "keep" });
    expect(planResize(1200, 1800, 200_000, "image/webp")).toEqual({ action: "keep" });
  });
  it("scales a larger photograph down to 2560 px on the longer side, keeping the proportions", () => {
    expect(planResize(5120, 3414, 3_000_000, "image/jpeg")).toEqual({ action: "reencode", width: 2560, height: 1707 });
    expect(planResize(3000, 6000, 3_000_000, "image/png")).toEqual({ action: "reencode", width: 1280, height: 2560 });
  });
  it("re-encodes a heavy file even when its pixel size is fine, without changing the size", () => {
    expect(planResize(2400, 1600, 6 * 1024 * 1024, "image/png")).toEqual({ action: "reencode", width: 2400, height: 1600 });
  });
  it("uses the approved limits", () => expect([PREP.maxLongEdge, PREP.targetMaxBytes]).toEqual([2560, 4 * 1024 * 1024]));
});
