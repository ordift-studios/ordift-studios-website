import { describe, expect, it } from "vitest";
import { getPublishReadiness, canProceedToReview, isReadyToPublish, type ReadinessInput } from "./portfolioValidation";

// Publish Readiness Blocking/Advisory correction (2026-09-20) —
// regression coverage for the Human Production QA report: advisory
// metadata (custom SEO, tags, client attribution) must never prevent
// a project from proceeding to review/publication, on ANY Portfolio
// discipline. getPublishReadiness() is a pure function (no DB access),
// so these are real assertions, not code-reading notes.

// A complete, genuinely publishable Photography project — every
// blocking requirement satisfied, every advisory field also filled in
// (used as the baseline "everything present" case).
const completePhotographyProject: ReadinessInput = {
  title: "Coastal Editorial Series",
  slug: "coastal-editorial-series",
  heroMedia: { type: "image", url: "https://cdn.example.com/hero.jpg", alt: "Model on a coastal cliff at golden hour" },
  story: "A three-day editorial shoot exploring light and texture along the Ghanaian coastline.",
  categoryIds: ["photography"],
  seo: { metaTitle: "Coastal Editorial Series — Ordift Studios", metaDescription: "Editorial photography along the coast.", ogImageUrl: null, canonicalUrl: null },
  gallery: [{ id: "g1", url: "https://cdn.example.com/1.jpg", alt: "Wide coastal shot", caption: null }],
  tags: ["editorial", "coastal"],
  client: "Atelier Noir",
};

// A complete, genuinely publishable Graphic Design project — same
// shape, different discipline, proving the engine has no
// discipline-specific branch.
const completeGraphicDesignProject: ReadinessInput = {
  title: "Heritage Brand Identity",
  slug: "heritage-brand-identity",
  heroMedia: { type: "image", url: "https://cdn.example.com/hero-gd.jpg", alt: "Brand identity mockup on a table" },
  story: "A full identity system rooted in Ghanaian textile motifs, delivered across print and digital.",
  categoryIds: ["graphic-design"],
  seo: { metaTitle: "Heritage Brand Identity — Ordift Studios", metaDescription: "A brand identity system.", ogImageUrl: null, canonicalUrl: null },
  gallery: [{ id: "gd1", url: "https://cdn.example.com/gd-1.jpg", alt: "Logo lockup", caption: null }],
  tags: ["branding", "identity"],
  client: "Heritage Collective",
};

function withoutAdvisoryFields(project: ReadinessInput): ReadinessInput {
  return { ...project, seo: { metaTitle: null, metaDescription: null, ogImageUrl: null, canonicalUrl: null }, tags: [], client: "" };
}

describe("Genuine required content still blocks (TRUE BLOCKER), across disciplines", () => {
  it.each([
    ["Photography", completePhotographyProject],
    ["Graphic Design", completeGraphicDesignProject],
  ])("%s: missing story blocks with the exact required-story message", (_label, project) => {
    const result = getPublishReadiness({ ...project, story: "" });
    expect(result.blocking).toContain("A project story / summary is required.");
    expect(canProceedToReview(result)).toBe(false);
    expect(isReadyToPublish({ ...project, story: "" })).toBe(false);
  });

  it.each([
    ["Photography", completePhotographyProject],
    ["Graphic Design", completeGraphicDesignProject],
  ])("%s: missing hero media blocks", (_label, project) => {
    const result = getPublishReadiness({ ...project, heroMedia: { type: "image", url: "", alt: "" } });
    expect(result.blocking.length).toBeGreaterThan(0);
    expect(canProceedToReview(result)).toBe(false);
  });

  it.each([
    ["Photography", completePhotographyProject],
    ["Graphic Design", completeGraphicDesignProject],
  ])("%s: missing title/slug/category blocks", (_label, project) => {
    expect(canProceedToReview(getPublishReadiness({ ...project, title: "" }))).toBe(false);
    expect(canProceedToReview(getPublishReadiness({ ...project, slug: "" }))).toBe(false);
    expect(canProceedToReview(getPublishReadiness({ ...project, categoryIds: [] }))).toBe(false);
  });
});

describe("Missing custom SEO does NOT block when fallback metadata is valid, across disciplines", () => {
  it.each([
    ["Photography", completePhotographyProject],
    ["Graphic Design", completeGraphicDesignProject],
  ])("%s: no metaTitle/metaDescription is advisory only", (_label, project) => {
    const result = getPublishReadiness({ ...project, seo: { metaTitle: null, metaDescription: null, ogImageUrl: null, canonicalUrl: null } });
    expect(result.warnings).toContain("SEO title/description not set — falls back to defaults.");
    expect(result.blocking).toEqual([]);
    expect(canProceedToReview(result)).toBe(true);
    expect(isReadyToPublish({ ...project, seo: { metaTitle: null, metaDescription: null, ogImageUrl: null, canonicalUrl: null } })).toBe(true);
  });
});

describe("Missing tags does NOT block, across disciplines", () => {
  it.each([
    ["Photography", completePhotographyProject],
    ["Graphic Design", completeGraphicDesignProject],
  ])("%s: empty tags is advisory only", (_label, project) => {
    const result = getPublishReadiness({ ...project, tags: [] });
    expect(result.warnings).toContain("No tags added — tags help with search and filtering.");
    expect(result.blocking).toEqual([]);
    expect(canProceedToReview(result)).toBe(true);
  });
});

describe("Missing client attribution does NOT block, across disciplines", () => {
  it.each([
    ["Photography", completePhotographyProject],
    ["Graphic Design", completeGraphicDesignProject],
  ])("%s: blank client (legitimately anonymous/confidential) is advisory only", (_label, project) => {
    const result = getPublishReadiness({ ...project, client: "" });
    expect(result.warnings).toContain("No client attribution set (leave blank if not permitted to name the client).");
    expect(result.blocking).toEqual([]);
    expect(canProceedToReview(result)).toBe(true);
  });
});

describe("All advisory fields absent at once still does not block, across disciplines (the exact reported scenario)", () => {
  it.each([
    ["Photography", completePhotographyProject],
    ["Graphic Design", completeGraphicDesignProject],
  ])("%s: no SEO + no tags + no client, but all required fields present, may still proceed to review/publication", (_label, project) => {
    const result = getPublishReadiness(withoutAdvisoryFields(project));
    expect(result.warnings.length).toBe(3);
    expect(result.blocking).toEqual([]);
    expect(canProceedToReview(result)).toBe(true);
    expect(isReadyToPublish(withoutAdvisoryFields(project))).toBe(true);
  });
});

describe("No unrelated Portfolio workflow regresses", () => {
  it("a fully complete project (every required AND every advisory field present) has zero blocking and zero warnings", () => {
    const result = getPublishReadiness(completePhotographyProject);
    expect(result.blocking).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("skipAltTextCheck (Publish-capability holders) still requires the hero image itself, only skipping alt text — a Publish-capability holder is not exempt from genuine required content", () => {
    const result = getPublishReadiness({ ...completePhotographyProject, heroMedia: { type: "image", url: "", alt: "" } }, { skipAltTextCheck: true });
    expect(result.blocking).toContain("A hero image is required.");
  });

  it("gallery images missing alt text still block (an accessibility/publication requirement, not advisory) unless skipAltTextCheck is set", () => {
    const withBadAlt = { ...completePhotographyProject, gallery: [{ id: "g1", url: "https://cdn.example.com/1.jpg", alt: "", caption: null }] };
    expect(canProceedToReview(getPublishReadiness(withBadAlt))).toBe(false);
    expect(canProceedToReview(getPublishReadiness(withBadAlt, { skipAltTextCheck: true }))).toBe(true);
  });

  it("an empty gallery is advisory only (a project may legitimately rely on hero media alone)", () => {
    const result = getPublishReadiness({ ...completePhotographyProject, gallery: [] });
    expect(result.warnings).toContain("No gallery images added yet.");
    expect(result.blocking).toEqual([]);
  });
});
