import type { FormState, GalleryItemPresentation } from "./PortfolioProjectForm";

// Raw shape from portfolioProjectEditQuery — loosely typed on purpose
// (see getPortfolioProjectForEdit's own comment); this is the one place
// that shape gets turned into something FormState-compatible.
type RawImage = { assetId?: string | null; url?: string | null; alt?: string | null; hotspotX?: number | null; hotspotY?: number | null };
type RawGalleryItem = RawImage & {
  key: string;
  caption?: string | null;
  productionNotes?: string | null;
  presentation?: string | null;
};

function toImgState(raw?: RawImage | null) {
  return {
    assetId: raw?.assetId ?? null,
    url: raw?.url ?? null,
    alt: raw?.alt ?? "",
    hotspotX: raw?.hotspotX ?? 0.5,
    hotspotY: raw?.hotspotY ?? 0.5,
    uploading: false,
    progress: 0,
    error: null,
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
    videos?: { type: string; url?: string; alt?: string }[];
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
    videos: (r.videos ?? [])
      .filter((v) => v.type === "embed")
      .map((v) => ({ key: `${v.url}`, url: v.url ?? "", alt: v.alt ?? "" })),
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
    collaborators: (r.collaborators ?? []).map((c) => ({ key: c.key, name: c.name ?? "", role: c.role ?? "" })),
    testimonialIds: r.testimonialIds ?? [],
    relatedProjectIds: r.relatedProjectIds ?? [],
    seoTitle: r.seoTitle ?? "",
    seoDescription: r.seoDescription ?? "",
  };
}
