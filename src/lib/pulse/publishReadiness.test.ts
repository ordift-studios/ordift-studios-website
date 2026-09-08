import { describe, expect, it } from "vitest";
import { getPulsePublishReadiness } from "./publishReadiness";
import { PLACEHOLDER_TEXT } from "./ingestion";

describe("getPulsePublishReadiness", () => {
  it("blocks a freshly-discovered draft (placeholder text, no hero media) even with a valid source URL", () => {
    const result = getPulsePublishReadiness({
      title: "Sony Announces New Camera",
      excerpt: PLACEHOLDER_TEXT,
      body: PLACEHOLDER_TEXT,
      hasHeroMedia: false,
      origin: "curated",
      sourceUrl: "https://example.org/article",
    });
    expect(result.ready).toBe(false);
    expect(result.blockers).toHaveLength(3);
  });

  it("is ready once an editor has replaced the placeholder, added hero media, and the source URL is valid", () => {
    const result = getPulsePublishReadiness({
      title: "Sony Announces New Camera",
      excerpt: "A real, Ordift-written excerpt about the announcement.",
      body: "A real, Ordift-written summary of the announcement in our own words.",
      hasHeroMedia: true,
      origin: "curated",
      sourceUrl: "https://example.org/article",
    });
    expect(result.ready).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it("blocks on missing hero media alone, even with real copy and a valid source URL", () => {
    const result = getPulsePublishReadiness({
      title: "Sony Announces New Camera",
      excerpt: "Real excerpt.",
      body: "Real body.",
      hasHeroMedia: false,
      origin: "curated",
      sourceUrl: "https://example.org/article",
    });
    expect(result.ready).toBe(false);
    expect(result.blockers).toEqual(["No Hero Media set — add an Ordift-appropriate image before publishing (never the source's own photograph unless its licence explicitly permits reuse)."]);
  });

  it("blocks on an empty title", () => {
    const result = getPulsePublishReadiness({ title: "  ", excerpt: "x", body: "y", hasHeroMedia: true, origin: "editorial", sourceUrl: null });
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("Title is empty.");
  });

  // Adaptive Discovery Remediation, Part 8/9 (2026-09-08) — original
  // source link requirement.
  describe("original source URL requirement", () => {
    const readyBase = { title: "Real Title", excerpt: "Real excerpt.", body: "Real body.", hasHeroMedia: true };

    it("blocks curated content with no source URL at all", () => {
      const result = getPulsePublishReadiness({ ...readyBase, origin: "curated", sourceUrl: null });
      expect(result.ready).toBe(false);
      expect(result.blockers).toContain("No original source URL set — discovered/curated content needs a valid source link before publishing.");
    });

    it("blocks community content with no source URL at all — same rule as curated", () => {
      const result = getPulsePublishReadiness({ ...readyBase, origin: "community", sourceUrl: null });
      expect(result.ready).toBe(false);
      expect(result.blockers.some((b) => b.includes("No original source URL set"))).toBe(true);
    });

    it("blocks curated content with a malformed source URL rather than rendering a broken public link", () => {
      const result = getPulsePublishReadiness({ ...readyBase, origin: "curated", sourceUrl: "not a url at all" });
      expect(result.ready).toBe(false);
      expect(result.blockers.some((b) => b.includes("isn't a valid web address"))).toBe(true);
    });

    it("blocks a non-http(s) scheme (e.g. javascript:) as an invalid source URL", () => {
      const result = getPulsePublishReadiness({ ...readyBase, origin: "curated", sourceUrl: "javascript:alert(1)" });
      expect(result.ready).toBe(false);
    });

    it("allows curated content with a well-formed http(s) source URL", () => {
      const result = getPulsePublishReadiness({ ...readyBase, origin: "curated", sourceUrl: "https://petapixel.com/2026/09/08/some-story/" });
      expect(result.ready).toBe(true);
    });

    it("never requires a source URL for Ordift-originated editorial content", () => {
      const result = getPulsePublishReadiness({ ...readyBase, origin: "editorial", sourceUrl: null });
      expect(result.ready).toBe(true);
      expect(result.blockers).toHaveLength(0);
    });
  });
});
