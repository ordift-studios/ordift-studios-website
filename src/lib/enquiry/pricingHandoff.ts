// Ordift Booking Journey Refinement (2026-09-07) — pure, zero-import
// encode/decode for carrying a configured pricing-family scope forward
// from /pricing into /book, so the visitor never has to re-answer
// "what are you building" once they've already configured it. Safe to
// import from a Client Component (each pricing estimator builds and
// encodes its own handoff) and from a Server Component (/book/page.tsx
// decodes it).
//
// This is DESCRIPTIVE information only — a human-readable summary for
// the visitor to review/edit and for Ordift staff to see in the
// enquiry notes. It is never treated as an authoritative price: no
// server code re-derives a charge from it, and nothing here creates or
// modifies a financial record. The enquiry/booking workflow this feeds
// into remains exactly what it already was — a request for Ordift to
// review and quote, not a checkout.

import { isPathwayValue, type PathwayValue } from "./pathways";

export type PricingHandoffFamily = "personal" | "corporate" | "wedding_event" | "commercial";

export type PricingHandoff = {
  family: PricingHandoffFamily;
  pathway: PathwayValue;
  summaryTitle: string;
  summaryLines: string[];
};

const MAX_ENCODED_LENGTH = 2000;

function isPricingHandoffFamily(value: unknown): value is PricingHandoffFamily {
  return value === "personal" || value === "corporate" || value === "wedding_event" || value === "commercial";
}

function sanitizeLines(lines: unknown): string[] {
  if (!Array.isArray(lines)) return [];
  return lines
    .filter((l): l is string => typeof l === "string")
    .map((l) => l.slice(0, 200))
    .slice(0, 20);
}

// Base64url (RFC 4648 §5) via btoa/atob — both are available globally
// in the browser and in the Next.js server runtime (Node 18+). Standard
// base64's `+`, `/` and `=` are NOT safe to place directly in a URL
// query string value (`+` in particular is read back as a literal
// space by some query-string parsers) — base64url swaps `+`/`/` for
// `-`/`_` and strips `=` padding (restored on decode from the string's
// length) so the token round-trips through a plain, unencoded href
// with no separate encodeURIComponent() step required at the call
// site. encodeURIComponent/decodeURIComponent around the JSON itself
// still handles non-Latin1 characters safely.
function toBase64Url(base64: string): string {
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(base64url: string): string {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
  return base64 + padding;
}

export function encodePricingHandoff(handoff: PricingHandoff): string {
  try {
    const json = JSON.stringify({
      family: handoff.family,
      pathway: handoff.pathway,
      summaryTitle: handoff.summaryTitle.slice(0, 200),
      summaryLines: sanitizeLines(handoff.summaryLines),
    });
    const encoded = toBase64Url(btoa(encodeURIComponent(json)));
    return encoded.length <= MAX_ENCODED_LENGTH ? encoded : "";
  } catch {
    return "";
  }
}

export function decodePricingHandoff(raw: string | undefined | null): PricingHandoff | null {
  if (!raw || raw.length > MAX_ENCODED_LENGTH) return null;
  try {
    const json = decodeURIComponent(atob(fromBase64Url(raw)));
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null) return null;
    const obj = parsed as Record<string, unknown>;
    if (!isPricingHandoffFamily(obj.family)) return null;
    if (typeof obj.pathway !== "string" || !isPathwayValue(obj.pathway)) return null;
    if (typeof obj.summaryTitle !== "string") return null;
    return {
      family: obj.family,
      pathway: obj.pathway,
      summaryTitle: obj.summaryTitle.slice(0, 200),
      summaryLines: sanitizeLines(obj.summaryLines),
    };
  } catch {
    return null;
  }
}

export function pricingHandoffFamilyLabel(family: PricingHandoffFamily): string {
  switch (family) {
    case "personal":
      return "Personal Portrait";
    case "corporate":
      return "Corporate & Headshots";
    case "wedding_event":
      return "Weddings & Events";
    case "commercial":
      return "Commercial / Advertising";
  }
}
