// @vitest-environment node
//
// WALKTHROUGH of the persistent Enquiries & Quick Pricing journey on the REAL schema (migrations applied to a throwaway local Postgres + PostgREST).
// SYNTHETIC data only; nothing here can reach Production (the test refuses a non-local URL). The persistence gate is switched on ONLY inside this test.
// Run: supabase/proposals/e2e_scratch.sh, then E2E_SUPABASE_URL=http://127.0.0.1:54997 npx vitest run --config vitest.localdb.config.ts src/lib/enquiry/walkthrough.localdb.e2e.ts
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
import { saveWorkspacePriceAction as saveRaw } from "@/app/admin/enquiries/quick-price/saveActions";
import * as acts from "@/app/admin/enquiries/[id]/pricingActions";
import { buildClientSummary, captureFromHref, compareOptions, discountState, previewDiscount } from "@/lib/pricing/quickPriceModel";
import { encodePricingHandoff } from "./pricingHandoff";
import { loadWorkflowFacts } from "./workflowFacts";
import { summariseWorkflow } from "./workflowSummary";

// the form actions return null only for an initial render state; in a walkthrough a result is always expected
const nn = <A extends unknown[]>(fn: (...a: A) => Promise<{ ok: boolean; message: string } | null>) => async (...a: A) => (await fn(...a))!;
const saveWorkspacePriceAction = nn(saveRaw);
const [convertAction, createFollowUpAction, decideDiscountAction, proposeDiscountAction, communicateDiscountAction, rescheduleFollowUpAction] = [acts.convertAction, acts.createFollowUpAction, acts.decideDiscountAction, acts.proposeDiscountAction, acts.communicateDiscountAction, acts.rescheduleFollowUpAction].map((f) => nn(f as never)) as unknown as Array<(prev: null, f: FormData) => Promise<{ ok: boolean; message: string; kind?: "created" | "found"; reference?: string }>>;
const sql = (q: string) => execSync("docker exec -i ordift-mig-check2 psql -U supabase_admin -h 127.0.0.1 -d p4_e2e -X -q -At -v ON_ERROR_STOP=1", { input: q }).toString().trim();
const U = (n: number) => `00000000-0000-4000-8000-0000000000${n.toString(16).padStart(2, "0")}`;
const user = (n: number, roles: string[]) => ({ id: U(n), email: `u${n}@e2e.test`, fullName: `User ${n}`, roles, accessStatus: "active" }) as unknown as Parameters<typeof svc.saveCommunicatedPrice>[0];
const staff = user(0xd1, ["staff"]), admin = user(0xd2, ["admin"]), founder = user(0xd3, ["super_admin"]), client = user(0xd4, ["client"]);
const GH = "00000000-0000-4000-8000-00000000e301", QA = "00000000-0000-4000-8000-00000000e302", NOMKT = "00000000-0000-4000-8000-00000000e303";
const link = (title: string, lines: string[]) => `/book?pathway=photography&pricing=${encodePricingHandoff({ family: "wedding_event", pathway: "photography", summaryTitle: title, summaryLines: lines })}`;
const A = captureFromHref(link("Wedding coverage", ["8 hours coverage", "300 edited images", "Estimated Total: $1,000.00"]));
const B = captureFromHref(link("Wedding coverage (extended)", ["10 hours coverage", "450 edited images", "Second photographer", "Estimated Total: $1,400.00"]));
const C = captureFromHref(link("Wedding coverage (essentials)", ["5 hours coverage", "150 edited images", "Estimated Total: $800.00"]));
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const finance = () => sql(`select (select count(*) from public.payments)||'/'||(select count(*) from public.payment_obligations)||'/'||(select count(*) from public.payable_items)||'/'||(select count(*) from public.engagements)||'/'||(select count(*) from public.agreements)||'/'||(select count(*) from public.payment_instructions)||'/'||(select count(*) from public.payment_receipt_jobs)||'/'||(select count(*) from public.email_send_failures)||'/'||(select count(*) from public.assignment_notifications)`);
let financeBefore = "";
const enquiryRows = () => sql(`select string_agg(reference_number||':'||coalesce(crm_stage::text,'-')||':'||coalesce(amount_due::text,'-')||':'||coalesce(payment_status::text,'-')||':'||coalesce(payment_country::text,'-')||':'||coalesce(is_test::text,'-'), ',' order by reference_number) from public.enquiries where id in ('${GH}','${QA}','${NOMKT}')`);
let enquiriesBefore = "";

beforeAll(() => {
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) throw new Error("Refusing to run against a non-local database");
  sql(`
  set session_replication_role = replica;
  insert into auth.users (id,email) select ('00000000-0000-4000-8000-0000000000'||lpad(to_hex(n),2,'0'))::uuid, 'u'||n||'@e2e.test' from generate_series(209,212) n on conflict do nothing;
  insert into public.profiles (id, full_name, access_status) select ('00000000-0000-4000-8000-0000000000'||lpad(to_hex(n),2,'0'))::uuid, 'User '||n, 'active' from generate_series(209,212) n on conflict do nothing;
  insert into public.user_roles (user_id, role_id) select '${U(0xd3)}', r.id from public.roles r where r.slug='super_admin' on conflict do nothing;
  insert into public.user_roles (user_id, role_id) select '${U(0xd2)}', r.id from public.roles r where r.slug='admin' on conflict do nothing;
  insert into public.enquiries (id, reference_number, email, full_name, service, phone, payment_country, is_test) values
    ('${GH}','ENQ-WT-GH','gh@b.test','Ghana Client','photography','0200000001','GH',false),('${QA}','ENQ-WT-QA','qa@b.test','Qatar Client','photography','0200000002','QA',true),('${NOMKT}','ENQ-WT-NM','nm@b.test','Unset Market','photography',null,null,false);
  insert into public.currencies (code, name, symbol) values ('USD','US dollar','$'),('QAR','Qatari riyal','QAR'),('GHS','Ghana cedi','GHS') on conflict do nothing;
  insert into public.exchange_rates (currency_code, rate_to_usd, effective_from, reason) values ('QAR', 3.64, now() - interval '2 days', 'walkthrough fresh'), ('GHS', 14.5, now() - interval '60 days', 'walkthrough stale');
  `);
  financeBefore = finance();
  enquiriesBefore = enquiryRows();
});

describe("1. Options A, B and C (the governed estimator results) and the comparison", () => {
  it("reads three priced options from the calculators' own results; an unpriceable selection is 'unpriced', never zero", () => {
    expect([A.status, B.status, C.status]).toEqual(["priced", "priced", "priced"]);
    expect([A, B, C].map((o) => (o.status === "priced" ? o.totalUsd : -1))).toEqual([1000, 1400, 800]);
    expect(captureFromHref("/book?pathway=photography").status).toBe("unpriced");
    expect(captureFromHref(null).status).toBe("unpriced");
  });
  it("B compared with A shows the added scope and the difference; C is evaluated as an alternative", () => {
    const cmp = compareOptions(A, B);
    expect(JSON.stringify(cmp)).toContain("400");
    expect(JSON.stringify(compareOptions(A, C))).toContain("200");
  });
});

describe("2. Discount preview and its safeguards", () => {
  it("a valid percentage previews correctly and always needs Founder / Super Admin approval for staff", () => {
    const p = previewDiscount(B, { type: "percentage", value: 10, reason: "repeat client, agreed with the Founder" });
    expect(p).toMatchObject({ ok: true, discountUsd: 140, totalUsd: 1260 });
    expect(discountState(p, false)).toBe("proposed_needs_approval");
    expect(discountState(p, true)).not.toBe("none");
  });
  it("invalid discounts are refused: zero, negative, 100%+, more than the price, no reason, not a number", () => {
    const bad = [{ type: "percentage" as const, value: 0 }, { type: "percentage" as const, value: -5 }, { type: "percentage" as const, value: 100 }, { type: "percentage" as const, value: 150 }, { type: "fixed" as const, value: 1400 }, { type: "fixed" as const, value: 5000 }, { type: "fixed" as const, value: Number("abc") }];
    for (const b of bad) expect(previewDiscount(B, { ...b, reason: "a sufficient reason here" }).ok, JSON.stringify(b)).toBe(false);
    expect(previewDiscount(B, { type: "percentage", value: 10, reason: "" }).ok).toBe(false);
    expect(previewDiscount({ status: "unpriced", reason: "x" }, { type: "percentage", value: 10, reason: "a sufficient reason here" }).ok).toBe(false);
  });
  it("the client summary never carries QAR/GHS", () => {
    const s = buildClientSummary(B, { label: "Option B", original: A, originalLabel: "Option A" });
    expect(s).not.toMatch(/QAR|GHS/);
    expect(s).toContain("estimate, not a formal quotation");
  });
});

describe("3. Saving the exact communicated price (Ghana market) and preserving revisions", () => {
  it("staff save Option A as revision 1, then the revised Option B as revision 2; both stay", async () => {
    h.current = staff;
    const r1 = await saveWorkspacePriceAction({ enquiryReference: "enq-wt-gh", service: "wedding_event", title: A.status === "priced" ? A.title : "", lines: A.status === "priced" ? A.lines : [], totalUsd: 1000, channel: "phone call", communicatedAt: new Date().toISOString(), localCurrency: "", assumptions: "", notes: "" });
    expect(r1).toMatchObject({ ok: true });
    const r2 = await saveWorkspacePriceAction({ enquiryReference: "ENQ-WT-GH", service: "wedding_event", title: B.status === "priced" ? B.title : "", lines: B.status === "priced" ? B.lines : [], totalUsd: 1400, channel: "WhatsApp", communicatedAt: new Date().toISOString(), localCurrency: "", assumptions: "client added a second photographer", notes: "" });
    expect(r2.ok && r2.message).toMatch(/revision 2/);
    const v = await svc.getEnquiryPricingView(GH);
    expect(v!.communications.map((c) => `${c.revision}:${c.communicated}:${c.currency}`)).toEqual(["2:1400:USD", "1:1000:USD"]);
    expect(sql(`select market_slug from public.enquiry_price_communications where enquiry_id='${GH}' limit 1`)).toBe("GH");
  });
  it("an unknown reference and a client cannot save; a price cannot be saved with a discount that is not approved", async () => {
    h.current = staff;
    expect((await saveWorkspacePriceAction({ enquiryReference: "ENQ-NOPE", service: "x", title: "t", lines: [], totalUsd: 100, channel: "phone", communicatedAt: "", localCurrency: "", assumptions: "", notes: "" })).ok).toBe(false);
    h.current = client;
    expect((await saveWorkspacePriceAction({ enquiryReference: "ENQ-WT-GH", service: "x", title: "t", lines: [], totalUsd: 100, channel: "phone", communicatedAt: "", localCurrency: "", assumptions: "", notes: "" })).ok).toBe(false);
    h.current = staff;
    const sneaky = await svc.saveCommunicatedPrice(staff, { enquiryId: GH, service: "wedding_event", scopeTitle: "Wedding coverage (extended)", scopeLines: B.status === "priced" ? B.lines : [], baseTotalUsd: 1400, communicatedUsd: 1000, channel: "phone", communicatedAt: new Date().toISOString() });
    expect(sneaky.ok === false && sneaky.error).toMatch(/needs an approved discount/);
  });
});

describe("4. Discount approval through the real screens' actions", () => {
  it("staff propose; staff cannot approve; a Super Admin approves; the discounted price is saved as revision 3 with the original kept", async () => {
    h.current = staff;
    expect(await proposeDiscountAction(null, fd({ enquiryId: GH, type: "percentage", value: "10", reason: "repeat client, agreed with the Founder" }))).toMatchObject({ ok: true });
    expect((await proposeDiscountAction(null, fd({ enquiryId: GH, type: "fixed", value: "50", reason: "a second one while the first is live" }))).ok).toBe(false);   // one live discount only
    const id = sql(`select id from public.enquiry_discount_approvals where enquiry_id='${GH}' and status='proposed'`);
    expect((await decideDiscountAction(null, fd({ enquiryId: GH, discountId: id, decision: "approved", note: "fine" }))).ok).toBe(false);
    expect((await communicateDiscountAction(null, fd({ enquiryId: GH, channel: "phone" }))).ok).toBe(false);                           // nothing approved yet
    h.current = founder;
    expect(await decideDiscountAction(null, fd({ enquiryId: GH, discountId: id, decision: "approved", note: "approved for this client" }))).toMatchObject({ ok: true });
    h.current = staff;
    expect(await communicateDiscountAction(null, fd({ enquiryId: GH, channel: "phone call" }))).toMatchObject({ ok: true });
    const v = await svc.getEnquiryPricingView(GH);
    expect(v!.communications.map((c) => `${c.revision}:${c.original}:${c.communicated}`)).toEqual(["3:1400:1260", "2:1400:1400", "1:1000:1000"]);
  });
});

describe("5. Currency handling, Ghana/Qatar separation and missing-rate behaviour", () => {
  const save = (ref: string, cur: "" | "QAR" | "GHS") => saveWorkspacePriceAction({ enquiryReference: ref, service: "wedding_event", title: "Wedding coverage", lines: A.status === "priced" ? A.lines : [], totalUsd: 1000, channel: "phone call", communicatedAt: new Date().toISOString(), localCurrency: cur, assumptions: "", notes: "" });
  it("Qatar enquiry with a current governed QAR rate stores USD plus a labelled internal QAR reference with its rate and date", async () => {
    h.current = staff;
    expect(await save("ENQ-WT-QA", "QAR")).toMatchObject({ ok: true });
    const c = (await svc.getEnquiryPricingView(QA))!.communications[0];
    expect(c.currency).toBe("USD");
    expect(c.localNote).toMatch(/Internal reference only: QAR 3640\.00 at 3\.64/);
    expect(sql(`select market_slug from public.enquiry_price_communications where enquiry_id='${QA}'`)).toBe("QA");
  });
  it("a stale GHS rate (60 days) saves the USD price but stores no local figure and says so", async () => {
    const r = await save("ENQ-WT-GH", "GHS");
    expect(r.ok && r.message).toMatch(/No internal local-currency figure was stored/);
    expect((await svc.getEnquiryPricingView(GH))!.communications[0].localNote).toBeNull();
  });
  it("a currency from the other market is refused outright (QAR on a Ghana enquiry, GHS on a Qatar one) and nothing is saved", async () => {
    const before = sql(`select count(*) from public.enquiry_price_communications`);
    const a = await save("ENQ-WT-GH", "QAR"), b = await save("ENQ-WT-QA", "GHS");
    expect(a.ok).toBe(false); expect(b.ok).toBe(false);
    expect(a.message).toMatch(/Ghana enquiry.*GHS, not QAR/);
    expect(sql(`select count(*) from public.enquiry_price_communications`)).toBe(before);
  });
  it("an enquiry with no payment market is stored as 'unspecified' (never silently Ghana), and a missing rate stores no local figure", async () => {
    sql(`delete from public.exchange_rates where currency_code='QAR' and reason='walkthrough fresh'`);
    expect(await save("ENQ-WT-NM", "QAR")).toMatchObject({ ok: true });
    expect(sql(`select market_slug||':'||coalesce(indicative_local_currency,'none') from public.enquiry_price_communications where enquiry_id='${NOMKT}'`)).toBe("unspecified:none");
  });
});

describe("6. Handler, follow-up, overdue and rescheduling", () => {
  it("a follow-up with a handler is set; a past due date reads as overdue on the list and the panel", async () => {
    h.current = staff;
    const past = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 16);
    expect(await createFollowUpAction(null, fd({ enquiryId: GH, handlerId: U(0xd2), nextAction: "Call to confirm the extended package", dueAt: past }))).toMatchObject({ ok: true });
    expect((await createFollowUpAction(null, fd({ enquiryId: GH, nextAction: "A second open one", dueAt: past }))).ok).toBe(false);
    const due = (await svc.listDueFollowUps()).find((d) => d.reference === "ENQ-WT-GH");
    expect(due).toMatchObject({ state: "overdue", handlerName: "User 210" });
  });
  it("rescheduling needs a reason, hands over to another handler, keeps the earlier date in history, and the list stops showing it as overdue", async () => {
    const open = (await svc.getEnquiryPricingView(GH))!.followUp!;
    const future = new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 16);
    expect((await rescheduleFollowUpAction(null, fd({ enquiryId: GH, followUpId: open.id, dueAt: future, reason: "" }))).ok).toBe(false);
    expect(await rescheduleFollowUpAction(null, fd({ enquiryId: GH, followUpId: open.id, dueAt: future, reason: "client travelling until Friday", handlerId: U(0xd3) }))).toMatchObject({ ok: true });
    const v = await svc.getEnquiryPricingView(GH);
    expect(v!.followUp).toMatchObject({ state: "upcoming", handlerName: "User 211" });
    expect(v!.followUpHistory[0].note).toMatch(/Rescheduled: client travelling/);
    expect((await svc.listDueFollowUps()).some((d) => d.reference === "ENQ-WT-GH")).toBe(false);
  });
});

describe("7. Conversion to ONE draft quotation, with no booking, payment, revenue or payable", () => {
  it("staff and clients cannot convert; an admin can; double and concurrent presses leave exactly one draft", async () => {
    h.current = staff;
    expect((await convertAction(null, fd({ enquiryId: GH }))).ok).toBe(false);
    h.current = client;
    expect((await convertAction(null, fd({ enquiryId: GH }))).ok).toBe(false);
    h.current = admin;
    const [x, y] = await Promise.all([convertAction(null, fd({ enquiryId: GH })), convertAction(null, fd({ enquiryId: GH }))]);
    // simultaneous presses: both succeed, exactly one says "created", the other says "found" (never a refusal and never a second quotation)
    expect([x, y].map((r) => r.ok)).toEqual([true, true]);
    expect([x, y].map((r) => r.kind).sort()).toEqual(["created", "found"]);
    expect(x.reference).toBe(y.reference);
    const again = await convertAction(null, fd({ enquiryId: GH }));
    expect(again).toMatchObject({ ok: true, kind: "found" });
    expect(again.message).toMatch(/already exists.*no second one was created/);
    const latest = (await svc.getEnquiryPricingView(GH))!.communications[0];
    expect(sql(`select count(*)||':'||min(status)||':'||min(currency)||':'||min(total) from public.client_quotations where enquiry_id='${GH}'`)).toBe(`1:draft:USD:${latest.communicated.toFixed(2)}`);
    expect(sql(`select count(*) from public.enquiry_conversions where enquiry_id='${GH}'`)).toBe("1");
    expect(sql(`select count(*) from public.client_quotation_items q join public.client_quotations c on c.id=q.quotation_id where c.enquiry_id='${GH}'`)).toBe("1");
  });
  it("the quotation carries the LATEST communicated amount (whatever staff last told the client), not a recomputed one", async () => {
    const latest = (await svc.getEnquiryPricingView(GH))!.communications[0];
    expect(latest.revision).toBe(4);                                              // revision 4 = Option A re-saved in step 5
    expect(sql(`select total from public.client_quotations where enquiry_id='${GH}'`)).toBe("1000.00");
    expect(sql(`select count(*) from public.enquiry_price_communications where enquiry_id='${GH}' and communicated_amount = 1260 and original_total_usd = 1400`)).toBe("1");   // the approved discounted revision is still in the history
  });
  it("the workflow summary and the enquiry panel read the SAME draft and say it is a draft, not issued", async () => {
    const f = await loadWorkflowFacts(GH, { userId: U(0xd2), isSuperAdmin: false });
    const r = summariseWorkflow(f!);
    const draftStep = r.steps.find((st) => st.key === "draft")!;
    expect(draftStep).toMatchObject({ answer: "Yes", state: "done" });
    expect(draftStep.detail).toMatch(/^ORD-QUO-\d{4}-\d{6} · version 1 · USD 1000\.00 · Draft$/);
    expect(r.steps.find((st) => st.key === "quotation")).toMatchObject({ answer: "No", state: "pending" });
    expect(r.steps.find((st) => st.key === "amount_due")!.state).toBe("pending");
    expect(r.steps.find((st) => st.key === "booking")!.state).toBe("pending");
    const conv = (await svc.getEnquiryPricingView(GH))!.conversion!;
    expect(conv).toMatchObject({ status: "draft", currency: "USD", total: 1000, version: 1, issuedAt: null, acceptedAt: null });
    expect(f!.quotations).toHaveLength(1);                                                        // one quotation, one source of truth
    expect(f!.quotations[0].reference).toBe(conv.quotationReference);
    expect(sql(`select count(*) from public.client_quotations where quotation_reference='${conv.quotationReference}'`)).toBe("1");
  });
  it("an enquiry whose only saved price is on a Qatar enquiry converts to a USD draft too (no local-currency quotation)", async () => {
    h.current = admin;
    expect(await convertAction(null, fd({ enquiryId: QA }))).toMatchObject({ ok: true });
    expect(sql(`select currency||':'||status from public.client_quotations where enquiry_id='${QA}'`)).toBe("USD:draft");
  });
  it("test classification: a quotation made from a TEST enquiry is itself a test record; one from a real enquiry is not", () => {
    expect(sql(`select is_test::text from public.client_quotations where enquiry_id='${QA}'`)).toBe("true");
    expect(sql(`select is_test::text from public.client_quotations where enquiry_id='${GH}'`)).toBe("false");
  });
  it("across the whole journey no payment, obligation, payable, engagement, agreement, receipt job, email failure or notification was created", () => {
    expect(finance()).toBe(financeBefore);
  });
  it("the enquiry rows themselves were not changed by saving prices, discounts, follow-ups or conversion", () => {
    expect(enquiryRows()).toBe(enquiriesBefore);
  });
});
