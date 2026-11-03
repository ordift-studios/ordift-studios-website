import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Synthetic data only. Mocks stand in for the signed-in user, the database and the audit log: nothing real is read or written.
const FP = "a".repeat(64); const OTHER = "b".repeat(64);
const state: { user: unknown; quotation: Record<string, unknown> | null; doc: { ok: boolean; doc?: { fingerprint: string } } } = { user: null, quotation: null, doc: { ok: true, doc: { fingerprint: FP } } };
const logged: { action: string; metadata: Record<string, unknown> }[] = [];

vi.mock("@/lib/portal/roles", () => ({ getCurrentUser: async () => state.user, hasRole: (u: { roles?: string[] }, r: string) => Boolean(u?.roles?.includes(r)), isSuperAdmin: () => false }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: async (e: { action: string; metadata: Record<string, unknown> }) => { logged.push(e); } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.quotation }) }) }) }) }) }));
vi.mock("./quotationDocumentData", () => ({ loadIssuedQuotationDocument: async () => state.doc, recordIssueFingerprint: async () => undefined }));
vi.mock("./quotationEntity", () => ({ ENTITY_REQUIRED_TO_ISSUE: "x", resolveQuotationEntity: async () => ({ ok: false, message: "x" }) }));

import { recordQuotationDelivery } from "./quotationIssuance";

const base = { quotationId: "q1", channel: "whatsapp_message", deliveredAt: new Date(Date.now() - 60_000).toISOString() };
beforeEach(() => { logged.length = 0; state.user = { id: "u1", roles: ["admin"] }; state.quotation = { id: "q1", status: "sent", issued_at: new Date(Date.now() - 3600_000).toISOString(), quotation_reference: "ORD-QUO-2026-009999", crew_support_request_id: null }; state.doc = { ok: true, doc: { fingerprint: FP } }; });

describe("recording a manual delivery (the system sends nothing)", () => {
  it("records channel, time, recipient and evidence, and the fingerprint of the PDF that was sent, marking that it matches the quotation today", async () => {
    const r = await recordQuotationDelivery({ ...base, recipient: " client@example.test ", evidence: "WhatsApp message, screenshot saved", pdfFingerprint: FP });
    expect(r).toEqual({ ok: true });
    expect(logged).toHaveLength(1);
    expect(logged[0].action).toBe("client_quotation.delivery_recorded");
    expect(logged[0].metadata).toMatchObject({ channel: "whatsapp_message", recipient: "client@example.test", evidence: "WhatsApp message, screenshot saved", pdfFingerprint: FP, pdfMatchesCurrentContent: true, currentContentFingerprint: FP, recordedBy: "u1" });
    expect(String(logged[0].metadata.note_system)).toMatch(/did not send anything/);
  });
  it("still records a delivery of a PDF that no longer matches the quotation, truthfully, and warns the person", async () => {
    const r = await recordQuotationDelivery({ ...base, pdfFingerprint: OTHER });
    expect(r.ok && r.warning).toMatch(/different from the PDF you say you sent/);
    expect(logged[0].metadata).toMatchObject({ pdfFingerprint: OTHER, pdfMatchesCurrentContent: false, currentContentFingerprint: FP });
  });
  it("claims nothing about which document was sent when no fingerprint is supplied", async () => {
    const r = await recordQuotationDelivery({ ...base, evidence: "Told the client by telephone" });
    expect(r).toEqual({ ok: true });
    expect(logged[0].metadata).not.toHaveProperty("pdfFingerprint");
    expect(logged[0].metadata.evidence).toBe("Told the client by telephone");
  });
  it("refuses a malformed fingerprint, a draft, a Crew Support quotation, a future time, an unknown channel and a non-admin; nothing is logged", async () => {
    expect((await recordQuotationDelivery({ ...base, pdfFingerprint: "not-a-hash" })).ok).toBe(false);
    state.quotation = { ...state.quotation, status: "draft" };
    expect((await recordQuotationDelivery({ ...base })).ok).toBe(false);
    state.quotation = { ...state.quotation, status: "sent", crew_support_request_id: "c1" };
    expect((await recordQuotationDelivery({ ...base })).ok).toBe(false);
    state.quotation = { ...state.quotation, crew_support_request_id: null };
    expect((await recordQuotationDelivery({ ...base, deliveredAt: new Date(Date.now() + 3600_000).toISOString() })).ok).toBe(false);
    expect((await recordQuotationDelivery({ ...base, channel: "carrier_pigeon" })).ok).toBe(false);
    state.user = { id: "u2", roles: ["client"] };
    expect((await recordQuotationDelivery({ ...base })).ok).toBe(false);
    expect(logged).toHaveLength(0);
  });
  it("trims and bounds free text so an audit record cannot be flooded", async () => {
    await recordQuotationDelivery({ ...base, evidence: "x".repeat(2000), recipient: "y".repeat(2000), note: "z".repeat(2000) });
    expect((logged[0].metadata.evidence as string).length).toBe(500);
    expect((logged[0].metadata.recipient as string).length).toBe(200);
    expect((logged[0].metadata.note as string).length).toBe(300);
  });
});

// Source guards: this feature must never send anything or change the quotation, and issuance must record the baseline fingerprint.
const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");
const SENDERS = /sendEmail|sendMail|\bresend\b|nodemailer|postmark|sendgrid|twilio|wa\.me|api\.whatsapp|notifications\/|enquiry\/email|lifecycleEmails/i;   // (the word "WhatsApp" alone is just a contact icon)

describe("nothing in the document, delivery or PDF route code can send a message", () => {
  it.each([
    ["./quotationDocument.ts"], ["./quotationDocumentData.ts"], ["./quotationIssuance.ts"], ["./quotationEntityAdvice.ts"], ["./quotationLicenceWarnings.ts"],
    ["../pdf/quotation/QuotationDocument.tsx"], ["../pdf/quotation/render.ts"], ["../../app/admin/pricing/quotations/[id]/document/route.ts"],
  ])("%s imports no mail, message or notification code", (f) => { expect(code(read(f))).not.toMatch(SENDERS); });
});

describe("the issued-quotation PDF route and the issue-time fingerprint", () => {
  const route = code(read("../../app/admin/pricing/quotations/[id]/document/route.ts"));
  it("is admin-only, validates the id, returns 404 for others, never caches, and refuses a changed quotation", () => {
    expect(route).toMatch(/hasRole\(user, "admin"\) && !isSuperAdmin\(user\)\)\) return plain\("Not found", 404\)/);
    expect(route).toMatch(/UUID\.test\(id\)/);
    expect(route).toMatch(/private, no-store/);
    expect(route).toMatch(/doc\.drift\.state === "changed"\) return plain\(DRIFT_MESSAGE, 409\)/);
  });
  it("only builds for issued ordinary quotations (the loader refuses drafts and Crew Support)", () => {
    const loader = code(read("./quotationDocumentData.ts"));
    expect(loader).toMatch(/q\.crewManaged\) return \{ ok: false, code: "crew"/);
    expect(loader).toMatch(/q\.status === "draft" \|\| q\.status === "ready" \|\| !q\.issuedAt\) return \{ ok: false, code: "not_issued"/);
    expect(loader).toMatch(/pickIssuanceEvent\(/);
  });
  it("issuance records the baseline fingerprint only after the atomic issue succeeded, and a failure of that note cannot undo the issue", () => {
    const i = code(read("./quotationIssuance.ts"));
    expect(i.indexOf('rpc("issue_ordinary_quotation"')).toBeLessThan(i.indexOf("recordIssueFingerprint(params.quotationId, user.id)"));
    expect(i).toMatch(/if \(!row\?\.issued_at\) return \{ ok: false[\s\S]*await recordIssueFingerprint/);
  });
  it("a stale draft edit cannot rewrite an issued quotation's lines: it stops before the items are replaced if the draft update matched no row", () => {
    const c = code(read("./clientQuotations.ts"));
    const fn = c.slice(c.indexOf("export async function updateClientQuotationDraft"), c.indexOf("export async function reviseClientQuotation"));
    expect(fn).toMatch(/\.eq\("status", "draft"\)\s*\.select\("id"\)/);
    expect(fn.indexOf("updatedRows.length === 0")).toBeGreaterThan(-1);
    expect(fn.indexOf("updatedRows.length === 0")).toBeLessThan(fn.indexOf('.from("client_quotation_items").delete()'));
  });
  it("makes no schema change: no migration file is added or referenced by this feature", () => {
    for (const f of ["./quotationDocument.ts", "./quotationDocumentData.ts", "./quotationEntityAdvice.ts"]) expect(code(read(f))).not.toMatch(/create table|alter table|\.rpc\("(?!issue_ordinary_quotation)/i);
  });
});
