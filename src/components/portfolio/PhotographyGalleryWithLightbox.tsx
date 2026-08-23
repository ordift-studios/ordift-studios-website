"use client";

import { useState } from "react";
import JustifiedPhotoGallery from "./JustifiedPhotoGallery";
import PhotoLightbox from "./PhotoLightbox";
import type { GalleryImage } from "@/lib/content/types";

// Photography detail redesign (2026-08-23) — owns the one piece of
// state a lightbox needs (which image, if any, is open) so
// PhotographyProjectView itself can stay a plain Server Component.
// Gallery layout redesign (2026-08-23, adaptive justified rows) —
// swapped from FlexiblePhotoGallery/PhotoGalleryRecipe to
// JustifiedPhotoGallery; FlexiblePhotoGallery itself is untouched and
// still used directly by Videography/Graphic Design.
export default function PhotographyGalleryWithLightbox({ images }: { images: GalleryImage[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <>
      <JustifiedPhotoGallery images={images} onImageClick={setOpenIndex} />
      {openIndex !== null && (
        <PhotoLightbox images={images} initialIndex={openIndex} onClose={() => setOpenIndex(null)} />
      )}
    </>
  );
}
