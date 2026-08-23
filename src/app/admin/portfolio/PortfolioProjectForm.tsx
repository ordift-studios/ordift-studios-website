"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { compressImageFile } from "@/lib/media/clientImageCompress";
import { getPublishReadiness } from "@/lib/admin/portfolioValidation";
import {
  checkSlugAvailableAction,
  createCategoryInlineAction,
  createCollectionInlineAction,
  createProjectDraftAction,
  saveProjectFieldsAction,
} from "./actions";
import type { Category, Collection, Testimonial } from "@/lib/content/types";

// Native Portfolio Project creator/editor (2026-08-05) — the one Client
// Component of any real size in the Portfolio Management System.
// Everything Sanity-facing goes through saveProjectFieldsAction /
// createProjectDraftAction (server actions) or the /api/admin/portfolio/
// assets route handler — this component never holds a Sanity token,
// only ever an asset id + preview URL handed back after upload.
//
// Deliberately out of scope here, left to Sanity Studio (see
// MILESTONES.md's native-editor entry for the full reasoning): direct
// video FILE upload (embed URLs are fully native), the before/after
// gallery, relatedWorkshopIds, and SEO ogImage/canonicalUrl.

type ImgState = {
  assetId: string | null;
  url: string | null;
  alt: string;
  hotspotX: number;
  hotspotY: number;
  uploading: boolean;
  progress: number;
  error: string | null;
  // Main Film support (2026-08-23, Videography) — "image" is the
  // default and every other discipline's behavior is unchanged;
  // "embed" lets a project's Hero Media be a YouTube/Vimeo video
  // instead, mirroring the existing Additional Films/Reels embed-URL
  // pattern. Native video file upload for the hero is deliberately out
  // of scope here — same reasoning as Additional Films/Reels below.
  mediaType: "image" | "embed";
  embedUrl: string;
};

// Photography adaptive justified gallery (2026-08-23) — optional
// per-image layout hint. "automatic" is the default and does nothing
// special; every other value only affects Photography's own gallery
// (src/components/portfolio/JustifiedPhotoGallery.tsx) — every other
// discipline ignores this field entirely.
export type GalleryItemPresentation = "automatic" | "featured" | "wide" | "portrait-pair" | "standard";

type GalleryItem = {
  key: string;
  assetId: string | null;
  url: string | null;
  alt: string;
  caption: string;
  // Internal-only — never sent to public-facing queries/pages. See
  // src/sanity/schemaTypes/objects/galleryImage.ts and the deliberate
  // omission from galleryImageFragment in groqFragments.ts.
  productionNotes: string;
  presentation: GalleryItemPresentation;
  hotspotX: number;
  hotspotY: number;
  uploading: boolean;
  progress: number;
  error: string | null;
};

// Shared by Additional Films ("videos") and Reels — a poster is
// optional per item (2026-08-23, Videography): shown before playback
// instead of the video's often-black first frame. Falls back to the
// project's own Portfolio Cover Image, then a placeholder, when unset
// — see VideoPlayer.tsx.
type VideoItem = {
  key: string;
  url: string;
  alt: string;
  posterAssetId: string | null;
  posterUrl: string | null;
  posterAlt: string;
  posterUploading: boolean;
  posterError: string | null;
};
type DownloadItem = {
  key: string;
  label: string;
  fileType: string;
  assetId: string | null;
  url: string | null;
  uploading: boolean;
  error: string | null;
};
type CollaboratorItem = { key: string; name: string; role: string };
type AwardItem = { key: string; title: string; issuer: string; year: string };
type PublicationItem = { key: string; name: string; url: string; year: string };

export type FormState = {
  title: string;
  slug: string;
  slugTouched: boolean;
  disciplines: string[];
  year: string;
  location: string;
  client: string;
  isPasswordProtected: boolean;
  hero: ImgState;
  gallery: GalleryItem[];
  behindTheScenes: GalleryItem[];
  videos: VideoItem[]; // "Additional Films" on the public Videography page
  reels: VideoItem[];
  downloads: DownloadItem[];
  categoryIds: string[];
  collectionIds: string[];
  seriesOrder: string;
  tags: string[];
  servicesProvided: string[];
  equipmentUsed: string[];
  story: string;
  objective: string;
  strategy: string;
  challenges: string;
  solution: string;
  process: string;
  results: string;
  deliverables: string[];
  awards: AwardItem[];
  publications: PublicationItem[];
  showCollaborationCredits: boolean;
  collaborators: CollaboratorItem[];
  testimonialIds: string[];
  relatedProjectIds: string[];
  seoTitle: string;
  seoDescription: string;
};

const DISCIPLINES = [
  "photography",
  "videography",
  "graphic-design",
  "branding",
  "content-creation",
  "talent-management",
  "production",
] as const;

const DISCIPLINE_LABELS: Record<string, string> = {
  photography: "Photography",
  videography: "Videography",
  "graphic-design": "Graphic Design",
  branding: "Branding & Strategy",
  "content-creation": "Content Creation",
  "talent-management": "Talent Management",
  production: "Production Services",
};

const STEPS = [
  "Project Basics",
  "Media",
  "Categories & Organisation",
  "Case Study",
  "Team & Deliverables",
  "SEO & Publication",
  "Review & Preview",
];

function newKey(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `k${Date.now()}${Math.random()}`;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function parseTagInput(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function emptyImg(): ImgState {
  return {
    assetId: null,
    url: null,
    alt: "",
    hotspotX: 0.5,
    hotspotY: 0.5,
    uploading: false,
    progress: 0,
    error: null,
    mediaType: "image",
    embedUrl: "",
  };
}

function emptyVideoItem(): VideoItem {
  return {
    key: newKey(),
    url: "",
    alt: "",
    posterAssetId: null,
    posterUrl: null,
    posterAlt: "",
    posterUploading: false,
    posterError: null,
  };
}

function uploadAsset(
  file: File,
  kind: "image" | "file",
  onProgress: (pct: number) => void
): Promise<{ assetId: string; url: string; width: number | null; height: number | null }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/portfolio/assets");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data.ok) resolve(data);
        else reject(new Error(data.error === "file-too-large" ? "File is too large." : "Upload failed."));
      } catch {
        reject(new Error("Upload failed."));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
    const fd = new FormData();
    fd.append("kind", kind);
    fd.append("file", file);
    xhr.send(fd);
  });
}

function mediaAssetField(img: ImgState) {
  if (img.mediaType === "embed") {
    if (!img.embedUrl) return null;
    return { _type: "mediaAsset", type: "embed", alt: img.alt, url: img.embedUrl };
  }
  if (!img.assetId) return null;
  return {
    _type: "mediaAsset",
    type: "image",
    alt: img.alt,
    image: {
      _type: "image",
      asset: { _type: "reference", _ref: img.assetId },
      hotspot: { _type: "sanity.imageHotspot", x: img.hotspotX, y: img.hotspotY, height: 0.5, width: 0.5 },
    },
  };
}

// Additional Films ("videos") and Reels share this exact shape — each
// item is always an embed (native video-file upload is out of scope
// for this increment; see the Admin UI's own note), with an optional
// per-item poster reusing the same asset-reference + hotspot pattern
// as every other image field in this form.
function videoItemsField(items: VideoItem[]) {
  return items
    .filter((i) => i.url)
    .map((i) => ({
      _type: "mediaAsset",
      _key: i.key,
      type: "embed",
      url: i.url,
      alt: i.alt,
      ...(i.posterAssetId
        ? {
            poster: {
              _type: "image",
              asset: { _type: "reference", _ref: i.posterAssetId },
              hotspot: { _type: "sanity.imageHotspot", x: 0.5, y: 0.5, height: 0.5, width: 0.5 },
            },
            posterAlt: i.posterAlt,
          }
        : {}),
    }));
}

function galleryField(items: GalleryItem[]) {
  return items
    .filter((i) => i.assetId)
    .map((i) => ({
      _type: "galleryImage",
      _key: i.key,
      alt: i.alt,
      caption: i.caption || undefined,
      productionNotes: i.productionNotes || undefined,
      presentation: i.presentation !== "automatic" ? i.presentation : undefined,
      image: {
        _type: "image",
        asset: { _type: "reference", _ref: i.assetId },
        hotspot: { _type: "sanity.imageHotspot", x: i.hotspotX, y: i.hotspotY, height: 0.5, width: 0.5 },
      },
    }));
}

// --- Small reusable pieces -------------------------------------------------

function FocalPointPicker({ url, x, y, onChange }: { url: string; x: number; y: number; onChange: (x: number, y: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  function handleClick(e: React.MouseEvent) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    onChange((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
  }
  return (
    <div
      ref={ref}
      onClick={handleClick}
      className="relative rounded-lg overflow-hidden border border-black/15 cursor-crosshair w-full max-w-xs aspect-[4/3] bg-black/5"
      title="Click to set the focal point"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="w-full h-full object-cover pointer-events-none" />
      <div
        className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full border-2 border-ordift-gold bg-white/70 pointer-events-none"
        style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
      />
    </div>
  );
}

function ImageDropZone({
  img,
  onFile,
  label,
}: {
  img: ImgState;
  onFile: (file: File) => void;
  label: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) onFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        className={`rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
          dragOver ? "border-ordift-gold bg-ordift-gold/5" : "border-black/15 hover:border-black/30"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = "";
          }}
        />
        {img.uploading ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">Uploading… {img.progress}%</p>
        ) : img.url ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">Drag a new file here, or click to replace {label}.</p>
        ) : (
          <p className="font-sans text-body-small text-ordift-ink-muted">Drag {label} here, or click to browse.</p>
        )}
      </div>
      {img.error && <p className="font-sans text-caption text-red-700">{img.error}</p>}
    </div>
  );
}

export default function PortfolioProjectForm({
  mode,
  projectId: initialProjectId,
  initialState,
  categories,
  collections,
  testimonials,
  otherProjects,
  canPublish,
}: {
  mode: "create" | "edit";
  projectId?: string;
  initialState?: Partial<FormState>;
  categories: Category[];
  collections: Collection[];
  testimonials: Testimonial[];
  otherProjects: { id: string; title: string }[];
  // Whoever holds the Portfolio "publish" capability (currently
  // super_admin/admin) never gets blocked by missing alt text here —
  // mirrors the server-side check in actions.ts so this live preview
  // never shows a false blocker. See src/lib/admin/portfolioValidation.ts.
  canPublish: boolean;
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState<string | null>(initialProjectId ?? null);
  const [step, setStep] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");

  const [form, setForm] = useState<FormState>(() => ({
    title: "",
    slug: "",
    slugTouched: false,
    disciplines: [],
    year: "",
    location: "",
    client: "",
    isPasswordProtected: false,
    hero: emptyImg(),
    gallery: [],
    behindTheScenes: [],
    videos: [],
    reels: [],
    downloads: [],
    categoryIds: [],
    collectionIds: [],
    seriesOrder: "",
    tags: [],
    servicesProvided: [],
    equipmentUsed: [],
    story: "",
    objective: "",
    strategy: "",
    challenges: "",
    solution: "",
    process: "",
    results: "",
    deliverables: [],
    awards: [],
    publications: [],
    showCollaborationCredits: false,
    collaborators: [],
    testimonialIds: [],
    relatedProjectIds: [],
    seoTitle: "",
    seoDescription: "",
    ...initialState,
  }));

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }

  // Unsaved-change warning — only wired for real browser navigation away
  // from the tab/window; in-app "Back to Portfolio" links still go
  // through React state, not a full unload, so this deliberately only
  // covers the case the browser itself can intercept.
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Live slug availability check, debounced.
  useEffect(() => {
    if (!form.slug) {
      setSlugStatus("idle");
      return;
    }
    setSlugStatus("checking");
    const t = setTimeout(async () => {
      const available = await checkSlugAvailableAction(form.slug, projectId ?? undefined);
      setSlugStatus(available ? "available" : "taken");
    }, 400);
    return () => clearTimeout(t);
  }, [form.slug, projectId]);

  function toSanityFields(scope: "basics" | "media" | "org" | "case-study" | "team" | "seo" | "all"): Record<string, unknown> {
    const fields: Record<string, unknown> = {};
    const yearNum = form.year ? Number(form.year) : null;
    const seriesOrderNum = form.seriesOrder ? Number(form.seriesOrder) : null;

    if (scope === "basics" || scope === "all") {
      fields.title = form.title;
      fields.slug = { _type: "slug", current: form.slug };
      fields.disciplines = form.disciplines;
      fields.year = yearNum;
      fields.location = form.location || undefined;
      fields.client = form.client || undefined;
      fields.isPasswordProtected = form.isPasswordProtected;
    }
    if (scope === "media" || scope === "all") {
      const hero = mediaAssetField(form.hero);
      if (hero) fields.heroMedia = hero;
      fields.gallery = galleryField(form.gallery);
      fields.behindTheScenesGallery = galleryField(form.behindTheScenes);
      fields.videos = videoItemsField(form.videos);
      fields.reels = videoItemsField(form.reels);
      fields.downloadableAssets = form.downloads
        .filter((d) => d.assetId)
        .map((d) => ({
          _type: "downloadableAsset",
          _key: d.key,
          label: d.label,
          fileType: d.fileType,
          file: { _type: "file", asset: { _type: "reference", _ref: d.assetId } },
        }));
    }
    if (scope === "org" || scope === "all") {
      fields.categories = form.categoryIds.map((id) => ({ _type: "reference", _ref: id, _key: id }));
      fields.collections = form.collectionIds.map((id) => ({ _type: "reference", _ref: id, _key: id }));
      fields.seriesOrder = seriesOrderNum;
      fields.tags = form.tags;
      fields.servicesProvided = form.servicesProvided;
      fields.equipmentUsed = form.equipmentUsed;
    }
    if (scope === "case-study" || scope === "all") {
      fields.story = form.story;
      fields.objective = form.objective || undefined;
      fields.strategy = form.strategy || undefined;
      fields.challenges = form.challenges || undefined;
      fields.solution = form.solution || undefined;
      fields.process = form.process || undefined;
      fields.results = form.results || undefined;
      fields.deliverables = form.deliverables;
      fields.awards = form.awards.map((a) => ({
        _type: "award",
        _key: a.key,
        title: a.title,
        issuer: a.issuer,
        year: a.year ? Number(a.year) : undefined,
      }));
      fields.publications = form.publications.map((p) => ({
        _type: "publication",
        _key: p.key,
        name: p.name,
        url: p.url || undefined,
        year: p.year ? Number(p.year) : undefined,
      }));
    }
    if (scope === "team" || scope === "all") {
      fields.showCollaborationCredits = form.showCollaborationCredits;
      fields.collaborators = form.collaborators.map((c) => ({ _type: "collaborator", _key: c.key, name: c.name, role: c.role }));
      fields.testimonials = form.testimonialIds.map((id) => ({ _type: "reference", _ref: id, _key: id }));
      fields.relatedProjects = form.relatedProjectIds.map((id) => ({ _type: "reference", _ref: id, _key: id }));
    }
    if (scope === "seo" || scope === "all") {
      fields.seo = {
        _type: "seo",
        metaTitle: form.seoTitle || undefined,
        metaDescription: form.seoDescription || undefined,
      };
    }
    return fields;
  }

  const save = useCallback(
    async (scope: Parameters<typeof toSanityFields>[0]): Promise<boolean> => {
      setSaving(true);
      setSaveError(null);
      try {
        if (!projectId) {
          if (!form.title.trim() || !form.slug.trim()) {
            setSaveError("Title and slug are required before the project can be saved.");
            return false;
          }
          const result = await createProjectDraftAction(form.title, form.slug);
          if (!result.ok) {
            setSaveError(result.error);
            return false;
          }
          setProjectId(result.id);
          const rest = toSanityFields("all");
          delete rest.title;
          delete rest.slug;
          if (Object.keys(rest).length > 0) await saveProjectFieldsAction(result.id, rest);
        } else {
          const result = await saveProjectFieldsAction(projectId, toSanityFields(scope));
          if (!result.ok) {
            setSaveError(result.error);
            return false;
          }
        }
        setDirty(false);
        setSaveSuccess("Saved.");
        setTimeout(() => setSaveSuccess(null), 2000);
        return true;
      } catch {
        setSaveError("Something went wrong saving this project. Please try again.");
        return false;
      } finally {
        setSaving(false);
      }
    },
    // toSanityFields is a plain closure over `form`/`projectId` (both
    // listed here already), recreated every render — not stateful, so
    // omitting it doesn't risk a stale closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, form]
  );

  async function goToStep(next: number) {
    const scopes: Parameters<typeof toSanityFields>[0][] = ["basics", "media", "org", "case-study", "team", "seo", "all"];
    const ok = await save(scopes[step] ?? "all");
    if (ok) setStep(next);
  }

  async function handleHeroFile(file: File) {
    setForm((f) => ({ ...f, hero: { ...f.hero, uploading: true, error: null, progress: 0 } }));
    try {
      const compressed = file.type.startsWith("image/") ? await compressImageFile(file) : file;
      const asset = await uploadAsset(compressed, "image", (p) =>
        setForm((f) => ({ ...f, hero: { ...f.hero, progress: p } }))
      );
      setForm((f) => ({
        ...f,
        hero: { ...f.hero, assetId: asset.assetId, url: asset.url, uploading: false, progress: 100 },
      }));
      setDirty(true);
    } catch (err) {
      setForm((f) => ({ ...f, hero: { ...f.hero, uploading: false, error: (err as Error).message } }));
    }
  }

  // Poster upload for one Additional Film/Reel item (2026-08-23,
  // Videography) — mirrors handleHeroFile's compress-then-upload
  // pattern exactly, just scoped to one array item by key instead of
  // the single hero field.
  async function handleVideoItemPosterFile(target: "videos" | "reels", key: string, file: File) {
    setForm((f) => ({
      ...f,
      [target]: f[target].map((v) => (v.key === key ? { ...v, posterUploading: true, posterError: null } : v)),
    }));
    try {
      const compressed = await compressImageFile(file);
      const asset = await uploadAsset(compressed, "image", () => {});
      setForm((f) => ({
        ...f,
        [target]: f[target].map((v) =>
          v.key === key ? { ...v, posterAssetId: asset.assetId, posterUrl: asset.url, posterUploading: false } : v
        ),
      }));
      setDirty(true);
    } catch (err) {
      setForm((f) => ({
        ...f,
        [target]: f[target].map((v) => (v.key === key ? { ...v, posterUploading: false, posterError: (err as Error).message } : v)),
      }));
    }
  }

  async function handleGalleryFiles(files: FileList, target: "gallery" | "behindTheScenes") {
    for (const file of Array.from(files)) {
      const key = newKey();
      const item: GalleryItem = { key, assetId: null, url: null, alt: "", caption: "", productionNotes: "", presentation: "automatic", hotspotX: 0.5, hotspotY: 0.5, uploading: true, progress: 0, error: null };
      setForm((f) => ({ ...f, [target]: [...f[target], item] }));
      try {
        const compressed = await compressImageFile(file);
        const asset = await uploadAsset(compressed, "image", (p) =>
          setForm((f) => ({ ...f, [target]: f[target].map((g) => (g.key === key ? { ...g, progress: p } : g)) }))
        );
        setForm((f) => ({
          ...f,
          [target]: f[target].map((g) => (g.key === key ? { ...g, assetId: asset.assetId, url: asset.url, uploading: false } : g)),
        }));
        setDirty(true);
      } catch (err) {
        setForm((f) => ({
          ...f,
          [target]: f[target].map((g) => (g.key === key ? { ...g, uploading: false, error: (err as Error).message } : g)),
        }));
      }
    }
  }

  function reorderGallery(target: "gallery" | "behindTheScenes", fromIdx: number, toIdx: number) {
    setForm((f) => {
      const list = [...f[target]];
      const [moved] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, moved);
      return { ...f, [target]: list };
    });
    setDirty(true);
  }

  async function handleDownloadFile(key: string, file: File) {
    setForm((f) => ({ ...f, downloads: f.downloads.map((d) => (d.key === key ? { ...d, uploading: true, error: null } : d)) }));
    try {
      const asset = await uploadAsset(file, "file", () => {});
      setForm((f) => ({
        ...f,
        downloads: f.downloads.map((d) => (d.key === key ? { ...d, assetId: asset.assetId, url: asset.url, uploading: false } : d)),
      }));
      setDirty(true);
    } catch (err) {
      setForm((f) => ({
        ...f,
        downloads: f.downloads.map((d) => (d.key === key ? { ...d, uploading: false, error: (err as Error).message } : d)),
      }));
    }
  }

  const readiness = useMemo(
    () =>
      getPublishReadiness(
        {
          title: form.title,
          slug: form.slug,
          heroMedia: { url: form.hero.url, type: "image", alt: form.hero.alt },
          story: form.story,
          categoryIds: form.categoryIds,
          seo: { metaTitle: form.seoTitle || null, metaDescription: form.seoDescription || null, ogImageUrl: null, canonicalUrl: null },
          gallery: form.gallery.map((g) => ({ id: g.key, url: g.url, alt: g.alt, caption: g.caption || null })),
          tags: form.tags,
          client: form.client,
        },
        { skipAltTextCheck: canPublish }
      ),
    [form, canPublish]
  );

  const isFirstStep = step === 0;
  const isLastStep = step === STEPS.length - 1;

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <button
          type="button"
          onClick={() => router.push("/admin/portfolio")}
          className="font-sans text-caption text-ordift-ink-muted hover:text-ordift-ink"
        >
          ← Portfolio
        </button>
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink mt-3">
          {mode === "create" ? "New Project" : `Edit: ${form.title || "Untitled"}`}
        </h1>
      </div>

      <ol className="flex flex-wrap gap-2">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => goToStep(i)}
              className={`font-sans text-caption font-medium px-3 py-1.5 rounded-full border ${
                i === step ? "border-ordift-navy-950 bg-ordift-navy-950 text-white" : "border-black/15 text-ordift-ink-muted"
              }`}
            >
              {i + 1}. {label}
            </button>
          </li>
        ))}
      </ol>

      <div className="rounded-xl border border-black/10 bg-white p-6 space-y-6">
        {step === 0 && (
          <div className="space-y-5">
            <div>
              <label className="block font-sans text-body-small font-medium text-ordift-ink mb-1">Title *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => {
                  const title = e.target.value;
                  setForm((f) => ({ ...f, title, slug: f.slugTouched ? f.slug : slugify(title) }));
                  setDirty(true);
                }}
                className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
              />
            </div>
            <div>
              <label className="block font-sans text-body-small font-medium text-ordift-ink mb-1">Slug *</label>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => {
                  update("slug", slugify(e.target.value));
                  setForm((f) => ({ ...f, slugTouched: true }));
                }}
                className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
              />
              <p className="font-sans text-caption mt-1 text-ordift-ink-muted">
                {slugStatus === "checking" && "Checking availability…"}
                {slugStatus === "available" && <span className="text-emerald-700">Available</span>}
                {slugStatus === "taken" && <span className="text-red-700">Already in use — choose another.</span>}
                {form.slug && ` — will be published at /work/${form.slug}`}
              </p>
            </div>
            <div>
              <p className="font-sans text-body-small font-medium text-ordift-ink mb-2">Disciplines</p>
              <div className="flex flex-wrap gap-2">
                {DISCIPLINES.map((d) => (
                  <label key={d} className="flex items-center gap-1.5 font-sans text-caption text-ordift-ink">
                    <input
                      type="checkbox"
                      checked={form.disciplines.includes(d)}
                      onChange={(e) =>
                        update(
                          "disciplines",
                          e.target.checked ? [...form.disciplines, d] : form.disciplines.filter((x) => x !== d)
                        )
                      }
                    />
                    {DISCIPLINE_LABELS[d]}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-sans text-body-small font-medium text-ordift-ink mb-1">Year</label>
                <input
                  type="number"
                  value={form.year}
                  onChange={(e) => update("year", e.target.value)}
                  className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
                />
              </div>
              <div>
                <label className="block font-sans text-body-small font-medium text-ordift-ink mb-1">Location</label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => update("location", e.target.value)}
                  className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
                />
              </div>
            </div>
            <div>
              <label className="block font-sans text-body-small font-medium text-ordift-ink mb-1">Client</label>
              <input
                type="text"
                value={form.client}
                onChange={(e) => update("client", e.target.value)}
                placeholder="Leave blank unless the client has given permission to be named"
                className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
              />
            </div>
            <label className="flex items-center gap-2 font-sans text-body-small text-ordift-ink">
              <input type="checkbox" checked={form.isPasswordProtected} onChange={(e) => update("isPasswordProtected", e.target.checked)} />
              Client Access Only (metadata flag — no enforcement yet)
            </label>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-8">
            <div>
              <h2 className="font-serif font-medium text-body text-ordift-ink mb-1">Hero Media *</h2>
              <p className="font-sans text-caption text-ordift-ink-muted mb-3">
                For a Videography project, this is the project&apos;s Main Film. Switch to Video Embed URL below —
                the Poster shown before Play reuses this project&apos;s own Portfolio Cover Image (set further down
                in Review &amp; Preview, or from Admin → Portfolio on the project&apos;s detail page).
              </p>
              <div className="flex gap-4 mb-3">
                <label className="flex items-center gap-1.5 font-sans text-body-small text-ordift-ink">
                  <input
                    type="radio"
                    checked={form.hero.mediaType === "image"}
                    onChange={() => setForm((f) => ({ ...f, hero: { ...f.hero, mediaType: "image" } }))}
                  />
                  Image
                </label>
                <label className="flex items-center gap-1.5 font-sans text-body-small text-ordift-ink">
                  <input
                    type="radio"
                    checked={form.hero.mediaType === "embed"}
                    onChange={() => setForm((f) => ({ ...f, hero: { ...f.hero, mediaType: "embed" } }))}
                  />
                  Video Embed URL
                </label>
              </div>

              {form.hero.mediaType === "image" ? (
                <>
                  <ImageDropZone img={form.hero} label="the hero image" onFile={handleHeroFile} />
                  {form.hero.url && (
                    <div className="grid sm:grid-cols-2 gap-4 mt-3">
                      <FocalPointPicker
                        url={form.hero.url}
                        x={form.hero.hotspotX}
                        y={form.hero.hotspotY}
                        onChange={(x, y) => {
                          setForm((f) => ({ ...f, hero: { ...f.hero, hotspotX: x, hotspotY: y } }));
                          setDirty(true);
                        }}
                      />
                      <div>
                        <label className="block font-sans text-body-small font-medium text-ordift-ink mb-1">Alt text *</label>
                        <input
                          type="text"
                          value={form.hero.alt}
                          onChange={(e) => {
                            setForm((f) => ({ ...f, hero: { ...f.hero, alt: e.target.value } }));
                            setDirty(true);
                          }}
                          className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
                        />
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-sans text-body-small font-medium text-ordift-ink mb-1">Embed URL *</label>
                    <input
                      type="url"
                      placeholder="https://youtube.com/watch?v=…"
                      value={form.hero.embedUrl}
                      onChange={(e) => {
                        setForm((f) => ({ ...f, hero: { ...f.hero, embedUrl: e.target.value } }));
                        setDirty(true);
                      }}
                      className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
                    />
                  </div>
                  <div>
                    <label className="block font-sans text-body-small font-medium text-ordift-ink mb-1">Alt text *</label>
                    <input
                      type="text"
                      placeholder="e.g. Sampson & Sadia's wedding film"
                      value={form.hero.alt}
                      onChange={(e) => {
                        setForm((f) => ({ ...f, hero: { ...f.hero, alt: e.target.value } }));
                        setDirty(true);
                      }}
                      className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
                    />
                  </div>
                </div>
              )}
            </div>

            <GalleryEditor
              title="Gallery"
              items={form.gallery}
              onFiles={(files) => handleGalleryFiles(files, "gallery")}
              onReorder={(a, b) => reorderGallery("gallery", a, b)}
              onUpdateItem={(key, patch) =>
                setForm((f) => ({ ...f, gallery: f.gallery.map((g) => (g.key === key ? { ...g, ...patch } : g)) }))
              }
              onRemove={(key) => setForm((f) => ({ ...f, gallery: f.gallery.filter((g) => g.key !== key) }))}
              canPublish={canPublish}
            />

            <GalleryEditor
              title="Behind the Scenes Gallery"
              items={form.behindTheScenes}
              onFiles={(files) => handleGalleryFiles(files, "behindTheScenes")}
              onReorder={(a, b) => reorderGallery("behindTheScenes", a, b)}
              onUpdateItem={(key, patch) =>
                setForm((f) => ({ ...f, behindTheScenes: f.behindTheScenes.map((g) => (g.key === key ? { ...g, ...patch } : g)) }))
              }
              onRemove={(key) => setForm((f) => ({ ...f, behindTheScenes: f.behindTheScenes.filter((g) => g.key !== key) }))}
              canPublish={canPublish}
            />

            <VideoItemEditor
              title="Additional Films (Videography)"
              helperText="Optional — Trailer, Teaser, Alternate Cut, Interview, etc. Embed URLs only (YouTube, Vimeo, etc.); direct video file upload still requires Sanity Studio. Leave empty if this project has none."
              addLabel="+ Add Additional Film"
              items={form.videos}
              onUpdateItem={(key, patch) => setForm((f) => ({ ...f, videos: f.videos.map((v) => (v.key === key ? { ...v, ...patch } : v)) }))}
              onAdd={() => setForm((f) => ({ ...f, videos: [...f.videos, emptyVideoItem()] }))}
              onRemove={(key) => setForm((f) => ({ ...f, videos: f.videos.filter((v) => v.key !== key) }))}
              onPosterFile={(key, file) => handleVideoItemPosterFile("videos", key, file)}
            />

            <VideoItemEditor
              title="Reels / Short Cuts (Videography)"
              helperText="Optional short-form/vertical video. Embed URLs only. Leave empty if this project has none."
              addLabel="+ Add Reel"
              items={form.reels}
              onUpdateItem={(key, patch) => setForm((f) => ({ ...f, reels: f.reels.map((v) => (v.key === key ? { ...v, ...patch } : v)) }))}
              onAdd={() => setForm((f) => ({ ...f, reels: [...f.reels, emptyVideoItem()] }))}
              onRemove={(key) => setForm((f) => ({ ...f, reels: f.reels.filter((v) => v.key !== key) }))}
              onPosterFile={(key, file) => handleVideoItemPosterFile("reels", key, file)}
            />

            <div>
              <h2 className="font-serif font-medium text-body text-ordift-ink mb-1">Downloadable Assets</h2>
              <p className="font-sans text-caption text-ordift-ink-muted mb-3">Small files only (press kits, PDFs) — larger files still require Sanity Studio.</p>
              {form.downloads.map((d) => (
                <div key={d.key} className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    placeholder="Label"
                    value={d.label}
                    onChange={(e) => update("downloads", form.downloads.map((x) => (x.key === d.key ? { ...x, label: e.target.value } : x)))}
                    className="w-40 rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
                  />
                  <input
                    type="text"
                    placeholder="Type (PDF, ZIP…)"
                    value={d.fileType}
                    onChange={(e) => update("downloads", form.downloads.map((x) => (x.key === d.key ? { ...x, fileType: e.target.value } : x)))}
                    className="w-28 rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
                  />
                  {d.url ? (
                    <span className="font-sans text-caption text-emerald-700">Uploaded</span>
                  ) : (
                    <label className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4 cursor-pointer">
                      {d.uploading ? "Uploading…" : "Choose file"}
                      <input
                        type="file"
                        accept="application/pdf,application/zip"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleDownloadFile(d.key, file);
                        }}
                      />
                    </label>
                  )}
                  {d.error && <span className="font-sans text-caption text-red-700">{d.error}</span>}
                  <button type="button" onClick={() => update("downloads", form.downloads.filter((x) => x.key !== d.key))} className="font-sans text-caption text-red-700">
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => update("downloads", [...form.downloads, { key: newKey(), label: "", fileType: "", assetId: null, url: null, uploading: false, error: null }])}
                className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4"
              >
                + Add downloadable asset
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <CheckboxCreateList
              title="Categories"
              options={categories}
              selected={form.categoryIds}
              onChange={(ids) => update("categoryIds", ids)}
              createLabel="+ New category"
              onCreated={(id) => update("categoryIds", [...form.categoryIds, id])}
              kind="category"
            />
            <CheckboxCreateList
              title="Collections / Series"
              options={collections}
              selected={form.collectionIds}
              onChange={(ids) => update("collectionIds", ids)}
              createLabel="+ New collection"
              onCreated={(id) => update("collectionIds", [...form.collectionIds, id])}
              kind="collection"
            />
            {form.collectionIds.some((id) => collections.find((c) => c.id === id)?.isOrdered) && (
              <div>
                <label className="block font-sans text-body-small font-medium text-ordift-ink mb-1">Series Order</label>
                <input
                  type="number"
                  value={form.seriesOrder}
                  onChange={(e) => update("seriesOrder", e.target.value)}
                  className="w-32 rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
                />
              </div>
            )}
            <TagField label="Tags" values={form.tags} onChange={(v) => update("tags", v)} />
            <TagField label="Services Provided" values={form.servicesProvided} onChange={(v) => update("servicesProvided", v)} />
            <TagField label="Equipment Used" values={form.equipmentUsed} onChange={(v) => update("equipmentUsed", v)} />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <TextAreaField label="Project Story / Summary *" value={form.story} onChange={(v) => update("story", v)} rows={5} />
            <TextAreaField label="Objective" value={form.objective} onChange={(v) => update("objective", v)} />
            <TextAreaField label="Creative Strategy" value={form.strategy} onChange={(v) => update("strategy", v)} />
            <TextAreaField label="Challenges" value={form.challenges} onChange={(v) => update("challenges", v)} />
            <TextAreaField label="Solution" value={form.solution} onChange={(v) => update("solution", v)} />
            <TextAreaField label="Creative Process" value={form.process} onChange={(v) => update("process", v)} />
            <TextAreaField label="Results & Impact" value={form.results} onChange={(v) => update("results", v)} />
            <TagField label="Deliverables" values={form.deliverables} onChange={(v) => update("deliverables", v)} />

            <RepeaterFields
              title="Awards"
              items={form.awards}
              onChange={(items) => update("awards", items)}
              newItem={() => ({ key: newKey(), title: "", issuer: "", year: "" })}
              fields={[
                { key: "title", placeholder: "Award title" },
                { key: "issuer", placeholder: "Issuer" },
                { key: "year", placeholder: "Year", type: "number", narrow: true },
              ]}
            />
            <RepeaterFields
              title="Publications"
              items={form.publications}
              onChange={(items) => update("publications", items)}
              newItem={() => ({ key: newKey(), name: "", url: "", year: "" })}
              fields={[
                { key: "name", placeholder: "Publication name" },
                { key: "url", placeholder: "URL" },
                { key: "year", placeholder: "Year", type: "number", narrow: true },
              ]}
            />
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <label className="flex items-start gap-2 font-sans text-body-small text-ordift-ink">
              <input
                type="checkbox"
                checked={form.showCollaborationCredits}
                onChange={(e) => update("showCollaborationCredits", e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Show Collaboration / Extended Credits publicly
                <span className="block font-sans text-caption text-ordift-ink-muted">
                  Off by default — ordinary client work stays minimal. Turn on for collaborative projects, workshops,
                  journal/editorial pieces, or productions involving another creative/production house — only then
                  does the Collaborators list below appear on the public page.
                </span>
              </span>
            </label>
            <RepeaterFields
              title="Collaborators"
              items={form.collaborators}
              onChange={(items) => update("collaborators", items)}
              newItem={() => ({ key: newKey(), name: "", role: "" })}
              fields={[
                { key: "name", placeholder: "Name" },
                { key: "role", placeholder: "Role (Photographer, Stylist…)" },
              ]}
            />
            <div>
              <p className="font-sans text-body-small font-medium text-ordift-ink mb-2">Testimonials</p>
              {testimonials.length === 0 && <p className="font-sans text-caption text-ordift-ink-muted">None available yet.</p>}
              {testimonials.map((t) => (
                <label key={t.id} className="flex items-start gap-2 font-sans text-caption text-ordift-ink mb-1">
                  <input
                    type="checkbox"
                    checked={form.testimonialIds.includes(t.id)}
                    onChange={(e) =>
                      update("testimonialIds", e.target.checked ? [...form.testimonialIds, t.id] : form.testimonialIds.filter((x) => x !== t.id))
                    }
                  />
                  <span>&ldquo;{t.quote}&rdquo; — {t.authorName}</span>
                </label>
              ))}
            </div>
            <div>
              <p className="font-sans text-body-small font-medium text-ordift-ink mb-2">Related Projects</p>
              {otherProjects.length === 0 && <p className="font-sans text-caption text-ordift-ink-muted">None available yet.</p>}
              {otherProjects.map((p) => (
                <label key={p.id} className="flex items-center gap-2 font-sans text-caption text-ordift-ink mb-1">
                  <input
                    type="checkbox"
                    checked={form.relatedProjectIds.includes(p.id)}
                    onChange={(e) =>
                      update("relatedProjectIds", e.target.checked ? [...form.relatedProjectIds, p.id] : form.relatedProjectIds.filter((x) => x !== p.id))
                    }
                  />
                  {p.title}
                </label>
              ))}
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-5">
            <div>
              <label className="block font-sans text-body-small font-medium text-ordift-ink mb-1">SEO Title</label>
              <input
                type="text"
                value={form.seoTitle}
                onChange={(e) => update("seoTitle", e.target.value)}
                className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
              />
            </div>
            <TextAreaField label="SEO Description" value={form.seoDescription} onChange={(v) => update("seoDescription", v)} rows={3} />
            <p className="font-sans text-caption text-ordift-ink-muted">
              OG image and canonical URL fine-tuning are still available in Sanity Studio if needed.
            </p>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-6">
            <div className="grid sm:grid-cols-2 gap-6">
              <div>
                {form.hero.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.hero.url} alt={form.hero.alt} className="w-full rounded-lg border border-black/10 object-cover aspect-[4/3]" />
                )}
              </div>
              <div className="space-y-1 font-sans text-body-small text-ordift-ink">
                <p className="font-serif font-medium text-body">{form.title || "Untitled Project"}</p>
                <p className="text-ordift-ink-muted">{[form.client, form.location, form.year].filter(Boolean).join(" · ")}</p>
                <p className="text-ordift-ink-muted">{form.disciplines.map((d) => DISCIPLINE_LABELS[d]).join(", ")}</p>
                <p className="mt-2">{form.story}</p>
              </div>
            </div>

            {form.gallery.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {form.gallery.slice(0, 8).map((g) => (
                  <div key={g.key} className="aspect-square rounded overflow-hidden bg-black/5">
                    {g.url && <img src={g.url} alt={g.alt} className="w-full h-full object-cover" />}
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-lg border border-black/10 p-4">
              <p className="font-sans text-body-small font-semibold text-ordift-ink mb-2">Publish Readiness</p>
              {readiness.blocking.length === 0 && readiness.warnings.length === 0 && (
                <p className="font-sans text-caption text-emerald-700">Everything required is in place.</p>
              )}
              {readiness.blocking.map((b) => (
                <p key={b} className="font-sans text-caption text-red-700">✕ {b}</p>
              ))}
              {readiness.warnings.map((w) => (
                <p key={w} className="font-sans text-caption text-amber-700">⚠ {w}</p>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="sticky bottom-4 rounded-xl border border-black/10 bg-white/95 backdrop-blur px-5 py-4 flex flex-wrap items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          {!isFirstStep && (
            <button type="button" onClick={() => goToStep(step - 1)} className="font-sans text-body-small font-medium px-4 py-2 rounded-md border border-black/15">
              Back
            </button>
          )}
          {!isLastStep && (
            <button type="button" onClick={() => goToStep(step + 1)} className="font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white">
              Next
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {saveError && <p className="font-sans text-caption text-red-700">{saveError}</p>}
          {saveSuccess && <p className="font-sans text-caption text-emerald-700">{saveSuccess}</p>}
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              const scopes: Parameters<typeof toSanityFields>[0][] = ["basics", "media", "org", "case-study", "team", "seo", "all"];
              const ok = await save(scopes[step] ?? "all");
              if (ok && projectId) router.push(`/admin/portfolio/${projectId}`);
            }}
            className="font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-gold-pressed text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save as Draft"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TagField({ label, values, onChange }: { label: string; values: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState(values.join(", "));
  return (
    <div>
      <label className="block font-sans text-body-small font-medium text-ordift-ink mb-1">{label}</label>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onChange(parseTagInput(text))}
        placeholder="Comma-separated"
        className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
      />
    </div>
  );
}

function TextAreaField({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <div>
      <label className="block font-sans text-body-small font-medium text-ordift-ink mb-1">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
      />
    </div>
  );
}

function RepeaterFields<T extends { key: string }>({
  title,
  items,
  onChange,
  newItem,
  fields,
}: {
  title: string;
  items: T[];
  onChange: (items: T[]) => void;
  newItem: () => T;
  fields: { key: keyof T; placeholder: string; type?: string; narrow?: boolean }[];
}) {
  return (
    <div>
      <p className="font-sans text-body-small font-medium text-ordift-ink mb-2">{title}</p>
      {items.map((item) => (
        <div key={item.key} className="flex items-center gap-2 mb-2">
          {fields.map((f) => (
            <input
              key={String(f.key)}
              type={f.type ?? "text"}
              placeholder={f.placeholder}
              value={String(item[f.key] ?? "")}
              onChange={(e) => onChange(items.map((it) => (it.key === item.key ? { ...it, [f.key]: e.target.value } : it)))}
              className={`rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small ${f.narrow ? "w-24" : "flex-1"}`}
            />
          ))}
          <button type="button" onClick={() => onChange(items.filter((it) => it.key !== item.key))} className="font-sans text-caption text-red-700">
            Remove
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, newItem()])} className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">
        + Add
      </button>
    </div>
  );
}

function CheckboxCreateList({
  title,
  options,
  selected,
  onChange,
  createLabel,
  onCreated,
  kind,
}: {
  title: string;
  options: { id: string; name: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
  createLabel: string;
  onCreated: (id: string) => void;
  kind: "category" | "collection";
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  // Initialized once from props — options only ever grows from here on
  // via onCreated below (an inline "+ New" while filling the wizard),
  // not from the parent re-fetching, so there's no prop change to
  // resync from.
  const [localOptions, setLocalOptions] = useState(options);

  async function handleCreate() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const result = kind === "category" ? await createCategoryInlineAction(name.trim()) : await createCollectionInlineAction(name.trim());
      if (result.ok) {
        setLocalOptions((o) => [...o, { id: result.id, name: name.trim() }]);
        onCreated(result.id);
        setName("");
        setCreating(false);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="font-sans text-body-small font-medium text-ordift-ink mb-2">{title}</p>
      <div className="flex flex-wrap gap-2 mb-2">
        {localOptions.map((o) => (
          <label
            key={o.id}
            className={`font-sans text-caption px-3 py-1 rounded-full border cursor-pointer ${
              selected.includes(o.id) ? "border-ordift-navy-950 bg-ordift-navy-950 text-white" : "border-black/15 text-ordift-ink-muted"
            }`}
          >
            <input
              type="checkbox"
              className="hidden"
              checked={selected.includes(o.id)}
              onChange={(e) => onChange(e.target.checked ? [...selected, o.id] : selected.filter((x) => x !== o.id))}
            />
            {o.name}
          </label>
        ))}
      </div>
      {creating ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-caption"
          />
          <button type="button" disabled={busy} onClick={handleCreate} className="font-sans text-caption font-medium px-3 py-1.5 rounded-md bg-ordift-navy-950 text-white">
            {busy ? "Creating…" : "Create"}
          </button>
          <button type="button" onClick={() => setCreating(false)} className="font-sans text-caption text-ordift-ink-muted">
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setCreating(true)} className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">
          {createLabel}
        </button>
      )}
    </div>
  );
}

function GalleryEditor({
  title,
  items,
  onFiles,
  onReorder,
  onUpdateItem,
  onRemove,
  canPublish,
}: {
  title: string;
  items: GalleryItem[];
  onFiles: (files: FileList) => void;
  onReorder: (from: number, to: number) => void;
  onUpdateItem: (key: string, patch: Partial<GalleryItem>) => void;
  onRemove: (key: string) => void;
  canPublish: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const dragIndex = useRef<number | null>(null);

  return (
    <div>
      <h2 className="font-serif font-medium text-body text-ordift-ink mb-3">{title}</h2>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`rounded-lg border-2 border-dashed p-4 text-center cursor-pointer mb-4 transition-colors ${
          dragOver ? "border-ordift-gold bg-ordift-gold/5" : "border-black/15 hover:border-black/30"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) onFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <p className="font-sans text-body-small text-ordift-ink-muted">Drag images here (multiple allowed), or click to browse.</p>
      </div>

      {items.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-4">
          {items.map((item, idx) => (
            <div
              key={item.key}
              draggable
              onDragStart={() => {
                dragIndex.current = idx;
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex.current !== null && dragIndex.current !== idx) onReorder(dragIndex.current, idx);
                dragIndex.current = null;
              }}
              className="rounded-lg border border-black/10 p-3 space-y-2 cursor-move"
            >
              <div className="flex gap-3">
                <div className="w-20 h-20 rounded bg-black/5 overflow-hidden shrink-0">
                  {item.url && <img src={item.url} alt={item.alt} className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1 space-y-1.5">
                  {item.uploading && <p className="font-sans text-caption text-ordift-ink-muted">Uploading… {item.progress}%</p>}
                  {item.error && <p className="font-sans text-caption text-red-700">{item.error}</p>}
                  <input
                    type="text"
                    placeholder="Caption (optional)"
                    value={item.caption}
                    onChange={(e) => onUpdateItem(item.key, { caption: e.target.value })}
                    className="w-full rounded border border-black/15 px-2 py-1 font-sans text-caption"
                  />
                  <input
                    type="text"
                    placeholder={canPublish ? "Alt text (optional for you)" : "Alt text *"}
                    value={item.alt}
                    onChange={(e) => onUpdateItem(item.key, { alt: e.target.value })}
                    className="w-full rounded border border-black/15 px-2 py-1 font-sans text-caption"
                  />
                  <textarea
                    placeholder="Production notes (internal only — never shown publicly)"
                    value={item.productionNotes}
                    onChange={(e) => onUpdateItem(item.key, { productionNotes: e.target.value })}
                    rows={2}
                    className="w-full rounded border border-black/15 px-2 py-1 font-sans text-caption"
                  />
                  <div>
                    <label className="block font-sans text-caption text-ordift-ink-muted mb-0.5">
                      Presentation (Photography gallery only)
                    </label>
                    <select
                      value={item.presentation}
                      onChange={(e) => onUpdateItem(item.key, { presentation: e.target.value as GalleryItemPresentation })}
                      className="w-full rounded border border-black/15 px-2 py-1 font-sans text-caption"
                    >
                      <option value="automatic">Automatic (default)</option>
                      <option value="featured">Featured / Full Bleed</option>
                      <option value="wide">Wide</option>
                      <option value="portrait-pair">Portrait Pair candidate</option>
                      <option value="standard">Standard</option>
                    </select>
                  </div>
                </div>
              </div>
              <button type="button" onClick={() => onRemove(item.key)} className="font-sans text-caption text-red-700">
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Shared by Additional Films and Reels (2026-08-23, Videography) —
// each item is an embed URL (mirrors the pattern already established
// for the pre-existing "videos" field; native video file upload is
// out of scope for this increment — see the top-level section's own
// helper text) plus an optional per-item poster image, so a project's
// index/detail pages never fall back to a video's often-black first
// frame. Reuses the same compress-then-upload pipeline as every other
// image in this form (handleVideoItemPosterFile).
function VideoItemEditor({
  title,
  helperText,
  addLabel,
  items,
  onUpdateItem,
  onAdd,
  onRemove,
  onPosterFile,
}: {
  title: string;
  helperText: string;
  addLabel: string;
  items: VideoItem[];
  onUpdateItem: (key: string, patch: Partial<VideoItem>) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
  onPosterFile: (key: string, file: File) => void;
}) {
  return (
    <div>
      <h2 className="font-serif font-medium text-body text-ordift-ink mb-1">{title}</h2>
      <p className="font-sans text-caption text-ordift-ink-muted mb-3">{helperText}</p>
      {items.map((v) => (
        <div key={v.key} className="rounded-lg border border-black/10 p-3 mb-2 space-y-2">
          <div className="flex gap-3">
            <label className="relative w-20 h-20 rounded bg-black/5 overflow-hidden shrink-0 cursor-pointer border border-black/10">
              {v.posterUrl ? (
                <img src={v.posterUrl} alt={v.posterAlt} className="w-full h-full object-cover" />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center font-sans text-caption text-ordift-ink-muted/70 text-center px-1">
                  {v.posterUploading ? "…" : "+ Poster"}
                </span>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                disabled={v.posterUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onPosterFile(v.key, file);
                  e.target.value = "";
                }}
                className="hidden"
              />
            </label>
            <div className="flex-1 space-y-1.5">
              {v.posterError && <p className="font-sans text-caption text-red-700">{v.posterError}</p>}
              <input
                type="url"
                placeholder="https://youtube.com/watch?v=…"
                value={v.url}
                onChange={(e) => onUpdateItem(v.key, { url: e.target.value })}
                className="w-full rounded border border-black/15 px-2 py-1 font-sans text-caption"
              />
              <input
                type="text"
                placeholder="Label / alt text (e.g. Trailer, Reel 1)"
                value={v.alt}
                onChange={(e) => onUpdateItem(v.key, { alt: e.target.value })}
                className="w-full rounded border border-black/15 px-2 py-1 font-sans text-caption"
              />
            </div>
          </div>
          <button type="button" onClick={() => onRemove(v.key)} className="font-sans text-caption text-red-700">
            Remove
          </button>
        </div>
      ))}
      <button type="button" onClick={onAdd} className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">
        {addLabel}
      </button>
    </div>
  );
}
