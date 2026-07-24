import Image from "next/image";

/**
 * PROVISIONAL: cropped from the only source file available
 * (`ordift_studios_black_logo.png`, raster, no vector). No redrawing —
 * straight crop + recolor only. Still pending your final sign-off on
 * exact crop/spacing, and would be redone cleanly from a vector source
 * (SVG/AI/EPS/PDF) if one becomes available. See Brand Bible section 28.
 */
const SOURCES = {
  full: { black: "/brand/logo-full-black.png", white: "/brand/logo-full-white.png", gold: "/brand/logo-full-gold.png" },
  nav: { black: "/brand/logo-nav-black.png", white: "/brand/logo-nav-white.png", gold: "/brand/logo-nav-gold.png" },
  icon: { black: "/brand/logo-icon-black-square.png", white: "/brand/logo-icon-white-square.png" },
} as const;

const NATIVE_RATIO = {
  full: 461 / 348,
  nav: 461 / 314,
  icon: 1,
};

type LogoProps = {
  variant?: keyof typeof SOURCES;
  color?: "black" | "white" | "gold";
  height?: number;
  className?: string;
  priority?: boolean;
};

export default function Logo({
  variant = "nav",
  color = "black",
  height = 32,
  className,
  priority,
}: LogoProps) {
  const sources = SOURCES[variant] as Record<string, string>;
  const src = sources[color] ?? sources.black;
  const width = Math.round(height * NATIVE_RATIO[variant]);

  return (
    <Image
      src={src}
      alt="Ordift Studios"
      width={width}
      height={height}
      className={className}
      priority={priority}
    />
  );
}
