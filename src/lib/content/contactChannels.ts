// Ordift Studios public contact channels (2026-09-07) — the single
// source of truth for approved functional mailboxes, so individual
// pages/components never hardcode an email string of their own. Public
// pages should render PRIMARY_PUBLIC_CONTACT_EMAIL (or resolve a
// CMS-supplied value through resolvePublicContactEmail below) rather
// than importing a literal address.
//
// ordift.ghana@gmail.com is internal/legacy/recovery only and must
// never be shown to the public — see resolvePublicContactEmail.

export const PUBLIC_CONTACT_EMAILS = {
  enquiries: "enquiries@ordiftstudios.com",
  info: "info@ordiftstudios.com",
  bookings: "bookings@ordiftstudios.com",
  accounts: "accounts@ordiftstudios.com",
  careers: "careers@ordiftstudios.com",
  commercials: "commercials@ordiftstudios.com",
} as const;

export const PRIMARY_PUBLIC_CONTACT_EMAIL = PUBLIC_CONTACT_EMAILS.enquiries;

// Internal/legacy address that must never be publicly exposed —
// recognized here so any content source still carrying it (e.g. a
// stale CMS field or an unset env var) is corrected at render time
// rather than requiring every call site to know about it.
const LEGACY_INTERNAL_EMAIL = "ordift.ghana@gmail.com";

// Resolves a CMS-supplied (or otherwise externally sourced) contact
// email for PUBLIC display: falls back to the approved primary address
// whenever the source value is empty or is the known legacy/internal
// address. Any other genuinely-configured @ordiftstudios.com (or other)
// address an Admin has deliberately set is passed through unchanged —
// this only ever corrects the one known-wrong value, it never
// overrides a real editorial choice.
export function resolvePublicContactEmail(raw: string | null | undefined): string {
  const trimmed = raw?.trim();
  if (!trimmed || trimmed.toLowerCase() === LEGACY_INTERNAL_EMAIL) {
    return PRIMARY_PUBLIC_CONTACT_EMAIL;
  }
  return trimmed;
}
