import type { PulseSourceAdapter, PulseSourceLike, RawDiscoveredItem } from "./types";

// Generic free/documented JSON API adapter (Phase A, 2026-08-24 — see
// PULSE_INGESTION_FOUNDATION.md §D). Deliberately field-mapping-driven
// rather than hard-coded to one provider's response shape, so any source
// exposing a plain JSON list of items — a free official API, a partner
// newsroom endpoint — can be onboarded by configuration, not new code.
// No paid/licensed API is wired in; this fetches whatever `source.url`
// points to over plain HTTP(S) and does not require an API key.
//
// `fieldMap` describes how to read one JSON item; JSON path segments are
// dot-separated (e.g. "attributes.headline"). A source without a
// configured fieldMap can't be used with this adapter yet — that's a
// deliberate refusal rather than a guess at an unknown shape.
export type ApiAdapterFieldMap = {
  itemsPath?: string; // dot path to the array of items within the response root; omit if the root itself is the array
  title: string;
  sourceUrl: string;
  summary?: string;
  imageUrl?: string;
  author?: string;
  publishedAt?: string;
};

function readPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function createApiAdapter(fieldMap: ApiAdapterFieldMap): PulseSourceAdapter {
  return {
    async fetch(source: PulseSourceLike): Promise<RawDiscoveredItem[]> {
      const endpoint = source.feedUrl ?? source.url;
      if (!endpoint) {
        throw new Error(`Pulse source "${source.name}" has no feedUrl/url configured.`);
      }
      const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
      if (!response.ok) {
        throw new Error(`Pulse source "${source.name}" API request failed: ${response.status}`);
      }
      const body: unknown = await response.json();
      const rawItems = fieldMap.itemsPath ? readPath(body, fieldMap.itemsPath) : body;
      if (!Array.isArray(rawItems)) return [];

      const items: RawDiscoveredItem[] = [];
      for (const raw of rawItems) {
        const title = asStringOrNull(readPath(raw, fieldMap.title));
        const sourceUrl = asStringOrNull(readPath(raw, fieldMap.sourceUrl));
        if (!title || !sourceUrl) continue; // skip malformed entries, never throw for one bad item
        items.push({
          title,
          sourceUrl,
          summary: fieldMap.summary ? asStringOrNull(readPath(raw, fieldMap.summary)) : null,
          imageUrl: fieldMap.imageUrl ? asStringOrNull(readPath(raw, fieldMap.imageUrl)) : null,
          author: fieldMap.author ? asStringOrNull(readPath(raw, fieldMap.author)) : null,
          publishedAt: fieldMap.publishedAt ? asStringOrNull(readPath(raw, fieldMap.publishedAt)) : null,
        });
      }
      return items;
    },
  };
}
