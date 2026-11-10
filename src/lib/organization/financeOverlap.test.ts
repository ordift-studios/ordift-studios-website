import { describe, expect, it } from "vitest";
import { acquisitionRepeatsExpense, expenseRepeatsAcquisition, type AcquisitionRef } from "./financeOverlap";

// SYNTHETIC values only (public repository).
const acq: AcquisitionRef = { invoiceNumber: "INV-1001", supplier: "Synthetic Supplier", invoiceDocumentId: "d-inv", statementDocumentId: null, financingDocumentIds: ["d-conf", "d-ev"] };
describe("expense vs acquisition", () => {
  it("refuses the same invoice number and supplier, ignoring case and spaces", () => {
    expect(expenseRepeatsAcquisition({ number: " inv-1001 ", party: "SYNTHETIC SUPPLIER", documentFamily: [] }, [acq])).toMatch(/already recorded as an equipment acquisition/);
  });
  it("refuses any document that backs the acquisition or its financing (including copies in the family)", () => {
    for (const d of ["d-inv", "d-conf", "d-ev"]) expect(expenseRepeatsAcquisition({ number: "X", party: "Y", documentFamily: ["other", d] }, [acq])).toMatch(/stored document/);
  });
  it("leaves an unrelated expense alone (same supplier other number, same number other supplier, no documents)", () => {
    expect(expenseRepeatsAcquisition({ number: "999", party: "Synthetic Supplier", documentFamily: ["z"] }, [acq])).toBeNull();
    expect(expenseRepeatsAcquisition({ number: "INV-1001", party: "Another Supplier", documentFamily: [] }, [acq])).toBeNull();
    expect(expenseRepeatsAcquisition({ number: "1", party: "2", documentFamily: [] }, [])).toBeNull();
  });
});
describe("acquisition vs expense", () => {
  const exp = [{ receiptNumber: "INV-2002", issuingAuthority: "Synthetic Supplier", sourceDocumentId: "d-exp" }];
  it("refuses a repeated invoice or a document already backing an expense", () => {
    expect(acquisitionRepeatsExpense({ number: "inv-2002", party: "synthetic supplier", documentFamily: [] }, exp)).toMatch(/already recorded as an expense/);
    expect(acquisitionRepeatsExpense({ number: "A", party: "B", documentFamily: ["d-exp"] }, exp)).toMatch(/stored document/);
  });
  it("accepts an unrelated acquisition", () => { expect(acquisitionRepeatsExpense({ number: "INV-1", party: "Synthetic Supplier", documentFamily: ["d-inv"] }, exp)).toBeNull(); });
});
