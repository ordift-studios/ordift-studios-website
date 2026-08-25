import { describe, expect, it, vi, beforeEach } from "vitest";
import type { DiscoveryRunLogger, MinimalSanityClient } from "./ingestion";

const rssFetchMock = vi.fn();
vi.mock("./sourceAdapters/rssAdapter", () => ({
  rssAdapter: { fetch: rssFetchMock },
}));

const { runDiscoveryForSource } = await import("./ingestion");

function makeSanityMock(overrides: Partial<{ source: unknown; taxonomy: unknown[]; existing: unknown[]; settings: unknown }> = {}) {
  const created: Record<string, unknown>[] = [];
  const source = overrides.source ?? {
    id: "src1",
    name: "[SAMPLE] Test Source",
    sourceType: "rss",
    feedUrl: "https://example.org/feed",
    url: "https://example.org",
    isActive: true,
    permissionClassification: "amber",
    editorialTrustLevel: "unverified",
    editorialPriority: 0,
    disciplineIds: ["cat-photo"],
    geographyIds: ["region-ghana"],
  };
  const taxonomy = overrides.taxonomy ?? [
    { id: "cat-photo", slug: "photography-news" },
    { id: "region-ghana", slug: "ghana" },
  ];
  const existing = overrides.existing ?? [];
  const settings =
    "settings" in overrides
      ? overrides.settings
      : { discoveryEnabled: true, regionWeight: 20, topicWeight: 30, freshnessWeight: 20, trustWeight: 20, priorityWeight: 10 };

  const sanity = {
    fetch: vi.fn(async (query: string) => {
      if (query.includes("_type == \"pulseSource\"")) return source;
      if (query.includes("pulseCategory")) return taxonomy;
      if (query.includes("pulseArticle") && query.includes("defined(sourceUrl)")) return existing;
      if (query.includes("pulseSettings")) return settings;
      throw new Error(`unexpected query: ${query}`);
    }),
    create: vi.fn(async (doc: Record<string, unknown>) => {
      const _id = `article-${created.length + 1}`;
      created.push({ ...doc, _id });
      return { ...doc, _id };
    }),
  } as unknown as MinimalSanityClient;
  return { sanity, created };
}

let logRun: DiscoveryRunLogger & ReturnType<typeof vi.fn>;

beforeEach(() => {
  rssFetchMock.mockReset();
  logRun = vi.fn().mockResolvedValue(undefined) as DiscoveryRunLogger & ReturnType<typeof vi.fn>;
});

describe("runDiscoveryForSource", () => {
  it("refuses an inactive source without any network call", async () => {
    const { sanity } = makeSanityMock({ source: { id: "src1", name: "X", sourceType: "rss", feedUrl: "u", url: null, isActive: false, permissionClassification: "amber", editorialTrustLevel: "unverified", editorialPriority: 0, disciplineIds: [], geographyIds: [] } });
    const result = await runDiscoveryForSource("src1", sanity, logRun);
    expect(result.refused).toMatch(/not Active/);
    expect(rssFetchMock).not.toHaveBeenCalled();
    expect(logRun).not.toHaveBeenCalled();
  });

  it("refuses a Red-classified source without any network call", async () => {
    const { sanity } = makeSanityMock({ source: { id: "src1", name: "X", sourceType: "rss", feedUrl: "u", url: null, isActive: true, permissionClassification: "red", editorialTrustLevel: "unverified", editorialPriority: 0, disciplineIds: [], geographyIds: [] } });
    const result = await runDiscoveryForSource("src1", sanity, logRun);
    expect(result.refused).toMatch(/Red/);
    expect(rssFetchMock).not.toHaveBeenCalled();
  });

  it("refuses to run when Pulse discovery is disabled in settings, without any network call", async () => {
    const { sanity } = makeSanityMock({ settings: { discoveryEnabled: false, regionWeight: 20, topicWeight: 30, freshnessWeight: 20, trustWeight: 20, priorityWeight: 10 } });
    const result = await runDiscoveryForSource("src1", sanity, logRun);
    expect(result.refused).toMatch(/discovery is currently disabled/);
    expect(rssFetchMock).not.toHaveBeenCalled();
    expect(logRun).not.toHaveBeenCalled();
  });

  it("refuses to run when the pulseSettings singleton doesn't exist yet (fails closed)", async () => {
    const { sanity } = makeSanityMock({ settings: null });
    const result = await runDiscoveryForSource("src1", sanity, logRun);
    expect(result.refused).toMatch(/discovery is currently disabled/);
    expect(rssFetchMock).not.toHaveBeenCalled();
  });

  it("refuses an unsupported source type", async () => {
    const { sanity } = makeSanityMock({ source: { id: "src1", name: "X", sourceType: "api", feedUrl: null, url: "https://example.org", isActive: true, permissionClassification: "amber", editorialTrustLevel: "unverified", editorialPriority: 0, disciplineIds: [], geographyIds: [] } });
    const result = await runDiscoveryForSource("src1", sanity, logRun);
    expect(result.refused).toMatch(/no automated adapter/);
  });

  it("creates a draft for a clean item, never sets heroMedia, always sets status draft", async () => {
    rssFetchMock.mockResolvedValue([
      { title: "New Camera Lens Announced", sourceUrl: "https://example.org/1", summary: "A lightweight lens.", imageUrl: "https://example.org/1.jpg", author: "Jane", publishedAt: "2026-08-20T00:00:00Z" },
    ]);
    const { sanity, created } = makeSanityMock();
    const result = await runDiscoveryForSource("src1", sanity, logRun);

    expect(result.refused).toBeNull();
    expect(result.created).toBe(1);
    expect(created).toHaveLength(1);
    const doc = created[0];
    expect(doc.status).toBe("draft");
    expect(doc.origin).toBe("curated");
    expect(doc.heroMedia).toBeUndefined();
    expect(doc.sourceUrl).toBe("https://example.org/1");
    expect(doc.aiSummary).toBe("A lightweight lens.");
    expect(doc.discoveryRunId).toBe(result.runId);
    expect(typeof doc.relevanceScore).toBe("number");
    expect(logRun).toHaveBeenCalledWith(expect.objectContaining({ created: 1, fetched: 1 }));
  });

  it("excludes a clearly non-creative item and never creates a draft for it", async () => {
    rssFetchMock.mockResolvedValue([
      { title: "President Announces Cabinet Reshuffle", sourceUrl: "https://example.org/2", summary: "Election result triggers government dispute.", imageUrl: null, author: null, publishedAt: null },
    ]);
    const { sanity, created } = makeSanityMock();
    const result = await runDiscoveryForSource("src1", sanity, logRun);
    expect(result.excluded).toBe(1);
    expect(result.created).toBe(0);
    expect(created).toHaveLength(0);
  });

  it("flags an ambiguous item for review instead of discarding it", async () => {
    rssFetchMock.mockResolvedValue([
      { title: "Government Announces New Copyright Rules for Photographers", sourceUrl: "https://example.org/3", summary: "The president signed new intellectual property protections for creative professionals.", imageUrl: null, author: null, publishedAt: null },
    ]);
    const { sanity, created } = makeSanityMock();
    const result = await runDiscoveryForSource("src1", sanity, logRun);
    expect(result.created).toBe(1);
    expect(result.flaggedForReview).toBe(1);
    expect(created[0].tags).toContain("flagged-for-review");
  });

  it("flags a likely duplicate but still creates it, never silently dropping it", async () => {
    rssFetchMock.mockResolvedValue([
      { title: "Paris Fashion Week 2026 Recap", sourceUrl: "https://example.org/new", summary: "s", imageUrl: null, author: null, publishedAt: "2026-08-20T00:00:00Z" },
    ]);
    const { sanity, created } = makeSanityMock({
      existing: [{ _id: "existing-1", sourceUrl: "https://a.example/existing", title: "Paris Fashion Week 2026 Recap", publishedAt: "2026-08-19T00:00:00Z" }],
    });
    const result = await runDiscoveryForSource("src1", sanity, logRun);
    expect(result.created).toBe(1);
    expect(result.flaggedDuplicate).toBe(1);
    expect(created[0].possibleDuplicateOf).toEqual({ _type: "reference", _ref: "existing-1" });
  });

  it("continues the run and records the error when a create() call fails for one item", async () => {
    rssFetchMock.mockResolvedValue([
      { title: "Item One", sourceUrl: "https://example.org/a", summary: null, imageUrl: null, author: null, publishedAt: null },
      { title: "Item Two", sourceUrl: "https://example.org/b", summary: null, imageUrl: null, author: null, publishedAt: null },
    ]);
    const { sanity } = makeSanityMock();
    sanity.create = vi
      .fn()
      .mockRejectedValueOnce(new Error("network blip"))
      .mockImplementationOnce(async (doc: Record<string, unknown>) => ({ ...doc, _id: "article-2" }));

    const result = await runDiscoveryForSource("src1", sanity, logRun);
    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/network blip/);
  });

  it("records an adapter-level fetch failure without throwing", async () => {
    rssFetchMock.mockRejectedValue(new Error("feed unreachable"));
    const { sanity } = makeSanityMock();
    const result = await runDiscoveryForSource("src1", sanity, logRun);
    expect(result.fetched).toBe(0);
    expect(result.errors[0]).toMatch(/feed unreachable/);
    expect(logRun).toHaveBeenCalledWith(expect.objectContaining({ errors: ["feed unreachable"] }));
  });

  it("bounds processing to MAX_ITEMS_PER_RUN even when the feed returns more, while still reporting the true fetched count", async () => {
    const manyItems = Array.from({ length: 12 }, (_, i) => ({
      title: `New Camera Lens Announced ${i}`,
      sourceUrl: `https://example.org/${i}`,
      summary: "A lightweight lens.",
      imageUrl: null,
      author: null,
      publishedAt: "2026-08-20T00:00:00Z",
    }));
    rssFetchMock.mockResolvedValue(manyItems);
    const { sanity, created } = makeSanityMock();
    const result = await runDiscoveryForSource("src1", sanity, logRun);

    expect(result.fetched).toBe(12); // true feed total, unbounded
    expect(result.created).toBe(5); // bounded
    expect(created).toHaveLength(5);
  });

  it("logs a 'started' entry before the risky work, distinct from the completion log, when a starter callback is supplied", async () => {
    rssFetchMock.mockResolvedValue([
      { title: "New Camera Lens Announced", sourceUrl: "https://example.org/1", summary: "A lightweight lens.", imageUrl: null, author: null, publishedAt: "2026-08-20T00:00:00Z" },
    ]);
    const { sanity } = makeSanityMock();
    const logRunStarted = vi.fn().mockResolvedValue(undefined);
    const callOrder: string[] = [];
    logRunStarted.mockImplementation(async () => { callOrder.push("started"); });
    logRun.mockImplementation(async () => { callOrder.push("completed"); });

    const result = await runDiscoveryForSource("src1", sanity, logRun, logRunStarted);

    expect(logRunStarted).toHaveBeenCalledTimes(1);
    expect(logRunStarted).toHaveBeenCalledWith({ runId: result.runId, sourceId: "src1", sourceName: "[SAMPLE] Test Source" });
    expect(logRun).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(["started", "completed"]); // started always precedes completed
  });

  it("never calls the starter callback when refused before any risky work begins", async () => {
    const { sanity } = makeSanityMock({ source: { id: "src1", name: "X", sourceType: "rss", feedUrl: "u", url: null, isActive: false, permissionClassification: "amber", editorialTrustLevel: "unverified", editorialPriority: 0, disciplineIds: [], geographyIds: [] } });
    const logRunStarted = vi.fn().mockResolvedValue(undefined);
    const result = await runDiscoveryForSource("src1", sanity, logRun, logRunStarted);
    expect(result.refused).toMatch(/not Active/);
    expect(logRunStarted).not.toHaveBeenCalled();
  });

  it("remains fully backward compatible when no starter callback is supplied", async () => {
    rssFetchMock.mockResolvedValue([
      { title: "New Camera Lens Announced", sourceUrl: "https://example.org/1", summary: "A lightweight lens.", imageUrl: null, author: null, publishedAt: "2026-08-20T00:00:00Z" },
    ]);
    const { sanity } = makeSanityMock();
    const result = await runDiscoveryForSource("src1", sanity, logRun);
    expect(result.created).toBe(1);
  });
});
