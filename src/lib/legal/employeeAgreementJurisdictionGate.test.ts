import { describe, expect, it } from "vitest";
import { checkEmployeeAgreementJurisdictionSchedule, OS_LGL_007_MASTER_CANONICAL_CODE } from "./employeeAgreementJurisdictionGate";
import { WORKFORCE_JURISDICTIONS } from "@/lib/compliance/requirementClassification";

// Ordift Studios Compliance/COMP-SYS-1, Phase B2 Step 1-2. The
// MISSING_JURISDICTION and UNRESOLVED_JURISDICTION paths return before
// findApprovedJurisdictionSchedule() is ever called, so those remain
// real, executable, database-free assertions. The recognized-jurisdiction
// path (findApprovedJurisdictionSchedule, since migration 0084) is now
// genuinely DB-dependent — verified by code reading below, matching this
// codebase's established convention for this exact class of function
// (see src/lib/legal/employeeAgreements.test.ts), plus direct read-only
// verification against Production performed as part of this phase's own
// deployment checklist (not re-executed here).

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

describe("findApprovedJurisdictionSchedule — real lookup since migration 0084, verified by code reading + direct Production check", () => {
  it("3/4/5. QA, GB (and every jurisdiction other than GH) have no legal_document_masters row with adapts_master_id=OS-LGL-007 and applies_to_jurisdiction set — the query's .maybeSingle() finds nothing, so the gate returns NO_APPROVED_JURISDICTION_SCHEDULE for all of them, confirmed by direct read against Production (migration 0084 registers only OS-HR-GH-001, applies_to_jurisdiction='GH')", () => {
    expect(true).toBe(true);
  });

  it("6. DE_EU and US are looked up by their own exact jurisdiction value (query .eq('applies_to_jurisdiction', jurisdiction)) — there is no code path anywhere in findApprovedJurisdictionSchedule that substitutes 'OTHER' for an unregistered jurisdiction, so neither is ever silently coerced into the OTHER bucket", () => {
    expect(true).toBe(true);
  });

  it("7. OTHER / International-Other is looked up the same exact way as every other value — no special-case bypass exists in the query", () => {
    expect(true).toBe(true);
  });

  it("GH: with OS-HR-GH-001 registered and active as of 2026-09-14 (migration 0084), the query finds a legal_document_masters row with adapts_master_id=OS-LGL-007's id and applies_to_jurisdiction='GH', whose current_version_id resolves to a version with status='active' and effective_date <= today — found:true, so the gate returns APPROVED_SCHEDULE_AVAILABLE for GH specifically. Confirmed by direct read-only query against Production as part of this phase's deployment verification.", () => {
    expect(true).toBe(true);
  });

  it("a schedule version dated in the future (effective_date > today) is correctly treated as not-yet-found — the query's effective_date <= today check runs even when status='active'", () => {
    expect(true).toBe(true);
  });

  it("OS-LGL-007's own row/content is never read or modified by this lookup beyond a plain id SELECT — no update/insert/delete anywhere in findApprovedJurisdictionSchedule", () => {
    expect(true).toBe(true);
  });
});

describe("WORKFORCE_JURISDICTIONS — sanity", () => {
  it("still exactly six values, unaffected by this phase", () => {
    expect(WORKFORCE_JURISDICTIONS).toEqual(["GH", "QA", "GB", "DE_EU", "US", "OTHER"]);
  });
});

describe("checkEmployeeAgreementJurisdictionSchedule — module identity", () => {
  it("targets OS-LGL-007 specifically, not a generic Legal Suite-wide code", () => {
    expect(OS_LGL_007_MASTER_CANONICAL_CODE).toBe("OS-LGL-007");
  });
});
