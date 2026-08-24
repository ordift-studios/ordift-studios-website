import { describe, expect, it } from "vitest";
import { computeRelevanceScore } from "./relevanceScoring";

const baseWeights = { regionWeight: 20, topicWeight: 30, freshnessWeight: 20, trustWeight: 20, priorityWeight: 10 };

describe("computeRelevanceScore", () => {
  it("scores highest for a fresh, region-matched, topic-matched, high-trust, high-priority item", () => {
    const score = computeRelevanceScore(
      {
        storyRegionSlugs: ["ghana"],
        visitorRegionChain: ["ghana", "west-africa", "africa", "global"],
        storyTopicSlugs: ["photography-news"],
        visitorInterestTopicSlugs: ["photography-news"],
        publishedAt: new Date().toISOString(),
        sourceEditorialTrustLevel: "high",
        sourceEditorialPriority: 10,
      },
      baseWeights
    );
    expect(score).toBeGreaterThan(90);
  });

  it("scores lower for a stale, region-mismatched, flagged-trust item", () => {
    const score = computeRelevanceScore(
      {
        storyRegionSlugs: ["europe"],
        visitorRegionChain: ["ghana", "west-africa", "africa", "global"],
        storyTopicSlugs: ["fashion-news"],
        visitorInterestTopicSlugs: ["photography-news"],
        publishedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        sourceEditorialTrustLevel: "flagged",
        sourceEditorialPriority: 0,
      },
      baseWeights
    );
    expect(score).toBeLessThan(40);
  });

  it("never hides a story tagged global regardless of visitor region", () => {
    const score = computeRelevanceScore(
      {
        storyRegionSlugs: ["global"],
        visitorRegionChain: ["kenya", "east-africa", "africa", "global"],
        storyTopicSlugs: [],
        visitorInterestTopicSlugs: [],
        publishedAt: new Date().toISOString(),
        sourceEditorialTrustLevel: "standard",
        sourceEditorialPriority: 5,
      },
      baseWeights
    );
    // Region component alone should already contribute its full share —
    // the score should not be penalized for "region mismatch".
    expect(score).toBeGreaterThan(50);
  });

  it("falls back to schema-default weights when none are provided", () => {
    const score = computeRelevanceScore({
      storyRegionSlugs: [],
      visitorRegionChain: ["global"],
      storyTopicSlugs: [],
      visitorInterestTopicSlugs: [],
      publishedAt: null,
      sourceEditorialTrustLevel: "standard",
      sourceEditorialPriority: 0,
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("returns 0 when all weights are zero rather than dividing by zero", () => {
    const score = computeRelevanceScore(
      {
        storyRegionSlugs: [],
        visitorRegionChain: ["global"],
        storyTopicSlugs: [],
        visitorInterestTopicSlugs: [],
        publishedAt: null,
        sourceEditorialTrustLevel: "standard",
        sourceEditorialPriority: 0,
      },
      { regionWeight: 0, topicWeight: 0, freshnessWeight: 0, trustWeight: 0, priorityWeight: 0 }
    );
    expect(score).toBe(0);
  });

  it("always stays within 0–100", () => {
    const score = computeRelevanceScore(
      {
        storyRegionSlugs: ["ghana"],
        visitorRegionChain: ["ghana", "global"],
        storyTopicSlugs: ["photography-news"],
        visitorInterestTopicSlugs: ["photography-news"],
        publishedAt: new Date().toISOString(),
        sourceEditorialTrustLevel: "high",
        sourceEditorialPriority: 999, // deliberately out-of-range input
      },
      baseWeights
    );
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
