# Launch Readiness Implementation Plan

**Date:** 2026-08-05
**Source:** every finding in `PRODUCT_LAUNCH_READINESS_REVIEW.md`, grouped into four sprints and broken into individually implementable, individually verifiable tasks.
**Status:** Sprint 1 approved for implementation. Sprints 2-4 are planned but **not started** — each requires a separate go-ahead before work begins, per this project's standing approval-gate discipline.
**Working method (binding for every task, not just Sprint 1):** implement → verify functionality → update documentation → commit → only then move to the next task. No batching multiple tasks into one commit.

---

## Sprint 1 — Critical (must complete before launch)

### S1-T1: Fix self-referencing "Related" content across Portfolio, Journal, and Workshops
- **Objective:** A related-content section must never link back to the page the visitor is already on. Fix the root cause (no self-exclusion in the related-items filter) everywhere the same pattern exists, not just on the one page the review happened to catch it on.
- **Affected files:**
  - `src/app/work/[slug]/page.tsx` (lines ~77 `relatedProjects` filter, ~87 `relatedWorkshops` filter)
  - `src/app/journal/[slug]/page.tsx` (lines ~91-92 related-items filter)
  - `src/app/workshops/[slug]/page.tsx` (line ~64 related-items filter)
- **Dependencies:** None — self-contained logic fix, no schema or content change required.
- **Estimated implementation effort:** Low.
- **Expected business/user impact:** High — removes a visibly broken moment on the site's flagship, most-scrutinized page; prevents the identical bug from resurfacing silently the instant any other entity references itself or a small content set creates a similar collision.
- **Acceptance criteria:**
  - On `/work/sampson-sadia-wedding`, "Related Projects" no longer appears (zero *other* projects exist) — confirmed by absence of the section, not an empty grid.
  - Filter logic in all three files excludes the current item's own `id` from its related-items list.
  - No regression to the case where genuine, distinct related items exist (verified by temporarily reasoning through the filter logic, since production has no second item to test against live).
  - `npm run build` and `npm run lint` pass.

### S1-T2: Replace generic "no results" empty states with an honest "Coming Soon" treatment when a section has zero total content
- **Objective:** Distinguish "nothing published in this section yet" from "your filter matched nothing" on Journal and Workshops, and present the zero-content case with the same honest, intentional framing already proven on Talent Management — not a bare message that reads like a broken search.
- **Affected files:**
  - `src/app/journal/page.tsx` (empty-state block, ~lines 223-226; `items` already holds the unfiltered total)
  - `src/app/workshops/page.tsx` (empty-state block, ~lines 95-98; `allWorkshops` already holds the unfiltered total)
- **Dependencies:** None — the unfiltered totals needed to distinguish the two cases are already fetched and in scope; no new data source required.
- **Estimated implementation effort:** Low.
- **Expected business/user impact:** High — directly addresses the review's Critical finding that 2 of 7 primary nav destinations currently read as empty/broken rather than "not published yet." Matches the platform's existing discipline (proven on Talent Management) of honest, non-defensive messaging about what isn't ready rather than either faking content or leaving a bare "no results."
- **Acceptance criteria:**
  - When total unfiltered content is zero, Journal and Workshops render a distinct "Coming Soon"-style message (not the filter-specific "no matches" copy), visually consistent with the rest of the page.
  - When content exists but the active filter matches nothing, the existing "no results for this filter" copy is preserved unchanged (this case must not regress).
  - No fabricated claims, dates, or specifics in the new copy — consistent with the platform's "never invent facts" content discipline.
  - `npm run build` and `npm run lint` pass; manual check on staging/local confirms both states render correctly.

---

## Sprint 2 — High Priority (not started — planned only)

| # | Task | Affected files (from review) | Effort | Impact |
|---|---|---|---|---|
| S2-T1 | Surface the real Photography project on its own department page's "Featured Work" | `src/app/services/[slug]/page.tsx`, content curation | Low | Medium-High |
| S2-T2 | Add a founder photo to the Founder page | `src/app/about/founder/page.tsx`, Sanity content | Low-Medium (pending photo asset) | High |
| S2-T3 | Add canonical tags to the 11 routes missing one | `src/app/page.tsx`, `about/page.tsx`, `about/founder/page.tsx`, `services/page.tsx`, `services/[slug]/page.tsx`, `journal/page.tsx`, `journal/authors/[slug]/page.tsx`, `workshops/page.tsx`, `workshops/[slug]/page.tsx`, `workshops/instructors/[slug]/page.tsx`, `book/page.tsx` | Medium | Medium |
| S2-T4 | Add site-wide Organization/WebSite JSON-LD | `src/app/layout.tsx` | Medium | Medium-High |
| S2-T5 | Replace the default social-share image with a proper 1200×630 branded asset | `src/app/layout.tsx`, `src/lib/media/ogImageUrl.ts` (extend existing pattern) | Medium | Medium-High |
| S2-T6 | Copy polish on the case study (grammar, near-duplicate caption) | Sanity content (`portfolioProject` document) | Low | Low-Medium |
| S2-T7 | Hide or resolve the empty "Destination Weddings" portfolio filter option | `src/app/work/page.tsx` or category-list source | Low | Low |

*Full Objective/Dependencies/Acceptance-criteria detail for each will be written out at the same level as Sprint 1 when Sprint 2 is approved to begin — kept summarized here to avoid drafting implementation detail for work that isn't authorized yet.*

## Sprint 3 — Medium Priority (not started — planned only)

| # | Task | Affected files (from review) | Effort | Impact |
|---|---|---|---|---|
| S3-T1 | Add `/about/founder` to `sitemap.xml` | sitemap generator | Low | Low-Medium |
| S3-T2 | Add Content Creation and Production Services to the footer | Footer component | Low | Low-Medium |
| S3-T3 | Revisit "Talent" nav placement once the Talent directory ships | Navigation config | Low | Low |
| S3-T4 | (Resolves naturally with Sprint 2/Portfolio Population — no standalone task) Same project appearing twice on `/work` | `src/app/work/page.tsx` | N/A | Low |

## Sprint 4 — Future Enhancements (not started — planned only)

| # | Task | Effort | Impact |
|---|---|---|---|
| S4-T1 | Competitive benchmarking pass against world-class creative-agency sites | Medium | Medium |
| S4-T2 | Dedicated WCAG accessibility audit (contrast, screen-reader flow, focus order) | Medium | Medium |
| S4-T3 | Gallery lightbox, richer per-project JSON-LD, caption-authoring guidance, dedicated homepage hero visual (already tracked in `PRODUCT_ROADMAP.md`) | Medium | Medium |
| S4-T4 | Full Portfolio/Journal/Workshops content population (Phase 3) | High | High |

---

## Progress Log

- 2026-08-05 — Plan created. Sprint 1 approved; implementation beginning with S1-T1.
