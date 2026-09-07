import { describe, expect, it } from "vitest";
import { TABS, TAB_GROUPS } from "./tabsConfig";

// Final Admin Pricing navigation consolidation (2026-09-07) — TABS/
// TAB_GROUPS is pure, zero-import config, so the exact final order the
// spec requires is directly unit-testable rather than only verifiable
// by reading the Server Component.

describe("14. Pricing navigation has all eight families, in the approved order", () => {
  it("lists exactly the eight pricing/service families first, in order", () => {
    const familyKeys = TABS.slice(0, 8).map((t) => t.key);
    expect(familyKeys).toEqual([
      "personal-sessions",
      "corporate",
      "wedding_event",
      "commercial",
      "graphic_design",
      "content_creation",
      "branding",
      "production_services",
    ]);
  });
});

describe("15. Shared configuration follows the pricing families, in order", () => {
  it("lists Subjects/Add-Ons/Discounts/Markets after the eight families, in order", () => {
    const sharedKeys = TABS.slice(8).map((t) => t.key);
    expect(sharedKeys).toEqual(["subjects", "addons", "discounts", "markets"]);
  });

  it("has exactly twelve tabs total — no route key was added, removed, or renamed by this consolidation", () => {
    expect(TABS.length).toBe(12);
  });
});

describe("TAB_GROUPS — visual grouping only, never a merge of underlying keys", () => {
  it("Service Pricing group matches the eight-family order exactly", () => {
    const group = TAB_GROUPS.find((g) => g.title === "Service Pricing");
    expect(group?.keys).toEqual(["personal-sessions", "corporate", "wedding_event", "commercial", "graphic_design", "content_creation", "branding", "production_services"]);
  });

  it("Shared Configuration group matches the four-item order exactly", () => {
    const group = TAB_GROUPS.find((g) => g.title === "Shared Configuration");
    expect(group?.keys).toEqual(["subjects", "addons", "discounts", "markets"]);
  });

  it("every TABS key appears in exactly one group — no key duplicated or dropped by the grouping", () => {
    const allGroupedKeys = TAB_GROUPS.flatMap((g) => g.keys);
    const tabKeys = TABS.map((t) => t.key);
    expect([...allGroupedKeys].sort()).toEqual([...tabKeys].sort());
    expect(new Set(allGroupedKeys).size).toBe(allGroupedKeys.length);
  });
});
