// Final Admin Pricing navigation consolidation (2026-09-07) — pure,
// zero-import config, extracted from page.tsx so the exact tab order
// is directly unit-testable (see tabsConfig.test.ts) rather than only
// verifiable by reading the Server Component. Route keys, calculator
// behavior, and query-param/deep-link behavior are unchanged by this
// extraction — page.tsx imports and uses this array exactly as it did
// when it was defined inline.

export const TABS = [
  { key: "personal-sessions", label: "Personal Sessions" },
  { key: "corporate", label: "Corporate & Headshots" },
  { key: "wedding_event", label: "Weddings & Events" },
  { key: "commercial", label: "Commercial / Advertising" },
  { key: "graphic_design", label: "Graphic Design" },
  { key: "content_creation", label: "Content Creation" },
  { key: "branding", label: "Branding & Creative Strategy" },
  { key: "production_services", label: "Production Services" },
  { key: "subjects", label: "Subjects / Groups" },
  { key: "addons", label: "Add-Ons" },
  { key: "discounts", label: "Discounts" },
  { key: "markets", label: "Markets / Overrides" },
] as const;

export type AdminPricingTabKey = (typeof TABS)[number]["key"];

export const TAB_GROUPS: { title: string; keys: AdminPricingTabKey[] }[] = [
  { title: "Service Pricing", keys: ["personal-sessions", "corporate", "wedding_event", "commercial", "graphic_design", "content_creation", "branding", "production_services"] },
  { title: "Shared Configuration", keys: ["subjects", "addons", "discounts", "markets"] },
];
