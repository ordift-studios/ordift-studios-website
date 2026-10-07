import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { candidateLabel, rankCandidates, type PersonFacts } from "./matching";
import { NO_QUOTATION, validateStatusChange } from "./rules";
import { allowedStatusTransitions, STATUS_LABELS } from "./config";
import { pathwayLabel } from "@/lib/enquiry/pathways";

const PHOTOGRAPHER = "title-photographer";
const PHOTO_EDITOR = "title-photo-editor";

function person(overrides: Partial<PersonFacts> & { name: string }): PersonFacts {
  return {
    profileId: overrides.name.toLowerCase().replace(/\W+/g, "-"),
    memberNumber: null,
    accessActive: true,
    vendorStatus: null,
    payeeStatus: null,
    engagementTypeName: "Full-time",
    isInternal: true,
    capabilities: [],
    conflicts: [],
    ...overrides,
  };
}

const cap = (titleId: string, proficiency: "primary" | "secondary" | "supporting" = "primary", verification: "verified" | "self_declared" | "revoked" = "verified") => ({ titleId, titleName: titleId === PHOTOGRAPHER ? "Photographer" : "Photo Editor", proficiency, verification });

// Mirrors the real Production roster observed in the 2026-10-07 audit.
const roster: PersonFacts[] = [
  person({ name: "Kelvin Acheampong", memberNumber: "0003", capabilities: [cap(PHOTOGRAPHER)] }),
  person({ name: "Eugene Anti", memberNumber: "CT0001", engagementTypeName: "Independent Contractor", isInternal: false }),
  person({ name: "Lady Anim-Tetey", memberNumber: "CL0001", engagementTypeName: "Vendor / Supplier", isInternal: false, vendorStatus: "pending" }),
  person({ name: "Mishael Adjei", memberNumber: "0002" }),
  person({ name: "Myredlive Anim-Tetey", memberNumber: "0001" }),
  person({ name: "Myredlive Anim-Tetey", profileId: "backup-account", memberNumber: null, engagementTypeName: null, isInternal: null }),
];

describe("role-aware crew matching (Phase 1)", () => {
  it("a Photographer request lists only people with a Photography capability — not IT contractors, vendors, other staff, or the duplicate/backup accounts", () => {
    const { candidates } = rankCandidates(PHOTOGRAPHER, roster);
    expect(candidates.map((c) => c.name)).toEqual(["Kelvin Acheampong"]);
  });

  it("includes eligible external photographers alongside internal ones", () => {
    const freelancer = person({ name: "Freelance Photographer", engagementTypeName: "Freelancer", isInternal: false, capabilities: [cap(PHOTOGRAPHER, "primary", "verified")] });
    const { candidates } = rankCandidates(PHOTOGRAPHER, [...roster, freelancer]);
    expect(candidates.map((c) => c.name).sort()).toEqual(["Freelance Photographer", "Kelvin Acheampong"]);
    expect(candidates.find((c) => c.name === "Freelance Photographer")?.isInternal).toBe(false);
  });

  it("the backup account has no capability so it never appears — and the Founder appears only once capabilities are actually set (not hard-coded)", () => {
    const withFounderCaps = roster.map((p) => (p.memberNumber === "0001" ? { ...p, capabilities: [cap(PHOTOGRAPHER, "secondary", "verified")] } : p));
    const { candidates } = rankCandidates(PHOTOGRAPHER, withFounderCaps);
    expect(candidates.map((c) => c.profileId)).toContain("myredlive-anim-tetey");
    expect(candidates.map((c) => c.profileId)).not.toContain("backup-account");
  });

  it("capability, not job title, decides: a photographer with a secondary Photo Editor capability is a Photo Editor candidate, and a primary-only editor ranks above them", () => {
    const kelvin = person({ name: "Kelvin A", capabilities: [cap(PHOTOGRAPHER), cap(PHOTO_EDITOR, "secondary")] });
    const editor = person({ name: "Dedicated Editor", isInternal: false, capabilities: [cap(PHOTO_EDITOR, "primary")] });
    const { candidates } = rankCandidates(PHOTO_EDITOR, [kelvin, editor]);
    expect(candidates.map((c) => c.name)).toEqual(["Dedicated Editor", "Kelvin A"]);
  });

  it("ranks primary > secondary > supporting, and verified above self-declared at the same relevance", () => {
    const people = [
      person({ name: "Supporting", capabilities: [cap(PHOTOGRAPHER, "supporting")] }),
      person({ name: "Secondary", capabilities: [cap(PHOTOGRAPHER, "secondary")] }),
      person({ name: "Primary Self-declared", capabilities: [cap(PHOTOGRAPHER, "primary", "self_declared")] }),
      person({ name: "Primary Verified", capabilities: [cap(PHOTOGRAPHER, "primary", "verified")] }),
    ];
    expect(rankCandidates(PHOTOGRAPHER, people).candidates.map((c) => c.name)).toEqual(["Primary Verified", "Primary Self-declared", "Secondary", "Supporting"]);
  });

  it("a self-declared capability is shown as unverified, never as verified", () => {
    const { candidates } = rankCandidates(PHOTOGRAPHER, [person({ name: "New Hire", capabilities: [cap(PHOTOGRAPHER, "primary", "self_declared")] })]);
    expect(candidates[0].verification).toBe("self_declared");
    expect(candidateLabel(candidates[0])).toMatch(/unverified/);
  });

  it("unknown availability never disqualifies; known conflicts and leave are flagged and ranked lower but still listed", () => {
    const people = [
      person({ name: "Free", capabilities: [cap(PHOTOGRAPHER)] }),
      person({ name: "Booked", capabilities: [cap(PHOTOGRAPHER)], conflicts: [{ kind: "crew_slot", label: "CSR-2026-000009 (2026-10-15)" }] }),
      person({ name: "On Leave", capabilities: [cap(PHOTOGRAPHER)], conflicts: [{ kind: "leave", label: "2026-10-14 → 2026-10-16" }] }),
    ];
    const { candidates } = rankCandidates(PHOTOGRAPHER, people);
    expect(candidates.map((c) => [c.name, c.availability])).toEqual([["Free", "unknown"], ["Booked", "conflict"], ["On Leave", "on_leave"]]);
    expect(candidateLabel(candidates[0])).toMatch(/Availability unknown/);
  });

  it("excludes revoked capabilities, inactive/expired access, non-active vendors and suspended payees", () => {
    const people = [
      person({ name: "Revoked", capabilities: [cap(PHOTOGRAPHER, "primary", "revoked")] }),
      person({ name: "Suspended Access", accessActive: false, capabilities: [cap(PHOTOGRAPHER)] }),
      person({ name: "Pending Vendor", vendorStatus: "pending", isInternal: false, capabilities: [cap(PHOTOGRAPHER)] }),
      person({ name: "Suspended Payee", payeeStatus: "suspended", capabilities: [cap(PHOTOGRAPHER)] }),
      person({ name: "Active Vendor", vendorStatus: "active", isInternal: false, capabilities: [cap(PHOTOGRAPHER)] }),
    ];
    const { candidates, excluded } = rankCandidates(PHOTOGRAPHER, people);
    expect(candidates.map((c) => c.name)).toEqual(["Active Vendor"]);
    expect(excluded.map((e) => e.reason).sort()).toEqual(["access_inactive", "no_matching_capability", "payee_inactive", "vendor_not_active"]);
  });

  it("a custom (unconfigured) role offers anyone with a live capability for manual choice", () => {
    const people = [person({ name: "Has Capability", capabilities: [cap(PHOTOGRAPHER)] }), person({ name: "No Capability" })];
    expect(rankCandidates(null, people).candidates.map((c) => c.name)).toEqual(["Has Capability"]);
  });

  it("attendance can never affect eligibility: no attendance data is read by the matcher or loader", () => {
    for (const f of ["src/lib/crewSupport/matching.ts", "src/lib/crewSupport/candidates.ts"]) {
      expect(readFileSync(f, "utf8").replace(/\/\/.*$/gm, "")).not.toMatch(/attendance/i);
    }
  });

  it("assignment is enforced server-side: a crafted form cannot assign a person without a matching capability", () => {
    expect(readFileSync("src/lib/crewSupport/admin.ts", "utf8")).toMatch(/isEligibleAssignee\(/);
  });
});

describe("Quote Preparation state and the Quote Issued guard", () => {
  it("Availability Review now leads to Quote Preparation, not straight to Quote Issued", () => {
    expect(allowedStatusTransitions("availability_review")).toContain("quote_preparation");
    expect(allowedStatusTransitions("availability_review")).not.toContain("quoted");
    expect(STATUS_LABELS.quote_preparation).toBe("Quote preparation");
  });

  it("Quote Issued is impossible without an actually issued quotation, and allowed once one exists", () => {
    expect(allowedStatusTransitions("quote_preparation")).toContain("quoted");
    expect(validateStatusChange("quote_preparation", "quoted", []).ok).toBe(false);
    expect(validateStatusChange("quote_preparation", "quoted", [], { ...NO_QUOTATION, hasLiveQuotation: false, hasIssuedQuotation: false, hasAcceptedQuotation: false }).ok).toBe(false);
    expect(validateStatusChange("quote_preparation", "quoted", [], { ...NO_QUOTATION, hasLiveQuotation: true, hasIssuedQuotation: true, hasAcceptedQuotation: false }).ok).toBe(true);
  });

  it("the old shortcut (availability_review → quoted) is rejected outright", () => {
    expect(validateStatusChange("availability_review", "quoted", [], { ...NO_QUOTATION, hasLiveQuotation: true, hasIssuedQuotation: true, hasAcceptedQuotation: false }).ok).toBe(false);
  });
});

describe("pathway labelling and QA/test-data handling", () => {
  it("crew-support enquiries read 'Creative Crew Support', not the raw slug", () => {
    expect(pathwayLabel("crew-support")).toBe("Creative Crew Support");
    expect(pathwayLabel("photography")).toBe("Photography");
  });

  it("the main /book service list is unchanged (crew-support is not a booking pathway)", async () => {
    const { PATHWAYS } = await import("@/lib/enquiry/pathways");
    expect(PATHWAYS.map((p) => p.value)).not.toContain("crew-support");
  });

  it("reports and dashboard counts exclude test records", () => {
    expect(readFileSync("src/lib/admin/reports/modules/contactEnquiries.ts", "utf8")).toMatch(/excludeTest: true/);
    expect(readFileSync("src/lib/admin/overview.ts", "utf8")).toMatch(/\.eq\("is_test", false\)/);
  });

  it("migration 0141 flags only the designated QA request by exact reference and never touches CSR-2026-000002 or authentication", () => {
    const sql = readFileSync("supabase/migrations/0141_crew_capabilities_and_qa_flag.sql", "utf8").replace(/--.*$/gm, "");
    expect(sql).toMatch(/where reference_number = 'CSR-2026-000001'/);
    expect(sql).not.toMatch(/CSR-2026-000002/);
    expect(sql).not.toMatch(/auth\./);
    expect(sql).not.toMatch(/\b(drop table|truncate|delete from)\b/i);
  });

  it("seeding uses only unambiguous craft titles (never 'other', management, engineering or instructor titles)", () => {
    const sql = readFileSync("supabase/migrations/0141_crew_capabilities_and_qa_flag.sql", "utf8");
    const list = sql.match(/ot\.slug in \(([\s\S]*?)\)/)?.[1] ?? "";
    for (const bad of ["'other'", "workshop_instructor", "talent_manager", "client_services"]) expect(list).not.toContain(bad);
    expect(list).toContain("'photographer'");
  });

  it("capability management is gated to admin/super_admin and every change is attributed", () => {
    expect(readFileSync("src/app/admin/crew-support/capabilities/page.tsx", "utf8")).toMatch(/if \(!canManageCrewSupport\(user\)\) redirect\(/);
    expect(readFileSync("src/app/admin/crew-support/capabilities/actions.ts", "utf8").match(/canManageCrewSupport\(user\)/g)?.length).toBe(2);
    expect(readFileSync("src/lib/crewSupport/capabilities.ts", "utf8").match(/logActivity\(/g)?.length).toBe(2);
  });
});

describe("Capabilities page is discoverable and complete (2026-10-07 follow-up)", () => {
  it("is reachable from the sidebar (admin-only) and from an in-section sub-navigation on the list, detail and capabilities pages", () => {
    expect(readFileSync("src/lib/portal/adminNavigation.ts", "utf8")).toMatch(/label: "Crew Capabilities", href: "\/admin\/crew-support\/capabilities", adminOnly: true/);
    for (const f of ["src/app/admin/crew-support/page.tsx", "src/app/admin/crew-support/[id]/page.tsx", "src/app/admin/crew-support/capabilities/page.tsx"]) {
      expect(readFileSync(f, "utf8")).toMatch(/<CrewSupportSubNav active=/);
    }
    expect(readFileSync("src/app/admin/crew-support/CrewSupportSubNav.tsx", "utf8")).toMatch(/\/admin\/crew-support\/capabilities/);
  });

  it("revoking keeps the row for history (an update to 'revoked'), never a delete", () => {
    const src = readFileSync("src/lib/crewSupport/capabilities.ts", "utf8").replace(/\/\/.*$/gm, "");
    expect(src).toMatch(/verification_status: "revoked"/);
    expect(src).not.toMatch(/\.delete\(\)/);
  });

  it("every capability change is attributed and surfaced as history, with verifier attribution, independent of organizational title", () => {
    const src = readFileSync("src/lib/crewSupport/capabilities.ts", "utf8");
    expect(src).toMatch(/person_capability\.set/);
    expect(src).toMatch(/person_capability\.revoked/);
    expect(src).toMatch(/verifiedByLabel/);
    expect(src).toMatch(/organizationalTitle/);
  });

  it("no individual is hard-coded anywhere in the capability system", () => {
    for (const f of ["src/lib/crewSupport/capabilities.ts", "src/lib/crewSupport/matching.ts", "src/lib/crewSupport/candidates.ts", "src/app/admin/crew-support/capabilities/page.tsx", "src/app/admin/crew-support/capabilities/actions.ts"]) {
      expect(readFileSync(f, "utf8").replace(/\/\/.*$/gm, "")).not.toMatch(/Kelvin|Myredlive|Founder|966bf3f7|2bf593f7|Eugene|Mishael/);
    }
  });
});
