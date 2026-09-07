import Image from "next/image";
import DepartmentFallbackArt from "./DepartmentFallbackArt";

// Ordift Studios department media architecture (2026-09-07) — REAL
// DEPARTMENT IMAGE takes precedence when available, otherwise the
// department-specific visual fallback (DepartmentFallbackArt) is
// rendered. Reuses Service.workLandingImage — the existing, already
// Admin-uploadable "Admin -> Portfolio -> Work Landing Images" field —
// rather than inventing a second CMS field for the same purpose; that
// field already feeds the exact same real-image-or-fallback decision
// on /work (see WorkDisciplineBands.tsx). The moment an Admin sets a
// real Work Landing Image for a department, it appears here too with
// no code change.
//
// Presentation preference override (2026-09-07) — a deliberate,
// code-level configuration, NOT a CMS field: Photography and
// Videography currently have real Work Landing Images uploaded, but
// the approved direction for these department card/hero surfaces is
// the same premium conceptual artwork family used by the other five
// departments. This is a presentation choice only — it never deletes,
// hides, or alters the real image data (still fully intact and used
// elsewhere, e.g. /work), and is trivially reversible by removing a
// slug from FORCE_CONCEPTUAL_ART below. It does not reverse the
// real-image-first architecture for any other department.
const FORCE_CONCEPTUAL_ART: ReadonlySet<string> = new Set(["photography", "videography"]);

export type DepartmentPresentationImage = {
  url: string;
  alt: string;
  width?: number | null;
  height?: number | null;
  lqip?: string | null;
  focalX?: number | null;
  focalY?: number | null;
};

export default function DepartmentMediaFrame({
  slug,
  name,
  image,
  aspectRatio = "4/3",
  className = "",
  sizes = "100vw",
  priority = false,
}: {
  slug: string;
  /** Department display name, used only for the fallback's accessible label. */
  name: string;
  image?: DepartmentPresentationImage | null;
  aspectRatio?: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  const useRealImage = Boolean(image?.url) && !FORCE_CONCEPTUAL_ART.has(slug);

  return (
    <div
      role="img"
      aria-label={useRealImage ? image!.alt : `${name} — imagery coming soon`}
      className={`relative overflow-hidden ${className}`}
      style={{ aspectRatio }}
    >
      {useRealImage ? (
        <Image
          src={image!.url}
          alt={image!.alt}
          fill
          sizes={sizes}
          placeholder={image!.lqip ? "blur" : "empty"}
          blurDataURL={image!.lqip ?? undefined}
          className="object-cover"
          style={{ objectPosition: `${image!.focalX ?? 50}% ${image!.focalY ?? 50}%` }}
          priority={priority}
        />
      ) : (
        <DepartmentFallbackArt slug={slug} className="absolute inset-0 w-full h-full" />
      )}
    </div>
  );
}
