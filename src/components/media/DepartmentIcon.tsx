// Ordift Studios department icon fallback system (2026-09-07) — a
// coherent, restrained line-icon language shown in MediaPlaceholder
// wherever a department has no real portfolio imagery yet. One icon
// per department, all sharing the same 24x24 viewBox, 1.5 stroke
// weight, rounded caps/joins and no fill — deliberately plain
// geometric line art, not illustrative or decorative. Falls back to
// MediaPlaceholder's own Ordift monogram when a slug has no mapping
// (e.g. non-department placeholders elsewhere on the site).

export type DepartmentSlug =
  | "photography"
  | "videography"
  | "graphic-design"
  | "branding"
  | "content-creation"
  | "talent-management"
  | "production";

const ICON_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function CameraIcon() {
  return (
    <svg {...ICON_PROPS} stroke="currentColor">
      <path d="M4 8.5h2.5L8 6h8l1.5 2.5H20a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function CinemaCameraIcon() {
  return (
    <svg {...ICON_PROPS} stroke="currentColor">
      <rect x="3" y="8" width="12" height="9" rx="1.2" />
      <path d="M15 11.2 21 8v10l-6-3.2Z" />
      <path d="M6.5 8V6M10.5 8V6" />
    </svg>
  );
}

function DesignToolIcon() {
  return (
    <svg {...ICON_PROPS} stroke="currentColor">
      <rect x="4" y="5" width="16" height="12" rx="1.2" />
      <circle cx="9.5" cy="11" r="1.4" />
      <path d="M4 15.5 9 11l3 3 3.5-3.5L20 15" />
    </svg>
  );
}

function BrandStrategyIcon() {
  return (
    <svg {...ICON_PROPS} stroke="currentColor">
      <circle cx="12" cy="7" r="2.3" />
      <circle cx="6" cy="17" r="2.3" />
      <circle cx="18" cy="17" r="2.3" />
      <path d="M10.4 8.6 7.6 15.1M13.6 8.6l2.8 6.5M8.3 17h7.4" />
    </svg>
  );
}

function ContentIcon() {
  return (
    <svg {...ICON_PROPS} stroke="currentColor">
      <rect x="3.5" y="5" width="17" height="14" rx="1.2" />
      <path d="M10.2 9.3v5.4l4.6-2.7-4.6-2.7Z" strokeLinejoin="round" />
    </svg>
  );
}

function TalentIcon() {
  return (
    <svg {...ICON_PROPS} stroke="currentColor">
      <circle cx="9" cy="8.5" r="2.5" />
      <path d="M4 18c0-2.8 2.2-5 5-5s5 2.2 5 5" />
      <circle cx="17" cy="9.5" r="2" />
      <path d="M14.8 13.2c1.6.2 3.7 1.5 3.7 4.3" />
    </svg>
  );
}

function ClapperboardIcon() {
  return (
    <svg {...ICON_PROPS} stroke="currentColor">
      <path d="M4 10.5 5.2 6h13.6L20 10.5" strokeLinejoin="round" />
      <path d="m6 6 2 3.2M10 6l2 3.2M14 6l2 3.2" />
      <rect x="4" y="10.5" width="16" height="7.5" rx="1" />
    </svg>
  );
}

const ICONS: Record<DepartmentSlug, () => React.ReactElement> = {
  photography: CameraIcon,
  videography: CinemaCameraIcon,
  "graphic-design": DesignToolIcon,
  branding: BrandStrategyIcon,
  "content-creation": ContentIcon,
  "talent-management": TalentIcon,
  production: ClapperboardIcon,
};

export function getDepartmentIcon(slug: string): React.ReactElement | null {
  const Icon = ICONS[slug as DepartmentSlug];
  return Icon ? <Icon /> : null;
}
