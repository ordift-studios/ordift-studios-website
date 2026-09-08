import { describe, expect, it } from "vitest";
import { findDuplicate, normalizeTitle, titleSimilarity } from "./dedup";

describe("normalizeTitle", () => {
  it("lowercases, strips punctuation, and collapses whitespace", () => {
    expect(normalizeTitle("  Vogue's  Fashion  Week — Recap!  ")).toBe("vogues fashion week recap");
  });
});

describe("titleSimilarity", () => {
  it("returns 1 for identical titles", () => {
    expect(titleSimilarity("Paris Fashion Week 2026 Recap", "Paris Fashion Week 2026 Recap")).toBe(1);
  });

  it("returns a high score for near-duplicate titles", () => {
    expect(
      titleSimilarity("Paris Fashion Week 2026: The Full Recap", "Paris Fashion Week 2026 Recap")
    ).toBeGreaterThan(0.6);
  });

  it("returns a low score for unrelated titles", () => {
    expect(titleSimilarity("Paris Fashion Week 2026 Recap", "New Camera Released by Sony")).toBeLessThan(0.2);
  });
});

describe("findDuplicate", () => {
  const existing = [
    { sourceUrl: "https://a.example/article-1", title: "Paris Fashion Week 2026 Recap", publishedAt: "2026-08-20T00:00:00Z" },
    { sourceUrl: "https://b.example/article-2", title: "Sony Announces New Mirrorless Camera", publishedAt: "2026-08-22T00:00:00Z" },
  ];

  it("matches on exact source URL", () => {
    const match = findDuplicate(
      { sourceUrl: "https://a.example/article-1", title: "A totally different title", publishedAt: "2026-08-21T00:00:00Z" },
      existing
    );
    expect(match?.sourceUrl).toBe("https://a.example/article-1");
  });

  it("matches on normalized title when URLs differ", () => {
    const match = findDuplicate(
      { sourceUrl: "https://c.example/article-3", title: "paris fashion week 2026 recap!!", publishedAt: "2026-08-20T12:00:00Z" },
      existing
    );
    expect(match?.title).toBe("Paris Fashion Week 2026 Recap");
  });

  it("matches on fuzzy title similarity", () => {
    const match = findDuplicate(
      { sourceUrl: "https://c.example/article-4", title: "Paris Fashion Week 2026: The Complete Recap", publishedAt: "2026-08-20T06:00:00Z" },
      existing
    );
    expect(match?.title).toBe("Paris Fashion Week 2026 Recap");
  });

  it("does not match an unrelated item", () => {
    const match = findDuplicate(
      { sourceUrl: "https://c.example/article-5", title: "Ghana Hosts Photography Exhibition", publishedAt: "2026-08-21T00:00:00Z" },
      existing
    );
    expect(match).toBeNull();
  });

  it("does not match outside the comparison window", () => {
    const match = findDuplicate(
      { sourceUrl: "https://c.example/article-6", title: "Paris Fashion Week 2026 Recap", publishedAt: "2025-01-01T00:00:00Z" },
      existing,
      { windowDays: 30 }
    );
    expect(match).toBeNull();
  });

  it("never mutates or deletes the existing list", () => {
    const before = [...existing];
    findDuplicate({ sourceUrl: "https://a.example/article-1", title: "x", publishedAt: null }, existing);
    expect(existing).toEqual(before);
  });
});

// Official/Primary Source Discovery, Part E (2026-09-08) — "story
// identity / multiple coverage." No new schema/table — this proves the
// EXISTING dedup mechanism already provides the smallest safe
// story-matching layer the task asks for: two different SOURCES
// reporting the same underlying announcement flag as a probable
// duplicate (never silently merged, never auto-suppressed — the
// second item is still created, just tagged possibleDuplicateOf for a
// human to see), while genuinely different coverage of the same
// product does NOT get flagged.
describe("findDuplicate — cross-source \"same underlying story\" (Part E)", () => {
  const officialAnnouncement = {
    sourceUrl: "https://www.apple.com/newsroom/2026/09/apple-introduces-new-mac-studio-with-m5-max-and-m5-ultra/",
    title: "Apple introduces new Mac Studio with M5 Max and M5 Ultra",
    publishedAt: "2026-08-25T00:00:00Z",
  };

  it("flags near-identical independent editorial coverage of the same official announcement as a probable duplicate", () => {
    // A realistic case — a publication lightly rewording an official
    // press headline shares most of its key nouns/terms verbatim.
    const editorialCoverage = {
      sourceUrl: "https://petapixel.com/2026/08/25/apple-introduces-new-mac-studio-with-m5-max-and-m5-ultra-chips/",
      title: "Apple Introduces New Mac Studio with M5 Max and M5 Ultra Chips",
      publishedAt: "2026-08-25T00:00:00Z",
    };
    expect(titleSimilarity(editorialCoverage.title, officialAnnouncement.title)).toBeGreaterThanOrEqual(0.6);
    const match = findDuplicate(editorialCoverage, [officialAnnouncement]);
    expect(match).toEqual(officialAnnouncement);
  });

  it("does NOT flag genuinely different analysis/review coverage merely because it mentions the same product", () => {
    const independentReview = {
      sourceUrl: "https://petapixel.com/2026/09/01/mac-studio-m5-review-a-video-editors-perspective/",
      title: "Mac Studio M5 Review: A Video Editor's Perspective After Two Weeks",
      publishedAt: "2026-09-01T00:00:00Z",
    };
    const match = findDuplicate(independentReview, [officialAnnouncement]);
    expect(match).toBeNull();
  });

  it("a flagged duplicate is never silently dropped by findDuplicate itself — it still returns the candidate is welcome to be created, only the caller (ingestion.ts) decides to tag possibleDuplicateOf rather than exclude", () => {
    // findDuplicate() has no "exclude" return value at all — it can
    // only ever return a match (Object) or null, never a signal to
    // drop the candidate. Excluding is a structurally different code
    // path (classifyForExclusion), never triggered by a dedup match.
    const editorialCoverage = { sourceUrl: "https://petapixel.com/x", title: "Apple introduces new Mac Studio with M5 Max and M5 Ultra", publishedAt: "2026-08-25T00:00:00Z" };
    const match = findDuplicate(editorialCoverage, [officialAnnouncement]);
    expect(match).not.toBeNull();
  });
});
