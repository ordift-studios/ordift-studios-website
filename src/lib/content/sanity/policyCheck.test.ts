import { describe, expect, it, vi } from "vitest";
import { checkPulseSourcePolicy, adoptPulseSourcePolicyCandidate, type PolicyCheckSanityClient } from "./pulseAdmin";
import { PULSE_SOURCE_DECISION_FIELDS } from "@/lib/pulse/policyEvidence";

// Rights Intelligence, "Check Policy" (2026-09-08) — real, executable
// tests via the same dependency-injection pattern already established
// by runDiscoveryForSource() (ingestion.test.ts): checkPulseSourcePolicy
// takes an injectable `sanity` client and `fetchPolicyText` function, so
// this suite never touches the real Sanity client or the network. This
// is deliberately a SEPARATE file from pulseSourceManager.test.ts (which
// doc-tests the rest of pulseAdmin.ts's DB-dependent functions) — those
// remain doc-tested because they have no injectable client; this one is
// injectable specifically so the #1 safety requirement (never writes a
// decision field) gets a real, structural test on the actual write
// path, not just a documented claim.

type MockSourceDoc = { termsUrl: string | null; sourceClassification: "official_primary" | "editorial_discovery" | null; url?: string | null } | null;

function makeMockSanity(source: MockSourceDoc = { termsUrl: "https://example.com/terms", sourceClassification: "official_primary", url: "https://www.example.com" }) {
  const patched: { id: string; fields: Record<string, unknown> }[] = [];
  const sanity: PolicyCheckSanityClient = {
    fetch: vi.fn(async () => source) as unknown as PolicyCheckSanityClient["fetch"],
    patch: (id: string) => ({
      set: (fields: Record<string, unknown>) => ({
        commit: async () => {
          patched.push({ id, fields });
          return {};
        },
      }),
    }),
  };
  return { sanity, patched };
}

describe("checkPulseSourcePolicy — refusals write nothing", () => {
  it("returns ok:false and writes nothing when no Policy/Rights URL is configured", async () => {
    const { sanity, patched } = makeMockSanity({ termsUrl: null, sourceClassification: null });
    const fetchPolicyText = vi.fn();
    const result = await checkPulseSourcePolicy("src1", sanity, fetchPolicyText);
    expect(result.ok).toBe(false);
    expect(patched).toHaveLength(0);
    expect(fetchPolicyText).not.toHaveBeenCalled();
  });

  it("returns ok:false and writes nothing when the source doesn't exist", async () => {
    const { sanity, patched } = makeMockSanity(null);
    const result = await checkPulseSourcePolicy("missing", sanity, vi.fn());
    expect(result.ok).toBe(false);
    expect(patched).toHaveLength(0);
  });
});

describe("checkPulseSourcePolicy — A/B/C/D/E via the real integration path", () => {
  it("A: candidate-green — the actual Sanity patch never carries any of the six decision fields", async () => {
    const { sanity, patched } = makeMockSanity();
    const fetchPolicyText = vi.fn(async () => ({
      ok: true as const,
      text: "Press materials may be used by media for editorial purposes without prior written permission.",
      contentType: "text/html",
    }));
    const result = await checkPulseSourcePolicy("nikon", sanity, fetchPolicyText);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.recommendation).toBe("candidate-green");
    expect(patched).toHaveLength(1);
    const keys = Object.keys(patched[0].fields);
    for (const decisionField of PULSE_SOURCE_DECISION_FIELDS) {
      expect(keys).not.toContain(decisionField);
    }
  });

  it("B: candidate-red — the patch has no isActive key at all, so the source structurally cannot be deactivated by this call", async () => {
    const { sanity, patched } = makeMockSanity();
    const fetchPolicyText = vi.fn(async () => ({
      ok: true as const,
      text: "All rights reserved. Photographs may not be reproduced without prior written consent.",
      contentType: "text/html",
    }));
    const result = await checkPulseSourcePolicy("nikon", sanity, fetchPolicyText);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.recommendation).toBe("candidate-red");
    expect(Object.prototype.hasOwnProperty.call(patched[0].fields, "isActive")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(patched[0].fields, "permissionClassification")).toBe(false);
  });

  it("C: a fetch failure (404/timeout/unsafe destination) is recorded as inconclusive, with provenance still preserved", async () => {
    const { sanity, patched } = makeMockSanity();
    const fetchPolicyText = vi.fn(async () => ({ ok: false as const, reason: "HTTP 404" }));
    const result = await checkPulseSourcePolicy("nikon", sanity, fetchPolicyText);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recommendation).toBe("inconclusive");
      expect(result.checkedUrl).toBe("https://example.com/terms");
    }
    expect(patched[0].fields.policyCheckedUrl).toBe("https://example.com/terms");
    expect(patched[0].fields.policyCheckRecommendation).toBe("inconclusive");
  });

  it("D: official_primary gets a non-binding trust suggestion distinct from any Trust Level value; editorial_discovery gets none", async () => {
    const okFetch = vi.fn(async () => ({ ok: true as const, text: "no clear signal here at all", contentType: "text/html" }));

    const official = makeMockSanity({ termsUrl: "https://example.com/terms", sourceClassification: "official_primary" });
    const officialResult = await checkPulseSourcePolicy("nikon", official.sanity, okFetch);
    expect(officialResult.ok).toBe(true);
    if (officialResult.ok) {
      expect(officialResult.trustSuggestion).toBeTruthy();
      expect(["high", "standard", "unverified", "flagged"]).not.toContain(officialResult.trustSuggestion);
    }
    // Discovery-vs-image-reuse independence: nothing about this call
    // ever reads or writes imageUsePermitted/isActive — confirmed again
    // by the same key-absence check as scenario B.
    expect(Object.prototype.hasOwnProperty.call(official.patched[0].fields, "imageUsePermitted")).toBe(false);

    const editorial = makeMockSanity({ termsUrl: "https://example.com/terms", sourceClassification: "editorial_discovery" });
    const editorialResult = await checkPulseSourcePolicy("petapixel", editorial.sanity, okFetch);
    expect(editorialResult.ok).toBe(true);
    if (editorialResult.ok) expect(editorialResult.trustSuggestion).toBeNull();
  });

  it("E: conflicting permissive+restrictive signals resolve to inconclusive end-to-end, never candidate-green", async () => {
    const { sanity } = makeMockSanity();
    const fetchPolicyText = vi.fn(async () => ({
      ok: true as const,
      text:
        "Press materials may be used by media for editorial purposes without prior written permission. " +
        "However, all photographs may not be reproduced without prior written consent.",
      contentType: "text/html",
    }));
    const result = await checkPulseSourcePolicy("nikon", sanity, fetchPolicyText);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.recommendation).toBe("inconclusive");
  });
});

describe("checkPulseSourcePolicy — URL provenance", () => {
  it("checkedUrl always reflects termsUrl as freshly read at THIS call — changing termsUrl between two checks never relabels the earlier evidence", async () => {
    const patched: { fields: Record<string, unknown> }[] = [];
    let currentTermsUrl = "https://example.com/terms-v1";
    const sanity: PolicyCheckSanityClient = {
      fetch: vi.fn(async () => ({ termsUrl: currentTermsUrl, sourceClassification: null })) as unknown as PolicyCheckSanityClient["fetch"],
      patch: () => ({
        set: (fields: Record<string, unknown>) => ({
          commit: async () => {
            patched.push({ fields });
            return {};
          },
        }),
      }),
    };
    const fetchPolicyText = vi.fn(async () => ({ ok: true as const, text: "no clear signal", contentType: "text/html" }));

    const first = await checkPulseSourcePolicy("src1", sanity, fetchPolicyText);
    expect(first.ok && first.checkedUrl).toBe("https://example.com/terms-v1");

    currentTermsUrl = "https://example.com/terms-v2"; // an Admin edits Policy/Rights URL between the two checks
    const second = await checkPulseSourcePolicy("src1", sanity, fetchPolicyText);
    expect(second.ok && second.checkedUrl).toBe("https://example.com/terms-v2");

    expect(patched[0].fields.policyCheckedUrl).toBe("https://example.com/terms-v1");
    expect(patched[1].fields.policyCheckedUrl).toBe("https://example.com/terms-v2");
  });

  it("the fetcher is always called with exactly the freshly-read termsUrl, never a different or stale URL", async () => {
    const { sanity } = makeMockSanity({ termsUrl: "https://www.nikon.com/terms", sourceClassification: "official_primary", url: "https://www.nikon.com" });
    const fetchPolicyText = vi.fn(async (url: string) => ({ ok: true as const, text: `checked ${url}`, contentType: "text/html" }));
    await checkPulseSourcePolicy("nikon", sanity, fetchPolicyText);
    expect(fetchPolicyText).toHaveBeenCalledWith("https://www.nikon.com/terms");
  });
});

// =========================================================================
// Official-Domain Policy Discovery Fallback (2026-09-08) — D/E/F/G/I/J
// through the real checkPulseSourcePolicy() integration path.
// =========================================================================
describe("checkPulseSourcePolicy — official-domain fallback", () => {
  it("D: saved URL 404s, Website is configured, homepage yields a candidate — recommendation stays inconclusive, evidence carries the candidate, termsUrl is NOT written", async () => {
    const { sanity, patched } = makeMockSanity({ termsUrl: "https://www.nikon.com/terms", sourceClassification: "official_primary", url: "https://www.nikon.com" });
    const fetchPolicyText = vi.fn(async (url: string) => {
      if (url === "https://www.nikon.com/terms") return { ok: false as const, reason: "HTTP 404" };
      if (url === "https://www.nikon.com") return { ok: true as const, text: `<a href="/company/terms-of-use">Terms of Use</a>`, contentType: "text/html" };
      throw new Error(`unexpected url ${url}`);
    });
    const result = await checkPulseSourcePolicy("nikon", sanity, fetchPolicyText);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recommendation).toBe("inconclusive");
      const candidate = result.evidence.find((e) => e.category === "fallback-candidate");
      expect(candidate?.url).toBe("https://www.nikon.com/company/terms-of-use");
    }
    // termsUrl must never appear in the patch at all — only adoption can write it.
    expect(Object.prototype.hasOwnProperty.call(patched[0].fields, "termsUrl")).toBe(false);
  });

  it("2 (never writes termsUrl): the fallback path's patch keys are exactly the five evidence fields, same as the non-fallback path", async () => {
    const { sanity, patched } = makeMockSanity({ termsUrl: "https://www.nikon.com/terms", sourceClassification: "official_primary", url: "https://www.nikon.com" });
    const fetchPolicyText = vi.fn(async (url: string) =>
      url === "https://www.nikon.com/terms" ? { ok: false as const, reason: "HTTP 404" } : { ok: false as const, reason: "HTTP 404" }
    );
    await checkPulseSourcePolicy("nikon", sanity, fetchPolicyText);
    expect(Object.keys(patched[0].fields).sort()).toEqual(
      ["policyCheckedAt", "policyCheckedUrl", "policyCheckEvidence", "policyCheckRecommendation", "policyCheckTrustSuggestion"].sort()
    );
  });

  it("2b: no fallback is attempted (and fetchPolicyText is called exactly once) when the source has no Website configured", async () => {
    const { sanity } = makeMockSanity({ termsUrl: "https://www.nikon.com/terms", sourceClassification: "official_primary", url: null });
    const fetchPolicyText = vi.fn(async () => ({ ok: false as const, reason: "HTTP 404" }));
    const result = await checkPulseSourcePolicy("nikon", sanity, fetchPolicyText);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.recommendation).toBe("inconclusive");
    expect(fetchPolicyText).toHaveBeenCalledTimes(1);
  });

  it("F/J: a candidate the homepage links to off the official domain never appears in evidence at all, end-to-end", async () => {
    const { sanity } = makeMockSanity({ termsUrl: "https://www.nikon.com/terms", sourceClassification: "official_primary", url: "https://www.nikon.com" });
    const fetchPolicyText = vi.fn(async (url: string) => {
      if (url === "https://www.nikon.com/terms") return { ok: false as const, reason: "HTTP 404" };
      return {
        ok: true as const,
        text: `<a href="https://totallydifferent.com/terms">Terms (off-site)</a><a href="https://nikon.com.evil.com/terms">Terms (lookalike)</a>`,
        contentType: "text/html",
      };
    });
    const result = await checkPulseSourcePolicy("nikon", sanity, fetchPolicyText);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.evidence.some((e) => e.category === "fallback-candidate")).toBe(false);
      // fetchPolicyText must never be called a third time for either
      // rejected candidate — only the saved URL and the one homepage.
    }
    expect(fetchPolicyText).toHaveBeenCalledTimes(2);
  });

  it("G: a press/newsroom candidate and a legal/terms candidate are tagged distinctly, never collapsed into one signal", async () => {
    const { sanity } = makeMockSanity({ termsUrl: "https://www.nikon.com/terms", sourceClassification: "official_primary", url: "https://www.nikon.com" });
    const fetchPolicyText = vi.fn(async (url: string) => {
      if (url === "https://www.nikon.com/terms") return { ok: false as const, reason: "HTTP 404" };
      return {
        ok: true as const,
        text: `<a href="/newsroom">Newsroom</a><a href="/legal/copyright">Copyright</a>`,
        contentType: "text/html",
      };
    });
    const result = await checkPulseSourcePolicy("nikon", sanity, fetchPolicyText);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const candidates = result.evidence.filter((e) => e.category === "fallback-candidate");
      expect(candidates.some((c) => c.snippet.includes("press/newsroom"))).toBe(true);
      expect(candidates.some((c) => c.snippet.includes("legal/terms"))).toBe(true);
    }
  });

  it("I: homepage fetch ALSO times out/5xx — still inconclusive, both failures recorded as evidence, never a candidate", async () => {
    const { sanity } = makeMockSanity({ termsUrl: "https://www.nikon.com/terms", sourceClassification: "official_primary", url: "https://www.nikon.com" });
    const fetchPolicyText = vi.fn(async (url: string) =>
      url === "https://www.nikon.com/terms" ? { ok: false as const, reason: "HTTP 404" } : { ok: false as const, reason: "timeout" }
    );
    const result = await checkPulseSourcePolicy("nikon", sanity, fetchPolicyText);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recommendation).toBe("inconclusive");
      expect(result.evidence.every((e) => e.category !== "fallback-candidate")).toBe(true);
      expect(result.evidence.some((e) => e.snippet.includes("timeout"))).toBe(true);
    }
  });

  it("no candidate on the homepage at all — inconclusive, evidence says so, never invents one", async () => {
    const { sanity } = makeMockSanity({ termsUrl: "https://www.nikon.com/terms", sourceClassification: "official_primary", url: "https://www.nikon.com" });
    const fetchPolicyText = vi.fn(async (url: string) =>
      url === "https://www.nikon.com/terms" ? { ok: false as const, reason: "HTTP 404" } : { ok: true as const, text: `<a href="/products">Cameras</a>`, contentType: "text/html" }
    );
    const result = await checkPulseSourcePolicy("nikon", sanity, fetchPolicyText);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recommendation).toBe("inconclusive");
      expect(result.evidence.some((e) => e.category === "fallback-candidate")).toBe(false);
    }
  });
});

// =========================================================================
// adoptPulseSourcePolicyCandidate — "Use this policy URL"
// =========================================================================
describe("adoptPulseSourcePolicyCandidate — structural isolation and independent re-validation", () => {
  function makeAdoptSanity(source: { url: string | null } | null = { url: "https://www.nikon.com" }) {
    const patched: { id: string; fields: Record<string, unknown> }[] = [];
    const sanity: PolicyCheckSanityClient = {
      fetch: vi.fn(async () => source) as unknown as PolicyCheckSanityClient["fetch"],
      patch: (id: string) => ({
        set: (fields: Record<string, unknown>) => ({
          commit: async () => {
            patched.push({ id, fields });
            return {};
          },
        }),
      }),
    };
    return { sanity, patched };
  }

  // A stub `checkSafety` is injected for every success-path test below —
  // deliberately never relying on real DNS resolution for determinism
  // (same reasoning as urlSafety.test.ts/policyCheckFetch.test.ts).
  // Every failure-path test below is rejected BEFORE the safety check
  // even runs (malformed/off-domain/credentials), so those correctly
  // use the real default and need no stub — except the literal-IP SSRF
  // case, which is deterministic without DNS by construction (see
  // urlSafety.ts) and so also uses the real default on purpose, as a
  // genuine end-to-end proof the real guard is actually wired in.
  const alwaysSafe = async () => ({ safe: true as const });

  it("1/2: a successful adoption's patch contains ONLY termsUrl — no other key, including none of the eight decision fields", async () => {
    const { sanity, patched } = makeAdoptSanity();
    const result = await adoptPulseSourcePolicyCandidate("nikon", "https://www.nikon.com/company/terms-of-use", sanity, alwaysSafe);
    expect(result.ok).toBe(true);
    expect(patched).toHaveLength(1);
    expect(Object.keys(patched[0].fields)).toEqual(["termsUrl"]);
    for (const decisionField of PULSE_SOURCE_DECISION_FIELDS) {
      expect(Object.prototype.hasOwnProperty.call(patched[0].fields, decisionField)).toBe(false);
    }
    expect(patched[0].fields.termsUrl).toBe("https://www.nikon.com/company/terms-of-use");
  });

  it("4: rejects an off-official-domain candidate even though nothing about it claims to have been 'previously shown' — re-validated independently, not trusted from display state", async () => {
    const { sanity, patched } = makeAdoptSanity();
    const result = await adoptPulseSourcePolicyCandidate("nikon", "https://totallydifferent.com/terms", sanity);
    expect(result.ok).toBe(false);
    expect(patched).toHaveLength(0);
  });

  it("4: rejects a lookalike domain that merely contains the official domain as a substring", async () => {
    const { sanity, patched } = makeAdoptSanity();
    const result = await adoptPulseSourcePolicyCandidate("nikon", "https://nikon.com.evil.com/terms", sanity);
    expect(result.ok).toBe(false);
    expect(patched).toHaveLength(0);
  });

  it("4: rejects a candidate URL resolving to a private/reserved address (SSRF guard re-run at adoption time, not skipped)", async () => {
    const { sanity, patched } = makeAdoptSanity({ url: "https://www.example.com" });
    const result = await adoptPulseSourcePolicyCandidate("src1", "http://169.254.169.254/terms", sanity);
    expect(result.ok).toBe(false);
    expect(patched).toHaveLength(0);
  });

  it("4: rejects a candidate URL carrying credentials", async () => {
    const { sanity, patched } = makeAdoptSanity();
    const result = await adoptPulseSourcePolicyCandidate("nikon", "https://user:pass@www.nikon.com/terms", sanity);
    expect(result.ok).toBe(false);
    expect(patched).toHaveLength(0);
  });

  it("rejects a malformed candidate URL", async () => {
    const { sanity, patched } = makeAdoptSanity();
    const result = await adoptPulseSourcePolicyCandidate("nikon", "not a url", sanity);
    expect(result.ok).toBe(false);
    expect(patched).toHaveLength(0);
  });

  it("rejects adoption when the source has no Website configured to validate the candidate against", async () => {
    const { sanity, patched } = makeAdoptSanity({ url: null });
    const result = await adoptPulseSourcePolicyCandidate("nikon", "https://www.nikon.com/terms", sanity);
    expect(result.ok).toBe(false);
    expect(patched).toHaveLength(0);
  });

  it("rejects adoption for a nonexistent source", async () => {
    const { sanity, patched } = makeAdoptSanity(null);
    const result = await adoptPulseSourcePolicyCandidate("missing", "https://www.nikon.com/terms", sanity);
    expect(result.ok).toBe(false);
    expect(patched).toHaveLength(0);
  });

  it("accepts a genuine subdomain of the official domain (e.g. a press.nikon.com newsroom page)", async () => {
    const { sanity, patched } = makeAdoptSanity({ url: "https://www.nikon.com" });
    const result = await adoptPulseSourcePolicyCandidate("nikon", "https://press.nikon.com/legal", sanity, alwaysSafe);
    expect(result.ok).toBe(true);
    expect(patched[0].fields.termsUrl).toBe("https://press.nikon.com/legal");
  });
});

// =========================================================================
// 5: re-checking after adoption gathers FRESH evidence — discovery
// itself is never silently treated as a successful classification.
// =========================================================================
describe("Check Policy + Adopt Policy Candidate — end-to-end freshness", () => {
  it("adopting a candidate never itself evaluates it — a subsequent Check Policy call performs its own real fetch/evaluation, distinct from the discovery evidence", async () => {
    let currentTermsUrl = "https://www.nikon.com/terms";
    const checkPatched: { fields: Record<string, unknown> }[] = [];
    const checkSanity: PolicyCheckSanityClient = {
      fetch: vi.fn(async () => ({ termsUrl: currentTermsUrl, sourceClassification: "official_primary" as const, url: "https://www.nikon.com" })) as unknown as PolicyCheckSanityClient["fetch"],
      patch: () => ({
        set: (fields: Record<string, unknown>) => ({
          commit: async () => {
            checkPatched.push({ fields });
            return {};
          },
        }),
      }),
    };
    const fetchPolicyText = vi.fn(async (url: string) => {
      if (url === "https://www.nikon.com/terms") return { ok: false as const, reason: "HTTP 404" };
      if (url === "https://www.nikon.com") return { ok: true as const, text: `<a href="/company/terms-of-use">Terms of Use</a>`, contentType: "text/html" };
      if (url === "https://www.nikon.com/company/terms-of-use") {
        return { ok: true as const, text: "All rights reserved. Photographs may not be reproduced without prior written consent.", contentType: "text/html" };
      }
      throw new Error(`unexpected url ${url}`);
    });

    // First check: saved URL 404s, fallback discovers a candidate. Still inconclusive.
    const first = await checkPulseSourcePolicy("nikon", checkSanity, fetchPolicyText);
    expect(first.ok && first.recommendation).toBe("inconclusive");

    // Admin adopts the candidate (separate write path, separate sanity mock for isolation).
    const { sanity: adoptSanity, patched: adoptPatched } = (() => {
      const patched: { fields: Record<string, unknown> }[] = [];
      const sanity: PolicyCheckSanityClient = {
        fetch: vi.fn(async () => ({ url: "https://www.nikon.com" })) as unknown as PolicyCheckSanityClient["fetch"],
        patch: () => ({ set: (fields: Record<string, unknown>) => ({ commit: async () => { patched.push({ fields }); return {}; } }) }),
      };
      return { sanity, patched };
    })();
    const adoptResult = await adoptPulseSourcePolicyCandidate("nikon", "https://www.nikon.com/company/terms-of-use", adoptSanity, async () => ({ safe: true as const }));
    expect(adoptResult.ok).toBe(true);
    // Adoption's own patch is termsUrl-only — never writes a recommendation, never treats discovery as a classification.
    expect(Object.keys(adoptPatched[0].fields)).toEqual(["termsUrl"]);
    currentTermsUrl = "https://www.nikon.com/company/terms-of-use"; // simulates the just-written termsUrl being read back

    // Second, separate Check Policy call: must perform its OWN real
    // fetch/evaluation of the newly-adopted URL, not reuse the
    // discovery-time evidence from the first check.
    const second = await checkPulseSourcePolicy("nikon", checkSanity, fetchPolicyText);
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.checkedUrl).toBe("https://www.nikon.com/company/terms-of-use");
      expect(second.recommendation).toBe("candidate-red"); // a REAL evaluation of the adopted page's own text, not the discovery evidence
      expect(second.evidence.every((e) => e.category !== "fallback-candidate")).toBe(true);
    }
    expect(fetchPolicyText).toHaveBeenCalledWith("https://www.nikon.com/company/terms-of-use");
  });
});
