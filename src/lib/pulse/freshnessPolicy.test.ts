import { describe, expect, it } from "vitest";
import { FRESHNESS_WINDOW_DAYS_BY_SOURCE_TYPE, DEFAULT_FRESHNESS_WINDOW_DAYS, getFreshnessWindowDays, isWithinFreshnessWindow } from "./freshnessPolicy";

describe("getFreshnessWindowDays", () => {
  it("returns the configured window for a known sourceType", () => {
    expect(getFreshnessWindowDays("rss")).toBe(FRESHNESS_WINDOW_DAYS_BY_SOURCE_TYPE.rss);
    expect(getFreshnessWindowDays("manual")).toBe(90);
  });
  it("falls back to the default for an unknown sourceType — never throws on a future new type", () => {
    expect(getFreshnessWindowDays("some-future-type")).toBe(DEFAULT_FRESHNESS_WINDOW_DAYS);
  });
});

describe("isWithinFreshnessWindow", () => {
  const now = new Date("2026-09-08T12:00:00.000Z");

  it("an item published today is within any window", () => {
    expect(isWithinFreshnessWindow({ publishedAt: now.toISOString(), sourceType: "rss", now })).toBe(true);
  });

  it("an RSS item older than 7 days is excluded", () => {
    const eightDaysAgo = new Date(now.getTime() - 8 * 86400000).toISOString();
    expect(isWithinFreshnessWindow({ publishedAt: eightDaysAgo, sourceType: "rss", now })).toBe(false);
  });

  it("an RSS item exactly at the 7-day boundary is still within window", () => {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
    expect(isWithinFreshnessWindow({ publishedAt: sevenDaysAgo, sourceType: "rss", now })).toBe(true);
  });

  it("a manual (editor-curated) item 60 days old is still within its longer window", () => {
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000).toISOString();
    expect(isWithinFreshnessWindow({ publishedAt: sixtyDaysAgo, sourceType: "manual", now })).toBe(true);
  });

  it("a manual item 91 days old exceeds even its longer window", () => {
    const ninetyOneDaysAgo = new Date(now.getTime() - 91 * 86400000).toISOString();
    expect(isWithinFreshnessWindow({ publishedAt: ninetyOneDaysAgo, sourceType: "manual", now })).toBe(false);
  });

  it("a null publishedAt is never excluded — preserves genuinely undated evergreen material", () => {
    expect(isWithinFreshnessWindow({ publishedAt: null, sourceType: "rss", now })).toBe(true);
  });

  it("an unparseable date string is never excluded rather than treated as infinitely stale", () => {
    expect(isWithinFreshnessWindow({ publishedAt: "not-a-date", sourceType: "rss", now })).toBe(true);
  });

  it("a future-dated item (clock skew) is never excluded on that basis alone", () => {
    const tomorrow = new Date(now.getTime() + 86400000).toISOString();
    expect(isWithinFreshnessWindow({ publishedAt: tomorrow, sourceType: "rss", now })).toBe(true);
  });

  it("an unknown sourceType uses the default 14-day window", () => {
    const twentyDaysAgo = new Date(now.getTime() - 20 * 86400000).toISOString();
    expect(isWithinFreshnessWindow({ publishedAt: twentyDaysAgo, sourceType: "some-future-type", now })).toBe(false);
    const tenDaysAgo = new Date(now.getTime() - 10 * 86400000).toISOString();
    expect(isWithinFreshnessWindow({ publishedAt: tenDaysAgo, sourceType: "some-future-type", now })).toBe(true);
  });
});

// Official/Primary Source Discovery, Part M (2026-09-08) — per-source
// freshnessWindowDaysOverride. Motivating case: a slower-moving official
// newsroom (e.g. an RSS feed that only posts every couple of weeks) that
// still publishes genuinely relevant material a little less often than
// the 7-day RSS default assumes.
describe("getFreshnessWindowDays — per-source override", () => {
  it("a positive override takes priority over the sourceType default", () => {
    expect(getFreshnessWindowDays("rss", 21)).toBe(21);
  });

  it("a null override falls through to the ordinary sourceType default", () => {
    expect(getFreshnessWindowDays("rss", null)).toBe(FRESHNESS_WINDOW_DAYS_BY_SOURCE_TYPE.rss);
  });

  it("an undefined override falls through to the ordinary sourceType default — the pre-existing two-arg call sites are unaffected", () => {
    expect(getFreshnessWindowDays("rss", undefined)).toBe(FRESHNESS_WINDOW_DAYS_BY_SOURCE_TYPE.rss);
  });

  it("a zero or negative override is never trusted (a misconfiguration must not silently exclude everything) — falls through to the sourceType default", () => {
    expect(getFreshnessWindowDays("rss", 0)).toBe(FRESHNESS_WINDOW_DAYS_BY_SOURCE_TYPE.rss);
    expect(getFreshnessWindowDays("rss", -5)).toBe(FRESHNESS_WINDOW_DAYS_BY_SOURCE_TYPE.rss);
  });
});

describe("isWithinFreshnessWindow — per-source override", () => {
  const now = new Date("2026-09-08T12:00:00.000Z");

  it("an RSS item 14 days old is excluded under the plain 7-day default but included once its source has a 21-day override", () => {
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000).toISOString();
    expect(isWithinFreshnessWindow({ publishedAt: fourteenDaysAgo, sourceType: "rss", now })).toBe(false);
    expect(isWithinFreshnessWindow({ publishedAt: fourteenDaysAgo, sourceType: "rss", freshnessWindowDaysOverride: 21, now })).toBe(true);
  });

  it("an item still older than even the override is excluded", () => {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
    expect(isWithinFreshnessWindow({ publishedAt: thirtyDaysAgo, sourceType: "rss", freshnessWindowDaysOverride: 21, now })).toBe(false);
  });

  it("a source with no override configured behaves exactly as before this feature existed", () => {
    const eightDaysAgo = new Date(now.getTime() - 8 * 86400000).toISOString();
    expect(isWithinFreshnessWindow({ publishedAt: eightDaysAgo, sourceType: "rss", now })).toBe(false);
  });
});
