import { describe, expect, it } from "vitest";
import { buildBlocks } from "./FlexiblePhotoGallery";
import { PHOTO_GALLERY_RECIPES, DESIGN_GALLERY_RECIPE } from "@/lib/content/portfolioTreatment";
import type { GalleryImage } from "@/lib/content/types";

// No real Portfolio project in the current dataset has a populated gallery
// array (every sample project's gallery is empty), so this is the only
// automated coverage that the scored block-selection algorithm in
// buildBlocks — the direct answer to "projects with many photographs
// should not display them all at the same size, and do not hard-code one
// repeating sequence" — actually behaves as intended.

function image(id: string, width: number, height: number): GalleryImage {
  return { id, url: `https://example.com/${id}.jpg`, alt: id, caption: null, width, height };
}

function makeImages(count: number, orientation: "portrait" | "landscape" | "alternating"): GalleryImage[] {
  return Array.from({ length: count }, (_, i) => {
    if (orientation === "portrait") return image(`i${i}`, 800, 1200);
    if (orientation === "landscape") return image(`i${i}`, 1600, 900);
    return i % 2 === 0 ? image(`i${i}`, 800, 1200) : image(`i${i}`, 1600, 900);
  });
}

describe("buildBlocks", () => {
  it("consumes every image exactly once, in order, across all blocks", () => {
    const images = makeImages(17, "alternating");
    const blocks = buildBlocks(images, PHOTO_GALLERY_RECIPES.wedding);
    const flattened = blocks.flatMap((b) => b.images.map((img) => img.id));
    expect(flattened).toEqual(images.map((img) => img.id));
  });

  it("never emits a block type more than twice in a row", () => {
    const images = makeImages(24, "landscape");
    for (const recipe of Object.values(PHOTO_GALLERY_RECIPES)) {
      const blocks = buildBlocks(images, recipe);
      for (let i = 2; i < blocks.length; i++) {
        const sameAsPrevTwo = blocks[i].type === blocks[i - 1].type && blocks[i].type === blocks[i - 2].type;
        expect(sameAsPrevTwo).toBe(false);
      }
    }
  });

  it("produces different rhythms for two same-length galleries with different orientation sequences", () => {
    const allPortrait = makeImages(14, "portrait");
    const alternating = makeImages(14, "alternating");
    const recipe = PHOTO_GALLERY_RECIPES.portrait;
    const rhythmA = buildBlocks(allPortrait, recipe).map((b) => b.type);
    const rhythmB = buildBlocks(alternating, recipe).map((b) => b.type);
    expect(rhythmA).not.toEqual(rhythmB);
  });

  it("does not put every image in its own full-width block for a large gallery", () => {
    const images = makeImages(20, "alternating");
    const blocks = buildBlocks(images, PHOTO_GALLERY_RECIPES.event);
    const fullOnly = blocks.every((b) => b.type === "full");
    expect(fullOnly).toBe(false);
  });

  it("respects allowTriple/allowAsymmetric off-switches (commercial recipe)", () => {
    const images = makeImages(15, "alternating");
    const blocks = buildBlocks(images, PHOTO_GALLERY_RECIPES.commercial);
    expect(blocks.some((b) => b.type === "asymmetric")).toBe(false);
  });

  it("handles a single image as one full block", () => {
    const blocks = buildBlocks([image("solo", 1000, 1000)], PHOTO_GALLERY_RECIPES.general);
    expect(blocks).toEqual([{ type: "full", images: [expect.objectContaining({ id: "solo" })] }]);
  });

  it("handles an empty array", () => {
    expect(buildBlocks([], PHOTO_GALLERY_RECIPES.general)).toEqual([]);
  });

  it("works for the Graphic Design recipe the same way as Photography recipes", () => {
    const images = makeImages(11, "alternating");
    const blocks = buildBlocks(images, DESIGN_GALLERY_RECIPE);
    const flattened = blocks.flatMap((b) => b.images.map((img) => img.id));
    expect(flattened).toEqual(images.map((img) => img.id));
    expect(blocks.length).toBeGreaterThan(1);
  });
});
