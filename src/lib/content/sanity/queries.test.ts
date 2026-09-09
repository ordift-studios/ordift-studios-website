import { describe, expect, it } from "vitest";
import { journalPostFragment, pulseArticleFragment } from "./queries";

// Journal null-safety fix (2026-09-09) — real Production build failure:
// prerendering /journal/apple-announces-its-most-powerful-mac-mini-yet-2fbce94d
// crashed with "TypeError: Cannot read properties of null (reading
// 'includes')". /journal/[slug]/page.tsx serves two different content
// types through one route (journalPost and pulseArticle — see
// STORIES_PULSE_INTEGRATION.md), and BOTH of their query fragments
// shared the identical defect: relationship-array fields projected as
// a bare `field[]._ref` evaluate to GROQ `null`, not `[]`, when the
// underlying Sanity array field is unset — but each type's TypeScript
// type (JournalPost/PulseArticle) declares these fields as
// always-arrays (ID[], never nullable), so the page trusted that
// contract and called `.includes(...)` directly inside `.filter()`.
//
// The FIRST fix attempt corrected only journalPostFragment — a real,
// independently legitimate instance of the same defect class (these
// fields are genuinely optional in journalPost's own Sanity schema
// too — see src/sanity/schemaTypes/documents/journalPost.ts, none of
// the four has `validation: (r) => r.required()`), but NOT the actual
// cause of this specific crash. Redeploying with only that fix still
// failed, with the identical error digest. Root cause was then
// confirmed empirically, not re-guessed: a direct, read-only query
// against the live Sanity dataset for the exact failing slug showed
// `_type: "pulseArticle"` with opportunityTypes/relatedArticles/
// relatedProjects/relatedWorkshops all genuinely null for that
// document — and, separately, that none of pulseArticle's six
// relationship-array fields (categories/regions/opportunityTypes/
// relatedArticles/relatedProjects/relatedWorkshops) has
// `validation: (r) => r.required()` in its own schema either
// (src/sanity/schemaTypes/documents/pulseArticle.ts) — opportunityTypes
// is even explicitly hidden in Studio unless contentKind ===
// "opportunity", so it's expected to be unset on an ordinary
// non-opportunity article, exactly matching this document. Re-running
// the exact fixed coalesce(...) projection directly against this same
// live document (read-only) confirmed every previously-null field now
// resolves to `[]` before this fix was ever deployed.
//
// Both fragments are fixed here, the same way: wrapping each
// projection in coalesce(..., []) — the exact pattern already
// established elsewhere in this file for equivalent optional-array
// fields (tags; workshop-related relatedProjects/relatedWorkshops).
// These are real, executable tests (not doc-tests) since both
// fragments are plain exported GROQ strings with no DB dependency —
// asserting on their literal content directly proves the defensive
// syntax that was missing is now present.
describe("journalPostFragment — null-safe relationship-array projections", () => {
  it("coalesces categoryIds to an empty array when unset", () => {
    expect(journalPostFragment).toContain('"categoryIds": coalesce(categories[]._ref, [])');
  });

  it("coalesces relatedPostIds to an empty array when unset", () => {
    expect(journalPostFragment).toContain('"relatedPostIds": coalesce(relatedPosts[]._ref, [])');
  });

  it("coalesces relatedProjectIds to an empty array when unset", () => {
    expect(journalPostFragment).toContain('"relatedProjectIds": coalesce(relatedProjects[]._ref, [])');
  });

  it("coalesces relatedWorkshopIds to an empty array when unset", () => {
    expect(journalPostFragment).toContain('"relatedWorkshopIds": coalesce(relatedWorkshops[]._ref, [])');
  });

  it("never regresses to a bare, un-coalesced projection for any of the four fields", () => {
    expect(journalPostFragment).not.toMatch(/"categoryIds":\s*categories\[\]\._ref(?!\w)/);
    expect(journalPostFragment).not.toMatch(/"relatedPostIds":\s*relatedPosts\[\]\._ref(?!\w)/);
    expect(journalPostFragment).not.toMatch(/"relatedProjectIds":\s*relatedProjects\[\]\._ref(?!\w)/);
    expect(journalPostFragment).not.toMatch(/"relatedWorkshopIds":\s*relatedWorkshops\[\]\._ref(?!\w)/);
  });
});

// pulseArticleFragment — the fragment actually responsible for the
// reported Production crash (see header comment above: confirmed
// empirically against the live document, not inferred from the URL
// slug alone).
describe("pulseArticleFragment — null-safe relationship-array projections", () => {
  it("coalesces categoryIds to an empty array when unset", () => {
    expect(pulseArticleFragment).toContain('"categoryIds": coalesce(categories[]._ref, [])');
  });

  it("coalesces regionIds to an empty array when unset", () => {
    expect(pulseArticleFragment).toContain('"regionIds": coalesce(regions[]._ref, [])');
  });

  it("coalesces opportunityTypeIds to an empty array when unset", () => {
    expect(pulseArticleFragment).toContain('"opportunityTypeIds": coalesce(opportunityTypes[]._ref, [])');
  });

  it("coalesces relatedArticleIds to an empty array when unset", () => {
    expect(pulseArticleFragment).toContain('"relatedArticleIds": coalesce(relatedArticles[]._ref, [])');
  });

  it("coalesces relatedProjectIds to an empty array when unset", () => {
    expect(pulseArticleFragment).toContain('"relatedProjectIds": coalesce(relatedProjects[]._ref, [])');
  });

  it("coalesces relatedWorkshopIds to an empty array when unset", () => {
    expect(pulseArticleFragment).toContain('"relatedWorkshopIds": coalesce(relatedWorkshops[]._ref, [])');
  });

  it("never regresses to a bare, un-coalesced projection for any of the six fields", () => {
    expect(pulseArticleFragment).not.toMatch(/"categoryIds":\s*categories\[\]\._ref(?!\w)/);
    expect(pulseArticleFragment).not.toMatch(/"regionIds":\s*regions\[\]\._ref(?!\w)/);
    expect(pulseArticleFragment).not.toMatch(/"opportunityTypeIds":\s*opportunityTypes\[\]\._ref(?!\w)/);
    expect(pulseArticleFragment).not.toMatch(/"relatedArticleIds":\s*relatedArticles\[\]\._ref(?!\w)/);
    expect(pulseArticleFragment).not.toMatch(/"relatedProjectIds":\s*relatedProjects\[\]\._ref(?!\w)/);
    expect(pulseArticleFragment).not.toMatch(/"relatedWorkshopIds":\s*relatedWorkshops\[\]\._ref(?!\w)/);
  });
});
