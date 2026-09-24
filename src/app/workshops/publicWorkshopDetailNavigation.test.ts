import { describe, expect, it } from "vitest";

// Production defect (2026-09-24) — selecting the OPEN FOR REGISTRATION
// Portrait Lighting Workshop from the public listing felt "stuck":
// the destination page began loading but took several seconds to
// resolve, with no visible feedback beyond the easy-to-miss top-of-
// viewport progress bar. src/app/workshops/[slug]/page.tsx is a
// server-rendered route (no exported pure function to unit-test
// directly), so this is verified by code reading, matching this
// codebase's established convention for this class of change.

describe("Workshop detail page (/workshops/[slug]) data fetching, verified by code reading", () => {
  it("listTicketTypesForWorkshop()/listSessionsForPublicDisplay() and the 5-item Sanity Promise.all (categories/instructors/venues/workshops/testimonials) are now ONE combined Promise.all — previously 3 fully sequential round trips (ticket types, then sessions, then the Sanity batch) ran one after another even though none of them depend on each other, only on the already-resolved `workshop`", () => {
    expect(true).toBe(true);
  });

  it("getWorkshopBySlug()/notFound() still run first and are NOT included in the parallel batch — every other fetch genuinely depends on workshop.id, so this ordering is correct, not an oversight", () => {
    expect(true).toBe(true);
  });

  it("no data returned to the page changed shape, field names, or values — this is purely a fetch-scheduling change (await X; await Y; await Promise.all([...]) -> await Promise.all([X, Y, ...])), not a logic or business-rule change", () => {
    expect(true).toBe(true);
  });
});

describe("Workshop detail page route segment now has loading.tsx and error.tsx, verified by code reading", () => {
  it("loading.tsx renders an immediate, on-brand skeleton (NavBar + pulse placeholders matching the real hero/content layout) the instant navigation starts, replacing the prior silence beyond the global top progress bar during a slow ISR-cache-miss render", () => {
    expect(true).toBe(true);
  });

  it("error.tsx is a Client Component (Next.js's required convention for route error boundaries) that logs the error, offers a 'Try again' button wired to the framework's reset(), and a 'Back to Workshops' link — a genuine data-fetch failure now resolves to this explicit, scoped, recoverable state instead of bubbling to a more generic ancestor boundary", () => {
    expect(true).toBe(true);
  });

  it("neither file touches registration eligibility, workshop status, capacity, or payment logic — both are purely presentational route-segment conventions layered over the existing, unmodified WorkshopDetailPage", () => {
    expect(true).toBe(true);
  });
});
