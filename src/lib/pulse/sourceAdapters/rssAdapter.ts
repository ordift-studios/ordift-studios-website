import Parser from "rss-parser";
import type { PulseSourceAdapter, PulseSourceLike, RawDiscoveredItem } from "./types";

// RSS/Atom adapter (Phase A, 2026-08-24 — see PULSE_INGESTION_FOUNDATION.md
// §D/§6). Uses `rss-parser` (MIT, free/open-source — see the Phase A
// delivery report for the exact version and the maintenance-status
// caveat flagged there). No SaaS RSS service — this parses a feed URL
// directly, exactly as approved.
//
// Reads only what the feed itself provides. Never invents a summary,
// image, or author — a missing field stays null, for the caller (a
// future orchestrator) to decide how to handle, rather than this adapter
// guessing.
const parser = new Parser();

export const rssAdapter: PulseSourceAdapter = {
  async fetch(source: PulseSourceLike): Promise<RawDiscoveredItem[]> {
    if (!source.feedUrl) {
      throw new Error(`Pulse source "${source.name}" has no feedUrl configured.`);
    }
    const feed = await parser.parseURL(source.feedUrl);
    const items: RawDiscoveredItem[] = [];
    for (const entry of feed.items ?? []) {
      if (!entry.title || !entry.link) continue; // skip malformed entries, never throw for one bad item
      items.push({
        title: entry.title,
        sourceUrl: entry.link,
        summary: entry.contentSnippet ?? entry.summary ?? null,
        imageUrl: entry.enclosure?.url ?? null,
        author: entry.creator ?? entry.author ?? null,
        publishedAt: entry.isoDate ?? entry.pubDate ?? null,
      });
    }
    return items;
  },
};
