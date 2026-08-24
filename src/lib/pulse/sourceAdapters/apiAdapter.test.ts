import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiAdapter } from "./apiAdapter";

describe("createApiAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps a nested JSON response using the configured field map", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          articles: [
            {
              headline: "New Gallery Opens in Accra",
              link: "https://example.org/articles/1",
              deck: "A survey of contemporary Ghanaian photography.",
              hero: "https://example.org/images/1.jpg",
              byline: "Jane Doe",
              published: "2026-08-20T10:00:00Z",
            },
            { headline: "Missing link, should be skipped" },
          ],
        },
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const adapter = createApiAdapter({
      itemsPath: "data.articles",
      title: "headline",
      sourceUrl: "link",
      summary: "deck",
      imageUrl: "hero",
      author: "byline",
      publishedAt: "published",
    });

    const items = await adapter.fetch({ id: "s1", name: "[SAMPLE] API Source", feedUrl: "https://example.org/api", url: null });

    expect(items).toEqual([
      {
        title: "New Gallery Opens in Accra",
        sourceUrl: "https://example.org/articles/1",
        summary: "A survey of contemporary Ghanaian photography.",
        imageUrl: "https://example.org/images/1.jpg",
        author: "Jane Doe",
        publishedAt: "2026-08-20T10:00:00Z",
      },
    ]);
    expect(mockFetch).toHaveBeenCalledWith("https://example.org/api", { headers: { Accept: "application/json" } });
  });

  it("returns an empty list when the items path does not resolve to an array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) })
    );
    const adapter = createApiAdapter({ itemsPath: "data.articles", title: "headline", sourceUrl: "link" });
    const items = await adapter.fetch({ id: "s1", name: "[SAMPLE]", feedUrl: "https://example.org/api", url: null });
    expect(items).toEqual([]);
  });

  it("throws when the source has no feedUrl or url configured", async () => {
    const adapter = createApiAdapter({ title: "headline", sourceUrl: "link" });
    await expect(adapter.fetch({ id: "s1", name: "[SAMPLE]", feedUrl: null, url: null })).rejects.toThrow(/no feedUrl\/url/);
  });

  it("throws when the HTTP response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const adapter = createApiAdapter({ title: "headline", sourceUrl: "link" });
    await expect(
      adapter.fetch({ id: "s1", name: "[SAMPLE]", feedUrl: "https://example.org/api", url: null })
    ).rejects.toThrow(/500/);
  });
});
