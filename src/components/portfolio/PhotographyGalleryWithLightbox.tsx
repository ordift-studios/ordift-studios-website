"use client";

import { useState } from "react";
import FlexiblePhotoGallery from "./FlexiblePhotoGallery";
import PhotoLightbox from "./PhotoLightbox";
import type { GalleryImage } from "@/lib/content/types";
import type { PhotoGalleryRecipe } from "@/lib/content/portfolioTreatment";

// Photography detail redesign (2026-08-23) — the only caller that opts
// FlexiblePhotoGallery into click-to-open-lightbox and scroll reveal;
// Videography/Graphic Design keep calling FlexiblePhotoGallery directly
// and are entirely unaffected. Owns the one piece of state a lightbox
// needs (which image, if any, is open) so PhotographyProjectView itself
// can stay a plain Server Component.
export default function PhotographyGalleryWithLightbox({
  images,
  recipe,
}: {
  images: GalleryImage[];
  recipe: PhotoGalleryRecipe;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <>
      <FlexiblePhotoGallery images={images} recipe={recipe} onImageClick={setOpenIndex} revealOnScroll />
      {openIndex !== null && (
        <PhotoLightbox images={images} initialIndex={openIndex} onClose={() => setOpenIndex(null)} />
      )}
    </>
  );
}
