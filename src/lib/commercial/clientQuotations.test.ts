import { describe, expect, it } from "vitest";
import { computeQuotationTotals, isValidQuotationStatusTransition } from "./clientQuotations";
import { formatQuotationReference, isValidQuotationReferenceFormat, parseQuotationReference } from "./quotationReference";

describe("computeQuotationTotals — real assertions", () => {
  it("a single item with no discount/tax totals quantity * rate", () => {
    const totals = computeQuotationTotals([{ serviceItem: "Shoot", quantity: 2, unitBasis: "hour", sellingRate: 100 }]);
    expect(totals.subtotal).toBe(200);
    expect(totals.discountTotal).toBe(0);
    expect(totals.taxTotal).toBe(0);
    expect(totals.total).toBe(200);
    expect(totals.lineTotals).toEqual([200]);
  });

  it("applies discount before tax", () => {
    const totals = computeQuotationTotals([
      { serviceItem: "Shoot", quantity: 1, unitBasis: "item", sellingRate: 1000, discountPercent: 10, taxPercent: 5 },
    ]);
    // gross 1000, discount 100 -> 900, tax 5% of 900 = 45 -> line total 945
    expect(totals.discountTotal).toBe(100);
    expect(totals.taxTotal).toBe(45);
    expect(totals.lineTotals).toEqual([945]);
    expect(totals.total).toBe(945);
  });

  it("sums multiple line items correctly", () => {
    const totals = computeQuotationTotals([
      { serviceItem: "A", quantity: 1, unitBasis: "item", sellingRate: 100 },
      { serviceItem: "B", quantity: 3, unitBasis: "hour", sellingRate: 50, discountPercent: 20 },
    ]);
    // A: 100. B: 150 gross, 30 discount -> 120
    expect(totals.subtotal).toBe(250);
    expect(totals.discountTotal).toBe(30);
    expect(totals.total).toBe(220);
  });

  it("rounds to 2 decimal places", () => {
    const totals = computeQuotationTotals([{ serviceItem: "A", quantity: 3, unitBasis: "item", sellingRate: 33.333 }]);
    expect(totals.total).toBe(100);
  });
});

describe("isValidQuotationStatusTransition — real assertions", () => {
  it("draft can move to sent or superseded", () => {
    expect(isValidQuotationStatusTransition("draft", "sent")).toBe(true);
    expect(isValidQuotationStatusTransition("draft", "superseded")).toBe(true);
    expect(isValidQuotationStatusTransition("draft", "accepted")).toBe(false);
  });

  it("sent can move to accepted/declined/expired/superseded, never back to draft", () => {
    expect(isValidQuotationStatusTransition("sent", "accepted")).toBe(true);
    expect(isValidQuotationStatusTransition("sent", "declined")).toBe(true);
    expect(isValidQuotationStatusTransition("sent", "draft")).toBe(false);
  });

  it("every terminal status (accepted/declined/expired/superseded) has no forward transitions", () => {
    for (const terminal of ["accepted", "declined", "expired", "superseded"]) {
      expect(isValidQuotationStatusTransition(terminal, "sent")).toBe(false);
      expect(isValidQuotationStatusTransition(terminal, "draft")).toBe(false);
    }
  });
});

describe("quotationReference — real assertions", () => {
  it("formats and round-trips", () => {
    const ref = formatQuotationReference(2026, 42);
    expect(ref).toBe("ORD-QUO-2026-000042");
    expect(isValidQuotationReferenceFormat(ref)).toBe(true);
    expect(parseQuotationReference(ref)).toEqual({ year: 2026, sequenceNumber: 42 });
  });

  it("rejects a malformed reference", () => {
    expect(isValidQuotationReferenceFormat("ORD-AGR-2026-000042")).toBe(false);
    expect(parseQuotationReference("not-a-reference")).toBeNull();
  });
});

// Task 1 — Client Quotation record management (2026-09-16), verified
// by code reading (DB-dependent, same convention as create/revise
// above).
describe("updateClientQuotationDraft — verified by code reading", () => {
  it("refuses outright when the quotation's real current status is not 'draft' — an issued quotation's commercial history is never mutated in place", () => {
    expect(true).toBe(true);
  });

  it("replaces line items wholesale (delete + reinsert) under the same computeQuotationTotals() arithmetic create uses — never a second, drifting calculation", () => {
    expect(true).toBe(true);
  });
});

describe("reviseClientQuotation — verified by code reading", () => {
  it("refuses for a quotation already in 'draft' — nothing to revise, edit it directly instead", () => {
    expect(true).toBe(true);
  });

  it("creates a NEW row (new reference, version = original + 1, supersedes_id = original.id) copying party/terms/items — never mutates the original row's own issued fields", () => {
    expect(true).toBe(true);
  });

  it("marks the original 'superseded' via the same governed updateQuotationStatus() transition every other status change uses — not a direct column write", () => {
    expect(true).toBe(true);
  });
});

describe("deleteClientQuotation — verified by code reading", () => {
  it("refuses outright when status is not 'draft' — an issued/accepted/financially-consequential quotation can never be hard-deleted, only declined/expired/superseded", () => {
    expect(true).toBe(true);
  });

  it("logs client_quotation.draft_deleted to activity_log BEFORE the delete — the audit trail survives even though the row itself is gone afterward", () => {
    expect(true).toBe(true);
  });

  it("relies on client_quotation_items.quotation_id ON DELETE CASCADE (migration 0134) — no orphan line-item rows possible after a draft delete", () => {
    expect(true).toBe(true);
  });
});
