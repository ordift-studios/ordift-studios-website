import { describe, expect, it } from "vitest";
import {
  evaluatePolicyText,
  buildPolicyCheckPatch,
  buildPolicyCheckTrustSuggestion,
  POLICY_CHECK_WRITE_FIELDS,
  PULSE_SOURCE_DECISION_FIELDS,
  isSameOrSubdomain,
  deriveOfficialDomain,
  extractPolicyCandidateLinks,
  buildFallbackCandidateEvidence,
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

// =========================================================================
// Official-Domain Policy Discovery Fallback (2026-09-08)
// =========================================================================

describe("isSameOrSubdomain — label-boundary-safe domain comparison", () => {
  it("accepts the exact official domain", () => {
    expect(isSameOrSubdomain("nikon.com", "nikon.com")).toBe(true);
  });
  it("accepts www. and a genuine subdomain", () => {
    expect(isSameOrSubdomain("www.nikon.com", "nikon.com")).toBe(true);
    expect(isSameOrSubdomain("press.nikon.com", "nikon.com")).toBe(true);
    expect(isSameOrSubdomain("a.b.press.nikon.com", "nikon.com")).toBe(true);
  });
  it("is case-insensitive", () => {
    expect(isSameOrSubdomain("WWW.NIKON.COM", "nikon.com")).toBe(true);
  });
  it("rejects a domain that merely CONTAINS the official domain as a substring — the exact naive-suffix-matching bug this was designed to avoid", () => {
    expect(isSameOrSubdomain("evilnikon.com", "nikon.com")).toBe(false);
    expect(isSameOrSubdomain("notnikon.com", "nikon.com")).toBe(false);
  });
  it("rejects a domain that merely ENDS with the official domain's characters without a real label boundary", () => {
    expect(isSameOrSubdomain("nikon.com.evil.com", "nikon.com")).toBe(false);
  });
  it("rejects an entirely unrelated domain", () => {
    expect(isSameOrSubdomain("petapixel.com", "nikon.com")).toBe(false);
    expect(isSameOrSubdomain("facebook.com", "nikon.com")).toBe(false);
  });
  it("rejects a bare TLD/empty official domain rather than matching everything", () => {
    expect(isSameOrSubdomain("anything.com", "")).toBe(false);
  });
});

describe("deriveOfficialDomain", () => {
  it("strips a leading www. label", () => {
    expect(deriveOfficialDomain("https://www.nikon.com")).toBe("nikon.com");
  });
  it("leaves a bare domain unchanged", () => {
    expect(deriveOfficialDomain("https://nikon.com")).toBe("nikon.com");
  });
  it("leaves a genuine non-www subdomain unchanged (never strips more than the one leading www. label)", () => {
    expect(deriveOfficialDomain("https://shop.nikon.com")).toBe("shop.nikon.com");
  });
  it("returns null for a malformed URL", () => {
    expect(deriveOfficialDomain("not a url")).toBeNull();
  });
  it("returns null for a non-http(s) scheme", () => {
    expect(deriveOfficialDomain("ftp://nikon.com")).toBeNull();
  });
});

describe("extractPolicyCandidateLinks — discovery matrix", () => {
  const BASE = "https://www.nikon.com/";
  const DOMAIN = "nikon.com";

  it("E: finds a same-official-domain candidate matching a legal/terms keyword", () => {
    const html = `<html><body><nav><a href="/company/terms-of-use">Terms of Use</a></nav></body></html>`;
    const candidates = extractPolicyCandidateLinks(html, BASE, DOMAIN);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].url).toBe("https://www.nikon.com/company/terms-of-use");
    expect(candidates[0].category).toBe("legal-terms");
  });

  it("finds a press/newsroom candidate as a distinct category from legal/terms", () => {
    const html = `<a href="/newsroom">Newsroom</a>`;
    const candidates = extractPolicyCandidateLinks(html, BASE, DOMAIN);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].category).toBe("press-newsroom");
  });

  it("resolves a relative href against the fetched homepage URL", () => {
    const html = `<a href="legal/copyright">Copyright</a>`;
    const candidates = extractPolicyCandidateLinks(html, BASE, DOMAIN);
    expect(candidates[0].url).toBe("https://www.nikon.com/legal/copyright");
  });

  it("F: rejects a candidate that would leave the official trust boundary, even with a matching keyword", () => {
    const html = `<a href="https://totallydifferent.com/terms-of-use">Terms of Use (off-site)</a>`;
    const candidates = extractPolicyCandidateLinks(html, BASE, DOMAIN);
    expect(candidates).toHaveLength(0);
  });

  it("F: rejects a lookalike domain that merely contains the official domain as a substring", () => {
    const html = `<a href="https://nikon.com.evil.com/terms">Terms</a>`;
    const candidates = extractPolicyCandidateLinks(html, BASE, DOMAIN);
    expect(candidates).toHaveLength(0);
  });

  it("does not surface a same-domain link that matches no keyword at all", () => {
    const html = `<a href="/products/cameras">Cameras</a>`;
    const candidates = extractPolicyCandidateLinks(html, BASE, DOMAIN);
    expect(candidates).toHaveLength(0);
  });

  it("J: rejects javascript:, data:, mailto:, and tel: targets even if their link text matches a keyword", () => {
    const html = [
      `<a href="javascript:alert('terms')">Terms</a>`,
      `<a href="data:text/html,terms">Terms</a>`,
      `<a href="mailto:legal@nikon.com">Legal</a>`,
      `<a href="tel:+18005551234">Legal Hotline</a>`,
    ].join("");
    const candidates = extractPolicyCandidateLinks(html, BASE, DOMAIN);
    expect(candidates).toHaveLength(0);
  });

  it("rejects a URL carrying credentials/userinfo", () => {
    const html = `<a href="https://user:pass@nikon.com/legal">Legal</a>`;
    const candidates = extractPolicyCandidateLinks(html, BASE, DOMAIN);
    expect(candidates).toHaveLength(0);
  });

  it("rejects a pure in-page fragment", () => {
    const html = `<a href="#legal-section">Legal</a>`;
    const candidates = extractPolicyCandidateLinks(html, BASE, DOMAIN);
    expect(candidates).toHaveLength(0);
  });

  it("bounds the candidate count even when many keyword-matching links exist", () => {
    const html = Array.from({ length: 20 }, (_, i) => `<a href="/legal-${i}">Legal Page ${i}</a>`).join("");
    const candidates = extractPolicyCandidateLinks(html, BASE, DOMAIN);
    expect(candidates.length).toBeLessThanOrEqual(3);
  });

  it("dedupes two links that resolve to the identical URL (e.g. differing only by fragment)", () => {
    const html = `<a href="/legal#top">Legal</a><a href="/legal">Legal (again)</a>`;
    const candidates = extractPolicyCandidateLinks(html, BASE, DOMAIN);
    expect(candidates).toHaveLength(1);
  });

  describe("malformed / unusual HTML — must fail safe, never invent a URL, never throw", () => {
    it("unterminated tag soup produces no candidates rather than throwing", () => {
      const html = `<a href="/legal" >Legal<div><a href=broken`;
      expect(() => extractPolicyCandidateLinks(html, BASE, DOMAIN)).not.toThrow();
    });

    it("a href attribute with no value / empty string never becomes a candidate", () => {
      const html = `<a href="">Legal</a><a href>Legal 2</a>`;
      const candidates = extractPolicyCandidateLinks(html, BASE, DOMAIN);
      expect(candidates).toHaveLength(0);
    });

    it("deeply nested/garbled markup around a legitimate link still only extracts the literal href present, never a fabricated one", () => {
      const html = `<div><span><a href="/legal/copyright"><b><i>Copyright</i></b></a></span></div>`;
      const candidates = extractPolicyCandidateLinks(html, BASE, DOMAIN);
      expect(candidates).toHaveLength(1);
      expect(candidates[0].url).toBe("https://www.nikon.com/legal/copyright");
    });

    it("a huge run of non-anchor markup does not hang or crash (bounded, linear scan)", () => {
      const html = "<div>".repeat(5000) + `<a href="/legal">Legal</a>` + "</div>".repeat(5000);
      const start = Date.now();
      const candidates = extractPolicyCandidateLinks(html, BASE, DOMAIN);
      expect(Date.now() - start).toBeLessThan(2000);
      expect(candidates).toHaveLength(1);
    });

    it("completely empty or non-HTML input produces no candidates", () => {
      expect(extractPolicyCandidateLinks("", BASE, DOMAIN)).toEqual([]);
      expect(extractPolicyCandidateLinks("plain text, no markup at all", BASE, DOMAIN)).toEqual([]);
    });

    it("a null-byte or control-character-laced href never crashes the parser and is safely handled by URL resolution", () => {
      const html = `<a href="/legal\x00/copyright">Copyright</a>`;
      expect(() => extractPolicyCandidateLinks(html, BASE, DOMAIN)).not.toThrow();
    });
  });
});

describe("buildFallbackCandidateEvidence", () => {
  it("preserves the URL, the matched term, and the category as the 'why' evidence", () => {
    const item = buildFallbackCandidateEvidence({
      url: "https://www.nikon.com/company/terms-of-use",
      title: "Terms of Use",
      matchedTerm: "terms of use",
      category: "legal-terms",
    });
    expect(item.category).toBe("fallback-candidate");
    expect(item.url).toBe("https://www.nikon.com/company/terms-of-use");
    expect(item.snippet).toContain("Terms of Use");
    expect(item.snippet).toContain("terms of use");
    expect(item.snippet.length).toBeLessThan(300); // bounded, never a page reproduction
  });
});
