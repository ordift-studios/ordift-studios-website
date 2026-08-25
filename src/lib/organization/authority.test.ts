import { describe, expect, it } from "vitest";
import { jurisdictionAuthority, PROTECTED_LEADERSHIP_POSITION_SLUGS, JURISDICTIONS, AUTHORITY_VERBS } from "@/lib/organization/authority";

// Phase 3.2 — pure-logic coverage for the peer-executive model. The
// DB-backed checks (hasJurisdictionAuthority, isSuperAdminId, and the
// full authorization branch inside assignStaffPosition()) need a live
// Supabase session to exercise for real and aren't covered here — see
// the Phase 3.2 report for how those were verified instead (code
// review + the same "no live admin session in this environment"
// limitation every prior phase's report has acknowledged).

describe("jurisdictionAuthority", () => {
  it("builds the documented <jurisdiction>.<verb> string", () => {
    expect(jurisdictionAuthority("operations", "administer")).toBe("operations.administer");
    expect(jurisdictionAuthority("finance", "view")).toBe("finance.view");
  });

  it("keeps every jurisdiction and verb distinct from one another (no accidental overlap in the naming convention)", () => {
    expect(new Set(JURISDICTIONS).size).toBe(JURISDICTIONS.length);
    expect(new Set(AUTHORITY_VERBS).size).toBe(AUTHORITY_VERBS.length);
  });
});

describe("PROTECTED_LEADERSHIP_POSITION_SLUGS", () => {
  it("covers exactly CHIEF and all six GR.9 peer executives — no more, no less", () => {
    expect(PROTECTED_LEADERSHIP_POSITION_SLUGS).toEqual(
      new Set([
        "founder-ceo",
        "chief-operating-officer-coo",
        "chief-financial-officer",
        "chief-strategy-officer",
        "chief-people-hr-officer",
        "chief-technology-officer",
        "director-executive-administration",
      ])
    );
  });

  it("does not protect a GR.8 Director or any ordinary Position", () => {
    expect(PROTECTED_LEADERSHIP_POSITION_SLUGS.has("creative-director")).toBe(false);
    expect(PROTECTED_LEADERSHIP_POSITION_SLUGS.has("photographer")).toBe(false);
  });
});
