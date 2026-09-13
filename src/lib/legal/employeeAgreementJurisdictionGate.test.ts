import { describe, expect, it } from "vitest";
import { checkEmployeeAgreementJurisdictionSchedule, OS_LGL_007_MASTER_CANONICAL_CODE } from "./employeeAgreementJurisdictionGate";
import { WORKFORCE_JURISDICTIONS } from "@/lib/compliance/requirementClassification";

// Ordift Studios Compliance/COMP-SYS-1, Phase B2 Step 1. The gate has no
// database dependency of its own today (no schedule registry exists
// yet — see the module's own doc comment), so every case below is a
// real, executable assertion — no code-reading placeholders needed.

describe("checkEmployeeAgreementJurisdictionSchedule — missing/malformed jurisdiction", () => {
  it("1. missing jurisdiction (null) -> MISSING_JURISDICTION, blocked", async () => {
    const result = await checkEmployeeAgreementJurisdictionSchedule(null);
    expect(result).toEqual({ ok: false, state: "MISSING_JURISDICTION", error: expect.any(String) });
  });

  it("1b. missing jurisdiction (undefined) -> MISSING_JURISDICTION, blocked", async () => {
    const result = await checkEmployeeAgreementJurisdictionSchedule(undefined);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.state).toBe("MISSING_JURISDICTION");
  });

  it("1c. missing jurisdiction (empty/whitespace-only string) -> MISSING_JURISDICTION, blocked", async () => {
    for (const empty of ["", "   "]) {
      const result = await checkEmployeeAgreementJurisdictionSchedule(empty);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.state).toBe("MISSING_JURISDICTION");
    }
  });

  it("2. malformed/unresolved jurisdiction -> UNRESOLVED_JURISDICTION, blocked", async () => {
    for (const bad of ["France", "Nigeria", "UK", "USA", "not-a-jurisdiction"]) {
      const result = await checkEmployeeAgreementJurisdictionSchedule(bad);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.state).toBe("UNRESOLVED_JURISDICTION");
    }
  });
});

describe("checkEmployeeAgreementJurisdictionSchedule — recognized jurisdictions, no approved schedule exists for any", () => {
  it("3. GH recognized, still blocked: NO_APPROVED_JURISDICTION_SCHEDULE", async () => {
    const result = await checkEmployeeAgreementJurisdictionSchedule("Ghana");
    expect(result).toEqual({ ok: false, state: "NO_APPROVED_JURISDICTION_SCHEDULE", error: expect.any(String) });
  });

  it("4. QA recognized, still blocked: NO_APPROVED_JURISDICTION_SCHEDULE", async () => {
    const result = await checkEmployeeAgreementJurisdictionSchedule("Qatar");
    expect(result).toEqual({ ok: false, state: "NO_APPROVED_JURISDICTION_SCHEDULE", error: expect.any(String) });
  });

  it("5. GB recognized, still blocked: NO_APPROVED_JURISDICTION_SCHEDULE", async () => {
    const result = await checkEmployeeAgreementJurisdictionSchedule("United Kingdom");
    expect(result).toEqual({ ok: false, state: "NO_APPROVED_JURISDICTION_SCHEDULE", error: expect.any(String) });
  });

  it("6. DE_EU and US are recognized on their own merits, never silently treated as OTHER, and are still blocked: NO_APPROVED_JURISDICTION_SCHEDULE", async () => {
    const deEuResult = await checkEmployeeAgreementJurisdictionSchedule("Germany / European Union");
    expect(deEuResult).toEqual({ ok: false, state: "NO_APPROVED_JURISDICTION_SCHEDULE", error: expect.any(String) });

    const usResult = await checkEmployeeAgreementJurisdictionSchedule("United States");
    expect(usResult).toEqual({ ok: false, state: "NO_APPROVED_JURISDICTION_SCHEDULE", error: expect.any(String) });

    // Neither result's error text claims "OTHER" or "International" — proving
    // they were not coerced into that bucket before reaching the schedule check.
    expect(deEuResult.ok).toBe(false);
    expect(usResult.ok).toBe(false);
    if (!deEuResult.ok) expect(deEuResult.error.toLowerCase()).not.toContain("other");
    if (!usResult.ok) expect(usResult.error.toLowerCase()).not.toContain("other");
  });

  it("7. OTHER / International-Other does not bypass the schedule gate: still NO_APPROVED_JURISDICTION_SCHEDULE, not a free pass", async () => {
    const result = await checkEmployeeAgreementJurisdictionSchedule("International / Other");
    expect(result).toEqual({ ok: false, state: "NO_APPROVED_JURISDICTION_SCHEDULE", error: expect.any(String) });
  });

  it("every canonical WorkforceJurisdiction is recognized and, today, blocked at the same NO_APPROVED_JURISDICTION_SCHEDULE state — none is silently favored or skipped", async () => {
    for (const jurisdiction of WORKFORCE_JURISDICTIONS) {
      const result = await checkEmployeeAgreementJurisdictionSchedule(jurisdiction);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.state).toBe("NO_APPROVED_JURISDICTION_SCHEDULE");
    }
  });
});

describe("checkEmployeeAgreementJurisdictionSchedule — module identity", () => {
  it("targets OS-LGL-007 specifically, not a generic Legal Suite-wide code", () => {
    expect(OS_LGL_007_MASTER_CANONICAL_CODE).toBe("OS-LGL-007");
  });
});
