import { classifyForExclusion } from "./exclusionFilter";
import { findDuplicate, type DedupCandidate } from "./dedup";
import { computeRelevanceScore } from "./relevanceScoring";
import { manualAdapter } from "./sourceAdapters/manualAdapter";
import { rssAdapter } from "./sourceAdapters/rssAdapter";
import type { RawDiscoveredItem } from "./sourceAdapters/types";

// The discovery orchestrator (Phase B, 2026-08-24 — see
// PULSE_INGESTION_FOUNDATION.md). Wires together every pure-function
// piece built in Phase A into the approved pipeline:
//
//   Active Approved Source -> Fetch -> Permission Gate -> Dedup ->
//   Creative Relevance Filter -> Political/General-News Exclusion ->
//   Topic Classification -> Region Classification -> Quality/Trust Score
//   -> Draft pulseArticle -> (human) Review/Publish -> Journal
//
// Hard rules enforced here, not just documented:
//   - status is ALWAYS "draft" — this module never writes "inReview" or
//     "published", regardless of a source's permission classification.
//   - a Red-classified or inactive source is refused outright, before
//     any network call.
//   - heroMedia is never set from a fetched item's image — Phase B has
//     no image-download/upload pipeline, and even if it did, an
//     Ordift-owned fallback presentation must exist first (a design
//     asset that doesn't exist yet — see the Phase B report). This
//     applies regardless of a source's imageUsePermitted value.
//   - a likely-duplicate item is still created as a draft (never
//     silently dropped) with `possibleDuplicateOf` set, per the
//     approved "flag, never auto-delete" rule.
//   - an item classified "exclude" is never created at all; "review" is
//     created but tagged `flagged-for-review` for a human to see why.

export type MinimalSanityClient = {
  fetch<T>(query: string, params?: Record<string, unknown>): Promise<T>;
  create<T = Record<string, unknown>>(doc: Record<string, unknown>): Promise<T & { _id: string }>;
};

export type DiscoveryRunLogger = (params: {
  runId: string;
  sourceId: string;
  sourceName: string;
  fetched: number;
  created: number;
  flaggedDuplicate: number;
  flaggedForReview: number;
  excluded: number;
  errors: string[];
}) => Promise<void>;

type SourceRecord = {
  id: string;
  name: string;
  sourceType: string;
  feedUrl: string | null;
  url: string | null;
  isActive: boolean;
  permissionClassification: "green" | "blue" | "amber" | "red";
  editorialTrustLevel: "high" | "standard" | "unverified" | "flagged";
  editorialPriority: number;
  disciplineIds: string[];
  geographyIds: string[];
};

const SOURCE_QUERY = `*[_type == "pulseSource" && _id == $id][0]{
  "id": _id, name, sourceType, feedUrl, url, isActive,
  "permissionClassification": coalesce(permissionClassification, "amber"),
  "editorialTrustLevel": coalesce(editorialTrustLevel, "unverified"),
  "editorialPriority": coalesce(editorialPriority, 0),
  "disciplineIds": disciplines[]._ref,
  "geographyIds": geography[]._ref
}`;

const TAXONOMY_SLUGS_QUERY = `*[_type in ["pulseCategory", "pulseRegion"]]{"id": _id, "slug": slug.current}`;

const RECENT_ARTICLES_FOR_DEDUP_QUERY = `*[_type == "pulseArticle" && defined(sourceUrl)] | order(_createdAt desc)[0...200]{"_id": _id, sourceUrl, title, publishedAt}`;

// ACTIVE settings (genuinely read and enforced below): discoveryEnabled
// (the master gate checked before any external fetch — Phase B closure
// refinement, 2026-08-25) and the five relevance weights. RESERVED/
// INACTIVE settings (exist on pulseSettings, exposed on
// contentRepository.getPulseSettings(), but not read by this module or
// any other code path): globalAutoPublishEnabled, maxPostsPerDay,
// minimumRelevanceScore — this module always creates status: "draft"
// unconditionally regardless of any of the three, so there is currently
// no path by which they could affect what gets published. See
// pulseSettings.ts's own field descriptions for the same distinction.
const SETTINGS_QUERY = `*[_type == "pulseSettings"][0]{discoveryEnabled, regionWeight, topicWeight, freshnessWeight, trustWeight, priorityWeight}`;

function selectAdapter(sourceType: string) {
  if (sourceType === "rss") return rssAdapter;
  if (sourceType === "manual") return manualAdapter;
  return null; // "api"/"press-release"/"partner" have no generic auto-fetch configured in Phase B
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

// Exported so the Admin review UI's publish-readiness check (see
// publishReadiness.ts) can detect "this draft still has its
// machine-generated placeholder" using the exact same string, rather
// than a second copy that could drift out of sync.
export const PLACEHOLDER_TEXT =
  "[Discovered draft — awaiting editorial review. See AI-Generated Summary for the source material. This placeholder must never be published as-is.]";

export type RunDiscoveryResult = {
  runId: string;
  sourceId: string;
  sourceName: string;
  fetched: number;
  created: number;
  flaggedDuplicate: number;
  flaggedForReview: number;
  excluded: number;
  createdArticleIds: string[];
  errors: string[];
  refused: string | null; // set (and nothing else attempted) when the source itself blocks the run
};

/**
 * Runs one discovery pass for a single source. Never throws for
 * per-item problems — those accumulate in `errors`/`refused` on the
 * result instead, so a caller (the API route, or a test/admin script)
 * always gets a complete picture of what happened.
 */
export async function runDiscoveryForSource(
  sourceId: string,
  sanity: MinimalSanityClient,
  logRun: DiscoveryRunLogger
): Promise<RunDiscoveryResult> {
  const runId = crypto.randomUUID();
  const errors: string[] = [];

  const source = await sanity.fetch<SourceRecord | null>(SOURCE_QUERY, { id: sourceId });
  if (!source) {
    return emptyResult(runId, sourceId, "unknown source", "source not found");
  }
  if (!source.isActive) {
    return emptyResult(runId, source.id, source.name, "source is not Active");
  }
  if (source.permissionClassification === "red") {
    return emptyResult(runId, source.id, source.name, "source is Red — ingestion disallowed");
  }

  // Global discovery gate (closure refinement, 2026-08-25) — checked
  // before any external fetch, exactly like the per-source checks
  // above. Fetched here (not only later alongside the relevance
  // weights) specifically so this can run BEFORE adapter.fetch() —
  // discoveryEnabled === false must stop the run before any outbound
  // network request, not merely before writing a draft. A missing
  // pulseSettings singleton (never created in Production) reads as
  // disabled, matching the schema's own `initialValue: false` — this
  // fails closed, the same direction every other Pulse default already
  // takes.
  const settings = await sanity.fetch<
    { discoveryEnabled: boolean; regionWeight: number; topicWeight: number; freshnessWeight: number; trustWeight: number; priorityWeight: number } | null
  >(SETTINGS_QUERY);
  if (!settings?.discoveryEnabled) {
    return emptyResult(runId, source.id, source.name, "Pulse discovery is currently disabled in Pulse Settings — turn on Creative Radar Discovery to run this.");
  }

  const adapter = selectAdapter(source.sourceType);
  if (!adapter) {
    return emptyResult(runId, source.id, source.name, `no automated adapter configured for sourceType "${source.sourceType}"`);
  }

  let rawItems: RawDiscoveredItem[];
  try {
    rawItems = await adapter.fetch({ id: source.id, name: source.name, feedUrl: source.feedUrl, url: source.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await logRun({
      runId,
      sourceId: source.id,
      sourceName: source.name,
      fetched: 0,
      created: 0,
      flaggedDuplicate: 0,
      flaggedForReview: 0,
      excluded: 0,
      errors: [message],
    });
    return { runId, sourceId: source.id, sourceName: source.name, fetched: 0, created: 0, flaggedDuplicate: 0, flaggedForReview: 0, excluded: 0, createdArticleIds: [], errors: [message], refused: null };
  }

  const [taxonomySlugs, existingForDedup] = await Promise.all([
    sanity.fetch<{ id: string; slug: string }[]>(TAXONOMY_SLUGS_QUERY),
    sanity.fetch<(DedupCandidate & { _id: string })[]>(RECENT_ARTICLES_FOR_DEDUP_QUERY),
  ]);
  const slugById = new Map(taxonomySlugs.map((t) => [t.id, t.slug]));
  const disciplineSlugs = source.disciplineIds.map((id) => slugById.get(id)).filter((s): s is string => Boolean(s));
  const geographySlugs = source.geographyIds.map((id) => slugById.get(id)).filter((s): s is string => Boolean(s));
  const weights = settings;

  const dedupPool: (DedupCandidate & { _id: string })[] = [...existingForDedup];

  let created = 0;
  let flaggedDuplicate = 0;
  let flaggedForReview = 0;
  let excluded = 0;
  const createdArticleIds: string[] = [];

  for (const item of rawItems) {
    // categorySlugs is deliberately omitted here — exclusionFilter.ts's
    // "trust an assigned category over keyword text" shortcut is meant
    // for a genuine PER-ITEM classification, not a source's blanket
    // `disciplines` label. Applying the source's own discipline here
    // would let an off-topic item from an otherwise on-topic source
    // (e.g. a stray political post from a photography feed) bypass the
    // exclusion check entirely, defeating its purpose — found live
    // while testing this orchestrator (2026-08-24). Every item's text
    // is evaluated on its own regardless of which source it came from.
    const exclusion = classifyForExclusion({ title: item.title, excerpt: item.summary ?? "" });
    if (exclusion === "exclude") {
      excluded += 1;
      continue;
    }

    const duplicate = findDuplicate({ sourceUrl: item.sourceUrl, title: item.title, publishedAt: item.publishedAt }, dedupPool);

    const relevanceScore = computeRelevanceScore(
      {
        storyRegionSlugs: geographySlugs,
        visitorRegionChain: ["global"], // ingestion-time baseline only — real per-visitor personalization happens at render time in a later phase, using the same computeRelevanceScore function fresh per request
        storyTopicSlugs: disciplineSlugs,
        visitorInterestTopicSlugs: [],
        publishedAt: item.publishedAt,
        sourceEditorialTrustLevel: source.editorialTrustLevel,
        sourceEditorialPriority: source.editorialPriority,
      },
      weights
    );

    const tags = exclusion === "review" ? ["flagged-for-review"] : [];

    try {
      const doc: Record<string, unknown> = {
        _type: "pulseArticle",
        title: item.title,
        slug: { _type: "slug", current: `${slugify(item.title)}-${runId.slice(0, 8)}` },
        contentKind: "article",
        origin: "curated",
        status: "draft",
        featured: false,
        excerpt: PLACEHOLDER_TEXT,
        body: PLACEHOLDER_TEXT,
        categories: source.disciplineIds.map((id) => ({ _type: "reference", _ref: id })),
        regions: source.geographyIds.map((id) => ({ _type: "reference", _ref: id })),
        tags,
        source: { _type: "reference", _ref: source.id },
        sourceUrl: item.sourceUrl,
        sourceAttribution: `via ${source.name}`,
        aiSummary: item.summary,
        publishedAt: item.publishedAt,
        relevanceScore,
        discoveryRunId: runId,
        ...(duplicate ? { possibleDuplicateOf: { _type: "reference", _ref: duplicate._id } } : {}),
        // heroMedia deliberately omitted — see module doc comment.
      };
      const createdDoc = await sanity.create(doc);
      createdArticleIds.push(createdDoc._id);
      dedupPool.push({ _id: createdDoc._id, sourceUrl: item.sourceUrl, title: item.title, publishedAt: item.publishedAt });
      created += 1;
      if (duplicate) flaggedDuplicate += 1;
      if (exclusion === "review") flaggedForReview += 1;
    } catch (e) {
      errors.push(`create failed for "${item.title}": ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  await logRun({
    runId,
    sourceId: source.id,
    sourceName: source.name,
    fetched: rawItems.length,
    created,
    flaggedDuplicate,
    flaggedForReview,
    excluded,
    errors,
  });

  return {
    runId,
    sourceId: source.id,
    sourceName: source.name,
    fetched: rawItems.length,
    created,
    flaggedDuplicate,
    flaggedForReview,
    excluded,
    createdArticleIds,
    errors,
    refused: null,
  };
}

function emptyResult(runId: string, sourceId: string, sourceName: string, reason: string): RunDiscoveryResult {
  return {
    runId,
    sourceId,
    sourceName,
    fetched: 0,
    created: 0,
    flaggedDuplicate: 0,
    flaggedForReview: 0,
    excluded: 0,
    createdArticleIds: [],
    errors: [],
    refused: reason,
  };
}
