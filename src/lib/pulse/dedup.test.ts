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
