// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseStatementEvidenceForm, parseUnlinkEvidenceForm } from "./equipmentForms";
import { buildEquipmentViews, currentStatementCheck, type RawAcquisition, type RawInstalment, type RawObligation, type RawStatementEvent } from "./equipmentPanelView";
import type { StatementEvidenceInput } from "./statementEvidenceRules";

const E = "11111111-1111-4111-8111-111111111101", OTHER = "99999999-9999-4999-8999-999999999999", INS = "33333333-3333-4333-8333-333333333301", ACQ = "44444444-4444-4444-8444-444444444401", DOC = "22222222-2222-4222-8222-222222222204";
const h = vi.hoisted(() => ({ superAdmin: true, rpc: vi.fn(), log: vi.fn(), rows: {} as Record<string, unknown> }));
vi.mock("@/lib/organization/authority", () => ({ isSuperAdminId: async () => h.superAdmin }));
vi.mock("./financeOverlap", () => ({ documentFamily: async () => [], expenseOverlapForAcquisition: async () => null }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: h.log }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: h.rpc, from: (t: string) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.rows[t] ?? null, error: null }) }) }) }) }) }));
import { linkStatementEvidence, unlinkStatementEvidence } from "./equipmentFinancing";

const seed = () => { h.rows = {
  employing_entities: { name: "Synthetic Studios (Qatar)", legal_name: "SYNTHETIC STUDIOS" },
  entity_financing_instalments: { status: "paid", paid_on: "2026-11-08", paid_amount: 287.25, entity_financing_obligations: { employing_entity_id: E, currency: "QAR" } },
  entity_equipment_acquisitions: { employing_entity_id: E, status: "recorded", currency: "QAR" } }; };
const ev = (over: Partial<StatementEvidenceInput> = {}): StatementEvidenceInput => ({ kind: "instalment", targetId: INS, documentId: DOC, holderKind: "company", instrumentKind: "credit_card", accountHolderAsPrinted: "SYNTHETIC STUDIOS W.L.L.", cardholderAsPrinted: null,
  instrumentIdentityAsPrinted: "card ending 4242", periodFrom: "2026-11-01", periodTo: "2026-11-09", lineDate: "2026-11-08", lineAmount: 287.25, lineCurrency: "QAR", lineDescriptionAsPrinted: "SYNTHPAY ONLINE", page: null, paymentReference: null, basisNote: "Matched to the reported first instalment", confirmCompanyInstrument: true, ...over });
beforeEach(() => { h.superAdmin = true; h.rpc.mockReset(); h.log.mockReset(); seed(); h.rpc.mockResolvedValue({ data: null, error: null }); });

describe("linkStatementEvidence (library)", () => {
  it("refuses everyone but a Super Admin before reading or writing anything", async () => {
    h.superAdmin = false;
    expect(await linkStatementEvidence({ actorUserId: "u", entityId: E, evidence: ev() })).toMatchObject({ ok: false });
    expect(h.rpc).not.toHaveBeenCalled(); expect(h.log).not.toHaveBeenCalled();
  });
  it("links through ONE audited database call with the statement facts, and logs it", async () => {
    expect(await linkStatementEvidence({ actorUserId: "u", entityId: E, evidence: ev({ paymentReference: "SP-0001" }) })).toEqual({ ok: true });
    expect(h.rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = h.rpc.mock.calls[0];
    expect(fn).toBe("link_statement_evidence");
    expect(args).toMatchObject({ p_kind: "instalment", p_target: INS, p_document: DOC, p_actor: "u" });
    expect(args.p_evidence).toMatchObject({ holderKind: "company", accountHolderAsPrinted: "SYNTHETIC STUDIOS W.L.L.", lineAmount: 287.25, lineCurrency: "QAR", lineDate: "2026-11-08", paymentReference: "SP-0001" });
    expect(h.log).toHaveBeenCalledWith(expect.objectContaining({ action: "equipment_statement.linked", metadata: expect.objectContaining({ kind: "instalment", amount: 287.25 }) }));
  });
  it("refuses a personal instrument, a holder that does not match, a different amount or a far date BEFORE the database", async () => {
    for (const over of [{ holderKind: "personal" }, { accountHolderAsPrinted: "A Founder Personally" }, { lineAmount: 100 }, { instrumentIdentityAsPrinted: "4111 1111 1111 1111" }] as Partial<StatementEvidenceInput>[])
      expect(await linkStatementEvidence({ actorUserId: "u", entityId: E, evidence: ev(over) })).toMatchObject({ ok: false });
    expect(h.rpc).not.toHaveBeenCalled();
    (h.rows.entity_financing_instalments as { paid_on: string }).paid_on = "2026-10-01";                         // the reported payment date is more than 7 days from the statement line
    expect(await linkStatementEvidence({ actorUserId: "u", entityId: E, evidence: ev() })).toMatchObject({ ok: false, error: expect.stringMatching(/more than 7 days/) });
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("refuses an instalment of another legal entity and an instalment that is not reported paid", async () => {
    (h.rows.entity_financing_instalments as { entity_financing_obligations: { employing_entity_id: string } }).entity_financing_obligations.employing_entity_id = OTHER;
    expect(await linkStatementEvidence({ actorUserId: "u", entityId: E, evidence: ev() })).toEqual({ ok: false, error: "That instalment does not belong to this legal entity." });
    seed(); (h.rows.entity_financing_instalments as { status: string }).status = "pending";
    expect(await linkStatementEvidence({ actorUserId: "u", entityId: E, evidence: ev() })).toMatchObject({ ok: false, error: expect.stringMatching(/reported paid/) });
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("links the funding source of a recorded purchase of THIS entity only", async () => {
    expect(await linkStatementEvidence({ actorUserId: "u", entityId: E, evidence: ev({ kind: "funding", targetId: ACQ }) })).toEqual({ ok: true });
    expect(h.rpc.mock.calls[0][1]).toMatchObject({ p_kind: "funding", p_target: ACQ });
    h.rpc.mockClear(); (h.rows.entity_equipment_acquisitions as { employing_entity_id: string }).employing_entity_id = OTHER;
    expect(await linkStatementEvidence({ actorUserId: "u", entityId: E, evidence: ev({ kind: "funding", targetId: ACQ }) })).toMatchObject({ ok: false });
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("turns the database's refusals into plain messages and logs nothing; an unknown failure stays generic", async () => {
    for (const [m, re] of [["a statement is already linked to this instalment: unlink it first, with a reason", /already linked/i], ["the account holder on the statement does not match this legal entity: an instrument in another name", /does not match this legal entity/i], ["boom internal detail", /could not be linked/]] as const) {
      h.rpc.mockResolvedValueOnce({ data: null, error: { message: m } });
      const r = await linkStatementEvidence({ actorUserId: "u", entityId: E, evidence: ev() });
      expect(r.ok).toBe(false); if (!r.ok) { expect(r.error).toMatch(re); expect(r.error).not.toMatch(/boom/); }
    }
    expect(h.log).not.toHaveBeenCalled();
  });
});

describe("unlinkStatementEvidence (library)", () => {
  it("needs a Super Admin, a written reason and a target of the entity shown", async () => {
    h.superAdmin = false; expect(await unlinkStatementEvidence({ actorUserId: "u", entityId: E, kind: "instalment", targetId: INS, reason: "Linked the wrong statement line" })).toMatchObject({ ok: false });
    h.superAdmin = true; expect(await unlinkStatementEvidence({ actorUserId: "u", entityId: E, kind: "instalment", targetId: INS, reason: "short" })).toMatchObject({ ok: false });
    (h.rows.entity_financing_instalments as { entity_financing_obligations: { employing_entity_id: string } }).entity_financing_obligations.employing_entity_id = OTHER;
    expect(await unlinkStatementEvidence({ actorUserId: "u", entityId: E, kind: "instalment", targetId: INS, reason: "Linked the wrong statement line" })).toMatchObject({ ok: false });
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("unlinks through the audited function with the trimmed reason and logs it", async () => {
    expect(await unlinkStatementEvidence({ actorUserId: "u", entityId: E, kind: "instalment", targetId: INS, reason: "  Linked the wrong statement line  " })).toEqual({ ok: true });
    expect(h.rpc).toHaveBeenCalledWith("unlink_statement_evidence", { p_kind: "instalment", p_target: INS, p_reason: "Linked the wrong statement line", p_actor: "u" });
    expect(h.log).toHaveBeenCalledWith(expect.objectContaining({ action: "equipment_statement.unlinked" }));
  });
});

describe("statement forms", () => {
  const form = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });
  const good = { entityId: E, kind: "instalment", targetId: INS, statementDocumentId: DOC, holderKind: "company", instrumentKind: "credit_card", accountHolderAsPrinted: "SYNTHETIC STUDIOS W.L.L.", instrumentIdentityAsPrinted: "card ending 4242", periodFrom: "2026-11-01", periodTo: "2026-11-30",
    lineDate: "2026-11-08", lineAmount: "287.25", lineCurrency: "QAR", lineDescriptionAsPrinted: "SYNTHPAY ONLINE", basisNote: "Matched to the reported first instalment", confirmCompanyInstrument: "yes" };
  it("parses a complete statement form and refuses incomplete ones", () => {
    expect(parseStatementEvidenceForm(form(good))).toMatchObject({ ok: true, entityId: E, evidence: { kind: "instalment", lineAmount: 287.25, confirmCompanyInstrument: true, paymentReference: null } });
    expect(parseStatementEvidenceForm(form({ ...good, entityId: "" }))).toMatchObject({ ok: false });
    expect(parseStatementEvidenceForm(form({ ...good, kind: "payment" }))).toMatchObject({ ok: false });
    expect(parseStatementEvidenceForm(form({ ...good, lineAmount: "abc" }))).toMatchObject({ ok: false });
    expect(parseStatementEvidenceForm(form({ ...good, confirmCompanyInstrument: "" }))).toMatchObject({ ok: true, evidence: { confirmCompanyInstrument: false } });   // the rules (not the parser) refuse an unticked box
  });
  it("the unlink form needs a reason and the confirmation tick", () => {
    const u = { entityId: E, kind: "funding", targetId: ACQ, reason: "Funding statement linked in error", confirmUnlink: "yes" };
    expect(parseUnlinkEvidenceForm(form(u))).toEqual({ ok: true, entityId: E, kind: "funding", targetId: ACQ, reason: "Funding statement linked in error" });
    expect(parseUnlinkEvidenceForm(form({ ...u, reason: "short" }))).toMatchObject({ ok: false });
    expect(parseUnlinkEvidenceForm(form({ ...u, confirmUnlink: "" }))).toMatchObject({ ok: false });
    expect(parseUnlinkEvidenceForm(form({ ...u, kind: "x" }))).toMatchObject({ ok: false });
  });
});

describe("view model: Founder-reported vs statement-verified", () => {
  const detail = (over: Record<string, unknown> = {}) => ({ kind: "instalment", statementDocumentId: DOC, instrumentKind: "credit_card", accountHolderAsPrinted: "SYNTHETIC STUDIOS W.L.L.", instrumentIdentityAsPrinted: "card ending 4242", periodFrom: "2026-11-01", periodTo: "2026-11-30", lineDate: "2026-11-08", lineAmount: 287.25, currency: "QAR",
    lineDescriptionAsPrinted: "SYNTHPAY ONLINE", paymentReference: null, referenceMatchesFinancing: null, dateDifferenceDays: 0, basisNote: "Matched", ...over });
  const evt = (type: RawStatementEvent["event_type"], at: string, instalment: string | null = INS): RawStatementEvent => ({ acquisition_id: ACQ, instalment_id: instalment, event_type: type, occurred_at: at, detail: type === "bank_evidence_linked" ? detail() : { reason: "wrong line" } });
  it("the latest event decides: a link shows the check, an unlink after it clears it, a re-link shows the new one", () => {
    const only = (e: RawStatementEvent) => e.instalment_id === INS;
    expect(currentStatementCheck([], only)).toBeNull();
    expect(currentStatementCheck([evt("bank_evidence_linked", "2026-11-12T10:00:00Z")], only)).toMatchObject({ holder: "SYNTHETIC STUDIOS W.L.L.", amount: 287.25, lineDate: "2026-11-08" });
    expect(currentStatementCheck([evt("bank_evidence_linked", "2026-11-12T10:00:00Z"), evt("bank_evidence_unlinked", "2026-11-12T11:00:00Z")], only)).toBeNull();
    expect(currentStatementCheck([evt("bank_evidence_linked", "2026-11-12T10:00:00Z"), evt("bank_evidence_unlinked", "2026-11-12T11:00:00Z"), evt("bank_evidence_linked", "2026-11-12T12:00:00Z")], only)).not.toBeNull();
  });
  const acq: RawAcquisition = { id: ACQ, supplier_name: "FNAC", supplier_branch: null, invoice_number: "235829", purchase_date: "2026-11-08", item_description: "Wacom One", quantity: 1, currency: "QAR", list_price_total: 1499, discount_total: 350, net_amount: 1149, customer_as_shown: "Founder",
    invoice_document_id: "d1", funding_source_status: "company_account", funding_source_note: "statement", accounting_classification: "pending_professional_review", bank_evidence_document_id: null, created_at: "2026-11-08T10:00:00Z", status: "recorded", void_reason: null };
  const ob: RawObligation = { id: "o1", acquisition_id: ACQ, provider: "PayLater", provider_reference: "SQ1", instalment_count: 4, financed_amount: 1149, plan_started_on: "2026-11-08", confirmation_document_id: "d2", schedule_basis: "founder_expected_months", status: "active" };
  const ins = (linked: boolean): RawInstalment[] => [1, 2, 3, 4].map((n) => ({ id: n === 1 ? INS : `i${n}`, obligation_id: "o1", sequence: n, amount: 287.25, expected_month: ["2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01"][n - 1], status: n === 1 ? "paid" as const : "pending" as const, paid_on: n === 1 ? "2026-11-08" : null,
    evidence_document_id: n === 1 ? "d2" : null, bank_evidence_document_id: n === 1 && linked ? DOC : null, evidence_note: n === 1 ? "PayLater PDF shows the down payment" : null }));
  const docs = [{ id: "d1", filename: "r.jpg", sha256: "a", documentType: "purchase_receipt" }, { id: "d2", filename: "p.pdf", sha256: "b", documentType: "other_financial_document" }];
  it("an instalment is 'reported paid' with no statement, and 'verified by statement' only when a statement is linked; the funding follows its own link", () => {
    const base = { entityLegalName: "Synthetic Studios", docs, obligations: [ob], today: "2026-11-12" };
    const [reported] = buildEquipmentViews({ ...base, acquisitions: [acq], instalments: ins(false) });
    expect(reported.financing?.instalments[0]).toMatchObject({ state: "paid_awaiting_statement", statement: null }); expect(reported.fundingStatement).toBeNull(); expect(reported.position.paidVerifiedByStatement).toBe(0);
    const [verified] = buildEquipmentViews({ ...base, acquisitions: [{ ...acq, bank_evidence_document_id: DOC }], instalments: ins(true), statementEvents: [evt("bank_evidence_linked", "2026-11-12T10:00:00Z"), evt("bank_evidence_linked", "2026-11-12T10:05:00Z", null)] });
    expect(verified.financing?.instalments[0]).toMatchObject({ state: "paid_verified_by_statement", statement: { amount: 287.25 } }); expect(verified.fundingStatement).toMatchObject({ holder: "SYNTHETIC STUDIOS W.L.L." });
    expect(verified.position.paidVerifiedByStatement).toBe(287.25); expect(verified.position.expenseRecognised).toBe(0);
  });
});
