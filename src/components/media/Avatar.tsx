import ResponsiveImage from "./ResponsiveImage";

// Small circular portrait — Founder, Journal authors, Workshop
// instructors today; the same shape will fit Staff Portal profiles,
// Talent headshots, and Vendor contacts later. `src` is a plain URL
// (these CMS documents store photo.asset->url directly, no width/
// height/lqip captured), so this never gets a blur placeholder — a
// short fixed size makes that a non-issue in practice.
//
// Graceful loading state for the *content* gap (no photo uploaded yet,
// not a network-loading state): renders the person's initials on a
// neutral tint instead of a broken image or an empty box, so a profile
// page never looks unfinished before real photos exist.
export type AvatarProps = {
  src: string | null;
  alt: string;
  size?: number;
  className?: string;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

export default function Avatar({ src, alt, size = 56, className = "" }: AvatarProps) {
  if (!src) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex shrink-0 items-center justify-center rounded-full bg-ordift-navy-900/10 font-sans font-semibold text-ordift-ink-muted ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.36 }}
      >
        {initials(alt)}
      </div>
    );
  }

  return (
    <ResponsiveImage
      src={src}
      alt={alt}
      aspectRatio="1/1"
      sizes={`${size}px`}
      style={{ width: size, height: size }}
      className={`rounded-full shrink-0 ${className}`}
    />
  );
}
