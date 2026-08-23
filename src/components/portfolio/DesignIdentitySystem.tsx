import type { GalleryImage, GalleryAssetRole } from "@/lib/content/types";
import ResponsiveImage from "@/components/media/ResponsiveImage";

// Graphic Design's Identity/System breakdown (2026-08-24) — structured
// (not scored/grouped like DesignShowcase) presentation of a project's
// gallery images that were explicitly routed here via each image's
// `assetRole` in the Admin gallery editor. Fixed priority order, not the
// order images happen to appear in the gallery array, so a brand
// identity case study always reads Logo → Secondary Marks → Colour →
// Typography → Visual Elements, regardless of upload order. Renders
// nothing (not even a heading) when no image has a routed role — a
// poster-only project must never show an empty "Brand System" section.
export type DesignIdentitySystemProps = {
  images: GalleryImage[];
  quality?: number;
};

const SECTION_ORDER: { role: Exclude<GalleryAssetRole, "automatic" | "application">; label: string }[] = [
  { role: "logo", label: "Primary Logo" },
  { role: "secondary-mark", label: "Secondary Marks" },
  { role: "color-palette", label: "Colour Palette" },
  { role: "typography", label: "Typography" },
  { role: "visual-element", label: "Visual Elements" },
];

const QUALITY = 90;

export default function DesignIdentitySystem({ images, quality = QUALITY }: DesignIdentitySystemProps) {
  const sections = SECTION_ORDER.map(({ role, label }) => ({
    role,
    label,
    items: images.filter((img) => img.assetRole === role),
  })).filter((s) => s.items.length > 0);

  if (sections.length === 0) return null;

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-8 space-y-12 sm:space-y-16">
      {sections.map((section) => (
        <div key={section.role}>
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-caption text-ordift-gold mb-4">
            {section.label}
          </p>
          <div
            className={
              section.items.length === 1
                ? "max-w-md"
                : "grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6"
            }
          >
            {section.items.map((image) => (
              <figure key={image.id}>
                <ResponsiveImage
                  src={image.url}
                  alt={image.alt}
                  width={image.width}
                  height={image.height}
                  lqip={image.lqip}
                  aspectRatio={section.role === "color-palette" ? "16/9" : undefined}
                  sizes="(min-width: 1024px) 30vw, 50vw"
                  objectFit="contain"
                  quality={quality}
                  className="rounded-lg bg-[#f7f6f4]"
                />
                {image.caption && (
                  <figcaption className="mt-2 font-sans text-caption text-ordift-ink-muted text-center">{image.caption}</figcaption>
                )}
              </figure>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
