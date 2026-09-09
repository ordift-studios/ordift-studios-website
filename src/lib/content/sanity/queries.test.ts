import { describe, expect, it } from "vitest";
import { journalPostFragment } from "./queries";

// Journal null-safety fix (2026-09-09) — real Production build failure:
// journalPostFragment's categories/relatedPosts/relatedProjects/
// relatedWorkshops projections (`field[]._ref`) evaluated to GROQ
// `null`, not `[]`, for any journalPost document where that field is
// unset — confirmed genuinely optional in the Sanity schema
// (src/sanity/schemaTypes/documents/journalPost.ts: none of these four
// fields has `validation: (r) => r.required()`, unlike heroImage/
// excerpt, which do). JournalPost's TypeScript type declares
// categoryIds/relatedPostIds/relatedProjectIds/relatedWorkshopIds as
// always-arrays (ID[], never nullable) — /journal/[slug]/page.tsx
// trusted that contract and called
// `post.categoryIds.includes(...)`/etc. directly inside `.filter()`,
// which crashed with "Cannot read properties of null (reading
// 'includes')" the moment a real post actually had one of these unset.
//
// Fixed at the query boundary — the one place this can be corrected
// once for every consumer (journalPostsQuery and
// journalPostBySlugQuery both share this fragment) — by wrapping each
// projection in coalesce(..., []), the exact same pattern already
// established elsewhere in this file for equivalent optional-array
// fields (workshop-related relatedProjects/relatedWorkshops, tags).
// This is a real, executable test (not a doc-test) since
// journalPostFragment is a plain exported GROQ string with no DB
// dependency — asserting on its literal content directly proves the
// defensive syntax that was missing is now present, the exact thing
// that caused the Production build failure.
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
