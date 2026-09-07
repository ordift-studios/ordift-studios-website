// Ordift Studios department visual fallback (2026-09-07, corrected
// interpretation) — a large, full-bleed, richly rendered illustration
// per department, standing in for real photography until it exists.
// This replaces DepartmentIcon.tsx as the PRIMARY large-media
// treatment (DepartmentIcon itself is left in place, unused for now,
// in case a genuinely small-icon use case appears elsewhere later).
//
// Each composition shares one visual family: a deep navy-to-black
// gradient ground, a warm gold glow seated behind the subject, and a
// large-scale gradient-shaded silhouette of the department's subject
// matter (camera, film reel, layout tools, brand-system diagram,
// content frame, spotlight/portfolio abstraction, clapperboard+light)
// — restrained, editorial, and deliberately abstract/generic enough
// never to be mistaken for a real client project, a real person, or a
// real logo. No text, no photography, no stock imagery: pure vector
// art in Ordift's own palette.
//
// DepartmentMediaFrame (same directory) is what actually decides
// between a real image and this fallback — this component only
// renders the fallback art itself.

export type DepartmentFallbackSlug =
  | "photography"
  | "videography"
  | "graphic-design"
  | "branding"
  | "content-creation"
  | "talent-management"
  | "production";

function Ground() {
  return (
    <>
      <rect width="100" height="100" fill="url(#df-ground)" />
      <circle cx="50" cy="46" r="34" fill="url(#df-glow)" />
    </>
  );
}

function SharedDefs() {
  return (
    <defs>
      <linearGradient id="df-ground" x1="0" y1="0" x2="0" y2="100" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#141a2e" />
        <stop offset="100%" stopColor="#05070f" />
      </linearGradient>
      <radialGradient id="df-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#caa24a" stopOpacity="0.35" />
        <stop offset="100%" stopColor="#caa24a" stopOpacity="0" />
      </radialGradient>
      <pattern id="df-clapper-stripes" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
        <rect width="7" height="7" fill="#0a0d18" />
        <rect width="3.5" height="7" fill="url(#df-metal)" />
      </pattern>
      <linearGradient id="df-metal" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#e8d9ae" />
        <stop offset="45%" stopColor="#b8944f" />
        <stop offset="100%" stopColor="#5b4620" />
      </linearGradient>
      <linearGradient id="df-metal-soft" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#9aa4c2" />
        <stop offset="100%" stopColor="#3a4160" />
      </linearGradient>
    </defs>
  );
}

function PhotographyArt() {
  return (
    <g>
      {/* Camera body */}
      <rect x="24" y="42" width="52" height="34" rx="4" fill="url(#df-metal-soft)" />
      <rect x="24" y="42" width="52" height="8" rx="2" fill="url(#df-metal)" opacity="0.6" />
      <rect x="40" y="32" width="20" height="10" rx="2" fill="url(#df-metal-soft)" />
      {/* Lens */}
      <circle cx="50" cy="60" r="14" fill="#0b0f1c" stroke="url(#df-metal)" strokeWidth="2.4" />
      <circle cx="50" cy="60" r="8" fill="#111633" stroke="url(#df-metal)" strokeWidth="1.2" />
      <circle cx="46" cy="56" r="2.6" fill="#e8d9ae" opacity="0.85" />
      {/* Viewfinder + shutter */}
      <rect x="66" y="46" width="6" height="5" rx="1" fill="url(#df-metal)" />
      <circle cx="30" cy="47" r="2.2" fill="#e8d9ae" />
    </g>
  );
}

function VideographyArt() {
  return (
    <g>
      {/* Film reel */}
      <circle cx="42" cy="52" r="20" fill="none" stroke="url(#df-metal)" strokeWidth="2.6" />
      <circle cx="42" cy="52" r="6" fill="url(#df-metal-soft)" />
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <circle
          key={deg}
          cx={42 + 12 * Math.cos((deg * Math.PI) / 180)}
          cy={52 + 12 * Math.sin((deg * Math.PI) / 180)}
          r="3.6"
          fill="#05070f"
          stroke="url(#df-metal)"
          strokeWidth="1"
        />
      ))}
      {/* Unspooling film strip */}
      <path d="M60 60 Q78 66 82 80" fill="none" stroke="url(#df-metal-soft)" strokeWidth="6" strokeLinecap="round" opacity="0.8" />
      <rect x="76" y="74" width="4" height="4" fill="#05070f" opacity="0.7" />
      <rect x="82" y="80" width="4" height="4" fill="#05070f" opacity="0.6" />
    </g>
  );
}

function GraphicDesignArt() {
  return (
    <g>
      {/* Layout canvas */}
      <rect x="26" y="30" width="44" height="52" rx="2" fill="none" stroke="url(#df-metal-soft)" strokeWidth="2" />
      <line x1="26" y1="44" x2="70" y2="44" stroke="url(#df-metal-soft)" strokeWidth="1" opacity="0.6" />
      <rect x="32" y="50" width="18" height="12" fill="url(#df-metal)" opacity="0.55" />
      <line x1="32" y1="68" x2="64" y2="68" stroke="url(#df-metal-soft)" strokeWidth="1" opacity="0.6" />
      <line x1="32" y1="73" x2="58" y2="73" stroke="url(#df-metal-soft)" strokeWidth="1" opacity="0.4" />
      {/* Stylus */}
      <path d="M66 26 L80 40" stroke="url(#df-metal)" strokeWidth="4" strokeLinecap="round" />
      <path d="M77 37 L83 43 L79 47 L73 41 Z" fill="url(#df-metal)" />
    </g>
  );
}

function BrandingArt() {
  const nodes = [
    { x: 50, y: 34 },
    { x: 32, y: 58 },
    { x: 68, y: 58 },
    { x: 50, y: 76 },
  ];
  return (
    <g>
      <line x1={nodes[0].x} y1={nodes[0].y} x2={nodes[1].x} y2={nodes[1].y} stroke="url(#df-metal-soft)" strokeWidth="1.4" opacity="0.7" />
      <line x1={nodes[0].x} y1={nodes[0].y} x2={nodes[2].x} y2={nodes[2].y} stroke="url(#df-metal-soft)" strokeWidth="1.4" opacity="0.7" />
      <line x1={nodes[1].x} y1={nodes[1].y} x2={nodes[3].x} y2={nodes[3].y} stroke="url(#df-metal-soft)" strokeWidth="1.4" opacity="0.7" />
      <line x1={nodes[2].x} y1={nodes[2].y} x2={nodes[3].x} y2={nodes[3].y} stroke="url(#df-metal-soft)" strokeWidth="1.4" opacity="0.7" />
      <line x1={nodes[1].x} y1={nodes[1].y} x2={nodes[2].x} y2={nodes[2].y} stroke="url(#df-metal-soft)" strokeWidth="1" opacity="0.4" />
      {nodes.map((n, i) => (
        <circle key={i} cx={n.x} cy={n.y} r={i === 0 ? 8 : 5.5} fill="url(#df-metal)" opacity={i === 0 ? 0.95 : 0.75} />
      ))}
    </g>
  );
}

function ContentCreationArt() {
  return (
    <g>
      {/* Phone/content frame */}
      <rect x="38" y="26" width="24" height="48" rx="5" fill="none" stroke="url(#df-metal-soft)" strokeWidth="2.4" />
      <circle cx="50" cy="50" r="8" fill="url(#df-metal)" opacity="0.85" />
      <path d="M47 46 L55 50 L47 54 Z" fill="#05070f" />
      {/* Broadcast arcs */}
      <path d="M68 40 Q76 50 68 60" fill="none" stroke="url(#df-metal-soft)" strokeWidth="1.6" opacity="0.6" />
      <path d="M74 34 Q86 50 74 66" fill="none" stroke="url(#df-metal-soft)" strokeWidth="1.6" opacity="0.35" />
    </g>
  );
}

function TalentManagementArt() {
  return (
    <g>
      {/* Spotlight cone */}
      <path d="M50 22 L32 78 L68 78 Z" fill="url(#df-glow)" opacity="0.8" />
      {/* Abstract stage mark, deliberately non-figurative */}
      <circle cx="50" cy="56" r="7" fill="url(#df-metal)" opacity="0.9" />
      <path d="M40 78 Q50 62 60 78 Z" fill="url(#df-metal-soft)" opacity="0.85" />
      <rect x="34" y="80" width="32" height="2.4" rx="1.2" fill="url(#df-metal-soft)" opacity="0.5" />
    </g>
  );
}

function ProductionServicesArt() {
  return (
    <g>
      {/* Clapperboard — board body + hinged, open striped clapper bar */}
      <rect x="22" y="52" width="40" height="26" rx="2" fill="none" stroke="url(#df-metal-soft)" strokeWidth="2.2" />
      <rect
        x="22"
        y="41"
        width="40"
        height="9"
        rx="1.5"
        fill="url(#df-clapper-stripes)"
        stroke="url(#df-metal-soft)"
        strokeWidth="0.8"
        transform="rotate(-13 22 45.5)"
      />
      {/* Light stand + softbox */}
      <line x1="78" y1="38" x2="78" y2="80" stroke="url(#df-metal-soft)" strokeWidth="1.6" opacity="0.75" />
      <rect x="68" y="24" width="20" height="15" rx="2" fill="url(#df-metal)" opacity="0.85" />
      <line x1="70" y1="80" x2="86" y2="80" stroke="url(#df-metal-soft)" strokeWidth="1.6" opacity="0.75" />
    </g>
  );
}

const SUBJECTS: Record<DepartmentFallbackSlug, () => React.ReactElement> = {
  photography: PhotographyArt,
  videography: VideographyArt,
  "graphic-design": GraphicDesignArt,
  branding: BrandingArt,
  "content-creation": ContentCreationArt,
  "talent-management": TalentManagementArt,
  production: ProductionServicesArt,
};

export function isDepartmentFallbackSlug(slug: string): slug is DepartmentFallbackSlug {
  return slug in SUBJECTS;
}

export default function DepartmentFallbackArt({ slug, className = "" }: { slug: string; className?: string }) {
  const Subject = SUBJECTS[slug as DepartmentFallbackSlug];
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden="true">
      <SharedDefs />
      <Ground />
      {Subject ? <Subject /> : null}
      {/* Vignette for editorial polish */}
      <rect width="100" height="100" fill="url(#df-vignette)" opacity="0.5" />
      <defs>
        <radialGradient id="df-vignette" cx="50%" cy="50%" r="75%">
          <stop offset="60%" stopColor="#000000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.55" />
        </radialGradient>
      </defs>
    </svg>
  );
}
