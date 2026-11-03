import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { contactsFor, snapshotContacts } from "@/lib/brand/letterheadContacts";

// Synthetic data only. A small fake database stands in for Supabase: nothing real is read or written.
type Row = Record<string, unknown>;
const db: { tables: Record<string, Row[]>; rpcCalls: { fn: string; args: Record<string, unknown> }[] } = { tables: {}, rpcCalls: [] };
function builder(table: string) {
  const filters: [string, unknown][] = [];
  const rows = () => (db.tables[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v));
  const b: Record<string, unknown> = {
    select: () => b, eq: (c: string, v: unknown) => { filters.push([c, v]); return b; }, order: () => b, limit: () => b, in: () => b,
    maybeSingle: async () => ({ data: rows()[0] ?? null }),
    then: (res: (v: unknown) => unknown) => Promise.resolve({ data: rows(), count: rows().length }).then(res),
  };
  return b;
}
const user = { id: "u1", roles: ["admin"] };
vi.mock("@/lib/portal/roles", () => ({ getCurrentUser: async () => user, hasRole: (u: { roles?: string[] }, r: string) => Boolean(u?.roles?.includes(r)), isSuperAdmin: () => false }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: async () => undefined }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (t: string) => builder(t), rpc: async (fn: string, args: Record<string, unknown>) => { db.rpcCalls.push({ fn, args }); return { data: [{ issued_at: "2026-11-04T09:30:00.000Z" }], error: null }; } }) }));
const entityJurisdiction = { current: "Qatar" as string | null };
vi.mock("./quotationEntity", () => ({
  ENTITY_REQUIRED_TO_ISSUE: "x",
  resolveQuotationEntity: async () => ({ ok: true, entity: { entityId: "e1", name: "E", source: "quotation", version: 1, display: {}, assessment: { jurisdiction: entityJurisdiction.current } } }),
}));
vi.mock("./quotationDocumentData", async (orig) => ({ ...(await orig<typeof import("./quotationDocumentData")>()), recordIssueFingerprint: async () => undefined }));
const quotation = { id: "q1", quotationReference: "ORD-QUO-2026-009999", version: 1, status: "sent", currency: "QAR", issuedAt: "2026-11-04T09:30:00.000Z", validUntil: "2026-12-04", crewManaged: false, clientName: null, prospectName: "Synthetic", prospectCompany: null, prospectEmail: null, prospectPhone: null, subtotal: 100, discountTotal: 0, taxTotal: 0, total: 100, paymentBookingTerms: null, items: [{ id: "i1", serviceItem: "Portrait", description: null, quantity: 1, unitBasis: "package", sellingRate: 100, discountPercent: null, taxPercent: null, lineTotal: 100, sourceType: "manual", sourceReference: null }] };
vi.mock("./clientQuotations", () => ({ getClientQuotation: async () => quotation }));

import { issueOrdinaryQuotation } from "./quotationIssuance";
import { loadIssuedQuotationDocument, resolveLetterheadContacts } from "./quotationDocumentData";

const ISSUED_AT = "2026-11-04T09:30:00.000Z";
const issuedEvent = (extra: Record<string, unknown> = {}): Row => ({ id: "ev1", entity_id: "q1", action: "client_quotation.issued", created_at: ISSUED_AT, actor_user_id: "u1", entity_type: "client_quotation", metadata: { issuedAt: ISSUED_AT, declaredActivities: ["photography"], legalDetails: { entityId: "e1", name: "E", recordedOn: "quotation", version: 1, legalName: "SYNTHETIC ENTITY", registrationType: null, identifiers: [], capturedAt: ISSUED_AT }, ...extra } });
beforeEach(() => {
  db.rpcCalls = [];
  db.tables = {
    client_quotations: [{ id: "q1", status: "draft", total: 100, valid_until: null, issued_at: null, crew_support_request_id: null, quotation_reference: "ORD-QUO-2026-009999", issued_by: "u1" }],
    client_quotation_items: [{ id: "i1", quotation_id: "q1" }],
    entity_activity_types: [{ key: "photography", label: "Photography" }],
    employing_entities: [{ id: "e1", jurisdiction_id: "j1" }], employment_jurisdictions: [{ id: "j1", name: "Qatar" }],
    activity_log: [],
  };
});

describe("issuing freezes the letterhead contact details into the issuance event", () => {
  it.each(["Qatar", "Ghana"])("the %s entity's quotation carries that entity's contact snapshot in the audit payload that the database merges into the append-only issuance event", async (j) => {
    entityJurisdiction.current = j;
    const r = await issueOrdinaryQuotation({ quotationId: "q1", validUntil: null, activities: ["photography"] });
    expect(r.ok).toBe(true);
    const call = db.rpcCalls.find((c) => c.fn === "issue_ordinary_quotation");
    expect((call?.args.p_audit as Record<string, unknown>).letterheadContacts).toEqual(snapshotContacts(contactsFor(j)));
    expect(JSON.stringify(call?.args.p_audit)).not.toMatch(/7777|gmail|whatsapp/i);
  });
  it("follows the entity's jurisdiction, never the client's currency or location: a QAR quotation on the Ghana entity carries Ghana's details", async () => {
    entityJurisdiction.current = "Ghana";
    await issueOrdinaryQuotation({ quotationId: "q1", validUntil: null, activities: [] });
    const audit = db.rpcCalls[0].args.p_audit as { letterheadContacts: { jurisdiction: string; phone: string } };
    expect(audit.letterheadContacts).toMatchObject({ jurisdiction: "Ghana", phone: "+233 504 981 277" });
  });
  it("does not change how the database event is built: the snapshot rides in p_audit and the migration is untouched", () => {
    const sql = readFileSync(new URL("../../../supabase/migrations/0173_jurisdiction_entity_requirements.sql", import.meta.url), "utf8");
    expect(sql).toMatch(/coalesce\(p_audit, '\{\}'::jsonb\) \|\| jsonb_build_object\(/);              // p_audit is merged into the event metadata
    const keys = [...sql.slice(sql.indexOf("jsonb_build_object(\n      'quotationReference'"), sql.indexOf("return query select v_issued")).matchAll(/^\s*'([A-Za-z]+)',/gm)].map((m) => m[1]);
    expect(keys).not.toContain("letterheadContacts");                                                    // the function never overwrites the snapshot key
  });
});

describe("a regenerated PDF prints the contact details the quotation was issued with", () => {
  it("uses the frozen snapshot even when the current configuration says something else", async () => {
    const frozen = { version: 1, jurisdiction: "Qatar", email: "enquiries@ordiftstudios.com", phone: "+974 0000 1111", website: "www.ordiftstudios.com" };
    db.tables.client_quotations[0] = { ...db.tables.client_quotations[0], status: "sent", issued_at: ISSUED_AT };
    db.tables.activity_log = [issuedEvent({ letterheadContacts: frozen })];
    const r = await loadIssuedQuotationDocument("q1", "2026-11-05");
    expect(r.ok && r.doc.context.contacts).toEqual(frozen);
    expect(r.ok && r.doc.context.contactsFrozen).toBe(true);
    expect(frozen.phone).not.toBe(contactsFor("Qatar").phone?.value);                              // it really differs from today's configuration
    expect((await resolveLetterheadContacts("q1", "Qatar")).contacts).toEqual(frozen);
  });
  it("a quotation issued before snapshots existed falls back to the current configuration and says so (not frozen)", async () => {
    db.tables.client_quotations[0] = { ...db.tables.client_quotations[0], status: "sent", issued_at: ISSUED_AT };
    db.tables.activity_log = [issuedEvent()];
    const r = await loadIssuedQuotationDocument("q1", "2026-11-05");
    expect(r.ok && r.doc.context.contactsFrozen).toBe(false);
    expect(r.ok && r.doc.context.contacts).toEqual(snapshotContacts(contactsFor("Qatar")));
    expect((await resolveLetterheadContacts("q1", "Qatar")).frozen).toBe(false);
  });
  it("a malformed snapshot is ignored rather than partially trusted", async () => {
    db.tables.client_quotations[0] = { ...db.tables.client_quotations[0], status: "sent", issued_at: ISSUED_AT };
    db.tables.activity_log = [issuedEvent({ letterheadContacts: { version: 1, email: "", website: "x" } })];
    const r = await loadIssuedQuotationDocument("q1", "2026-11-05");
    expect(r.ok && r.doc.context.contactsFrozen).toBe(false);
  });
  it("the content fingerprint is unaffected by the contact snapshot (it is separately preserved by the append-only event, not by the fingerprint)", async () => {
    db.tables.client_quotations[0] = { ...db.tables.client_quotations[0], status: "sent", issued_at: ISSUED_AT };
    db.tables.activity_log = [issuedEvent({ letterheadContacts: { version: 1, jurisdiction: "Qatar", email: "a@b.c", phone: null, website: "w.x" } })];
    const a = await loadIssuedQuotationDocument("q1", "2026-11-05");
    db.tables.activity_log = [issuedEvent()];
    const b = await loadIssuedQuotationDocument("q1", "2026-11-05");
    expect(a.ok && b.ok && a.doc.fingerprint === b.doc.fingerprint).toBe(true);
  });
});
