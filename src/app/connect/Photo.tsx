import type { CSSProperties } from "react";
import { fileUrl, remoteFileUrl, remoteSrcSet, srcSet, type ConnectImage } from "./gallery";

// One photograph, served as AVIF with a WebP fallback at several widths so each phone downloads only what it needs. width/height reserve the exact space (no layout shift, no cropping), and
// the photograph's average colour shows until it has loaded. These are already-optimised static files, so the plain <picture> element is used instead of next/image. The <picture> wrapper is
// `display: contents` so it takes no box of its own: the <img> is then the real layout item, and centring and percentage widths apply to it directly (a wrapper box would stretch to the full
// width and leave a narrower photograph hugging one side).
export default function Photo({ img, sizes, className = "", style, eager = false }: { img: ConnectImage; sizes: string; className?: string; style?: CSSProperties; eager?: boolean }) {
  const fallbackWidth = img.widths[Math.min(1, img.widths.length - 1)];
  if (img.remote) {
    // A photograph added through the manager: one <img> whose width list the image host answers, in the best format each browser supports. Same sizing, loading and placeholder behaviour as the others.
    return (
      <picture className="contents">
        <img src={remoteFileUrl({ remote: img.remote }, fallbackWidth)} srcSet={remoteSrcSet({ remote: img.remote, widths: img.widths })} sizes={sizes} alt={img.alt} width={img.width} height={img.height} loading={eager ? "eager" : "lazy"} decoding="async" style={{ backgroundColor: img.color, ...style }} className={className} />
      </picture>
    );
  }
  return (
    <picture className="contents">
      <source type="image/avif" srcSet={srcSet(img, "avif")} sizes={sizes} />
      <source type="image/webp" srcSet={srcSet(img, "webp")} sizes={sizes} />
      <img src={fileUrl(img, fallbackWidth, "webp")} alt={img.alt} width={img.width} height={img.height} loading={eager ? "eager" : "lazy"} decoding="async" style={{ backgroundColor: img.color, ...style }} className={className} />
    </picture>
  );
}

// A box that fits the photograph inside a maximum height (any CSS length) and the width available, at the photograph's own proportions. It is definite BEFORE the file has loaded, so there
// is never an empty 0 x 0 element (a lazy-loaded image with no size can wait indefinitely before it starts to download) and nothing moves when the picture arrives.
export const fitStyle = (img: Pick<ConnectImage, "width" | "height">, maxHeight: string): CSSProperties => ({
  aspectRatio: `${img.width} / ${img.height}`,
  width: `min(100%, calc(${maxHeight} * ${(img.width / img.height).toFixed(5)}))`,
  height: "auto",
});
