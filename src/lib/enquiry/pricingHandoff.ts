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

// Base64 via btoa/atob — both are available globally in the browser and
// in the Next.js server runtime (Node 18+). encodeURIComponent/
// decodeURIComponent around them handles non-Latin1 characters safely.
export function encodePricingHandoff(handoff: PricingHandoff): string {
  try {
    const json = JSON.stringify({
      family: handoff.family,
      pathway: handoff.pathway,
      summaryTitle: handoff.summaryTitle.slice(0, 200),
      summaryLines: sanitizeLines(handoff.summaryLines),
    });
    const encoded = btoa(encodeURIComponent(json));
    return encoded.length <= MAX_ENCODED_LENGTH ? encoded : "";
  } catch {
    return "";
  }
}

export function decodePricingHandoff(raw: string | undefined | null): PricingHandoff | null {
  if (!raw || raw.length > MAX_ENCODED_LENGTH) return null;
  try {
    const json = decodeURIComponent(atob(raw));
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
