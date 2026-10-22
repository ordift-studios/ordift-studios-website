import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  agreements: [] as Record<string, unknown>[],
  calls: [] as { table: string; or: string[]; in: [string, unknown[]][]; eq: [string, unknown][] }[],
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const call = { table, or: [] as string[], in: [] as [string, unknown[]][], eq: [] as [string, unknown][] };
      h.calls.push(call);
      const rows = () =>
        table === "legal_document_masters"
          ? [{ id: "master-1", canonical_code: "OS-LGL-010" }]
          : h.agreements.filter((r) =>
              call.eq.every(([c, v]) => r[c] === v) &&
              call.in.every(([c, vs]) => vs.includes(r[c])) &&
              // emulate PostgREST: "evidence_classification.is.null,evidence_classification.neq.controlled_test"
              call.or.every(() => r.evidence_classification == null || r.evidence_classification !== "controlled_test"),
            );
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (c: string, v: unknown) => { call.eq.push([c, v]); return b; },
        in: (c: string, vs: unknown[]) => { call.in.push([c, vs]); return b; },
        or: (expr: string) => { call.or.push(expr); return b; },
        limit: () => b,
        maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
      };
      return b;
    },
  }),
}));

import { hasFullyExecutedAgreement } from "./agreementEngine";

const ask = () => hasFullyExecutedAgreement({ canonicalCode: "OS-LGL-010", primaryContextType: "instructor_profile", primaryContextReference: "p-1" });
const base = { master_id: "master-1", primary_context_type: "instructor_profile", primary_context_reference: "p-1", status: "fully_executed" };

beforeEach(() => { h.calls = []; h.agreements = []; });

describe("hasFullyExecutedAgreement ignores controlled-test evidence", () => {
  it("a genuine executed agreement satisfies the requirement", async () => {
    h.agreements = [{ ...base, evidence_classification: "genuine" }];
    expect(await ask()).toBe(true);
  });
  it("an unclassified executed agreement (older records) still counts", async () => {
    h.agreements = [{ ...base, evidence_classification: null }];
    expect(await ask()).toBe(true);
  });
  it("a CONTROLLED TEST executed agreement never counts", async () => {
    h.agreements = [{ ...base, evidence_classification: "controlled_test" }];
    expect(await ask()).toBe(false);
  });
  it("a genuine agreement still counts when a test one exists beside it; draft/unsigned never count", async () => {
    h.agreements = [{ ...base, evidence_classification: "controlled_test" }, { ...base, evidence_classification: "genuine" }, { ...base, status: "draft", evidence_classification: "genuine" }];
    expect(await ask()).toBe(true);
    h.agreements = [{ ...base, status: "draft", evidence_classification: "genuine" }];
    expect(await ask()).toBe(false);
  });
  it("applies the exclusion in the query itself, and no master means no agreement", async () => {
    h.agreements = [{ ...base, evidence_classification: "genuine" }];
    await ask();
    expect(h.calls.find((c) => c.table === "agreements")?.or[0]).toContain("neq.controlled_test");
  });
});
