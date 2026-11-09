import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({ user: null as null | { id: string }, admin: true, sa: false, tables: {} as Record<string, Row[]>, failAudit: false, failTermsUpdate: false, latest: null as null | Record<string, unknown>, writes: [] as { table: string; op: string; values: Row }[] }));
vi.mock("@/lib/portal/roles", () => ({ getCurrentUser: async () => h.user, hasRole: (_u: unknown, r: string) => r === "admin" && h.admin, isSuperAdmin: () => h.sa }));
vi.mock("./availabilityService", () => ({ loadLatestAvailabilityCheck: async () => h.latest }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (table: string) => {
  const f: ((r: Row) => boolean)[] = []; let mode = "select"; let payload: Row = {};
  const rows = () => (h.tables[table] ??= []);
  const run = () => {
    if (mode === "insert") { if (h.failAudit && table === "activity_log") return { data: null, error: { message: "x" } }; rows().push(payload); h.writes.push({ table, op: "insert", values: payload }); return { data: null, error: null }; }
    const m = rows().filter((r) => f.every((p) => p(r)));
    if (mode === "update") { if (h.failTermsUpdate) return { data: null, error: { message: "x" } }; m.forEach((r) => Object.assign(r, payload)); h.writes.push({ table, op: "update", values: payload }); return { data: m[0] ?? null, error: null }; }
    return { data: m[0] ?? null, error: null };
  };
  const q: Record<string, unknown> = { select: () => q, eq: (c: string, v: unknown) => { f.push((r) => r[c] === v); return q; },
    insert: (v: Row) => { mode = "insert"; payload = v; return Promise.resolve(run()); }, update: (v: Row) => { mode = "update"; payload = v; return q; }, maybeSingle: async () => run() };
  return q;
} }) }));

import { applyAvailabilityPolicyForIssue, loadQuotationAvailabilityContext } from "./quotationAvailabilityService";
import { CONDITIONAL_SENTENCE } from "./quotationAvailabilityPolicy";

const ON: Record<string, string | undefined> = { BOOKING_CONFIRMATION_ENABLED: "true" };
const chk = (state: string, stale = false) => ({ state, label: state, at: "2026-11-09T10:00:00Z", stale, assigneeId: "p1", byLabel: null, start: null });
const apply = (o: Record<string, unknown> = {}, env = ON) => applyAvailabilityPolicyForIssue({ actorUserId: "u1", quotationId: "q1", basis: "depends", independentReason: "", conditionalAck: false, ...o } as Parameters<typeof applyAvailabilityPolicyForIssue>[0], env);
const q = () => h.tables.client_quotations[0];
beforeEach(() => {
  h.user = { id: "u1" }; h.admin = true; h.sa = false; h.failAudit = false; h.failTermsUpdate = false; h.writes = []; h.latest = chk("available");
  h.tables = { client_quotations: [{ id: "q1", status: "draft", enquiry_id: "e1", crew_support_request_id: null, payment_booking_terms: "No payment is required before the booking is confirmed." }], activity_log: [] };
});

describe("applyAvailabilityPolicyForIssue", () => {
  it("is completely inert while the booking schedule is off: no read, no write, no wording", async () => {
    expect(await apply({ basis: "" }, {})).toMatchObject({ ok: true, mode: "not_applicable", conditional: false }); expect(h.writes).toEqual([]);
  });
  it("is for admins and Super Admins who issue quotations; anyone else is refused before anything is read or written", async () => {
    h.admin = false; expect((await apply()).ok).toBe(false); h.admin = true; h.user = null; expect((await apply()).ok).toBe(false); h.user = { id: "u2" }; expect((await apply()).ok).toBe(false); expect(h.writes).toEqual([]);
  });
  it("refuses an issued quotation (only a draft is changed) and leaves Crew Support quotations to their own process", async () => {
    q().status = "sent"; expect((await apply()) as { error: string }).toMatchObject({ ok: false }); q().status = "draft";
    q().crew_support_request_id = "c1"; expect(await apply()).toMatchObject({ ok: true, mode: "not_applicable" }); expect(h.writes).toEqual([]);
  });
  it("AVAILABLE: issues as normal, records the declaration, adds no wording", async () => {
    const r = await apply(); expect(r).toMatchObject({ ok: true, mode: "available", conditional: false });
    expect(h.tables.activity_log.at(-1)).toMatchObject({ action: "client_quotation.availability_basis_declared", entity_id: "q1" });
    expect(h.tables.activity_log.at(-1)!.metadata).toMatchObject({ mode: "available", latestCheckState: "available", notReservation: true, availabilityRecheckedAtBookingConfirmation: true, conditionalSentenceAdded: false });
    expect(q().payment_booking_terms).toBe("No payment is required before the booking is confirmed.");
  });
  it("TENTATIVE needs the acknowledgement, then adds the conditional sentence to the DRAFT terms (once) and records it", async () => {
    h.latest = chk("tentative");
    expect((await apply()) as { error: string }).toMatchObject({ ok: false, error: expect.stringMatching(/CONDITIONAL/) }); expect(h.writes).toEqual([]);
    expect(await apply({ conditionalAck: true })).toMatchObject({ ok: true, mode: "conditional", conditional: true });
    expect(String(q().payment_booking_terms)).toBe(`No payment is required before the booking is confirmed.\n${CONDITIONAL_SENTENCE}`);
    await apply({ conditionalAck: true }); expect(String(q().payment_booking_terms).split(CONDITIONAL_SENTENCE).length).toBe(3 - 1);   // still exactly one copy
    expect(h.tables.activity_log.at(-1)!.metadata).toMatchObject({ mode: "conditional", conditionalSentenceAdded: true, conditionalWording: { version: "2026-11-quotation-conditional-v1", status: "pending_final_legal_review" } });
  });
  it("CONFLICTING is refused (even with the acknowledgement) and nothing is recorded or changed", async () => {
    h.latest = chk("conflicting"); const r = await apply({ conditionalAck: true }); expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/already known to be blocked/) }); expect(h.writes).toEqual([]);
  });
  it("no check and a stale check are refused; an independent quotation needs a reason", async () => {
    h.latest = null; expect((await apply()) as { error: string }).toMatchObject({ ok: false, error: expect.stringMatching(/Run an availability check/) });
    h.latest = chk("available", true); expect((await apply()) as { error: string }).toMatchObject({ error: expect.stringMatching(/more than 7 days/) });
    expect((await apply({ basis: "independent", independentReason: "short" })).ok).toBe(false);
    expect(await apply({ basis: "independent", independentReason: "Retouching only, no attendance" })).toMatchObject({ ok: true, mode: "independent" });
    expect(h.tables.activity_log.at(-1)!.metadata).toMatchObject({ basis: "independent", independentReason: "Retouching only, no attendance" });
  });
  it("removes a conditional sentence left in a draft when the quotation is now supported by an Available check", async () => {
    q().payment_booking_terms = `No payment is required before the booking is confirmed.\n${CONDITIONAL_SENTENCE}`; h.latest = chk("available");
    await apply(); expect(q().payment_booking_terms).toBe("No payment is required before the booking is confirmed.");
  });
  it("records the declaration first and fails closed: if it cannot be written nothing is issued and the terms are untouched; if the terms cannot be updated nothing is issued", async () => {
    h.latest = chk("tentative"); h.failAudit = true; expect((await apply({ conditionalAck: true })).ok).toBe(false); expect(q().payment_booking_terms).not.toContain("Scheduling");
    h.failAudit = false; h.failTermsUpdate = true; expect((await apply({ conditionalAck: true })).ok).toBe(false);
  });
  it("creates no booking, reservation, hold or payment: it writes only an audit entry and the draft's terms", async () => {
    h.latest = chk("tentative"); await apply({ conditionalAck: true });
    expect([...new Set(h.writes.map((w) => `${w.table}:${w.op}`))].sort()).toEqual(["activity_log:insert", "client_quotations:update"]);
    expect(Object.keys(h.writes.find((w) => w.table === "client_quotations")!.values)).toEqual(["payment_booking_terms"]);
  });
});

describe("loadQuotationAvailabilityContext", () => {
  it("is null while the switch is off and for Crew Support quotations; otherwise describes what will happen", async () => {
    expect(await loadQuotationAvailabilityContext("q1", {})).toBeNull();
    h.latest = chk("tentative"); expect(await loadQuotationAvailabilityContext("q1", ON)).toMatchObject({ applies: true, hasEnquiry: true, latestLabel: "tentative", outlook: { outcome: "conditional" } });
    h.latest = chk("conflicting"); expect((await loadQuotationAvailabilityContext("q1", ON))?.outlook.outcome).toBe("blocked");
    q().crew_support_request_id = "c1"; expect(await loadQuotationAvailabilityContext("q1", ON)).toBeNull();
  });
});
