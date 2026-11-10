// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/lib/legal/fakeAdmin.testkit";

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb, superAdmin: true, log: vi.fn() }));
vi.mock("@/lib/supabase/admin", async () => { const { fakeAdmin } = await import("@/lib/legal/fakeAdmin.testkit"); return { createAdminClient: () => fakeAdmin(h.db) }; });
vi.mock("@/lib/organization/authority", () => ({ isSuperAdminId: async () => h.superAdmin }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: h.log }));
vi.mock("./financeOverlap", () => ({ documentFamily: async () => [], expenseOverlapForAcquisition: async () => null }));
import { recordAcquisitionBundle, recordAcquisitionPayment, setAcquisitionTerms, voidAcquisitionPayment } from "./equipmentFinancing";

const Q = "ent-qatar", G = "ent-ghana";
const acqRow = (id: string, entity: string, net = 2000) => ({ id, employing_entity_id: entity, net_amount: net, status: "recorded" });
const seed = (extra: Record<string, unknown[]> = {}) => {
  h.db = makeFakeDb({ entity_equipment_acquisitions: [acqRow("a-q", Q), acqRow("a-g", G, 500), acqRow("a-fin", Q, 1149)], entity_acquisition_payments: [], entity_financing_obligations: [{ id: "o1", acquisition_id: "a-fin", status: "active" }], ...extra });
  h.db.rpcHandlers = { record_acquisition_payment: () => ({ data: "pay-1", error: null }), set_acquisition_terms: () => ({ data: "t-1", error: null }), void_acquisition_payment: () => ({ data: null, error: null }) };
};
const pay = (over: Record<string, unknown> = {}) => ({ kind: "full", amount: 2000, paidOn: "2026-11-02", method: "cash", evidenceNote: "cash receipt seen and kept by the Founder", ...over });
beforeEach(() => { h.superAdmin = true; h.log.mockReset(); seed(); });

describe("recordAcquisitionPayment", () => {
  it("refuses everyone but a Super Admin before reading or writing anything", async () => {
    h.superAdmin = false; const calls = vi.fn(); h.db.rpcHandlers!.record_acquisition_payment = (a) => { calls(a); return { data: "x", error: null }; };
    expect(await recordAcquisitionPayment({ actorUserId: "u", entityId: Q, acquisitionId: "a-q", payment: pay() })).toMatchObject({ ok: false });
    expect(calls).not.toHaveBeenCalled(); expect(h.log).not.toHaveBeenCalled();
  });
  it("records an outright payment with ONE audited database call and logs it as not bank-verified", async () => {
    let args: Record<string, unknown> = {}; h.db.rpcHandlers!.record_acquisition_payment = (a) => { args = a; return { data: "pay-1", error: null }; };
    expect(await recordAcquisitionPayment({ actorUserId: "u", entityId: Q, acquisitionId: "a-q", payment: pay({ method: "company_debit_card", evidenceNote: null, evidenceDocumentId: "00000000-0000-4000-8000-000000000009" }) })).toEqual({ ok: true });
    expect(args).toMatchObject({ p_acquisition: "a-q", p_kind: "full", p_amount: 2000, p_method: "company_debit_card", p_evidence_doc: "00000000-0000-4000-8000-000000000009", p_actor: "u" });
    expect(h.log).toHaveBeenCalledWith(expect.objectContaining({ action: "equipment_payment.recorded", entityId: Q, metadata: expect.objectContaining({ bankVerified: false }) }));
  });
  it("keeps Qatar and Ghana apart: a purchase of one entity cannot be paid through the other", async () => {
    expect(await recordAcquisitionPayment({ actorUserId: "u", entityId: G, acquisitionId: "a-q", payment: pay() })).toEqual({ ok: false, error: "That purchase does not belong to this legal entity." });
    expect(await recordAcquisitionPayment({ actorUserId: "u", entityId: Q, acquisitionId: "a-g", payment: pay({ amount: 500 }) })).toMatchObject({ ok: false });
    expect(h.log).not.toHaveBeenCalled();
  });
  it("refuses a financed purchase (paid through its instalments) before the database is called", async () => {
    expect(await recordAcquisitionPayment({ actorUserId: "u", entityId: Q, acquisitionId: "a-fin", payment: pay({ amount: 1149 }) })).toMatchObject({ ok: false, error: expect.stringMatching(/instalments/) });
    expect(h.log).not.toHaveBeenCalled();
  });
  it("refuses a total above the net price using the recorded payments, ignoring voided ones", async () => {
    seed({ entity_acquisition_payments: [{ acquisition_id: "a-q", amount: 1500, status: "recorded" }, { acquisition_id: "a-q", amount: 400, status: "void" }] });
    expect(await recordAcquisitionPayment({ actorUserId: "u", entityId: Q, acquisitionId: "a-q", payment: pay({ kind: "part", amount: 501 }) })).toMatchObject({ ok: false, error: expect.stringMatching(/500\.00 remains/) });
    expect(await recordAcquisitionPayment({ actorUserId: "u", entityId: Q, acquisitionId: "a-q", payment: pay({ kind: "balance", amount: 500 }) })).toEqual({ ok: true });
  });
  it("turns the database's own refusals (a concurrent over-payment) into plain messages and logs nothing", async () => {
    h.db.rpcHandlers!.record_acquisition_payment = () => ({ data: null, error: { message: "payments would total 2600.00 but the net price is 2000.00 (already paid 600.00)" } });
    expect(await recordAcquisitionPayment({ actorUserId: "u", entityId: Q, acquisitionId: "a-q", payment: pay({ kind: "part", amount: 600 }) })).toEqual({ ok: false, error: "This payment would take the total above the net price." });
    expect(h.log).not.toHaveBeenCalled();
  });
});

describe("setAcquisitionTerms and voidAcquisitionPayment", () => {
  it("sets terms through the audited function for a non-financed purchase only", async () => {
    expect(await setAcquisitionTerms({ actorUserId: "u", entityId: Q, acquisitionId: "a-q", terms: { arrangement: "supplier_credit", balanceDueOn: "2026-12-31" } })).toEqual({ ok: true });
    expect(h.log).toHaveBeenCalledWith(expect.objectContaining({ action: "equipment_terms.set" }));
    expect(await setAcquisitionTerms({ actorUserId: "u", entityId: Q, acquisitionId: "a-fin", terms: { arrangement: "paid_in_full" } })).toMatchObject({ ok: false });
    expect(await setAcquisitionTerms({ actorUserId: "u", entityId: Q, acquisitionId: "a-q", terms: { arrangement: "supplier_credit" } })).toMatchObject({ ok: false });   // due date missing
    expect(await setAcquisitionTerms({ actorUserId: "u", entityId: G, acquisitionId: "a-q", terms: { arrangement: "unpaid" } })).toMatchObject({ ok: false });
  });
  it("a void needs a written reason and the payment must belong to the entity shown", async () => {
    seed({ entity_acquisition_payments: [{ id: "p-q", employing_entity_id: Q, acquisition_id: "a-q", amount: 10, status: "recorded" }] });
    expect(await voidAcquisitionPayment({ actorUserId: "u", entityId: Q, paymentId: "p-q", reason: "short" })).toMatchObject({ ok: false });
    expect(await voidAcquisitionPayment({ actorUserId: "u", entityId: G, paymentId: "p-q", reason: "entered against the wrong purchase" })).toMatchObject({ ok: false });
    expect(await voidAcquisitionPayment({ actorUserId: "u", entityId: Q, paymentId: "p-q", reason: "entered against the wrong purchase" })).toEqual({ ok: true });
    expect(h.log).toHaveBeenCalledWith(expect.objectContaining({ action: "equipment_payment.voided" }));
  });
  it("never writes outside the audited functions (no direct table writes)", async () => {
    await recordAcquisitionPayment({ actorUserId: "u", entityId: Q, acquisitionId: "a-q", payment: pay() });
    await setAcquisitionTerms({ actorUserId: "u", entityId: Q, acquisitionId: "a-q", terms: { arrangement: "unpaid" } });
    expect(h.db.writes).toEqual([]);   // the fake records direct inserts/updates only: there must be none
  });
});

describe("recordAcquisitionBundle (atomic purchase + terms + payment)", () => {
  const acquisition = { entityId: "00000000-0000-4000-8000-0000000000e1", supplier: "Synthetic Supplier", invoiceNumber: "INV-B1", purchaseDate: "2026-11-01", itemDescription: "Synthetic equipment", quantity: 1, currency: "QAR", listPrice: 2000, discount: 0, net: 2000, invoiceDocumentId: "00000000-0000-4000-8000-0000000000a1", fundingStatus: "to_confirm" };
  const terms = { arrangement: "paid_in_full" };
  beforeEach(() => { h.db.rpcHandlers!.record_acquisition_bundle = () => ({ data: [{ new_acquisition_id: "acq-1", new_terms_id: "t-1", new_payment_id: "p-1" }], error: null }); });
  it("sends ONE call carrying purchase, terms and payment, logs it as not bank-verified, and makes no direct table write", async () => {
    let args: Record<string, unknown> = {}; h.db.rpcHandlers!.record_acquisition_bundle = (a) => { args = a; return { data: [{ new_acquisition_id: "acq-1" }], error: null }; };
    expect(await recordAcquisitionBundle({ actorUserId: "u", acquisition, terms, payment: pay() })).toEqual({ ok: true, acquisitionId: "acq-1" });
    expect(args).toMatchObject({ p_actor: "u", p: { entityId: "00000000-0000-4000-8000-0000000000e1", terms: { arrangement: "paid_in_full" }, payment: { kind: "full", amount: 2000, method: "cash" } } });
    expect(h.log).toHaveBeenCalledWith(expect.objectContaining({ action: "equipment_acquisition.recorded", metadata: expect.objectContaining({ paymentRecorded: true, bankVerified: false, arrangement: "paid_in_full" }) }));
    expect(h.db.writes).toEqual([]);
  });
  it("validates everything before the database: over-payment, missing due date, payment on an unpaid arrangement", async () => {
    const spy = vi.fn(); h.db.rpcHandlers!.record_acquisition_bundle = (a) => { spy(a); return { data: null, error: null }; };
    expect(await recordAcquisitionBundle({ actorUserId: "u", acquisition, terms, payment: pay({ kind: "part", amount: 2000.01 }) })).toMatchObject({ ok: false });
    expect(await recordAcquisitionBundle({ actorUserId: "u", acquisition, terms: { arrangement: "supplier_credit" }, payment: null })).toMatchObject({ ok: false });
    expect(await recordAcquisitionBundle({ actorUserId: "u", acquisition, terms: { arrangement: "unpaid" }, payment: pay({ kind: "part", amount: 10 }) })).toMatchObject({ ok: false });
    expect(spy).not.toHaveBeenCalled();
  });
  it("refuses everyone but a Super Admin", async () => {
    h.superAdmin = false;
    expect(await recordAcquisitionBundle({ actorUserId: "u", acquisition, terms, payment: pay() })).toMatchObject({ ok: false });
    expect(h.log).not.toHaveBeenCalled();
  });
  it("a refusal inside the transaction means nothing exists: the user gets a plain message and nothing is logged; a retry after success is a plain 'already recorded'", async () => {
    h.db.rpcHandlers!.record_acquisition_bundle = () => ({ data: null, error: { message: "payments would total 2000.01 but the net price is 2000.00 (already paid 0)" } });
    expect(await recordAcquisitionBundle({ actorUserId: "u", acquisition, terms, payment: pay() })).toEqual({ ok: false, error: "This payment would take the total above the net price." });
    h.db.rpcHandlers!.record_acquisition_bundle = () => ({ data: null, error: { message: 'duplicate key value violates unique constraint "acquisitions_one_per_invoice"' } });
    expect(await recordAcquisitionBundle({ actorUserId: "u", acquisition, terms, payment: pay() })).toEqual({ ok: false, error: "This supplier invoice is already recorded as an acquisition." });
    expect(h.log).not.toHaveBeenCalled();
  });
});

