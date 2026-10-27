import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/lib/legal/fakeAdmin.testkit";

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb, logged: [] as { action: string; metadata: Record<string, unknown> }[] }));
vi.mock("@/lib/supabase/admin", async () => {
  const { fakeAdmin: make } = await import("@/lib/legal/fakeAdmin.testkit");
  return { createAdminClient: () => make(h.db) };
});
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: async (e: { action: string; metadata: Record<string, unknown> }) => { h.logged.push(e); } }));
vi.mock("@/lib/organization/authority", () => ({ isSuperAdminId: async (id: string) => id === "super", hasAuthority: async () => true }));

import { recordEntityReceipt } from "./entityRegistrations";

const Q = "ent-qatar", G = "ent-ghana";
// The QAR 1,200 receipt recorded on 15 Oct (three payable lines) — must never be touched or duplicated.
const old = (code: string, amount: number) => ({ id: `old-${code}`, employing_entity_id: Q, expense_date: "2026-10-15", amount, currency: "QAR", category: "incorporation_registration", line_code: code, description: code, receipt_number: "OLD-1200", receipt_total: 1200, issuing_authority: "Single Window", request_reference: "SR-OLD", source_document_id: "d-old", payer_as_shown: "Applicant", funding_source_status: "founder_personal", funding_source_note: "Founder statement", accounting_treatment: "to_be_confirmed", status: "recorded", reimbursement_intent: "to_be_confirmed" });
const docs = [
  { id: "d-old", employing_entity_id: Q, document_type: "government_receipt" }, { id: "d-new", employing_entity_id: Q, document_type: "government_receipt" },
  { id: "d-cr", employing_entity_id: Q, document_type: "commercial_registration" }, { id: "d-ghana", employing_entity_id: G, document_type: "government_receipt" },
];
const permitReceipt = (over: object = {}) => ({
  entityId: Q, receiptNumber: "7929943008946018004112", receiptDate: "2026-10-26", issuingAuthority: "Single Window (Ministry of Commerce and Industry service)", requestReference: "SR3032128",
  currency: "QAR", printedTotal: 500, category: "government_fee", payerAsShown: "Applicant: the Founder (card payment)", sourceDocumentId: "d-new", actorUserId: "super", today: "2026-10-27",
  lines: [{ code: "PERMIT_ISSUANCE", description: "Ordift Studios Commercial Permit issuance fee", amount: 500 }, { code: "ESTABLISHMENT_CARD_PRINT", description: "Establishment card printing", amount: 0 }],
  fundingSourceStatus: "founder_personal", fundingSourceNote: "Founder's own written statement, 27 Oct 2026: paid from personal funds", reimbursementIntent: "not_reimbursable", paymentMethod: "card",
  relatedReference: "Commercial License 345520", notes: "Non-reimbursable Founder contribution toward company establishment.", ...over,
});
const expenses = () => h.db.tables.entity_expenses;

beforeEach(() => {
  h.logged = [];
  h.db = makeFakeDb({ employing_entity_documents: docs, entity_expenses: [old("A", 200), old("B", 500), old("C", 500)], activity_log: [] });
});

describe("recordEntityReceipt: the QAR 500 Founder-funded permit fee", () => {
  it("records ONE payable line (the zero line is not an expense) with funding, reimbursement intention, method and reference kept as separate fields; accounting stays to-be-confirmed", async () => {
    const r = await recordEntityReceipt(permitReceipt());
    expect(r).toMatchObject({ ok: true, recorded: 1, total: 500 });
    const row = expenses().find((e) => e.receipt_number === "7929943008946018004112")!;
    expect(row).toMatchObject({
      employing_entity_id: Q, expense_date: "2026-10-26", amount: 500, currency: "QAR", category: "government_fee", line_code: "PERMIT_ISSUANCE", request_reference: "SR3032128", source_document_id: "d-new", receipt_total: 500,
      funding_source_status: "founder_personal", funding_confirmed_by: "super", reimbursement_intent: "not_reimbursable", payment_method: "card", related_reference: "Commercial License 345520", recorded_by: "super",
    });
    expect(row.funding_source_note).toMatch(/personal funds/);
    expect(typeof row.funding_confirmed_at).toBe("string");
    expect(row.accounting_treatment ?? "to_be_confirmed").toBe("to_be_confirmed"); // never set by the form
    expect(expenses().filter((e) => e.line_code === "ESTABLISHMENT_CARD_PRINT")).toHaveLength(0);
  });
  it("leaves the earlier QAR 1,200 receipt and its three lines byte-for-byte untouched, and writes ONLY to entity_expenses (no payable, payment, loan, capital or journal table)", async () => {
    const before = JSON.stringify(expenses().filter((e) => e.receipt_number === "OLD-1200"));
    await recordEntityReceipt(permitReceipt());
    expect(JSON.stringify(expenses().filter((e) => e.receipt_number === "OLD-1200"))).toBe(before);
    expect(expenses()).toHaveLength(4);
    expect(h.db.writes.map((w) => w.table).filter((t) => t !== "entity_expenses")).toEqual([]);
  });
  it("writes one audit event naming the receipt, the funding and the intention (no secrets, no amounts beyond the receipt)", async () => {
    await recordEntityReceipt(permitReceipt());
    expect(h.logged).toEqual([{ actorUserId: "super", action: "entity_expense.receipt_recorded", entityType: "employing_entity", entityId: Q,
      metadata: { receiptNumber: "7929943008946018004112", lines: 1, total: 500, currency: "QAR", category: "government_fee", fundingSourceStatus: "founder_personal", reimbursementIntent: "not_reimbursable", sourceDocumentId: "d-new" } }]);
  });
  it("defaults to funding 'to confirm' and reimbursement 'not decided' when the form states neither", async () => {
    const { fundingSourceStatus, fundingSourceNote, reimbursementIntent, ...rest } = permitReceipt();
    void fundingSourceStatus; void fundingSourceNote; void reimbursementIntent;
    expect(await recordEntityReceipt(rest)).toMatchObject({ ok: true });
    expect(expenses().find((e) => e.receipt_number === "7929943008946018004112")).toMatchObject({ funding_source_status: "to_confirm", funding_source_note: null, funding_confirmed_by: null, funding_confirmed_at: null, reimbursement_intent: "to_be_confirmed" });
  });
});

describe("recordEntityReceipt: duplicates and existing records are refused with nothing written", () => {
  const refused = async (over: object, msg: RegExp) => {
    const before = JSON.stringify(h.db.tables.entity_expenses);
    const r = await recordEntityReceipt(permitReceipt(over));
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(msg);
    expect(JSON.stringify(h.db.tables.entity_expenses)).toBe(before);
    expect(h.logged).toEqual([]);
  };
  it("the earlier receipt number, however it is split", async () => {
    await refused({ receiptNumber: "OLD-1200", sourceDocumentId: "d-new", requestReference: "SR-NEW", printedTotal: 1200, lines: [{ code: "ALL", description: "All", amount: 1200 }] }, /already recorded/);
  });
  it("the earlier receipt's stored document, under a different number", async () => { await refused({ sourceDocumentId: "d-old" }, /already backs a recorded receipt/); });
  it("the earlier request reference", async () => { await refused({ requestReference: "SR-OLD" }, /Request SR-OLD already has a recorded receipt/); });
  it("recording the permit receipt a second time", async () => {
    expect((await recordEntityReceipt(permitReceipt())).ok).toBe(true);
    const n = expenses().length;
    const again = await recordEntityReceipt(permitReceipt());
    expect(again.ok).toBe(false);
    expect(expenses()).toHaveLength(n);
  });
});

describe("recordEntityReceipt: validation cannot be bypassed", () => {
  const refused = async (over: object, msg: RegExp) => {
    const r = await recordEntityReceipt(permitReceipt(over));
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(msg);
    expect(expenses()).toHaveLength(3);
  };
  it("non-Super-Admin", () => refused({ actorUserId: "staff" }, /Super Admin/));
  it("a document that is not a receipt, or belongs to another entity", async () => { await refused({ sourceDocumentId: "d-cr" }, /not classed as a payment receipt/); await refused({ sourceDocumentId: "d-ghana" }, /Upload the receipt to this entity's vault/); });
  it("lines that do not add up to the printed total", () => refused({ printedTotal: 600 }, /add up to 500\.00 but the receipt total is 600\.00/));
  it("a future date, a bad date, a bad currency, a zero total, an unknown category, an unknown payment method", async () => {
    await refused({ receiptDate: "2026-10-28" }, /cannot be in the future/); await refused({ receiptDate: "26/10/2026" }, /YYYY-MM-DD/); await refused({ currency: "QR" }, /three-letter/);
    await refused({ printedTotal: 0 }, /greater than zero/); await refused({ category: "bonus" }, /expense category/); await refused({ paymentMethod: "crypto" }, /payment method/);
  });
  it("funding stated without a basis, or a reimbursement intention that contradicts who paid", async () => {
    await refused({ fundingSourceNote: "" }, /how the funding source is known/);
    await refused({ fundingSourceStatus: "company_account", fundingSourceNote: "bank line", reimbursementIntent: "not_reimbursable" }, /nothing to reimburse/);
  });
  it("a receipt with no payable line", () => refused({ printedTotal: 1, lines: [{ code: "Z", description: "zero", amount: 0 }] }, /add up|no payable/));
});
