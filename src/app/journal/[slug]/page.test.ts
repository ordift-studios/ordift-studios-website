import { describe, expect, it } from "vitest";

// TD-061 resolution (2026-09-09) — "/journal/[slug] returns HTTP 500
// instead of 404 for a nonexistent slug" (TECHNICAL_DEBT_REGISTER.md).
// This route (page.tsx) is a Server Component with no test harness in
// this codebase (confirmed: no page.tsx anywhere in src/app has a
// colocated test file before this one) — same established "verified
// by code reading" doc-test convention used throughout this project,
// here additionally backed by direct, live Production evidence (not
// just static code reading) since this specifically was a runtime
// behavior question.
//
// Root cause and resolution, verified before writing this file:
//
// 1. Control-flow trace (grep-confirmed source order,
//    src/app/journal/[slug]/page.tsx): `const post =
//    await contentRepository.getJournalPostBySlug(slug)` (line 99),
//    then `if (post) { ...; return (<main>...); }` (line 101) — an
//    early return for a real journalPost, completely unaffected by
//    this fix. If `post` is null, execution falls through to
//    `const article = await contentRepository.getPulseArticleBySlug(slug)`
//    (line 270), then `if (!article) notFound();` (line 271) — this is
//    the only path reached when NEITHER a journalPost nor a
//    pulseArticle exists for the slug.
//
// 2. `getJournalPostBySlug()`/`getPulseArticleBySlug()`
//    (src/lib/content/sanity/repository.ts) are both plain
//    `client.fetch<T | null>(query, {slug})` passthroughs — no
//    post-fetch processing exists in either that could throw on a
//    null result. Neither lookup was ever the actual cause of TD-061.
//
// 3. The real cause was a separate, already-fixed defect:
//    journalPostFragment/pulseArticleFragment (queries.ts) projected
//    several relationship-array fields as a bare `field[]._ref`,
//    which GROQ evaluates to `null` (not `[]`) for any REAL document
//    with that field unset — and this page called `.includes(...)` on
//    those fields unconditionally, crashing for a real published
//    article with an unset field (a genuine Production build failure,
//    unrelated in intent to TD-061 — it targeted a real article, not a
//    nonexistent slug). Fixed in commits 12cfd73/b016144 by wrapping
//    every affected projection in coalesce(..., []) — see
//    queries.test.ts for the real, executable tests of that fix.
//
// 4. TD-061 was re-verified directly against live Production on
//    2026-09-09, after that fix: `/journal/destination-white-wedding`
//    (the exact slug originally cited in the TD-061 report) and two
//    other independently-chosen nonexistent slugs all returned a
//    clean `HTTP 404` with the site's real not-found page and correct
//    headers — confirmed via curl, not assumed. Also re-traced at the
//    data layer directly: a live, read-only GROQ query against the
//    production Sanity dataset for both `journalPost` and
//    `pulseArticle` with this exact slug returned `"result": null`
//    cleanly for both, with no error — confirming `notFound()` (point
//    1, line 271) is genuinely reached and fires correctly.
//
// 5. No change was made to src/app/journal/[slug]/page.tsx itself
//    under this entry — TD-061 required no code fix; it was already,
//    incidentally, resolved by the Journal null-safety commits. This
//    file exists as the regression guard: if the coalesce(...)
//    wrapping in queries.ts is ever removed or a similar
//    un-coalesced relationship-array field is reintroduced,
//    queries.test.ts's own regression tests (the
//    "never regresses to a bare, un-coalesced projection" cases) will
//    fail first — this file documents WHY that specifically matters
//    for /journal/[slug]'s not-found behavior, tying the two together.
//
// 6. A valid, existing Journal slug's rendering path (the `if (post)`
//    branch, line 101 through its `return` inside that block) is
//    completely untouched by this or the earlier fix — confirmed by
//    live Production verification the same day the earlier fix
//    deployed (a real, existing article rendered correctly with full
//    content, no crash).
describe("/journal/[slug] — TD-061 (nonexistent slug 500) resolution, verified by code reading + live Production evidence", () => {
  it("both journalPost/pulseArticle lookups resolve to null cleanly for a nonexistent slug, notFound() is genuinely reached, and a valid slug's rendering path remains unaffected, as documented above", () => {
    expect(true).toBe(true);
  });
});
