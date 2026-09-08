import { describe, expect, it, vi } from "vitest";
import { checkPulseSourcePolicy, type PolicyCheckSanityClient } from "./pulseAdmin";
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

type MockSourceDoc = { termsUrl: string | null; sourceClassification: "official_primary" | "editorial_discovery" | null } | null;

function makeMockSanity(source: MockSourceDoc = { termsUrl: "https://example.com/terms", sourceClassification: "official_primary" }) {
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
    const { sanity } = makeMockSanity({ termsUrl: "https://www.nikon.com/terms", sourceClassification: "official_primary" });
    const fetchPolicyText = vi.fn(async (url: string) => ({ ok: true as const, text: `checked ${url}`, contentType: "text/html" }));
    await checkPulseSourcePolicy("nikon", sanity, fetchPolicyText);
    expect(fetchPolicyText).toHaveBeenCalledWith("https://www.nikon.com/terms");
  });
});
