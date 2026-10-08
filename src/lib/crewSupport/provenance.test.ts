import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { describeAmountDueProvenance } from "@/lib/admin/enquiries";

const quotation = readFileSync("src/lib/crewSupport/quotation.ts", "utf8");
const complete = quotation.slice(quotation.indexOf("export async function completeAcceptance"), quotation.indexOf("// ---------------------------------------------------------- client portal"));
const migration = readFileSync("supabase/migrations/0144_enquiry_amount_due_provenance.sql", "utf8");

describe("receivable provenance: amount due is traceable to its accepted quotation", () => {
  it("acceptance writes the amount WITH source and the quotation id, in one conditional update", () => {
    expect(complete).toContain('amount_due_source: "accepted_quotation"');
    expect(complete).toContain("amount_due_quotation_id: quote.id");
  });
  it("is idempotent and never overwrites a different quotation's receivable", () => {
    expect(complete).toContain("amount_due_quotation_id.is.null,amount_due_quotation_id.eq.${quote.id}");
    expect(complete).toContain("already established by a different accepted quotation");
  });
  it("a hand-typed amount is recorded as manual and detaches any quotation link", () => {
    const actions = readFileSync("src/app/admin/enquiries/actions.ts", "utf8");
    expect(actions).toContain('amount_due_source: "manual"');
    expect(actions).toContain("amount_due_quotation_id: null");
  });
  it("the migration is additive: nullable columns, restricted FK, NO backfill, NO destructive statement", () => {
    const sql = migration.replace(/--.*$/gm, "");
    expect(sql).toMatch(/add column amount_due_source text,/);
    expect(sql).toMatch(/amount_due_quotation_id uuid references public\.client_quotations \(id\) on delete restrict/);
    expect(sql).not.toMatch(/\b(drop|truncate|delete\s+from|update\s+public|insert\s+into)\b/i);
    expect(sql).toMatch(/amount_due_quotation_id is null or amount_due_source = 'accepted_quotation'/);
  });
  it("legacy rows read as 'not recorded' rather than a guessed source", () => {
    expect(describeAmountDueProvenance({ kind: "legacy" })).toMatch(/Not recorded/);
    expect(describeAmountDueProvenance({ kind: "accepted_quotation", quotationId: "q", quotationReference: "ORD-QUO-2026-000003" })).toBe("Accepted quotation ORD-QUO-2026-000003");
    expect(describeAmountDueProvenance({ kind: "manual" })).toMatch(/manually/);
  });
  it("the accepted quotation is immutable: generic revise/update/delete tools refuse crew-managed quotes, so the receivable can't drift from its source", () => {
    const generic = readFileSync("src/lib/commercial/clientQuotations.ts", "utf8");
    expect(generic).toContain("crewManagedRefusal");
  });
  it("acceptance never creates a payment record", () => {
    expect(complete).not.toMatch(/from\("payments"\)|payment_type|reference_amount_usd/);
    // The only payment interaction is the existing module recomputing status after a variation.
    expect(complete.match(/syncEntityPaymentStatus/g)?.length ?? 0).toBeLessThanOrEqual(2); // dynamic import + one call
  });
});

describe("0145 migration is additive and reuses existing records", () => {
  const sql = readFileSync("supabase/migrations/0145_crew_support_commitments.sql", "utf8").replace(/--.*$/gm, "");
  it("no destructive statement, no new table, no backfill", () => {
    expect(sql).not.toMatch(/\b(drop|truncate|delete\s+from|insert\s+into|create\s+table)\b/i);
    expect(sql).not.toMatch(/\bupdate\s+public\./i);
  });
  it("compensation and money are NOT added to the slot", () => {
    expect(sql).not.toMatch(/add column (compensation|agreed_amount|amount)/i);
  });
});
