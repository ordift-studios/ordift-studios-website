// Generic date formatting shared across content types (Workshops, Journal,
// and anything future). Lives in a neutral location rather than inside
// e.g. workshopHelpers.ts, since it isn't workshop-specific logic — same
// reasoning as the src/lib/shared/ move in ARCHITECTURE.md.

export function formatDate(iso: string | null): string {
  if (!iso) return "To be announced";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
