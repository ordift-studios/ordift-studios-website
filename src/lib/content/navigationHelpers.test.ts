import { describe, expect, it } from "vitest";
import { withHrefFallback } from "./navigationHelpers";

// Public Workshops nav defect (2026-09-20) — regression coverage for
// the reported symptom: clicking "Workshops" in the main nav produced
// no navigation at all, traced to a blank href in the live Sanity
// navigation singleton. withHrefFallback() is a pure function (no
// server-only imports), so these are real assertions.

describe("withHrefFallback", () => {
  it("repairs a link whose href is blank by matching its label against the canonical seed navigation", () => {
    const result = withHrefFallback([{ label: "Workshops", href: "" }]);
    expect(result).toEqual([{ label: "Workshops", href: "/workshops" }]);
  });

  it("repairs a link whose href is whitespace-only", () => {
    const result = withHrefFallback([{ label: "Workshops", href: "   " }]);
    expect(result[0].href).toBe("/workshops");
  });

  it("leaves a link with a real, non-blank href completely untouched — an intentionally repointed href is never overridden", () => {
    const result = withHrefFallback([{ label: "Workshops", href: "/workshops?category=photography" }]);
    expect(result).toEqual([{ label: "Workshops", href: "/workshops?category=photography" }]);
  });

  it("leaves a blank-href link with no matching seed label unchanged (nothing to fall back to)", () => {
    const result = withHrefFallback([{ label: "A Brand New Section", href: "" }]);
    expect(result).toEqual([{ label: "A Brand New Section", href: "" }]);
  });

  it("repairs only the affected link in a mixed list, preserving order and every other link exactly", () => {
    const input = [
      { label: "About", href: "/about" },
      { label: "Workshops", href: "" },
      { label: "Stories", href: "/journal" },
    ];
    const result = withHrefFallback(input);
    expect(result).toEqual([
      { label: "About", href: "/about" },
      { label: "Workshops", href: "/workshops" },
      { label: "Stories", href: "/journal" },
    ]);
  });
});
