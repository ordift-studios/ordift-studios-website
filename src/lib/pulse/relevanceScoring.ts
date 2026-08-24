import type { PulseEditorialTrustLevel, PulseSettings } from "../content/types";
import { hasRegionOverlap } from "./geoRegion";

// Configurable relevance score for Ordift Pulse (Phase A, 2026-08-24 —
// see PULSE_INGESTION_FOUNDATION.md §5). A pure function of inputs +
// weights, deliberately not hard-coded — the weights come from
// PulseSettings (Sanity) so they can be tuned by an admin later without a
// code change. Nothing calls this yet; it exists so the ingestion
// pipeline (a later phase) has a tested, ready-made scoring function to
// call rather than inventing one under time pressure.
//
// This is a RANKING signal, never a visibility gate on its own — see
// geoRegion.ts's own note. A low score can route an item to a lower
// position or a "needs more review" state; it must never be the sole
// reason an otherwise-eligible item is discarded (PulseSettings.
// minimumRelevanceScore is described in its own schema field as
// affecting what's flagged for review, not what's silently dropped).

const TRUST_LEVEL_SCORE: Record<PulseEditorialTrustLevel, number> = {
  high: 100,
  standard: 70,
  unverified: 40,
  flagged: 0,
};

export type RelevanceInput = {
  storyRegionSlugs: string[];
  visitorRegionChain: string[]; // from geoRegion.resolveRegionChain — pass ["global"] for a region-agnostic score
  storyTopicSlugs: string[];
  visitorInterestTopicSlugs: string[]; // empty array = no topic preference, topic score defaults neutral
  publishedAt: string | null; // ISO datetime
  now?: Date; // injectable for tests; defaults to current time
  sourceEditorialTrustLevel: PulseEditorialTrustLevel;
  sourceEditorialPriority: number; // raw value from PulseSource.editorialPriority, typically 0–10
};

const FRESHNESS_HALF_LIFE_HOURS = 48;
const MAX_PRIORITY_FOR_NORMALIZATION = 10;

function regionScore(input: RelevanceInput): number {
  return hasRegionOverlap(input.storyRegionSlugs, input.visitorRegionChain) ? 100 : 30;
}

function topicScore(input: RelevanceInput): number {
  if (input.visitorInterestTopicSlugs.length === 0) return 70; // neutral — no stated preference
  if (input.storyTopicSlugs.length === 0) return 50; // untagged story, mild penalty
  const overlap = input.storyTopicSlugs.some((slug) => input.visitorInterestTopicSlugs.includes(slug));
  return overlap ? 100 : 40;
}

function freshnessScore(input: RelevanceInput): number {
  if (!input.publishedAt) return 50;
  const now = input.now ?? new Date();
  const ageHours = Math.max(0, (now.getTime() - new Date(input.publishedAt).getTime()) / (1000 * 60 * 60));
  // Exponential decay, halving every FRESHNESS_HALF_LIFE_HOURS — a brand
  // new item scores ~100, one at exactly the half-life scores ~50.
  return 100 * Math.pow(0.5, ageHours / FRESHNESS_HALF_LIFE_HOURS);
}

function trustScore(input: RelevanceInput): number {
  return TRUST_LEVEL_SCORE[input.sourceEditorialTrustLevel];
}

function priorityScore(input: RelevanceInput): number {
  const clamped = Math.max(0, Math.min(MAX_PRIORITY_FOR_NORMALIZATION, input.sourceEditorialPriority));
  return (clamped / MAX_PRIORITY_FOR_NORMALIZATION) * 100;
}

/**
 * Weighted 0–100 relevance score. `weights` normally comes straight from
 * a PulseSettings document; any subset of weights may be omitted and
 * falls back to that field's own schema default.
 */
export function computeRelevanceScore(
  input: RelevanceInput,
  weights: Partial<
    Pick<PulseSettings, "regionWeight" | "topicWeight" | "freshnessWeight" | "trustWeight" | "priorityWeight">
  > = {}
): number {
  const regionWeight = weights.regionWeight ?? 20;
  const topicWeight = weights.topicWeight ?? 30;
  const freshnessWeight = weights.freshnessWeight ?? 20;
  const trustWeight = weights.trustWeight ?? 20;
  const priorityWeight = weights.priorityWeight ?? 10;
  const totalWeight = regionWeight + topicWeight + freshnessWeight + trustWeight + priorityWeight;
  if (totalWeight <= 0) return 0;

  const weightedSum =
    regionScore(input) * regionWeight +
    topicScore(input) * topicWeight +
    freshnessScore(input) * freshnessWeight +
    trustScore(input) * trustWeight +
    priorityScore(input) * priorityWeight;

  return Math.round((weightedSum / totalWeight) * 100) / 100;
}
