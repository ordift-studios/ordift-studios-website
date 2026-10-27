// The approved cover design's rules, kept pure so they can be tested without rendering: what the cover says, which photograph references are accepted, and what must be true before an edition is approved.
// The wording is DERIVED, never typed: the service descriptor comes from the activities the issuing entity was verified to be licensed for, and the edition line from the jurisdiction.
import { ISSUING_RULES } from "./jurisdictions";
import type { RateCardContent, RateCardCover } from "./types";

export const COVER_PANEL_OPACITY = 0.7;
export const DEFAULT_COVER: RateCardCover = { variant: "standard", focusY: 0.5 };
export const coverOf = (c: RateCardContent): RateCardCover => ({ ...DEFAULT_COVER, ...(c.cover ?? {}) });

export type CoverWording = { descriptor: string | null; edition: string };

// Photography and film are the only two services the cover may name, and each only when the issuing entity's verified activities include it. With no verified activity there is no descriptor at all
// (the cover then shows just the title and edition) — a cover never claims a service that was not verified.
export function coverWording(c: RateCardContent): CoverWording {
  const lic = c.meta.issuingEntity?.licensedActivities ?? [];
  const photo = lic.includes("photography"), film = lic.includes("videography");
  const wedding = coverOf(c).variant === "wedding";
  let descriptor: string | null = null;
  if (photo && film) descriptor = wedding ? "Wedding Photography & Film" : "Photography & Film Services";
  else if (photo) descriptor = wedding ? "Wedding Photography" : "Photography Services";
  else if (film) descriptor = wedding ? "Wedding Film" : "Film Services";
  const place = ISSUING_RULES[c.meta.marketSlug]?.jurisdiction ?? c.meta.marketName;
  return { descriptor, edition: `${place} Edition` };
}

// A cover photograph is either a file bundled with the app (/pdf/…) or an asset uploaded through the builder, which lives at an immutable content-addressed Sanity CDN address (the file name carries
// its hash, so replacing a photograph means a NEW address and an approved edition can never silently change). Nothing else — no other host, no query string, no data: URI — is accepted.
const SANITY_IMAGE = /^https:\/\/cdn\.sanity\.io\/images\/([a-z0-9]+)\/([a-z0-9_-]+)\/[A-Za-z0-9]+-\d+x\d+\.(?:jpg|jpeg|png|webp)$/;
const BUNDLED = /^\/pdf\/[A-Za-z0-9._-]+\.(?:jpg|jpeg|png|webp)$/;
export const isSanityCoverUrl = (u: string): boolean => SANITY_IMAGE.test(u);
export const isCoverImageAllowed = (u: string): boolean => BUNDLED.test(u) || SANITY_IMAGE.test(u);
export function sanityCoverScope(u: string): { projectId: string; dataset: string } | null { const m = SANITY_IMAGE.exec(u); return m ? { projectId: m[1], dataset: m[2] } : null; }

// Same-origin address the browser fetches an uploaded photograph through (the route re-checks the signed-in Super Admin and the exact project/dataset before it fetches anything).
export const COVER_PROXY = "/api/admin/pricing/rate-card/cover";
export const coverProxyUrl = (u: string): string => `${COVER_PROXY}?src=${encodeURIComponent(u)}`;

export type CoverCheck = { errors: string[]; warnings: string[] };
export function validateCover(c: RateCardContent, mode: "draft" | "approval"): CoverCheck {
  const errors: string[] = [], warnings: string[] = [];
  const hard = mode === "approval" ? errors : warnings;
  const cov = coverOf(c);
  if (c.coverImage.trim() && !isCoverImageAllowed(c.coverImage.trim())) errors.push("The cover photograph must be a bundled /pdf/ image or a photograph uploaded through the rate card builder.");
  if (!Number.isFinite(cov.focusY) || cov.focusY < 0 || cov.focusY > 1) errors.push("The cover crop position must be between 0 and 1.");
  if (cov.variant !== "standard" && cov.variant !== "wedding") errors.push("Unknown cover variant.");
  if (cov.variant === "wedding" && c.meta.marketSlug !== "ghana") errors.push("The wedding cover variation is only available for the Ghana edition.");
  if (c.coverImage.trim() && cov.cleared !== true) hard.push("Confirm that Ordift may use the cover photograph on a client-facing rate card (people shown, permissions) before approval.");
  if (c.coverImage.trim() && cov.cleared === true && !(cov.clearedNote ?? "").trim()) hard.push("Say what the cover photograph's clearance rests on (for example the Founder's own statement).");
  if (!coverWording(c).descriptor) hard.push("The cover names no service yet: choose the issuing entity so the wording can be taken from its verified activities.");
  return { errors, warnings };
}
