import type { GalleryImage } from "@/lib/content/types";
import ResponsiveImage from "@/components/media/ResponsiveImage";

// Image-led gallery for the Portfolio redesign — deliberately separate from
// src/components/media/Gallery.tsx, which forces a uniform crop into a fixed
// grid and is still used as-is by Workshops (unaffected by this redesign).
// This component reads each image's own aspect ratio and arranges them into
// full-bleed / editorial-pair / sequence blocks instead of stretching every
// photo into the same shape.
export type FlexiblePhotoGalleryProps = {
  images: GalleryImage[];
  /** "flexible" (default) reads aspect ratios and varies the layout.
   * "sequential" renders a steady 3-up rhythm regardless of orientation —
   * for Event photography, where pacing/progression matters more than
   * showcasing any single frame. "controlled" forces every image into the
   * same square crop in a 3-up grid — for Commercial/Product work, where a
   * uniform, controlled presentation is the correct choice, not a
   * limitation. */
  mode?: "flexible" | "sequential" | "controlled";
};

type Block =
  | { type: "full"; images: GalleryImage[] }
  | { type: "pair"; images: GalleryImage[] }
  | { type: "triple"; images: GalleryImage[] };

function isPortrait(image: GalleryImage): boolean {
  return Boolean(image.width && image.height && image.height > image.width);
}

// Greedy pass: a landscape (or orientation-unknown) image stands alone,
// full-bleed, since it's usually the stronger single statement. Two
// consecutive portraits become an editorial pairing. Otherwise images group
// into threes. Deterministic and cheap — no layout library, no client JS.
function buildFlexibleBlocks(images: GalleryImage[]): Block[] {
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
    if (next && isPortrait(next)) {
      blocks.push({ type: "pair", images: [image, next] });
      i += 2;
      continue;
    }
    const chunk = images.slice(i, i + 3);
    blocks.push(chunk.length === 3 ? { type: "triple", images: chunk } : { type: "pair", images: chunk });
    i += chunk.length;
  }
  return blocks;
}

function buildSequentialBlocks(images: GalleryImage[]): Block[] {
  const blocks: Block[] = [];
  for (let i = 0; i < images.length; i += 3) {
    blocks.push({ type: "triple", images: images.slice(i, i + 3) });
  }
  return blocks;
}

export default function FlexiblePhotoGallery({ images, mode = "flexible" }: FlexiblePhotoGalleryProps) {
  if (images.length === 0) return null;

  if (mode === "controlled") {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {images.map((image) => (
          <Figure key={image.id} image={image} aspectRatio="1/1" sizes="(min-width: 640px) 33vw, 50vw" />
        ))}
      </div>
    );
  }

  const blocks = mode === "sequential" ? buildSequentialBlocks(images) : buildFlexibleBlocks(images);

  return (
    <div className="flex flex-col gap-4">
      {blocks.map((block, i) => {
        if (block.type === "full") {
          return (
            <Figure
              key={block.images[0].id}
              image={block.images[0]}
              aspectRatio="3/2"
              sizes="(min-width: 1024px) 55vw, 100vw"
              priority={i === 0}
            />
          );
        }
        const cols = block.type === "pair" ? "grid-cols-2" : "grid-cols-3";
        return (
          <div key={block.images.map((img) => img.id).join("-")} className={`grid ${cols} gap-4`}>
            {block.images.map((image) => (
              <Figure
                key={image.id}
                image={image}
                aspectRatio="4/5"
                sizes={block.type === "pair" ? "(min-width: 1024px) 27vw, 50vw" : "(min-width: 1024px) 18vw, 33vw"}
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
}: {
  image: GalleryImage;
  aspectRatio: string;
  sizes: string;
  priority?: boolean;
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
        className="rounded-lg"
      />
      {image.caption && (
        <figcaption className="mt-2 font-sans text-caption text-ordift-ink-muted">{image.caption}</figcaption>
      )}
    </figure>
  );
}
