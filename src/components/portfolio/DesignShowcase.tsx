import type { GalleryImage } from "@/lib/content/types";
import { DESIGN_GALLERY_RECIPE } from "@/lib/content/portfolioTreatment";
import { buildBlocks } from "./FlexiblePhotoGallery";
import ResponsiveImage from "@/components/media/ResponsiveImage";

// Graphic Design's "Selected Work" / "Applications & Mockups" showcase
// (2026-08-24) — reuses FlexiblePhotoGallery's scored buildBlocks
// grouping engine (full/pair/triple/asymmetric, orientation-aware,
// variety-aware) tuned by DESIGN_GALLERY_RECIPE, but with entirely new
// rendering: object-contain instead of object-cover, so a statement
// piece of artwork is never silently cropped to fit a block shape it
// wasn't designed for — "do not force every asset to fill/crop its
// container" (2026-08-24 brief). Deliberately not FlexiblePhotoGallery
// itself, which Videography's stills gallery still relies on unchanged.
export type DesignShowcaseProps = {
  images: GalleryImage[];
  quality?: number;
};

const QUALITY = 90;

// Same clamp range as FlexiblePhotoGallery's own imageAspect() — guards
// against a mis-tagged outlier (e.g. a near-zero-height asset) breaking
// the row height; real design artwork essentially never hits this.
const MIN_RATIO = 0.5;
const MAX_RATIO = 2.6;
function clampedAspect(image: GalleryImage): string | undefined {
  if (!image.width || !image.height) return undefined;
  return String(Math.min(MAX_RATIO, Math.max(MIN_RATIO, image.width / image.height)));
}

export default function DesignShowcase({ images, quality = QUALITY }: DesignShowcaseProps) {
  if (images.length === 0) return null;
  const blocks = buildBlocks(images, DESIGN_GALLERY_RECIPE);
  const gap = DESIGN_GALLERY_RECIPE.gap;

  return (
    <div className={`mx-auto max-w-6xl px-4 sm:px-8 flex flex-col ${gap}`}>
      {blocks.map((block) => {
        if (block.type === "full") {
          return (
            <Tile key={block.images[0].id} image={image0(block)} sizes="(min-width: 1024px) 80vw, 100vw" quality={quality} />
          );
        }
        if (block.type === "asymmetric") {
          return (
            <div key={blockKey(block)} className={`grid grid-cols-[3fr_2fr] ${gap}`}>
              {block.images.map((image) => (
                <Tile key={image.id} image={image} sizes="(min-width: 1024px) 35vw, 50vw" quality={quality} />
              ))}
            </div>
          );
        }
        const cols = block.type === "pair" ? "grid-cols-2" : "grid-cols-3";
        const sizes = block.type === "pair" ? "(min-width: 1024px) 40vw, 50vw" : "(min-width: 1024px) 27vw, 33vw";
        return (
          <div key={blockKey(block)} className={`grid ${cols} ${gap} items-start`}>
            {block.images.map((image) => (
              <Tile key={image.id} image={image} sizes={sizes} quality={quality} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function image0(block: { images: GalleryImage[] }): GalleryImage {
  return block.images[0];
}
function blockKey(block: { images: GalleryImage[] }): string {
  return block.images.map((img) => img.id).join("-");
}

function Tile({ image, sizes, quality }: { image: GalleryImage; sizes: string; quality: number }) {
  return (
    <figure>
      <ResponsiveImage
        src={image.url}
        alt={image.alt}
        width={image.width}
        height={image.height}
        lqip={image.lqip}
        aspectRatio={clampedAspect(image)}
        sizes={sizes}
        objectFit="contain"
        quality={quality}
        className="rounded-lg bg-[#f7f6f4]"
      />
      {image.caption && (
        <figcaption className="mt-2 font-sans text-caption text-ordift-ink-muted text-center">{image.caption}</figcaption>
      )}
    </figure>
  );
}
