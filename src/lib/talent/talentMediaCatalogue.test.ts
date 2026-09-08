import { describe, expect, it } from "vitest";
import { TALENT_MEDIA_TYPES, isValidTalentMediaType } from "./talentMediaCatalogue";

describe("TALENT_MEDIA_TYPES / isValidTalentMediaType", () => {
  it("is exactly the four documented types", () => {
    expect(TALENT_MEDIA_TYPES).toEqual(["portfolio_image", "portfolio_video", "comp_card", "other"]);
  });
  it("rejects an unknown type", () => {
    expect(isValidTalentMediaType("headshot_raw")).toBe(false);
  });
});
