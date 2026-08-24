import { describe, expect, it, vi } from "vitest";

const parseURLMock = vi.fn();

vi.mock("rss-parser", () => ({
  default: class MockParser {
    parseURL = parseURLMock;
  },
}));

// Imported after the mock so the adapter's module-scope `new Parser()`
// picks up the mocked class — no real network request happens in this
// test file.
const { rssAdapter } = await import("./rssAdapter");

describe("rssAdapter", () => {
  it("maps feed items to RawDiscoveredItem, skipping malformed entries", async () => {
    parseURLMock.mockResolvedValue({
      items: [
        {
          title: "New Gallery Opens in Accra",
          link: "https://example.org/articles/1",
          contentSnippet: "A survey of contemporary Ghanaian photography.",
          enclosure: { url: "https://example.org/images/1.jpg" },
          creator: "Jane Doe",
          isoDate: "2026-08-20T10:00:00.000Z",
        },
        { title: "Missing link, should be skipped" },
        { link: "https://example.org/articles/2" }, // missing title, should be skipped
      ],
    });

    const items = await rssAdapter.fetch({ id: "s1", name: "[SAMPLE] RSS Source", feedUrl: "https://example.org/feed", url: null });

    expect(items).toEqual([
      {
        title: "New Gallery Opens in Accra",
        sourceUrl: "https://example.org/articles/1",
        summary: "A survey of contemporary Ghanaian photography.",
        imageUrl: "https://example.org/images/1.jpg",
        author: "Jane Doe",
        publishedAt: "2026-08-20T10:00:00.000Z",
      },
    ]);
    expect(parseURLMock).toHaveBeenCalledWith("https://example.org/feed");
  });

  it("returns an empty list when the feed has no items", async () => {
    parseURLMock.mockResolvedValue({ items: [] });
    const items = await rssAdapter.fetch({ id: "s1", name: "[SAMPLE]", feedUrl: "https://example.org/feed", url: null });
    expect(items).toEqual([]);
  });

  it("throws when the source has no feedUrl configured", async () => {
    await expect(rssAdapter.fetch({ id: "s1", name: "[SAMPLE]", feedUrl: null, url: null })).rejects.toThrow(/no feedUrl/);
  });
});
