import { describe, expect, it } from "vitest";
import { buildJustifiedRows, clampedAspectRatio } from "./justifiedGallery";
import type { GalleryImage } from "./types";

function image(id: string, width: number, height: number, presentation?: GalleryImage["presentation"]): GalleryImage {
  return { id, url: `https://example.com/${id}.jpg`, alt: id, caption: null, width, height, presentation };
}

function makeImages(count: number, orientation: "portrait" | "landscape" | "alternating"): GalleryImage[] {
  return Array.from({ length: count }, (_, i) => {
    if (orientation === "portrait") return image(`i${i}`, 800, 1200);
    if (orientation === "landscape") return image(`i${i}`, 1600, 900);
    return i % 2 === 0 ? image(`i${i}`, 800, 1200) : image(`i${i}`, 1600, 900);
  });
}

describe("buildJustifiedRows", () => {
  it("consumes every image exactly once, in order, across all rows", () => {
    const images = makeImages(17, "alternating");
    for (const breakpoint of ["mobile", "tablet", "desktop"] as const) {
      const rows = buildJustifiedRows(images, breakpoint);
      const flattened = rows.flatMap((r) => r.images.map((img) => img.id));
      expect(flattened).toEqual(images.map((img) => img.id));
    }
  });

  it("handles an empty array", () => {
    expect(buildJustifiedRows([], "desktop")).toEqual([]);
  });

  it("handles a single image as one row", () => {
    const rows = buildJustifiedRows([image("solo", 1000, 1000)], "desktop");
    expect(rows).toEqual([{ images: [expect.objectContaining({ id: "solo" })] }]);
  });

  it("gives a featured image its own row regardless of breakpoint", () => {
    const images = [image("a", 1600, 900), image("b", 1600, 900, "featured"), image("c", 1600, 900)];
    for (const breakpoint of ["mobile", "tablet", "desktop"] as const) {
      const rows = buildJustifiedRows(images, breakpoint);
      const featuredRow = rows.find((r) => r.images.some((img) => img.id === "b"));
      expect(featuredRow?.images).toHaveLength(1);
    }
  });

  it("never exceeds 2 images per row on mobile", () => {
    const images = makeImages(20, "alternating");
    const rows = buildJustifiedRows(images, "mobile");
    for (const row of rows) {
      expect(row.images.length).toBeLessThanOrEqual(2);
    }
  });

  it("puts a landscape image alone on mobile", () => {
    const images = [image("wide", 1600, 900)];
    const rows = buildJustifiedRows(images, "mobile");
    expect(rows).toHaveLength(1);
    expect(rows[0].images).toHaveLength(1);
  });

  it("never exceeds 3 images per row on tablet/desktop", () => {
    const images = makeImages(24, "portrait");
    for (const breakpoint of ["tablet", "desktop"] as const) {
      const rows = buildJustifiedRows(images, breakpoint);
      for (const row of rows) {
        expect(row.images.length).toBeLessThanOrEqual(3);
      }
    }
  });

  it("does not put a large all-landscape gallery entirely into single-image rows on desktop", () => {
    const images = makeImages(20, "landscape");
    const rows = buildJustifiedRows(images, "desktop");
    expect(rows.some((r) => r.images.length > 1)).toBe(true);
  });

  it("does not reorder images even when a portrait-pair hint is present", () => {
    const images = [image("a", 1600, 900), image("b", 800, 1200, "portrait-pair"), image("c", 1600, 900)];
    const rows = buildJustifiedRows(images, "desktop");
    const flattened = rows.flatMap((r) => r.images.map((img) => img.id));
    expect(flattened).toEqual(["a", "b", "c"]);
  });

  it("clamps extreme aspect ratios", () => {
    expect(clampedAspectRatio(image("tall", 100, 1000))).toBeGreaterThanOrEqual(0.5);
    expect(clampedAspectRatio(image("wide", 1000, 100))).toBeLessThanOrEqual(2.8);
  });

  it("falls back to a square ratio when dimensions are missing", () => {
    expect(clampedAspectRatio({ id: "x", url: null, alt: "", caption: null })).toBe(1);
  });
});
