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
  // Adaptive Discovery Remediation, Part 8/9 (2026-09-08) — origin
  // decides whether a source URL is even relevant: Ordift-originated
  // editorial content has no external source and must never be forced
  // to have one (Part 8's own explicit instruction). "curated"/
  // "community" content — anything with a discovered/external
  // origin — normally REQUIRES a valid original-source URL before
  // publication (Part 8's own explicit principle).
  origin: string;
  sourceUrl: string | null;
};

export type PulsePublishReadiness = {
  ready: boolean;
  blockers: string[];
};

// A minimal, dependency-free http(s) URL check — deliberately not
// Sanity's own `url` field validation (that only runs inside Studio's
// own save/publish flow, never for a document created via
// sanity.create(), which is exactly how a discovered draft's sourceUrl
// gets set — see ingestion.ts). Never invents/repairs a malformed
// value; only reports it as a blocker.
function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// Official/Primary Source Discovery (2026-09-08) — "official" joins
// the sourceUrl requirement: an Ordift-written draft grounded in a
// verified official announcement must still preserve/validate the
// link to that announcement, same as curated content does. It does
// NOT join isCuratedExternalDiscovery() below — hero media stays
// required for "official", matching its full-editorial-requirement
// status (see that function's own comment).
const EXTERNAL_ORIGINS = new Set(["curated", "community", "official"]);

// Original vs. Curated Publishing Model, Part D (2026-09-08) — hero
// media becomes OPTIONAL for exactly one origin: "curated". Ordift-
// original ("editorial") content keeps the unconditional requirement
// unchanged, and so does "community" — deliberately NOT grouped with
// "curated" here, even though EXTERNAL_ORIGINS above groups them
// together for the (pre-existing, unchanged) source-URL requirement.
// That's a real, intentional split, not an inconsistency: "curated" is
// definitionally sourced from the vetted pulseSource registry (an
// external publisher's own reporting/photography Ordift is pointing
// to, never reproducing) — a missing hero there is expected and safe
// to render as a discovery brief instead. "community" carries no such
// guarantee today, and per explicit direction this phase must not
// quietly assume "community" always means "curated external" — a
// community submission may later represent original community-
// authored work with its own ownership/media rules, so its hero-media
// requirement stays exactly what it already was (required) until a
// deliberate future decision says otherwise.
function isCuratedExternalDiscovery(origin: string): boolean {
  return origin === "curated";
}

export function getPulsePublishReadiness(input: PulsePublishReadinessInput): PulsePublishReadiness {
  const blockers: string[] = [];

  if (!input.title.trim()) blockers.push("Title is empty.");
  if (input.excerpt === PLACEHOLDER_TEXT) {
    blockers.push("Excerpt is still the machine-generated placeholder — write a real excerpt before publishing.");
  }
  if (input.body === PLACEHOLDER_TEXT) {
    blockers.push("Body is still the machine-generated placeholder — write real Ordift-authored copy before publishing.");
  }
  if (!input.hasHeroMedia && !isCuratedExternalDiscovery(input.origin)) {
    blockers.push("No Hero Media set — add an Ordift-appropriate image before publishing (never the source's own photograph unless its licence explicitly permits reuse).");
  }
  if (EXTERNAL_ORIGINS.has(input.origin)) {
    if (!input.sourceUrl) {
      blockers.push("No original source URL set — discovered/curated content needs a valid source link before publishing.");
    } else if (!isValidHttpUrl(input.sourceUrl)) {
      blockers.push("The original source URL isn't a valid web address — fix it before publishing so the public \"Read Original Article\" link isn't broken.");
    }
  }

  return { ready: blockers.length === 0, blockers };
}
