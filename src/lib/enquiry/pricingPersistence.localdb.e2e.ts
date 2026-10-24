// @vitest-environment node
//
// Persistent enquiry pricing against the REAL proposed schema (migration 0168 applied to a throwaway local Postgres + PostgREST). SYNTHETIC data only.
// The persistence gate is switched on ONLY inside this test. Run: supabase/proposals/e2e_scratch.sh, then
// E2E_SUPABASE_URL=http://127.0.0.1:54997 npx vitest run --config vitest.localdb.config.ts src/lib/enquiry/pricingPersistence.localdb.e2e.ts
import { execSync } from "node:child_process";
import { beforeAll, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  agent: null as unknown,
  current: null as unknown,
  fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const undici = await import("undici");
    (h as { agent: unknown }).agent ??= new undici.Agent({ keepAliveTimeout: 1, keepAliveMaxTimeout: 1 });
    return (await undici.fetch(String(input).replace("/rest/v1", ""), { ...(init as object), dispatcher: (h as { agent: unknown }).agent as import("undici").Dispatcher })) as unknown as Response;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock("./pricingHistory", async (orig) => ({ ...(await orig<typeof import("./pricingHistory")>()), ENQUIRY_PRICING_PERSISTENCE_ENABLED: true }));
vi.mock("@/lib/portal/roles", async (orig) => ({ ...(await orig<typeof import("@/lib/portal/roles")>()), getCurrentUser: async () => h.current }));
vi.mock("@/lib/supabase/admin", async () => {
  const { createClient: make } = await import("@supabase/supabase-js");
  return { createAdminClient: () => make(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: h.fetch } }) };
});
vi.mock("@/lib/supabase/server", async () => {
  const { createClient: make } = await import("@supabase/supabase-js");
  return { createClient: async () => make(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: h.fetch } }) };
});

import * as svc from "./pricingPersistence";
const sql = (q: string) => execSync("docker exec -i ordift-mig-check2 psql -U supabase_admin -h 127.0.0.1 -d p4_e2e -X -q -At -v ON_ERROR_STOP=1", { input: q }).toString().trim();
const U = (n: number) => `00000000-0000-4000-8000-0000000000${n.toString(16).padStart(2, "0")}`;
const user = (n: number, roles: string[]) => ({ id: U(n), email: `u${n}@e2e.test`, fullName: `User ${n}`, roles, accessStatus: "active" }) as unknown as Parameters<typeof svc.saveCommunicatedPrice>[0];
const staff = user(0xc1, ["staff"]);
const founder = user(0xc2, ["super_admin"]);
const E1 = "00000000-0000-4000-8000-00000000e201", E2 = "00000000-0000-4000-8000-00000000e202";
const LINES = ["Wedding coverage: 8 hours", "Edited gallery: 300 images", "Estimated Total: $1,000.00"];
const base = { enquiryId: E1, service: "wedding_event", scopeTitle: "Wedding coverage", scopeLines: LINES, baseTotalUsd: 1000, channel: "phone call", communicatedAt: new Date().toISOString() };

beforeAll(() => {
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) throw new Error("Refusing to run against a non-local database");
  sql(`
  set session_replication_role = replica;
  insert into auth.users (id,email) select ('00000000-0000-4000-8000-0000000000'||lpad(to_hex(n),2,'0'))::uuid, 'u'||n||'@e2e.test' from generate_series(193,194) n on conflict do nothing;
  insert into public.profiles (id, full_name, access_status) select ('00000000-0000-4000-8000-0000000000'||lpad(to_hex(n),2,'0'))::uuid, 'User '||n, 'active' from generate_series(193,194) n on conflict do nothing;
  insert into public.user_roles (user_id, role_id) select '${U(0xc2)}', r.id from public.roles r where r.slug='super_admin' on conflict do nothing;
  insert into public.enquiries (id, reference_number, email, full_name, service, phone) values ('${E1}','ENQ-E2E-P1','p@b.test','Pricing One','photography','0200000000'),('${E2}','ENQ-E2E-P2','q@b.test','Pricing Two','photography',null) on conflict do nothing;
  insert into public.currencies (code, name, symbol) values ('USD','US dollar','$') on conflict do nothing;
  `);
});

describe("enquiry pricing services against the real schema", () => {
  it("saves a communicated price as revision 1 and keeps the original", async () => {
    const r = await svc.saveCommunicatedPrice(staff, { ...base, communicatedUsd: 1000 });
    expect(r).toMatchObject({ ok: true, revision: 1 });
    expect(sql(`select communicated_currency||':'||original_total_usd||':'||communicated_amount from public.enquiry_price_communications where enquiry_id='${E1}'`)).toBe("USD:1000.00:1000.00");
  });

  it("a different price needs an approved discount; staff propose, only a Super Admin approves, and the approval is tied to this scope", async () => {
    expect((await svc.saveCommunicatedPrice(staff, { ...base, communicatedUsd: 900 })).ok).toBe(false);
    const p = await svc.proposeDiscount(staff, { enquiryId: E1, scopeTitle: base.scopeTitle, scopeLines: LINES, baseTotalUsd: 1000, type: "percentage", value: 10, reason: "repeat client, agreed with the Founder" });
    expect(p).toMatchObject({ ok: true, totalAfterUsd: 900 });
    if (!p.ok) return;
    expect((await svc.decideDiscount(staff, p.id, "approved", "fine")).ok).toBe(false);          // staff cannot approve
    expect((await svc.saveCommunicatedPrice(staff, { ...base, communicatedUsd: 900, discountApprovalId: p.id })).ok).toBe(false);   // not approved yet
    expect((await svc.decideDiscount(founder, p.id, "approved", "approved for this client")).ok).toBe(true);
    expect((await svc.saveCommunicatedPrice(staff, { ...base, scopeLines: [...LINES, "Extra hour"], communicatedUsd: 900, discountApprovalId: p.id })).ok).toBe(false);   // scope changed
    expect(await svc.saveCommunicatedPrice(staff, { ...base, communicatedUsd: 900, discountApprovalId: p.id })).toMatchObject({ ok: true, revision: 2 });
    const view = await svc.getEnquiryPricingView(E1);
    expect(view!.communications.map((c) => `${c.revision}:${c.original}:${c.communicated}`)).toEqual(["2:1000:900", "1:1000:1000"]);
  });

  it("an indicative local figure is stored only with its governed rate and date, and the client amount stays USD", async () => {
    const r = await svc.saveCommunicatedPrice(staff, { ...base, enquiryId: E2, communicatedUsd: 1000, indicativeLocal: { currency: "QAR", amount: 3640, rateToUsd: 3.64, effectiveFrom: "2026-10-11T00:00:00Z" } });
    expect(r.ok).toBe(true);
    const view = await svc.getEnquiryPricingView(E2);
    expect(view!.communications[0].localNote).toMatch(/Internal reference only: QAR 3640\.00/);
    expect(view!.communications[0].currency).toBe("USD");
  });

  it("follow-ups: one open, due/overdue surfaced, reschedule with a reason and a hand-over keeps history", async () => {
    const past = new Date(Date.now() - 2 * 86_400_000).toISOString();
    expect((await svc.createFollowUp(staff, { enquiryId: E1, handlerId: U(0xc1), nextAction: "Call to confirm the quote", dueAt: past })).ok).toBe(true);
    const second = await svc.createFollowUp(staff, { enquiryId: E1, handlerId: U(0xc1), nextAction: "Another", dueAt: past });
    expect(second.ok === false && second.error).toMatch(/already has an open follow-up/);
    const due = await svc.listDueFollowUps();
    expect(due.find((d) => d.reference === "ENQ-E2E-P1")).toMatchObject({ state: "overdue", handlerName: "User 193" });
    const open = (await svc.getEnquiryPricingView(E1))!.followUp!;
    expect((await svc.rescheduleFollowUp(staff, { followUpId: open.id, newDueAt: new Date(Date.now() + 3 * 86_400_000).toISOString(), reason: "" })).ok).toBe(false);
    expect((await svc.rescheduleFollowUp(staff, { followUpId: open.id, newDueAt: new Date(Date.now() + 3 * 86_400_000).toISOString(), reason: "client asked for Monday", newHandlerId: U(0xc2) })).ok).toBe(true);
    const view = await svc.getEnquiryPricingView(E1);
    expect(view!.followUp).toMatchObject({ handlerName: "User 194", state: "upcoming" });
    expect(view!.followUpHistory.length).toBe(1);
    expect((await svc.completeFollowUp(staff, view!.followUp!.id, "client confirmed")).ok).toBe(true);
    expect((await svc.getEnquiryPricingView(E1))!.followUp).toBeNull();
  });

  it("conversion: staff cannot, an admin creates ONE draft quotation, repeats and concurrent presses create no second", async () => {
    expect((await svc.convertToQuotation(staff, E1)).ok).toBe(false);
    h.current = founder;
    const others = () => sql(`select (select count(*) from public.payments)||'/'||(select count(*) from public.payment_obligations)||'/'||(select count(*) from public.engagements)||'/'||(select count(*) from public.agreements)||'/'||(select count(*) from public.client_quotation_items)`);
    const before = others();
    const [a, b] = await Promise.all([svc.convertToQuotation(founder, E1), svc.convertToQuotation(founder, E1)]);
    const oks = [a, b].filter((x) => x.ok);
    expect(oks.length).toBeGreaterThanOrEqual(1);
    const again = await svc.convertToQuotation(founder, E1);
    expect(again).toMatchObject({ ok: true, alreadyDone: true });
    expect(sql(`select count(*) from public.client_quotations where enquiry_id='${E1}'`)).toBe("1");
    expect(sql(`select status||':'||total||':'||currency from public.client_quotations where enquiry_id='${E1}'`)).toBe("draft:900.00:USD");
    expect(sql(`select count(*) from public.enquiry_conversions where enquiry_id='${E1}'`)).toBe("1");
    // nothing else was created: no payment, obligation, engagement or agreement
    const after = others().split("/");
    expect(after.slice(0, 4)).toEqual(before.split("/").slice(0, 4));          // no payment, obligation, engagement or agreement
    expect(after[4]).toBe(String(Number(before.split("/")[4]) + 1));          // exactly one quotation line
  });

  it("an enquiry with no saved price cannot be converted", async () => {
    h.current = founder;
    const r = await svc.convertToQuotation(founder, "00000000-0000-4000-8000-00000000e299");
    expect(r.ok).toBe(false);
  });
});
