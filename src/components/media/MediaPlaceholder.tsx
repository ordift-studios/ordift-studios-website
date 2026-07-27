import Logo from "@/components/Logo";

// A professionally-styled "real content coming here" placeholder — for
// the areas of the site that have no media wiring at all yet (Home
// hero, Home department grid, department/service pages), distinct from
// ResponsiveImage/MediaAsset's empty state (which handles a CMS field
// that exists but has no asset uploaded). No stock imagery, ever —
// this is the deliberate design alternative. Reuses the exact visual
// language already established on the Coming Soon holding page (radial
// navy gradient + a subtly shimmering gold glow behind the Ordift
// monogram) so a visitor reads it as an intentional brand moment, not
// a broken image. See MEDIA_UPLOAD_LIST.md for what replaces each of
// these once real photography/film exists.
export type MediaPlaceholderProps = {
  label?: string;
  /** Accessible name — falls back to a generic "imagery coming soon" label when omitted. */
  alt?: string;
  aspectRatio?: string;
  tone?: "dark" | "light";
  className?: string;
  /** Extra wrapper styles — e.g. a fixed pixel width/height, matching ResponsiveImage's same escape hatch. */
  style?: React.CSSProperties;
  /** Scales the monogram + glow down for small tiles (gallery thumbnails, avatars) where the full-size mark would overwhelm the space. */
  compact?: boolean;
};

export default function MediaPlaceholder({
  label,
  alt,
  aspectRatio = "4/3",
  tone = "light",
  className = "",
  style,
  compact = false,
}: MediaPlaceholderProps) {
  const isDark = tone === "dark";

  return (
    <div
      role="img"
      aria-label={alt ?? (label ? `${label} — imagery coming soon` : "Imagery coming soon")}
      className={`relative overflow-hidden flex items-center justify-center ${
        isDark ? "bg-ordift-navy-900" : "bg-ordift-offwhite"
      } ${className}`}
      style={{ aspectRatio, ...style }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: isDark
            ? "radial-gradient(ellipse at 50% 40%, var(--color-navy-900) 0%, var(--color-navy-950) 75%)"
            : "radial-gradient(ellipse at 50% 40%, #ffffff 0%, var(--color-offwhite) 75%)",
        }}
      />
      <div
        className={`pointer-events-none absolute rounded-full blur-3xl opacity-[0.18] animate-ordift-shimmer motion-reduce:animate-none ${
          compact ? "h-10 w-10" : "h-24 w-24 sm:h-32 sm:w-32"
        }`}
        style={{ backgroundColor: "var(--color-gold)" }}
        aria-hidden="true"
      />
      <div className={`relative flex flex-col items-center text-center ${compact ? "gap-1.5 px-2" : "gap-3 px-4"}`}>
        <Logo
          variant="icon"
          color={isDark ? "white" : "black"}
          height={compact ? 16 : 28}
          className="opacity-30"
        />
        {label && (
          <p
            className={`font-sans font-semibold uppercase tracking-[0.2em] ${compact ? "text-[10px]" : "text-caption"} ${
              isDark ? "text-white/40" : "text-ordift-ink-muted/70"
            }`}
          >
            {label}
          </p>
        )}
      </div>
    </div>
  );
}
