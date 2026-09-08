import { describe, expect, it } from "vitest";
import { getPulsePublishReadiness } from "./publishReadiness";
import { PLACEHOLDER_TEXT } from "./ingestion";

describe("getPulsePublishReadiness", () => {
  it("blocks a freshly-discovered curated draft on its still-placeholder excerpt/body, even with a valid source URL and no hero media (hero is optional for curated — see the dedicated describe block below)", () => {
    const result = getPulsePublishReadiness({
      title: "Sony Announces New Camera",
      excerpt: PLACEHOLDER_TEXT,
      body: PLACEHOLDER_TEXT,
      hasHeroMedia: false,
      origin: "curated",
      sourceUrl: "https://example.org/article",
    });
    expect(result.ready).toBe(false);
    expect(result.blockers).toHaveLength(2);
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

  it("blocks on an empty title", () => {
    const result = getPulsePublishReadiness({ title: "  ", excerpt: "x", body: "y", hasHeroMedia: true, origin: "editorial", sourceUrl: null });
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("Title is empty.");
  });

  // Original vs. Curated Publishing Model (2026-09-08) — hero media is
  // required for Ordift-original ("editorial") content, unchanged, but
  // optional for "curated" external discovery — never for "community",
  // which deliberately keeps the pre-existing unconditional requirement
  // (see publishReadiness.ts's own isCuratedExternalDiscovery() comment
  // for exactly why "community" is excluded here).
  describe("hero media requirement by origin", () => {
    const readyCopy = { title: "Real Title", excerpt: "Real excerpt.", body: "Real body." };

    it("1. editorial + no hero => NOT publish-ready", () => {
      const result = getPulsePublishReadiness({ ...readyCopy, hasHeroMedia: false, origin: "editorial", sourceUrl: null });
      expect(result.ready).toBe(false);
      expect(result.blockers).toContain(
        "No Hero Media set — add an Ordift-appropriate image before publishing (never the source's own photograph unless its licence explicitly permits reuse)."
      );
    });

    it("2. editorial + valid hero (+ other requirements satisfied) => hero rule passes", () => {
      const result = getPulsePublishReadiness({ ...readyCopy, hasHeroMedia: true, origin: "editorial", sourceUrl: null });
      expect(result.ready).toBe(true);
      expect(result.blockers).toHaveLength(0);
    });

    it("3. curated + no hero + valid source URL + genuine body (+ other requirements satisfied) => hero absence alone does NOT block readiness", () => {
      const result = getPulsePublishReadiness({ ...readyCopy, hasHeroMedia: false, origin: "curated", sourceUrl: "https://petapixel.com/2026/09/08/some-story/" });
      expect(result.ready).toBe(true);
      expect(result.blockers).toHaveLength(0);
    });

    it("4. curated + missing source URL (even with no hero) => NOT publish-ready", () => {
      const result = getPulsePublishReadiness({ ...readyCopy, hasHeroMedia: false, origin: "curated", sourceUrl: null });
      expect(result.ready).toBe(false);
      expect(result.blockers.some((b) => b.includes("No original source URL set"))).toBe(true);
      // and specifically NOT because of the hero-media rule — that
      // blocker must not appear for curated content at all.
      expect(result.blockers.some((b) => b.includes("No Hero Media set"))).toBe(false);
    });

    it("4b. curated + invalid source URL (even with no hero) => NOT publish-ready", () => {
      const result = getPulsePublishReadiness({ ...readyCopy, hasHeroMedia: false, origin: "curated", sourceUrl: "not a url" });
      expect(result.ready).toBe(false);
      expect(result.blockers.some((b) => b.includes("isn't a valid web address"))).toBe(true);
    });

    it("community + no hero still blocks — deliberately NOT extended the same as curated (see the code comment this test mirrors)", () => {
      const result = getPulsePublishReadiness({ ...readyCopy, hasHeroMedia: false, origin: "community", sourceUrl: "https://example.org/post" });
      expect(result.ready).toBe(false);
      expect(result.blockers).toContain(
        "No Hero Media set — add an Ordift-appropriate image before publishing (never the source's own photograph unless its licence explicitly permits reuse)."
      );
    });

    it("curated content with hero media chosen anyway is also ready — the richer presentation remains available at the editor's discretion", () => {
      const result = getPulsePublishReadiness({ ...readyCopy, hasHeroMedia: true, origin: "curated", sourceUrl: "https://petapixel.com/2026/09/08/some-story/" });
      expect(result.ready).toBe(true);
    });

    // Official/Primary Source Discovery (2026-09-08) — "official" gets
    // full-editorial hero treatment (same as "editorial"), deliberately
    // NOT the curated hero-optional exception, even though it shares
    // curated's sourceUrl requirement (see EXTERNAL_ORIGINS vs.
    // isCuratedExternalDiscovery() in publishReadiness.ts).
    it("5. official + no hero => NOT publish-ready — official drafts keep the full editorial hero requirement, unlike curated", () => {
      const result = getPulsePublishReadiness({ ...readyCopy, hasHeroMedia: false, origin: "official", sourceUrl: "https://www.nikon.com/news/2026/some-announcement" });
      expect(result.ready).toBe(false);
      expect(result.blockers).toContain(
        "No Hero Media set — add an Ordift-appropriate image before publishing (never the source's own photograph unless its licence explicitly permits reuse)."
      );
    });

    it("6. official + hero + valid source URL (+ other requirements satisfied) => publish-ready", () => {
      const result = getPulsePublishReadiness({ ...readyCopy, hasHeroMedia: true, origin: "official", sourceUrl: "https://www.nikon.com/news/2026/some-announcement" });
      expect(result.ready).toBe(true);
      expect(result.blockers).toHaveLength(0);
    });
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

    // Official/Primary Source Discovery (2026-09-08) — an Ordift-written
    // draft grounded in a verified official announcement still needs a
    // real, valid link to that announcement, same as curated content.
    it("blocks official content with no source URL at all — same rule as curated", () => {
      const result = getPulsePublishReadiness({ ...readyBase, origin: "official", sourceUrl: null });
      expect(result.ready).toBe(false);
      expect(result.blockers.some((b) => b.includes("No original source URL set"))).toBe(true);
    });

    it("blocks official content with a malformed source URL rather than rendering a broken public link", () => {
      const result = getPulsePublishReadiness({ ...readyBase, origin: "official", sourceUrl: "not a url at all" });
      expect(result.ready).toBe(false);
      expect(result.blockers.some((b) => b.includes("isn't a valid web address"))).toBe(true);
    });

    it("allows official content with a well-formed http(s) source URL", () => {
      const result = getPulsePublishReadiness({ ...readyBase, origin: "official", sourceUrl: "https://www.apple.com/newsroom/2026/09/some-announcement/" });
      expect(result.ready).toBe(true);
    });
  });
});
