import type { GalleryImage } from "@/lib/content/types";
import type { PhotoGalleryRecipe } from "@/lib/content/portfolioTreatment";
import ResponsiveImage from "@/components/media/ResponsiveImage";

// Image-led gallery for the Portfolio redesign — deliberately separate from
// src/components/media/Gallery.tsx, which forces a uniform crop into a fixed
// grid and is still used as-is by Workshops (unaffected by this redesign).
// This component reads each image's own aspect ratio and arranges them into
// full-bleed / editorial-pair / sequence blocks instead of stretching every
// photo into the same shape.
//
// Two ways to drive it:
// - `recipe` (Photography, six sub-treatments — portfolioTreatment.ts):
//   full control over spacing, triple/diptych bias, edge-to-edge bleed,
//   per-block crop ratios, and (Portrait) alternating asymmetric placement.
// - `mode` (Videography stills, Graphic Design — unchanged since Phase 2):
//   simple flexible/sequential/controlled presets, untouched by the
//   Photography visual-system rework so those disciplines don't shift
//   under a review that hasn't reached them yet.
export type FlexiblePhotoGalleryProps =
  | { images: GalleryImage[]; recipe: PhotoGalleryRecipe; mode?: never }
  | { images: GalleryImage[]; mode?: "flexible" | "sequential" | "controlled"; recipe?: never };

type Block =
  | { type: "full"; images: GalleryImage[] }
  | { type: "pair"; images: GalleryImage[] }
  | { type: "triple"; images: GalleryImage[] };

function isPortrait(image: GalleryImage): boolean {
  return Boolean(image.width && image.height && image.height > image.width);
}

const LEGACY_RECIPES: Record<"flexible" | "sequential" | "controlled", PhotoGalleryRecipe> = {
  flexible: {
    gap: "gap-4",
    allowTriple: true,
    preferDiptych: false,
    edgeToEdge: false,
    fullAspect: "3/2",
    pairAspect: "4/5",
    tripleAspect: "4/5",
    alternateOffset: false,
  },
  sequential: {
    gap: "gap-4",
    allowTriple: true,
    preferDiptych: false,
    edgeToEdge: false,
    fullAspect: "4/5",
    pairAspect: "4/5",
    tripleAspect: "4/5",
    alternateOffset: false,
  },
  controlled: {
    gap: "gap-4",
    allowTriple: false,
    preferDiptych: false,
    edgeToEdge: false,
    fullAspect: "1/1",
    pairAspect: "1/1",
    tripleAspect: "1/1",
    alternateOffset: false,
  },
};

// Greedy pass: a landscape (or orientation-unknown) image stands alone,
// full-bleed. Two consecutive portraits pair into an editorial diptych. A
// recipe with allowTriple + not preferDiptych groups three consecutive
// portraits into a sequence instead. Deterministic and cheap — no layout
// library, no client JS.
function buildBlocks(images: GalleryImage[], recipe: PhotoGalleryRecipe): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < images.length) {
    const image = images[i];
    if (!isPortrait(image)) {
      blocks.push({ type: "full", images: [image] });
      i += 1;
      continue;
    }
    const next = images[i + 1];
    const nextIsPortrait = Boolean(next && isPortrait(next));
    if (recipe.allowTriple && !recipe.preferDiptych) {
      const third = images[i + 2];
      if (nextIsPortrait && third && isPortrait(third)) {
        blocks.push({ type: "triple", images: [image, next!, third] });
        i += 3;
        continue;
      }
    }
    if (nextIsPortrait) {
      blocks.push({ type: "pair", images: [image, next!] });
      i += 2;
      continue;
    }
    blocks.push({ type: "full", images: [image] });
    i += 1;
  }
  return blocks;
}

// (mode === "controlled" special-case removed from Phase 2 in favor of a
// square recipe with allowTriple:false, above — same visual result, one
// code path instead of two.)
export default function FlexiblePhotoGallery(props: FlexiblePhotoGalleryProps) {
  const { images } = props;
  if (images.length === 0) return null;
  const recipe: PhotoGalleryRecipe = props.recipe ?? LEGACY_RECIPES[props.mode ?? "flexible"];

  const blocks = buildBlocks(images, recipe);
  // Precomputed with no mutation (each block's position among "full"
  // blocks only) — used for the Portrait treatment's alternating
  // left/right asymmetric placement and for marking the very first
  // full-bleed image as priority. Galleries are small (tens of images at
  // most), so the O(n²) scan here is negligible.
  const fullBlockIndexes = blocks.map((block, i) =>
    block.type === "full" ? blocks.slice(0, i).filter((b) => b.type === "full").length : -1,
  );
  // Rounded corners read as a "card" — right for images inset within the
  // page, wrong for ones bleeding to the viewport edge.
  const imageClassName = recipe.edgeToEdge ? "" : "rounded-lg";

  return (
    <div className={recipe.edgeToEdge ? `flex flex-col ${recipe.gap}` : `mx-auto max-w-6xl px-4 sm:px-8 flex flex-col ${recipe.gap}`}>
      {blocks.map((block, blockIndex) => {
        if (block.type === "full") {
          const offsetIndex = fullBlockIndexes[blockIndex];
          const asymmetric = recipe.alternateOffset && offsetIndex % 2 === 1;
          return (
            <div
              key={block.images[0].id}
              className={asymmetric ? "max-w-3xl ml-auto mr-0 w-full sm:w-4/5" : "w-full"}
            >
              <Figure
                image={block.images[0]}
                aspectRatio={recipe.fullAspect}
                sizes="100vw"
                priority={offsetIndex === 0}
                className={imageClassName}
              />
            </div>
          );
        }
        const cols = block.type === "pair" ? "grid-cols-2" : "grid-cols-3";
        const aspect = block.type === "pair" ? recipe.pairAspect : recipe.tripleAspect;
        const sizes = block.type === "pair" ? "(min-width: 1024px) 40vw, 50vw" : "(min-width: 1024px) 27vw, 33vw";
        return (
          <div key={block.images.map((img) => img.id).join("-")} className={`grid ${cols} ${recipe.gap}`}>
            {block.images.map((image) => (
              <Figure key={image.id} image={image} aspectRatio={aspect} sizes={sizes} className={imageClassName} />
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
}: {
  image: GalleryImage;
  aspectRatio: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
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
