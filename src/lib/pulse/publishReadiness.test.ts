import { describe, expect, it } from "vitest";
import { getPulsePublishReadiness } from "./publishReadiness";
import { PLACEHOLDER_TEXT } from "./ingestion";

describe("getPulsePublishReadiness", () => {
  it("blocks a freshly-discovered draft (placeholder text, no hero media)", () => {
    const result = getPulsePublishReadiness({
      title: "Sony Announces New Camera",
      excerpt: PLACEHOLDER_TEXT,
      body: PLACEHOLDER_TEXT,
      hasHeroMedia: false,
    });
    expect(result.ready).toBe(false);
    expect(result.blockers).toHaveLength(3);
  });

  it("is ready once an editor has replaced the placeholder and added hero media", () => {
    const result = getPulsePublishReadiness({
      title: "Sony Announces New Camera",
      excerpt: "A real, Ordift-written excerpt about the announcement.",
      body: "A real, Ordift-written summary of the announcement in our own words.",
      hasHeroMedia: true,
    });
    expect(result.ready).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it("blocks on missing hero media alone, even with real copy", () => {
    const result = getPulsePublishReadiness({
      title: "Sony Announces New Camera",
      excerpt: "Real excerpt.",
      body: "Real body.",
      hasHeroMedia: false,
    });
    expect(result.ready).toBe(false);
    expect(result.blockers).toEqual(["No Hero Media set — add an Ordift-appropriate image before publishing (never the source's own photograph unless its licence explicitly permits reuse)."]);
  });

  it("blocks on an empty title", () => {
    const result = getPulsePublishReadiness({ title: "  ", excerpt: "x", body: "y", hasHeroMedia: true });
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("Title is empty.");
  });
});
