// Ordift Pulse — Adaptive Discovery Remediation (2026-09-08).
// Pure, zero-import freshness POLICY — deliberately separate from
// relevanceScoring.ts's freshnessScore(), which stays exactly as it
// was (a soft, continuous ranking signal, never a hard cutoff). This
// module answers a different, narrower question: "is this item current
// enough to even be worth creating a draft for at all" — a hard gate
// applied once, at discovery time, before scoring runs.
//
// Windows are keyed by sourceType rather than one arbitrary global
// number, so a fast-moving RSS news feed and a slower editorial/API
// source can each get an appropriate leash without a code change when
// a new sourceType is added later — just add a line here. A missing
// publishedAt is treated as "don't exclude" (never penalize genuinely
// undated evergreen material), matching freshnessScore()'s own
// documented neutral-default precedent for the same case.

export const FRESHNESS_WINDOW_DAYS_BY_SOURCE_TYPE: Readonly<Record<string, number>> = {
  rss: 7, // fast-moving news/blog feeds — strongly prefer very recent
  api: 14,
  "press-release": 14,
  partner: 30,
  manual: 90, // editor-curated evergreen picks — the longest leash, a human already chose this
};

export const DEFAULT_FRESHNESS_WINDOW_DAYS = 14;

// Official/Primary Source Discovery, Part M (2026-09-08) — an optional
// per-source override (PulseSource.freshnessWindowDaysOverride) takes
// priority over the sourceType default when a real positive number is
// supplied; otherwise falls through to the exact same sourceType-keyed
// lookup as before. A slower-moving official newsroom that still
// publishes genuinely relevant material a little less often is the
// motivating case — this does not change the default for any source
// that hasn't been explicitly configured.
export function getFreshnessWindowDays(sourceType: string, overrideDays?: number | null): number {
  if (typeof overrideDays === "number" && overrideDays > 0) return overrideDays;
  return FRESHNESS_WINDOW_DAYS_BY_SOURCE_TYPE[sourceType] ?? DEFAULT_FRESHNESS_WINDOW_DAYS;
}

export function isWithinFreshnessWindow(params: { publishedAt: string | null; sourceType: string; freshnessWindowDaysOverride?: number | null; now?: Date }): boolean {
  if (!params.publishedAt) return true; // unknown date never excludes on its own
  const publishedDate = new Date(params.publishedAt);
  if (Number.isNaN(publishedDate.getTime())) return true; // unparseable date never excludes — a formatting quirk isn't a staleness signal
  const now = params.now ?? new Date();
  const ageDays = (now.getTime() - publishedDate.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays < 0) return true; // a source-clock-skew "future" date is not "stale" — let scoring/review handle it, never silently exclude
  return ageDays <= getFreshnessWindowDays(params.sourceType, params.freshnessWindowDaysOverride);
}
