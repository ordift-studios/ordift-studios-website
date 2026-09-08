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
//
// Every mocked `{ ok: true, ... }` fetch result below includes
// `finalUrl` — required since One-Hop Official-Policy Gateway
// Resolution (2026-09-08) uses it to verify a fetched page's ACTUAL
// destination (after any redirects) is still within the official
// domain, not merely the URL that was originally requested.

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
    const fetchPolicyText = vi.fn(async (url: string) => ({
      ok: true as const,
      text: "Press materials may be used by media for editorial purposes without prior written permission.",
      contentType: "text/html",
      finalUrl: url,
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

  it("1: saved valid substantive policy → no fallback at all — fetchPolicyText is called exactly once", async () => {
    const { sanity } = makeMockSanity();
    const fetchPolicyText = vi.fn(async (url: string) => ({
      ok: true as const,
      text: "All rights reserved.",
      contentType: "text/html",
      finalUrl: url,
    }));
    const result = await checkPulseSourcePolicy("nikon", sanity, fetchPolicyText);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.recommendation).toBe("candidate-red");
    expect(fetchPolicyText).toHaveBeenCalledTimes(1);
  });

  it("B: candidate-red — the patch has no isActive key at all, so the source structurally cannot be deactivated by this call", async () => {
    const { sanity, patched } = makeMockSanity();
    const fetchPolicyText = vi.fn(async (url: string) => ({
      ok: true as const,
      text: "All rights reserved. Photographs may not be reproduced without prior written consent.",
      contentType: "text/html",
      finalUrl: url,
    }));
    const result = await checkPulseSourcePolicy("nikon", sanity, fetchPolicyText);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.recommendation).toBe("candidate-red");
    expect(Object.prototype.hasOwnProperty.call(patched[0].fields, "isActive")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(patched[0].fields, "permissionClassification")).toBe(false);
  });

  it("B2 (Nikon-like restrictive wording): 'prohibited from using' + 'need to obtain ... prior written permission' produces candidate-red, and the decisive snippet is surfaced — not just a generic copyright line", async () => {
    const { sanity } = makeMockSanity();
    const fetchPolicyText = vi.fn(async (url: string) => ({
      ok: true as const,
      text:
        "All materials on this website are protected by copyright laws and belong to the Company. " +
        "You are prohibited from using any material (including duplication, modification, uploading, presentation, transmission, distribution, licensing, sales and publication) " +
        "except for non-commercial and personal purposes. If you want to use any materials on this website, you need to obtain the Company's prior written permission.",
      contentType: "text/html",
      finalUrl: url,
    }));
    const result = await checkPulseSourcePolicy("nikon", sanity, fetchPolicyText);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recommendation).toBe("candidate-red");
      // The decisive evidence — not merely the weak generic copyright line — must be present.
      expect(result.evidence.some((e) => /prohibited from using/i.test(e.snippet))).toBe(true);
      expect(result.evidence.some((e) => /need.{0,10}obtain.{0,60}permission/i.test(e.snippet))).toBe(true);
    }
  });

  it("ordinary copyright notices alone do not become a stronger restriction than the evaluator already intended — a bare copyright line still yields candidate-red via the existing pattern, with no over-matching from the new patterns", async () => {
    const { sanity } = makeMockSanity();
    const fetchPolicyText = vi.fn(async (url: string) => ({
      ok: true as const,
      text: "© 2026 Example Corporation. All rights reserved.",
      contentType: "text/html",
      finalUrl: url,
    }));
    const result = await checkPulseSourcePolicy("nikon", sanity, fetchPolicyText);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recommendation).toBe("candidate-red");
      // The new "prohibited from using" / "need to obtain permission"
      // patterns must NOT spuriously fire on a bare copyright notice.
      expect(result.evidence.some((e) => /prohibited from using/i.test(e.snippet))).toBe(false);
      expect(result.evidence.some((e) => /need.{0,10}obtain/i.test(e.snippet))).toBe(false);
    }
  });

  it("permissive fixtures continue producing candidate-green unaffected by the new restrictive patterns", async () => {
    const { sanity } = makeMockSanity();
    const fetchPolicyText = vi.fn(async (url: string) => ({
      ok: true as const,
      text: "Press materials may be used by media for editorial purposes without prior written permission.",
      contentType: "text/html",
      finalUrl: url,
    }));
    const result = await checkPulseSourcePolicy("nikon", sanity, fetchPolicyText);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.recommendation).toBe("candidate-green");
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
    const okFetch = vi.fn(async (url: string) => ({ ok: true as const, text: "no clear signal here at all", contentType: "text/html", finalUrl: url }));

    const official = makeMockSanity({ termsUrl: "https://example.com/terms", sourceClassification: "official_primary" });
    const officialResult = await checkPulseSourcePolicy("nikon", official.sanity, okFetch);
    expect(officialResult.ok).toBe(true);
    if (officialResult.ok) {
      expect(officialResult.trustSuggestion).toBeTruthy();
      expect(["high", "standard", "unverified", "flagged"]).not.toContain(officialResult.trustSuggestion);
    }
    expect(Object.prototype.hasOwnProperty.call(official.patched[0].fields, "imageUsePermitted")).toBe(false);

    const editorial = makeMockSanity({ termsUrl: "https://example.com/terms", sourceClassification: "editorial_discovery" });
    const editorialResult = await checkPulseSourcePolicy("petapixel", editorial.sanity, okFetch);
    expect(editorialResult.ok).toBe(true);
    if (editorialResult.ok) expect(editorialResult.trustSuggestion).toBeNull();
  });

  it("E: conflicting permissive+restrictive signals resolve to inconclusive end-to-end, never candidate-green", async () => {
    const { sanity } = makeMockSanity();
    const fetchPolicyText = vi.fn(async (url: string) => ({
      ok: true as const,
      text:
        "Press materials may be used by media for editorial purposes without prior written permission. " +
        "However, all photographs may not be reproduced without prior written consent.",
      contentType: "text/html",
      finalUrl: url,
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
    const fetchPolicyText = vi.fn(async (url: string) => ({ ok: true as const, text: "no clear signal", contentType: "text/html", finalUrl: url }));

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
    const fetchPolicyText = vi.fn(async (url: string) => ({ ok: true as const, text: `checked ${url}`, contentType: "text/html", finalUrl: url }));
    await checkPulseSourcePolicy("nikon", sanity, fetchPolicyText);
    expect(fetchPolicyText).toHaveBeenCalledWith("https://www.nikon.com/terms");
  });
});

// =========================================================================
// Official-Domain Policy Discovery Fallback + One-Hop Gateway
// Resolution (2026-09-08)
// =========================================================================
describe("checkPulseSourcePolicy — official-domain fallback: direct substantive candidate (no gateway hop needed)", () => {
  it("2: saved URL fails → homepage → the top candidate's OWN page already has real policy language → shown directly, no deeper hop attempted", async () => {
    const { sanity, patched } = makeMockSanity({ termsUrl: "https://www.nikon.com/terms", sourceClassification: "official_primary", url: "https://www.nikon.com" });
    const fetchPolicyText = vi.fn(async (url: string) => {
      if (url === "https://www.nikon.com/terms") return { ok: false as const, reason: "HTTP 404" };
      if (url === "https://www.nikon.com") return { ok: true as const, text: `<a href="/legal/copyright">Copyright</a>`, contentType: "text/html", finalUrl: url };
      if (url === "https://www.nikon.com/legal/copyright") {
        return { ok: true as const, text: "All rights reserved. Reproduction is prohibited from using without permission.", contentType: "text/html", finalUrl: url };
      }
      throw new Error(`unexpected url ${url}`);
    });
    const result = await checkPulseSourcePolicy("nikon", sanity, fetchPolicyText);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recommendation).toBe("inconclusive"); // fallback NEVER classifies, even with substantive-looking content
      expect(result.evidence.some((e) => e.category === "fallback-candidate" && e.url === "https://www.nikon.com/legal/copyright")).toBe(true);
      expect(result.evidence.some((e) => e.category === "fallback-candidate-substantive")).toBe(false); // no deeper hop — this candidate was already substantive
    }
    // Exactly 3 fetches: saved URL, homepage, and the one gateway/candidate hop.
    expect(fetchPolicyText).toHaveBeenCalledTimes(3);
    expect(Object.prototype.hasOwnProperty.call(patched[0].fields, "termsUrl")).toBe(false);
  });
});

describe("checkPulseSourcePolicy — official-domain fallback: the real Nikon scenario (gateway → substantive)", () => {
  it("3: saved URL fails → homepage → gateway page (no signal of its own) → ONE deeper same-domain substantive candidate surfaced, distinctly tagged", async () => {
    const { sanity, patched } = makeMockSanity({ termsUrl: "https://www.nikon.com/terms", sourceClassification: "official_primary", url: "https://www.nikon.com" });
    const fetchPolicyText = vi.fn(async (url: string) => {
      if (url === "https://www.nikon.com/terms") return { ok: false as const, reason: "HTTP 404" };
      if (url === "https://www.nikon.com") return { ok: true as const, text: `<a href="/usage/">Terms of Use</a>`, contentType: "text/html", finalUrl: url };
      if (url === "https://www.nikon.com/usage/") {
        // A pure gateway page — no permissive/restrictive language, just a pointer.
        return {
          ok: true as const,
          text: `For terms and conditions for using this website, refer to <a href="/usage/group-info/">Terms and Conditions of Use</a>.`,
          contentType: "text/html",
          finalUrl: url,
        };
      }
      throw new Error(`unexpected url ${url}`);
    });
    const result = await checkPulseSourcePolicy("nikon", sanity, fetchPolicyText);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recommendation).toBe("inconclusive"); // fallback discovery is NEVER itself a classification
      const gateway = result.evidence.find((e) => e.category === "fallback-candidate");
      const substantive = result.evidence.find((e) => e.category === "fallback-candidate-substantive");
      expect(gateway?.url).toBe("https://www.nikon.com/usage/");
      expect(gateway?.snippet).toMatch(/gateway|index/i);
      expect(substantive?.url).toBe("https://www.nikon.com/usage/group-info/");
      expect(substantive?.snippet).toContain("Terms and Conditions of Use");
    }
    // Exactly 3 fetches — the deeper substantive URL is NEVER itself fetched.
    expect(fetchPolicyText).toHaveBeenCalledTimes(3);
    expect(fetchPolicyText).not.toHaveBeenCalledWith("https://www.nikon.com/usage/group-info/");
    expect(Object.prototype.hasOwnProperty.call(patched[0].fields, "termsUrl")).toBe(false);
  });

  it("2 (never writes termsUrl): the gateway-resolution path's patch keys are exactly the five evidence fields", async () => {
    const { sanity, patched } = makeMockSanity({ termsUrl: "https://www.nikon.com/terms", sourceClassification: "official_primary", url: "https://www.nikon.com" });
    const fetchPolicyText = vi.fn(async (url: string) => {
      if (url === "https://www.nikon.com/terms") return { ok: false as const, reason: "HTTP 404" };
      if (url === "https://www.nikon.com") return { ok: true as const, text: `<a href="/usage/">Terms of Use</a>`, contentType: "text/html", finalUrl: url };
      return { ok: true as const, text: `<a href="/usage/group-info/">Terms and Conditions of Use</a>`, contentType: "text/html", finalUrl: url };
    });
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
});

describe("checkPulseSourcePolicy — gateway hop: trust-boundary rejection", () => {
  it("4: a deeper link the gateway page points to OFF the official domain is rejected and never fetched", async () => {
    const { sanity } = makeMockSanity({ termsUrl: "https://www.nikon.com/terms", sourceClassification: "official_primary", url: "https://www.nikon.com" });
    const fetchPolicyText = vi.fn(async (url: string) => {
      if (url === "https://www.nikon.com/terms") return { ok: false as const, reason: "HTTP 404" };
      if (url === "https://www.nikon.com") return { ok: true as const, text: `<a href="/usage/">Terms of Use</a>`, contentType: "text/html", finalUrl: url };
      if (url === "https://www.nikon.com/usage/") {
        return { ok: true as const, text: `See <a href="https://totallydifferent.com/legal/terms">our terms</a> for details.`, contentType: "text/html", finalUrl: url };
      }
      throw new Error(`must never fetch a rejected off-domain candidate: ${url}`);
    });
    const result = await checkPulseSourcePolicy("nikon", sanity, fetchPolicyText);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.evidence.some((e) => e.category === "fallback-candidate-substantive")).toBe(false);
      // The gateway page itself is still shown as a plain (unexplored-further) candidate.
      expect(result.evidence.some((e) => e.category === "fallback-candidate" && e.url === "https://www.nikon.com/usage/")).toBe(true);
    }
    expect(fetchPolicyText).toHaveBeenCalledTimes(3);
  });

  it("5: a lookalike domain (containing the official domain as a substring) found on the gateway page is rejected", async () => {
    const { sanity } = makeMockSanity({ termsUrl: "https://www.nikon.com/terms", sourceClassification: "official_primary", url: "https://www.nikon.com" });
    const fetchPolicyText = vi.fn(async (url: string) => {
      if (url === "https://www.nikon.com/terms") return { ok: false as const, reason: "HTTP 404" };
      if (url === "https://www.nikon.com") return { ok: true as const, text: `<a href="/usage/">Terms of Use</a>`, contentType: "text/html", finalUrl: url };
      if (url === "https://www.nikon.com/usage/") {
        return { ok: true as const, text: `See <a href="https://nikon.com.evil.com/legal/terms">our terms</a> for details.`, contentType: "text/html", finalUrl: url };
      }
      throw new Error(`must never fetch a rejected lookalike-domain candidate: ${url}`);
    });
    const result = await checkPulseSourcePolicy("nikon", sanity, fetchPolicyText);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.evidence.some((e) => e.category === "fallback-candidate-substantive")).toBe(false);
    expect(fetchPolicyText).toHaveBeenCalledTimes(3);
  });

  it("6: the gateway fetch itself failing (e.g. the real SSRF guard rejecting a redirect to a private/local address) degrades gracefully to an unverified plain candidate — never crashes, never fetches deeper", async () => {
    const { sanity } = makeMockSanity({ termsUrl: "https://www.nikon.com/terms", sourceClassification: "official_primary", url: "https://www.nikon.com" });
    const fetchPolicyText = vi.fn(async (url: string) => {
      if (url === "https://www.nikon.com/terms") return { ok: false as const, reason: "HTTP 404" };
      if (url === "https://www.nikon.com") return { ok: true as const, text: `<a href="/usage/">Terms of Use</a>`, contentType: "text/html", finalUrl: url };
      // Simulates the real safeFetchText()/isSafeFetchTarget() SSRF
      // guard rejecting a redirect the gateway page's own server sent
      // toward a private/local address — this integration test doesn't
      // re-exercise that guard's own logic (see urlSafety.test.ts/
      // policyCheckFetch.test.ts for that), only that checkPulseSourcePolicy
      // handles the resulting failure safely.
      if (url === "https://www.nikon.com/usage/") return { ok: false as const, reason: "unsafe destination — hostname resolves to a private/reserved address (127.0.0.1)" };
      throw new Error(`unexpected url ${url}`);
    });
    const result = await checkPulseSourcePolicy("nikon", sanity, fetchPolicyText);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recommendation).toBe("inconclusive");
      expect(result.evidence.some((e) => e.category === "fallback-candidate" && e.url === "https://www.nikon.com/usage/")).toBe(true);
      expect(result.evidence.some((e) => e.category === "fallback-candidate-substantive")).toBe(false);
    }
    expect(fetchPolicyText).toHaveBeenCalledTimes(3);
  });

  it("7: a deeper candidate that would itself require ANOTHER hop (a second gateway) is presented unfetched, never triggering a third navigation", async () => {
    const { sanity } = makeMockSanity({ termsUrl: "https://www.nikon.com/terms", sourceClassification: "official_primary", url: "https://www.nikon.com" });
    const fetchPolicyText = vi.fn(async (url: string) => {
      if (url === "https://www.nikon.com/terms") return { ok: false as const, reason: "HTTP 404" };
      if (url === "https://www.nikon.com") return { ok: true as const, text: `<a href="/usage/">Terms of Use</a>`, contentType: "text/html", finalUrl: url };
      if (url === "https://www.nikon.com/usage/") {
        // Points to ANOTHER gateway-like page (which, if fetched, would
        // itself need yet another hop) — but it must never be fetched.
        return { ok: true as const, text: `Refer to <a href="/usage/group-info/">Terms and Conditions of Use</a>.`, contentType: "text/html", finalUrl: url };
      }
      throw new Error(`must never navigate a third hop: ${url}`);
    });
    const result = await checkPulseSourcePolicy("nikon", sanity, fetchPolicyText);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.evidence.some((e) => e.category === "fallback-candidate-substantive" && e.url === "https://www.nikon.com/usage/group-info/")).toBe(true);
    }
    // Still exactly 3 — proves no third navigation happened regardless
    // of what the (unfetched) deeper candidate itself might contain.
    expect(fetchPolicyText).toHaveBeenCalledTimes(3);
  });

  it("8: malformed HTML on the gateway page yields no deeper candidate, falls back to the plain candidate, never crashes", async () => {
    const { sanity } = makeMockSanity({ termsUrl: "https://www.nikon.com/terms", sourceClassification: "official_primary", url: "https://www.nikon.com" });
    const fetchPolicyText = vi.fn(async (url: string) => {
      if (url === "https://www.nikon.com/terms") return { ok: false as const, reason: "HTTP 404" };
      if (url === "https://www.nikon.com") return { ok: true as const, text: `<a href="/usage/">Terms of Use</a>`, contentType: "text/html", finalUrl: url };
      if (url === "https://www.nikon.com/usage/") return { ok: true as const, text: `<a href="/legal broken tag soup <div><a href=`, contentType: "text/html", finalUrl: url };
      throw new Error(`unexpected url ${url}`);
    });
    const result = await checkPulseSourcePolicy("nikon", sanity, fetchPolicyText);
    expect(result.ok).toBe(true); // never throws/crashes on malformed HTML
    if (result.ok) {
      expect(result.evidence.some((e) => e.category === "fallback-candidate" && e.url === "https://www.nikon.com/usage/")).toBe(true);
      expect(result.evidence.some((e) => e.category === "fallback-candidate-substantive")).toBe(false);
    }
  });

  it("9: the homepage redirecting outside the official domain stops fallback discovery entirely — no candidates from off-domain content", async () => {
    const { sanity } = makeMockSanity({ termsUrl: "https://www.nikon.com/terms", sourceClassification: "official_primary", url: "https://www.nikon.com" });
    const fetchPolicyText = vi.fn(async (url: string) => {
      if (url === "https://www.nikon.com/terms") return { ok: false as const, reason: "HTTP 404" };
      // The homepage request itself resolves (after a redirect
      // safeFetchText already validated as SSRF-safe) to a page outside
      // nikon.com — the official-domain-specific check must catch this
      // even though it's not a private/internal address.
      if (url === "https://www.nikon.com") {
        return { ok: true as const, text: `<a href="/legal">Terms</a>`, contentType: "text/html", finalUrl: "https://attacker-controlled.example/" };
      }
      throw new Error(`must never fetch anything past an off-domain homepage redirect: ${url}`);
    });
    const result = await checkPulseSourcePolicy("nikon", sanity, fetchPolicyText);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recommendation).toBe("inconclusive");
      expect(result.evidence.some((e) => e.category === "fallback-candidate")).toBe(false);
      expect(result.evidence.some((e) => e.category === "safety-block")).toBe(true);
    }
    expect(fetchPolicyText).toHaveBeenCalledTimes(2); // saved URL + the one (rejected) homepage attempt — never a third
  });

  it("9b: the gateway hop redirecting outside the official domain is treated as unverified — falls back to the plain (unfetched-content) candidate", async () => {
    const { sanity } = makeMockSanity({ termsUrl: "https://www.nikon.com/terms", sourceClassification: "official_primary", url: "https://www.nikon.com" });
    const fetchPolicyText = vi.fn(async (url: string) => {
      if (url === "https://www.nikon.com/terms") return { ok: false as const, reason: "HTTP 404" };
      if (url === "https://www.nikon.com") return { ok: true as const, text: `<a href="/usage/">Terms of Use</a>`, contentType: "text/html", finalUrl: url };
      if (url === "https://www.nikon.com/usage/") {
        return { ok: true as const, text: `<a href="/legal">Legal</a>`, contentType: "text/html", finalUrl: "https://attacker-controlled.example/usage/" };
      }
      throw new Error(`must never trust content from an off-domain gateway redirect: ${url}`);
    });
    const result = await checkPulseSourcePolicy("nikon", sanity, fetchPolicyText);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.evidence.some((e) => e.category === "fallback-candidate-substantive")).toBe(false);
      expect(result.evidence.some((e) => e.category === "fallback-candidate" && e.url === "https://www.nikon.com/usage/")).toBe(true);
    }
    expect(fetchPolicyText).toHaveBeenCalledTimes(3);
  });
});

describe("checkPulseSourcePolicy — multiple homepage candidates: deterministic, bounded", () => {
  it("10: more than the cap of matching homepage links still yields a bounded, deterministic set", async () => {
    const { sanity } = makeMockSanity({ termsUrl: "https://www.nikon.com/terms", sourceClassification: "official_primary", url: "https://www.nikon.com" });
    const fetchPolicyText = vi.fn(async (url: string) => {
      if (url === "https://www.nikon.com/terms") return { ok: false as const, reason: "HTTP 404" };
      if (url === "https://www.nikon.com") {
        const links = Array.from({ length: 6 }, (_, i) => `<a href="/legal-${i}">Legal Page ${i}</a>`).join("");
        return { ok: true as const, text: links, contentType: "text/html", finalUrl: url };
      }
      // The top candidate's own page has real signal, so no deeper hop is attempted.
      return { ok: true as const, text: "All rights reserved.", contentType: "text/html", finalUrl: url };
    });
    const first = await checkPulseSourcePolicy("nikon", sanity, fetchPolicyText);
    const second = await checkPulseSourcePolicy("nikon", sanity, fetchPolicyText);
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      const firstUrls = first.evidence.filter((e) => e.url).map((e) => e.url);
      const secondUrls = second.evidence.filter((e) => e.url).map((e) => e.url);
      expect(firstUrls.length).toBeLessThanOrEqual(3);
      expect(firstUrls).toEqual(secondUrls); // deterministic across repeated runs
    }
  });

  it("G: a press/newsroom candidate and a legal/terms candidate are tagged distinctly, never collapsed into one signal", async () => {
    const { sanity } = makeMockSanity({ termsUrl: "https://www.nikon.com/terms", sourceClassification: "official_primary", url: "https://www.nikon.com" });
    const fetchPolicyText = vi.fn(async (url: string) => {
      if (url === "https://www.nikon.com/terms") return { ok: false as const, reason: "HTTP 404" };
      if (url === "https://www.nikon.com") return { ok: true as const, text: `<a href="/newsroom">Newsroom</a><a href="/legal/copyright">Copyright</a>`, contentType: "text/html", finalUrl: url };
      // The top (newsroom) candidate already has real signal of its own — no deeper hop.
      if (url === "https://www.nikon.com/newsroom") return { ok: true as const, text: "All rights reserved for press materials.", contentType: "text/html", finalUrl: url };
      throw new Error(`unexpected url ${url}`);
    });
    const result = await checkPulseSourcePolicy("nikon", sanity, fetchPolicyText);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const candidates = result.evidence.filter((e) => e.category === "fallback-candidate");
      expect(candidates.some((c) => c.snippet.includes("press/newsroom"))).toBe(true);
      expect(candidates.some((c) => c.snippet.includes("legal/terms"))).toBe(true);
    }
  });
});

describe("checkPulseSourcePolicy — official-domain fallback: other failure/absence modes", () => {
  it("11: homepage fetch ALSO times out/5xx — still inconclusive, both failures recorded as evidence, never a candidate", async () => {
    const { sanity } = makeMockSanity({ termsUrl: "https://www.nikon.com/terms", sourceClassification: "official_primary", url: "https://www.nikon.com" });
    const fetchPolicyText = vi.fn(async (url: string) =>
      url === "https://www.nikon.com/terms" ? { ok: false as const, reason: "HTTP 404" } : { ok: false as const, reason: "timeout" }
    );
    const result = await checkPulseSourcePolicy("nikon", sanity, fetchPolicyText);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recommendation).toBe("inconclusive");
      expect(result.evidence.every((e) => e.category !== "fallback-candidate" && e.category !== "fallback-candidate-substantive")).toBe(true);
      expect(result.evidence.some((e) => e.snippet.includes("timeout"))).toBe(true);
    }
  });

  it("11 (no candidate on the homepage at all) → inconclusive, evidence says so, never invents one", async () => {
    const { sanity } = makeMockSanity({ termsUrl: "https://www.nikon.com/terms", sourceClassification: "official_primary", url: "https://www.nikon.com" });
    const fetchPolicyText = vi.fn(async (url: string) =>
      url === "https://www.nikon.com/terms"
        ? { ok: false as const, reason: "HTTP 404" }
        : { ok: true as const, text: `<a href="/products">Cameras</a>`, contentType: "text/html", finalUrl: url }
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

  const alwaysSafe = async () => ({ safe: true as const });

  it("14: a successful adoption's patch contains ONLY termsUrl — no other key, including none of the eight decision fields", async () => {
    const { sanity, patched } = makeAdoptSanity();
    const result = await adoptPulseSourcePolicyCandidate("nikon", "https://www.nikon.com/usage/group-info/", sanity, alwaysSafe);
    expect(result.ok).toBe(true);
    expect(patched).toHaveLength(1);
    expect(Object.keys(patched[0].fields)).toEqual(["termsUrl"]);
    for (const decisionField of PULSE_SOURCE_DECISION_FIELDS) {
      expect(Object.prototype.hasOwnProperty.call(patched[0].fields, decisionField)).toBe(false);
    }
    expect(patched[0].fields.termsUrl).toBe("https://www.nikon.com/usage/group-info/");
  });

  it("15: rejects an off-official-domain candidate even though nothing about it claims to have been 'previously shown' — re-validated independently, not trusted from display state", async () => {
    const { sanity, patched } = makeAdoptSanity();
    const result = await adoptPulseSourcePolicyCandidate("nikon", "https://totallydifferent.com/terms", sanity);
    expect(result.ok).toBe(false);
    expect(patched).toHaveLength(0);
  });

  it("15: rejects a lookalike domain that merely contains the official domain as a substring", async () => {
    const { sanity, patched } = makeAdoptSanity();
    const result = await adoptPulseSourcePolicyCandidate("nikon", "https://nikon.com.evil.com/terms", sanity);
    expect(result.ok).toBe(false);
    expect(patched).toHaveLength(0);
  });

  it("15: rejects a candidate URL resolving to a private/reserved address (SSRF guard re-run at adoption time, not skipped)", async () => {
    const { sanity, patched } = makeAdoptSanity({ url: "https://www.example.com" });
    const result = await adoptPulseSourcePolicyCandidate("src1", "http://169.254.169.254/terms", sanity);
    expect(result.ok).toBe(false);
    expect(patched).toHaveLength(0);
  });

  it("15: rejects a candidate URL carrying credentials", async () => {
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
// 16: re-checking after adoption gathers FRESH evidence — discovery
// itself is never silently treated as a successful classification.
// =========================================================================
describe("Check Policy + Adopt Policy Candidate — end-to-end freshness (the real Nikon shape)", () => {
  it("adopting the deeper substantive candidate never itself evaluates it — a subsequent Check Policy call performs its own real fetch/evaluation of the newly adopted URL", async () => {
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
      if (url === "https://www.nikon.com") return { ok: true as const, text: `<a href="/usage/">Terms of Use</a>`, contentType: "text/html", finalUrl: url };
      if (url === "https://www.nikon.com/usage/") {
        return { ok: true as const, text: `Refer to <a href="/usage/group-info/">Terms and Conditions of Use</a>.`, contentType: "text/html", finalUrl: url };
      }
      if (url === "https://www.nikon.com/usage/group-info/") {
        return {
          ok: true as const,
          text: "All materials are protected by copyright laws. You are prohibited from using any material except for non-commercial and personal purposes. You need to obtain prior written permission.",
          contentType: "text/html",
          finalUrl: url,
        };
      }
      throw new Error(`unexpected url ${url}`);
    });

    // First check: saved URL 404s, gateway resolution discovers the deeper substantive candidate. Still inconclusive.
    const first = await checkPulseSourcePolicy("nikon", checkSanity, fetchPolicyText);
    expect(first.ok && first.recommendation).toBe("inconclusive");
    expect(first.ok && first.evidence.some((e) => e.category === "fallback-candidate-substantive" && e.url === "https://www.nikon.com/usage/group-info/")).toBe(true);
    expect(fetchPolicyText).toHaveBeenCalledTimes(3);
    expect(fetchPolicyText).not.toHaveBeenCalledWith("https://www.nikon.com/usage/group-info/"); // never fetched during discovery itself

    // Admin adopts the deeper candidate (separate write path, separate sanity mock for isolation).
    const { sanity: adoptSanity, patched: adoptPatched } = (() => {
      const patched: { fields: Record<string, unknown> }[] = [];
      const sanity: PolicyCheckSanityClient = {
        fetch: vi.fn(async () => ({ url: "https://www.nikon.com" })) as unknown as PolicyCheckSanityClient["fetch"],
        patch: () => ({ set: (fields: Record<string, unknown>) => ({ commit: async () => { patched.push({ fields }); return {}; } }) }),
      };
      return { sanity, patched };
    })();
    const adoptResult = await adoptPulseSourcePolicyCandidate("nikon", "https://www.nikon.com/usage/group-info/", adoptSanity, async () => ({ safe: true as const }));
    expect(adoptResult.ok).toBe(true);
    expect(Object.keys(adoptPatched[0].fields)).toEqual(["termsUrl"]); // adoption's own patch is termsUrl-only
    currentTermsUrl = "https://www.nikon.com/usage/group-info/"; // simulates the just-written termsUrl being read back

    // Second, separate Check Policy call: must perform its OWN real
    // fetch of the adopted URL — the fetch count resets to 1 (this is
    // now the PRIMARY url and succeeds directly, no fallback needed).
    const second = await checkPulseSourcePolicy("nikon", checkSanity, fetchPolicyText);
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.checkedUrl).toBe("https://www.nikon.com/usage/group-info/");
      expect(second.recommendation).toBe("candidate-red"); // a REAL evaluation of the adopted page's own text
      expect(second.evidence.some((e) => /prohibited from using/i.test(e.snippet))).toBe(true);
      expect(second.evidence.every((e) => e.category !== "fallback-candidate" && e.category !== "fallback-candidate-substantive")).toBe(true);
    }
  });
});
