import { describe, expect, it } from "vitest";
import { clampedPosterRatio } from "./VideoPlayer";
import type { PresentationImage } from "@/lib/content/types";

function poster(width: number, height: number): PresentationImage {
  return { url: "https://example.com/poster.jpg", alt: "", width, height, lqip: null, focalX: 50, focalY: 50, assetId: "a" };
}

describe("clampedPosterRatio", () => {
  it("falls back to 16/9 when there is no poster", () => {
    expect(clampedPosterRatio(null)).toBe(16 / 9);
  });

  it("preserves a normal landscape ratio", () => {
    expect(clampedPosterRatio(poster(1920, 1080))).toBeCloseTo(16 / 9, 5);
  });

  it("preserves a normal vertical 9:16 ratio", () => {
    expect(clampedPosterRatio(poster(1080, 1920))).toBeCloseTo(9 / 16, 5);
  });

  it("clamps an extreme panorama to the wide ceiling", () => {
    expect(clampedPosterRatio(poster(5000, 1000))).toBeLessThanOrEqual(2.76);
  });

  it("clamps an extreme tall image to the vertical floor", () => {
    expect(clampedPosterRatio(poster(500, 5000))).toBeGreaterThanOrEqual(0.5625);
  });
});
