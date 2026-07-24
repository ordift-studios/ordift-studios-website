import { sanityContentRepository } from "./sanity/repository";
import type { ContentRepository } from "./repository";

// The single active content source for the whole site. Flipped to the
// live Sanity project (ixbvr1n8) on 2026-07-24 — every page, component,
// and API route reads through `contentRepository` from this file, never
// `./local` or `./sanity` directly, so this was the only line that
// needed to change. See CMS_MIGRATION.md.
export const contentRepository: ContentRepository = sanityContentRepository;

export type { ContentRepository } from "./repository";
export * from "./types";
