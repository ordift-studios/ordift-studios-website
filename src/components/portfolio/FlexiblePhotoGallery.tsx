import type { GalleryImage } from "@/lib/content/types";
import type { PhotoGalleryRecipe } from "@/lib/content/portfolioTreatment";
import ResponsiveImage from "@/components/media/ResponsiveImage";
import InteractiveFigure from "./InteractiveFigure";

// Image-led gallery for the Portfolio redesign — deliberately separate from
// src/components/media/Gallery.tsx, which forces a uniform crop into a fixed
// grid and is still used as-is by Workshops (unaffected by this redesign).
//
// Two ways to drive it:
// - `recipe` (Photography, six sub-treatments — portfolioTreatment.ts):
//   a scored, variety-aware block engine (see buildBlocks below) — not a
//   fixed repeating sequence, and not a rigid grid.
// - `mode` (Videography stills, Graphic Design — unchanged since Phase 2):
//   simple flexible/sequential/controlled presets.
// onImageClick/revealOnScroll (2026-08-23, Photography detail redesign)
// are both optional and additive — omitted entirely by every existing
// caller (Videography, Graphic Design), whose rendered output is
// therefore byte-for-byte unchanged. Only Photography's gallery wrapper
// (PhotographyGalleryWithLightbox.tsx) passes them, which is also the
// only thing that pulls the client-only InteractiveFigure into the
// bundle — this file itself still has no hooks/browser APIs and needs
// no "use client" directive.
type InteractiveProps = {
  onImageClick?: (index: number) => void;
  revealOnScroll?: boolean;
};
export type FlexiblePhotoGalleryProps =
  | ({ images: GalleryImage[]; recipe: PhotoGalleryRecipe; mode?: never } & InteractiveProps)
  | ({ images: GalleryImage[]; mode?: "flexible" | "sequential" | "controlled"; recipe?: never } & InteractiveProps);

type BlockType = "full" | "pair" | "triple" | "asymmetric";
type Block = { type: BlockType; images: GalleryImage[] };

const LEGACY_RECIPES: Record<"flexible" | "sequential" | "controlled", PhotoGalleryRecipe> = {
  flexible: {
    gap: "gap-4",
    weights: { full: 3, pair: 3, triple: 2, asymmetric: 1 },
    allowTriple: true,
    allowAsymmetric: false,
    edgeToEdge: false,
    alternateOffset: false,
    fallbackAspect: "3/2",
  },
  sequential: {
    gap: "gap-4",
    weights: { full: 1, pair: 2, triple: 4, asymmetric: 0 },
    allowTriple: true,
    allowAsymmetric: false,
    edgeToEdge: false,
    alternateOffset: false,
    fallbackAspect: "4/5",
  },
  controlled: {
    gap: "gap-4",
    weights: { full: 4, pair: 3, triple: 0, asymmetric: 0 },
    allowTriple: false,
    allowAsymmetric: false,
    edgeToEdge: false,
    alternateOffset: false,
    fallbackAspect: "1/1",
  },
};

// Real aspect ratio when Sanity has reported dimensions, clamped so a
// mis-tagged outlier (e.g. a 1px-tall placeholder) can't blow the layout
// up — otherwise every image keeps its true shape instead of being forced
// into one of a handful of fixed crops.
const MIN_RATIO = 0.55; // tall portrait ceiling, ~9:16
const MAX_RATIO = 2.4; // wide landscape ceiling, wider than 21:9
function imageAspect(image: GalleryImage, fallback: string): string {
  if (!image.width || !image.height) return fallback;
  const ratio = Math.min(MAX_RATIO, Math.max(MIN_RATIO, image.width / image.height));
  return String(ratio);
}
type Orientation = "portrait" | "landscape" | "square";
function orientationOf(image: GalleryImage): Orientation {
  if (!image.width || !image.height) return "landscape";
  const ratio = image.width / image.height;
  if (ratio < 0.9) return "portrait";
  if (ratio > 1.15) return "landscape";
  return "square";
}
function isPortrait(image: GalleryImage): boolean {
  return orientationOf(image) === "portrait";
}

// Scored, variety-aware, orientation-aware grouping: at each position,
// score every grouping that fits the remaining images (full / pair /
// triple / asymmetric) on three factors —
//   1. the recipe's per-subtype base weight (a Wedding gallery favors
//      pairs more than a Commercial one does, etc.)
//   2. how well the candidate images' actual orientations suit that shape
//      (two portraits read cleanly as a symmetric diptych; a portrait next
//      to a landscape reads better as an asymmetric wide/narrow split than
//      squeezed into equal columns)
//   3. a penalty for repeating the same shape as the last one or two
//      blocks, so a gallery of many photographs doesn't read as the same
//      block over and over.
// This is what makes two projects in the same treatment produce different
// rhythms: the algorithm responds to each project's actual image count,
// order and orientations, not a canned repeating pattern.
function buildBlocks(images: GalleryImage[], recipe: PhotoGalleryRecipe): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  let last: BlockType | null = null;
  let last2: BlockType | null = null;

  function repetitionPenalty(type: BlockType): number {
    let p = 0;
    if (last === type) p += 2.5;
    if (last === type && last2 === type) p += 4;
    return p;
  }

  function orientationFit(type: BlockType, take: number): number {
    const group = images.slice(i, i + take).map(orientationOf);
    if (type === "pair") {
      // Symmetric columns read best when both images share an orientation.
      return group[0] === group[1] ? 1.5 : -0.5;
    }
    if (type === "asymmetric") {
      // The wide/narrow split is the natural home for a mixed pair.
      return group[0] !== group[1] ? 1.5 : -0.5;
    }
    if (type === "triple") {
      const uniform = group.every((o) => o === group[0]);
      return uniform ? 0.5 : -0.5;
    }
    return 0; // "full" suits any single image
  }

  while (i < images.length) {
    const remaining = images.length - i;
    const candidates: { type: BlockType; take: number; score: number }[] = [
      { type: "full", take: 1, score: recipe.weights.full - repetitionPenalty("full") + orientationFit("full", 1) },
    ];
    if (remaining >= 2) {
      candidates.push({
        type: "pair",
        take: 2,
        score: recipe.weights.pair - repetitionPenalty("pair") + orientationFit("pair", 2),
      });
      if (recipe.allowAsymmetric) {
        candidates.push({
          type: "asymmetric",
          take: 2,
          score: recipe.weights.asymmetric - repetitionPenalty("asymmetric") + orientationFit("asymmetric", 2),
        });
      }
    }
    if (remaining >= 3 && recipe.allowTriple) {
      candidates.push({
        type: "triple",
        take: 3,
        score: recipe.weights.triple - repetitionPenalty("triple") + orientationFit("triple", 3),
      });
    }

    candidates.sort((a, b) => b.score - a.score);
    const chosen = candidates[0];
    blocks.push({ type: chosen.type, images: images.slice(i, i + chosen.take) });
    last2 = last;
    last = chosen.type;
    i += chosen.take;
  }
  return blocks;
}

export default function FlexiblePhotoGallery(props: FlexiblePhotoGalleryProps) {
  const { images, onImageClick, revealOnScroll } = props;
  if (images.length === 0) return null;
  const recipe: PhotoGalleryRecipe = props.recipe ?? LEGACY_RECIPES[props.mode ?? "flexible"];

  const blocks = buildBlocks(images, recipe);
  const flatIndexById = new Map(images.map((img, idx) => [img.id, idx]));
  // Precomputed with no mutation (each "full" block's position among full
  // blocks only) — used for the Portrait treatment's alternating
  // left/right asymmetric placement and to mark the first full-bleed image
  // as priority. Galleries are small (tens of images at most), so the
  // O(n²) scan here is negligible.
  const fullBlockIndexes = blocks.map((block, idx) =>
    block.type === "full" ? blocks.slice(0, idx).filter((b) => b.type === "full").length : -1,
  );
  const asymmetricIndexes = blocks.map((block, idx) =>
    block.type === "asymmetric" ? blocks.slice(0, idx).filter((b) => b.type === "asymmetric").length : -1,
  );
  // Rounded corners read as a "card" — right for images inset within the
  // page, wrong for ones bleeding to the viewport edge.
  const imageClassName = recipe.edgeToEdge ? "" : "rounded-lg";

  return (
    <div
      className={
        recipe.edgeToEdge
          ? `flex flex-col ${recipe.gap}`
          : `mx-auto max-w-6xl px-4 sm:px-8 flex flex-col ${recipe.gap}`
      }
    >
      {blocks.map((block, blockIndex) => {
        if (block.type === "full") {
          const offsetIndex = fullBlockIndexes[blockIndex];
          const asymmetricOffset = recipe.alternateOffset && offsetIndex % 2 === 1;
          return (
            <div
              key={block.images[0].id}
              className={asymmetricOffset ? "max-w-3xl ml-auto mr-0 w-full sm:w-4/5" : "w-full"}
            >
              <Figure
                image={block.images[0]}
                aspectRatio={imageAspect(block.images[0], recipe.fallbackAspect)}
                sizes="100vw"
                priority={offsetIndex === 0}
                className={imageClassName}
                onClick={onImageClick ? () => onImageClick(flatIndexById.get(block.images[0].id) ?? 0) : undefined}
                revealOnScroll={revealOnScroll}
              />
            </div>
          );
        }

        if (block.type === "asymmetric") {
          // Alternates which side is wide vs. narrow so consecutive
          // asymmetric blocks in the same project don't mirror each other.
          const wideFirst = asymmetricIndexes[blockIndex] % 2 === 0;
          const cols = wideFirst ? "grid-cols-[2fr_1fr]" : "grid-cols-[1fr_2fr]";
          return (
            <div key={block.images.map((img) => img.id).join("-")} className={`grid ${cols} ${recipe.gap}`}>
              {block.images.map((image) => (
                <Figure
                  key={image.id}
                  image={image}
                  aspectRatio={imageAspect(image, recipe.fallbackAspect)}
                  sizes="(min-width: 1024px) 35vw, 50vw"
                  className={imageClassName}
                  onClick={onImageClick ? () => onImageClick(flatIndexById.get(image.id) ?? 0) : undefined}
                  revealOnScroll={revealOnScroll}
                />
              ))}
            </div>
          );
        }

        const cols = block.type === "pair" ? "grid-cols-2" : "grid-cols-3";
        const sizes = block.type === "pair" ? "(min-width: 1024px) 40vw, 50vw" : "(min-width: 1024px) 27vw, 33vw";
        return (
          <div key={block.images.map((img) => img.id).join("-")} className={`grid ${cols} ${recipe.gap} items-start`}>
            {block.images.map((image) => (
              <Figure
                key={image.id}
                image={image}
                aspectRatio={imageAspect(image, recipe.fallbackAspect)}
                sizes={sizes}
                className={imageClassName}
                onClick={onImageClick ? () => onImageClick(flatIndexById.get(image.id) ?? 0) : undefined}
                revealOnScroll={revealOnScroll}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function Figure({
  image,
  aspectRatio,
  sizes,
  priority,
  className,
  onClick,
  revealOnScroll,
}: {
  image: GalleryImage;
  aspectRatio: string;
  sizes: string;
  priority?: boolean;
  className?: string;
  onClick?: () => void;
  revealOnScroll?: boolean;
}) {
  // Neither prop set (every existing caller — Videography, Graphic
  // Design) → identical markup to before this feature existed.
  if (!onClick && !revealOnScroll) {
    return (
      <figure>
        <ResponsiveImage
          src={image.url}
          alt={image.alt}
          width={image.width}
          height={image.height}
          lqip={image.lqip}
          aspectRatio={aspectRatio}
          sizes={sizes}
          priority={priority}
          className={className}
        />
        {image.caption && (
          <figcaption className="mt-2 px-4 sm:px-0 font-sans text-caption text-ordift-ink-muted">
            {image.caption}
          </figcaption>
        )}
      </figure>
    );
  }

  return (
    <InteractiveFigure
      image={image}
      aspectRatio={aspectRatio}
      sizes={sizes}
      priority={priority}
      className={className}
      onClick={onClick}
      revealOnScroll={revealOnScroll}
    />
  );
}

// Exported for potential reuse (Videography/Graphic Design future passes,
// or gallery-adjacent components that need orientation without pulling in
// the whole grouping engine) and for direct unit testing of the scoring
// algorithm — see FlexiblePhotoGallery.test.ts. No real Portfolio project
// in the current dataset has a populated gallery array, so this is the
// only automated coverage of buildBlocks's actual behavior today.
export { isPortrait, buildBlocks };
export type { Block, BlockType };
