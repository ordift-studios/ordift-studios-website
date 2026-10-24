import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
let gateOn = false;
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (t: string) => { calls.push(t); throw new Error("database touched: " + t); }, rpc: (n: string) => { calls.push(n); throw new Error("database touched: " + n); } }) }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: async () => {} }));
vi.mock("@/lib/commercial/clientQuotations", () => ({ createClientQuotation: async () => { calls.push("createClientQuotation"); return { ok: false, error: "x" }; } }));
vi.mock("./pricingHistory", async (orig) => ({ ...(await orig<typeof import("./pricingHistory")>()), get ENQUIRY_PRICING_PERSISTENCE_ENABLED() { return gateOn; } }));

import * as svc from "./pricingPersistence";
const staff = { id: "u1", email: "s@x.test", fullName: "Staff", roles: ["staff"] } as unknown as Parameters<typeof svc.saveCommunicatedPrice>[0];
const founder = { ...staff, id: "u2", roles: ["super_admin"] } as typeof staff;
const client = { ...staff, id: "u3", roles: ["client"] } as typeof staff;
const PRICE = { enquiryId: "e1", service: "wedding_event", scopeTitle: "Wedding", scopeLines: ["8 hours"], baseTotalUsd: 1000, communicatedUsd: 1000, channel: "phone", communicatedAt: new Date().toISOString() };

beforeEach(() => { calls.length = 0; gateOn = false; });

describe("while enquiry pricing persistence is off, nothing touches the database", () => {
  it("every write and read refuses or returns empty without a query", async () => {
    const rs = await Promise.all([
      svc.saveCommunicatedPrice(founder, PRICE),
      svc.proposeDiscount(founder, { enquiryId: "e1", scopeTitle: "W", scopeLines: [], baseTotalUsd: 1000, type: "percentage", value: 10, reason: "a good enough reason" }),
      svc.decideDiscount(founder, "d1", "approved", "ok"),
      svc.createFollowUp(founder, { enquiryId: "e1", handlerId: "u1", nextAction: "call", dueAt: new Date().toISOString() }),
      svc.rescheduleFollowUp(founder, { followUpId: "f1", newDueAt: new Date().toISOString(), reason: "asked" }),
      svc.completeFollowUp(founder, "f1", "done"),
      svc.convertToQuotation(founder, "e1"),
    ]);
    for (const r of rs) expect(r.ok).toBe(false);
    expect(await svc.getEnquiryPricingView("e1")).toBeNull();
    expect(await svc.listDueFollowUps()).toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe("rules enforced before the database is reached", () => {
  it("only staff may save, propose or follow up; only an admin may create the quotation", async () => {
    gateOn = true;
    const rs = await Promise.all([svc.saveCommunicatedPrice(client, PRICE), svc.proposeDiscount(client, { enquiryId: "e1", scopeTitle: "W", scopeLines: [], baseTotalUsd: 1000, type: "percentage", value: 10, reason: "a good enough reason" }), svc.createFollowUp(client, { enquiryId: "e1", handlerId: "u1", nextAction: "call", dueAt: new Date().toISOString() }), svc.convertToQuotation(client, "e1"), svc.convertToQuotation(staff, "e1")]);
    for (const r of rs) expect(r.ok).toBe(false);
    expect(calls).toEqual([]);
  });
  it("staff cannot approve or reject a discount; only a Super Admin can", async () => {
    gateOn = true;
    const r = await svc.decideDiscount(staff, "d1", "approved", "fine");
    expect(r.ok === false && r.error).toMatch(/Super Admin/);
    expect(calls).toEqual([]);
  });
  it("a price below the minimum, a vague channel, a future time and a missing reason are refused", async () => {
    gateOn = true;
    expect((await svc.saveCommunicatedPrice(staff, { ...PRICE, communicatedUsd: 0 })).ok).toBe(false);
    expect((await svc.saveCommunicatedPrice(staff, { ...PRICE, channel: "x" })).ok).toBe(false);
    expect((await svc.saveCommunicatedPrice(staff, { ...PRICE, communicatedAt: new Date(Date.now() + 86_400_000).toISOString() })).ok).toBe(false);
    expect((await svc.proposeDiscount(staff, { enquiryId: "e1", scopeTitle: "W", scopeLines: [], baseTotalUsd: 1000, type: "percentage", value: 10, reason: "short" })).ok).toBe(false);
    expect((await svc.proposeDiscount(staff, { enquiryId: "e1", scopeTitle: "W", scopeLines: [], baseTotalUsd: 1000, type: "fixed", value: 5000, reason: "far more than the price" })).ok).toBe(false);
    expect((await svc.rescheduleFollowUp(staff, { followUpId: "f1", newDueAt: new Date().toISOString(), reason: "" })).ok).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe("source guards", () => {
  const src = readFileSync(new URL("./pricingPersistence.ts", import.meta.url), "utf8");
  it("every exported function checks the gate", () => {
    const fns = [...src.matchAll(/export async function (\w+)\(([\s\S]*?)\n}\n/g)];
    expect(fns.length).toBeGreaterThanOrEqual(9);
    for (const [, name, body] of fns) expect(body, name).toMatch(/gate\(\)|ENQUIRY_PRICING_PERSISTENCE_ENABLED/);
  });
  it("sends nothing and moves no money: no email, payment, receipt, revenue, payable, agreement or booking writes", () => {
    for (const bad of ["sendEmail", "notify", "payments", "payment_obligations", "receipt", "revenue", "agreements", "bookings", "engagements"]) expect(src).not.toContain(`from("${bad}")`);
    expect(src).not.toMatch(/sendEmail|resend|fetch\(/);
  });
  it("conversion creates a draft quotation only, with a deterministic idempotency key and a stored link", () => {
    expect(src).toContain("conversionIdempotencyKey(enquiryId, \"client_quotation\")");
    expect(src).toContain("createClientQuotation(");
    expect(src).toContain("alreadyDone: true");
  });
  it("the client currency stays USD; local currency is stored only as a labelled internal reference", () => {
    expect(src).toContain('communicated_currency: "USD"');
    expect(src).toContain("Internal reference only");
    expect(src).toContain("Only USD communicated prices can become a quotation");
  });
  it("history is never rewritten: communications are inserted, never updated or deleted", () => {
    expect(src).not.toMatch(/from\("enquiry_price_communications"\)\.(update|delete)/);
    expect(src).not.toMatch(/\.delete\(/);
  });
});
