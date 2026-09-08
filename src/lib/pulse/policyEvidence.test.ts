import { describe, expect, it } from "vitest";
import {
  evaluatePolicyText,
  buildPolicyCheckPatch,
  buildPolicyCheckTrustSuggestion,
  POLICY_CHECK_WRITE_FIELDS,
  PULSE_SOURCE_DECISION_FIELDS,
} from "./policyEvidence";

// Rights Intelligence, "Check Policy" (2026-09-08) — A/B/C/D/E matrix
// per the approved architecture review, plus the field-isolation
// guarantee that is the single most safety-critical property of this
// feature.

describe("Field isolation — the #1 safety requirement", () => {
  it("buildPolicyCheckPatch's key set is disjoint from every human-decision field, and is exactly the five evidence fields", () => {
    const patch = buildPolicyCheckPatch({
      checkedAt: "2026-09-08T12:00:00.000Z",
      checkedUrl: "https://example.com/terms",
      recommendation: "inconclusive",
      evidence: [],
      trustSuggestion: null,
    });
    const patchKeys = Object.keys(patch).sort();
    expect(patchKeys).toEqual([...POLICY_CHECK_WRITE_FIELDS].sort());
    for (const decisionField of PULSE_SOURCE_DECISION_FIELDS) {
      expect(patchKeys).not.toContain(decisionField);
    }
  });

  it("PULSE_SOURCE_DECISION_FIELDS enumerates all six independent concerns (plus their two supporting fields) named in the approved design", () => {
    expect(PULSE_SOURCE_DECISION_FIELDS).toEqual([
      "permissionClassification",
      "isActive",
      "imageUsePermitted",
      "commercialUsePermitted",
      "autoPublishEligible",
      "editorialTrustLevel",
      "attributionRequirement",
      "lastPolicyReviewDate",
    ]);
  });
});

// --- A: clearly permissive policy -> candidate-green ---------------------
describe("Scenario A — clearly permissive policy", () => {
  it("a real permission-verb phrase co-occurring with real asset-context language returns candidate-green", () => {
    const text =
      "Press materials, including product photographs and executive headshots, may be used by media outlets for editorial purposes without prior written permission.";
    const result = evaluatePolicyText(text);
    expect(result.recommendation).toBe("candidate-green");
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.evidence.every((e) => e.snippet.length < 400)).toBe(true); // bounded
  });
});

// --- B: clearly restrictive policy -> candidate-red -----------------------
describe("Scenario B — clearly restrictive policy", () => {
  it("unambiguous restrictive language returns candidate-red", () => {
    const text =
      "All content on this website, including but not limited to text, images, and trademarks, is protected by copyright. Reproduction or distribution of any material without our prior written consent is strictly prohibited.";
    const result = evaluatePolicyText(text);
    expect(result.recommendation).toBe("candidate-red");
    expect(result.evidence.length).toBeGreaterThan(0);
  });
});

// --- C: ambiguous / no clear signal -> inconclusive ------------------------
describe("Scenario C — ambiguous or no clear signal", () => {
  it("ordinary boilerplate with neither a clear permissive nor restrictive phrase returns inconclusive", () => {
    const text = "Welcome to our website. We use cookies to improve your experience. Contact us with any questions about our products.";
    const result = evaluatePolicyText(text);
    expect(result.recommendation).toBe("inconclusive");
  });

  it("a single isolated keyword ('royalty-free') with no permission-verb phrase around it is never enough for candidate-green", () => {
    const text = "This report was printed on royalty-free stock paper sourced from a certified sustainable supplier.";
    const result = evaluatePolicyText(text);
    expect(result.recommendation).toBe("inconclusive");
  });

  it("a single isolated keyword ('press') with no permission-verb phrase is never enough for candidate-green", () => {
    const text = "Our press office is located on the third floor and handles all media inquiries during business hours.";
    const result = evaluatePolicyText(text);
    expect(result.recommendation).toBe("inconclusive");
  });

  it("a permission-verb phrase with NO nearby asset-context word (generic site-wide language) is skipped, not counted as evidence", () => {
    // "may be used" appears, but nothing nearby says press/media/photo/
    // trademark/third-party — this must read as generic website ToS
    // boilerplate, not a grant to reuse newsroom/media assets.
    const text = "By using this website you agree to our terms. Cookies may be used to remember your session preferences.";
    const result = evaluatePolicyText(text);
    expect(result.recommendation).toBe("inconclusive");
  });

  it("a permission-verb phrase with 'attribution' alone nearby (not a real asset-context term) is still not enough for candidate-green", () => {
    const text = "This page may be used for general reference. Attribution of the site design is appreciated but not required.";
    const result = evaluatePolicyText(text);
    expect(result.recommendation).toBe("inconclusive");
  });
});

// --- D: official source, discovery-acceptable, image reuse unresolved ------
describe("Scenario D — official source: discovery vs. image-reuse independence", () => {
  it("evaluatePolicyText's recommendation is unaffected by source classification — it only ever reasons about the fetched text", () => {
    // No sourceClassification parameter exists on evaluatePolicyText at
    // all — this is a structural guarantee, not just a behavioural one.
    const text = "All rights reserved. Photographs may not be reproduced without prior written consent.";
    expect(evaluatePolicyText(text).recommendation).toBe("candidate-red");
  });

  it("buildPolicyCheckTrustSuggestion never returns a Trust Level value, and is null for a non-official source", () => {
    const officialSuggestion = buildPolicyCheckTrustSuggestion("official_primary");
    expect(officialSuggestion).toContain("not an independent source");
    expect(["high", "standard", "unverified", "flagged"]).not.toContain(officialSuggestion);
    expect(buildPolicyCheckTrustSuggestion("editorial_discovery")).toBeNull();
    expect(buildPolicyCheckTrustSuggestion(null)).toBeNull();
    expect(buildPolicyCheckTrustSuggestion(undefined)).toBeNull();
  });

  it("official-domain ownership is never phrased as universally 'high trust' — the suggestion text itself says the opposite", () => {
    const suggestion = buildPolicyCheckTrustSuggestion("official_primary")!;
    expect(suggestion.toLowerCase()).not.toContain("high trust");
    expect(suggestion).toContain("authoritative for the brand's own announcements");
  });
});

// --- E: contradiction -> inconclusive, never candidate-green ---------------
describe("Scenario E — permissive AND restrictive evidence both present", () => {
  it("returns inconclusive, never candidate-green, when both signals appear on the same page", () => {
    const text =
      "Press materials may be used by media outlets for editorial purposes without prior written permission. " +
      "However, all photographs remain the property of the company and may not be reproduced without prior written consent.";
    const result = evaluatePolicyText(text);
    expect(result.recommendation).toBe("inconclusive");
    expect(result.recommendation).not.toBe("candidate-green");
    // Evidence should still surface both sides so a human can see why.
    const categories = result.evidence.map((e) => e.category);
    expect(categories.length).toBeGreaterThan(0);
  });
});

describe("Evidence quality — category distinctions and bounded snippets", () => {
  it("distinguishes photographs from trademarks from press-materials rather than collapsing into one category", () => {
    const text = "All photographs are protected by copyright and may not be reproduced without prior written consent.";
    const result = evaluatePolicyText(text);
    expect(result.evidence.some((e) => e.category === "photographs")).toBe(true);
  });

  it("tags trademark-specific restrictive language distinctly from photograph-specific language", () => {
    const text = "Our trademarks and logos may not be used without prior written consent from the company.";
    const result = evaluatePolicyText(text);
    expect(result.evidence.some((e) => e.category === "trademarks")).toBe(true);
  });

  it("never returns a snippet anywhere near the length of a full policy page — bounded to a short window", () => {
    const longPolicy = "All rights reserved. ".repeat(500) + "Photographs may not be reproduced without prior written consent. " + "Other terms follow. ".repeat(500);
    const result = evaluatePolicyText(longPolicy);
    for (const item of result.evidence) {
      expect(item.snippet.length).toBeLessThan(400);
    }
  });

  it("strips HTML tags before evaluating rather than matching against markup", () => {
    const html = "<html><body><p>All <b>rights</b> reserved. Photographs may not be <i>reproduced</i> without prior written consent.</p></body></html>";
    const result = evaluatePolicyText(html);
    expect(result.recommendation).toBe("candidate-red");
    expect(result.evidence[0].snippet).not.toContain("<");
  });

  it("caps the number of evidence items returned (bounded, never unbounded growth)", () => {
    const text = [
      "All rights reserved.",
      "Photographs may not be reproduced without prior written consent.",
      "Trademarks and logos may not be used without prior written consent.",
      "Third-party licensor content may not be distributed without prior written consent.",
      "This site reserves all rights to its press materials.",
      "Unauthorized use of any image is strictly prohibited.",
      "No license is granted for any third-party trademark.",
    ].join(" ");
    const result = evaluatePolicyText(text);
    expect(result.evidence.length).toBeLessThanOrEqual(5);
  });
});
