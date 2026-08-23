import type { FormState, GalleryItemPresentation } from "./PortfolioProjectForm";

// Raw shape from portfolioProjectEditQuery — loosely typed on purpose
// (see getPortfolioProjectForEdit's own comment); this is the one place
// that shape gets turned into something FormState-compatible.
type RawImage = {
  assetId?: string | null;
  url?: string | null;
  alt?: string | null;
  hotspotX?: number | null;
  hotspotY?: number | null;
  // Main Film support (2026-08-23, Videography) — present only on
  // heroMedia's raw shape; every other RawImage usage (gallery item
  // hotspot pickers, etc.) simply never has it set.
  type?: string | null;
};
type RawGalleryItem = RawImage & {
  key: string;
  caption?: string | null;
  productionNotes?: string | null;
  presentation?: string | null;
};
// Additional Films / Reels (2026-08-23, Videography) — mirrors
// editVideoItemShape in queries.ts exactly.
type RawVideoItem = {
  key: string;
  type?: string;
  url?: string;
  alt?: string;
  posterAssetId?: string | null;
  posterUrl?: string | null;
  posterAlt?: string | null;
};

function toImgState(raw?: RawImage | null) {
  const isEmbed = raw?.type === "embed";
  return {
    assetId: raw?.assetId ?? null,
    url: isEmbed ? null : (raw?.url ?? null),
    alt: raw?.alt ?? "",
    hotspotX: raw?.hotspotX ?? 0.5,
    hotspotY: raw?.hotspotY ?? 0.5,
    uploading: false,
    progress: 0,
    error: null,
    mediaType: (isEmbed ? "embed" : "image") as "image" | "embed",
    embedUrl: isEmbed ? (raw?.url ?? "") : "",
  };
}

function toGalleryItems(raw?: RawGalleryItem[] | null) {
  return (raw ?? []).map((g) => ({
    key: g.key,
    assetId: g.assetId ?? null,
    url: g.url ?? null,
    alt: g.alt ?? "",
    caption: g.caption ?? "",
    productionNotes: g.productionNotes ?? "",
    presentation: (g.presentation as GalleryItemPresentation | null) ?? "automatic",
    hotspotX: g.hotspotX ?? 0.5,
    hotspotY: g.hotspotY ?? 0.5,
    uploading: false,
    progress: 0,
    error: null,
  }));
}

function toVideoItems(raw?: RawVideoItem[] | null) {
  return (raw ?? [])
    .filter((v) => v.type === "embed")
    .map((v) => ({
      key: v.key,
      url: v.url ?? "",
      alt: v.alt ?? "",
      posterAssetId: v.posterAssetId ?? null,
      posterUrl: v.posterUrl ?? null,
      posterAlt: v.posterAlt ?? "",
      posterUploading: false,
      posterError: null,
    }));
}

export function mapEditDataToFormState(raw: Record<string, unknown>): Partial<FormState> {
  const r = raw as {
    title?: string;
    slug?: string;
    disciplines?: string[];
    year?: number;
    location?: string;
    client?: string;
    isPasswordProtected?: boolean;
    heroMedia?: RawImage;
    gallery?: RawGalleryItem[];
    behindTheScenesGallery?: RawGalleryItem[];
    videos?: RawVideoItem[];
    reels?: RawVideoItem[];
    downloadableAssets?: { key: string; label?: string; fileType?: string; assetId?: string; url?: string }[];
    categoryIds?: string[];
    collectionIds?: string[];
    seriesOrder?: number;
    tags?: string[];
    servicesProvided?: string[];
    equipmentUsed?: string[];
    story?: string;
    objective?: string;
    strategy?: string;
    challenges?: string;
    solution?: string;
    process?: string;
    results?: string;
    deliverables?: string[];
    awards?: { key: string; title?: string; issuer?: string; year?: number }[];
    publications?: { key: string; name?: string; url?: string; year?: number }[];
    showCollaborationCredits?: boolean;
    collaborators?: { key: string; name?: string; role?: string }[];
    testimonialIds?: string[];
    relatedProjectIds?: string[];
    seoTitle?: string;
    seoDescription?: string;
  };

  return {
    title: r.title ?? "",
    slug: r.slug ?? "",
    slugTouched: true,
    disciplines: r.disciplines ?? [],
    year: r.year != null ? String(r.year) : "",
    location: r.location ?? "",
    client: r.client ?? "",
    isPasswordProtected: r.isPasswordProtected ?? false,
    hero: toImgState(r.heroMedia),
    gallery: toGalleryItems(r.gallery),
    behindTheScenes: toGalleryItems(r.behindTheScenesGallery),
    videos: toVideoItems(r.videos),
    reels: toVideoItems(r.reels),
    downloads: (r.downloadableAssets ?? []).map((d) => ({
      key: d.key,
      label: d.label ?? "",
      fileType: d.fileType ?? "",
      assetId: d.assetId ?? null,
      url: d.url ?? null,
      uploading: false,
      error: null,
    })),
    categoryIds: r.categoryIds ?? [],
    collectionIds: r.collectionIds ?? [],
    seriesOrder: r.seriesOrder != null ? String(r.seriesOrder) : "",
    tags: r.tags ?? [],
    servicesProvided: r.servicesProvided ?? [],
    equipmentUsed: r.equipmentUsed ?? [],
    story: r.story ?? "",
    objective: r.objective ?? "",
    strategy: r.strategy ?? "",
    challenges: r.challenges ?? "",
    solution: r.solution ?? "",
    process: r.process ?? "",
    results: r.results ?? "",
    deliverables: r.deliverables ?? [],
    awards: (r.awards ?? []).map((a) => ({ key: a.key, title: a.title ?? "", issuer: a.issuer ?? "", year: a.year != null ? String(a.year) : "" })),
    publications: (r.publications ?? []).map((p) => ({ key: p.key, name: p.name ?? "", url: p.url ?? "", year: p.year != null ? String(p.year) : "" })),
    showCollaborationCredits: r.showCollaborationCredits ?? false,
    collaborators: (r.collaborators ?? []).map((c) => ({ key: c.key, name: c.name ?? "", role: c.role ?? "" })),
    testimonialIds: r.testimonialIds ?? [],
    relatedProjectIds: r.relatedProjectIds ?? [],
    seoTitle: r.seoTitle ?? "",
    seoDescription: r.seoDescription ?? "",
  };
}
