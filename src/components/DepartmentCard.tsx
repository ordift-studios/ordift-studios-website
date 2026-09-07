import Link from "next/link";
import DepartmentMediaFrame, { type DepartmentPresentationImage } from "@/components/media/DepartmentMediaFrame";

type DepartmentCardProps = {
  name: string;
  description: string;
  href: string;
  /** Department slug (e.g. "photography") — resolves the department-specific visual fallback in DepartmentFallbackArt.tsx when no real image is set. */
  slug?: string;
  /** Real department image (Service.workLandingImage) — takes precedence over the fallback art when set. */
  image?: DepartmentPresentationImage | null;
};

export default function DepartmentCard({
  name,
  description,
  href,
  slug,
  image,
}: DepartmentCardProps) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-black/10 bg-white p-5 sm:p-6 shadow-sm transition-all hover:border-black/20 hover:shadow-md hover:-translate-y-0.5"
    >
      <DepartmentMediaFrame slug={slug ?? ""} name={name} image={image} aspectRatio="4/3" sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw" className="rounded-lg mb-4" />
      <p className="font-serif font-medium text-card-title lg:text-card-title-desktop text-ordift-ink mb-1">
        {name}
      </p>
      <p className="font-sans text-body-small text-ordift-ink-muted mb-3">
        {description}
      </p>
      <span className="font-sans text-body-small text-ordift-gold-pressed">
        Discover more →
      </span>
    </Link>
  );
}
