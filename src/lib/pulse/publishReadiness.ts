import { PLACEHOLDER_TEXT } from "./ingestion";

// Publish-readiness gate for the Admin review interface (Phase D,
// 2026-08-24 — see PULSE_INGESTION_FOUNDATION.md). Mirrors the
// established Portfolio precedent (getPublishReadiness in
// src/lib/admin/portfolioValidation.ts) — a pure function an action
// checks before allowing a status transition to "published", not a
// database constraint. Specifically exists to make sure a discovered
// draft's machine-generated placeholder excerpt/body and missing
// heroMedia can never slip straight to Publish without a human actually
// having edited it in Studio first — this is the concrete mechanism
// behind "preserve the human editorial-review requirement," not just a
// policy statement.
export type PulsePublishReadinessInput = {
  title: string;
  excerpt: string;
  body: string;
  hasHeroMedia: boolean;
};

export type PulsePublishReadiness = {
  ready: boolean;
  blockers: string[];
};

export function getPulsePublishReadiness(input: PulsePublishReadinessInput): PulsePublishReadiness {
  const blockers: string[] = [];

  if (!input.title.trim()) blockers.push("Title is empty.");
  if (input.excerpt === PLACEHOLDER_TEXT) {
    blockers.push("Excerpt is still the machine-generated placeholder — write a real excerpt before publishing.");
  }
  if (input.body === PLACEHOLDER_TEXT) {
    blockers.push("Body is still the machine-generated placeholder — write real Ordift-authored copy before publishing.");
  }
  if (!input.hasHeroMedia) {
    blockers.push("No Hero Media set — add an Ordift-appropriate image before publishing (never the source's own photograph unless its licence explicitly permits reuse).");
  }

  return { ready: blockers.length === 0, blockers };
}
