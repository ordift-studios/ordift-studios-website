// @vitest-environment node
//
// End-to-end run of the REAL Direct Bank Transfer server code against a throwaway local Postgres +
// PostgREST built from the full migration chain (see vitest.localdb.config.ts and
// scripts/crew-support-e2e.md). It cannot reach Staging or Production: the Supabase URL is forced to
// localhost, storage and outbound email are stubbed, and every bank detail used here is fake test data.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const h = vi.hoisted(() => ({
  user: null as null | { id: string; email: string | null; fullName: string | null; roles: string[]; accessStatus: string },
  uploads: [] as string[],
  agent: null as unknown,
  // Standalone PostgREST serves at the root; supabase-js adds /rest/v1 (the gateway prefix in real Supabase).
  // Short keep-alive: Docker Desktop's port proxy can reset a reused idle socket (sporadic "fetch failed").
  fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const undici = await import("undici");
    (h as { agent: unknown }).agent ??= new undici.Agent({ keepAliveTimeout: 1, keepAliveMaxTimeout: 1 });
    return (await undici.fetch(String(input).replace("/rest/v1", ""), { ...(init as object), dispatcher: (h as { agent: unknown }).agent as import("undici").Dispatcher })) as unknown as Response;
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/shared/rateLimit", () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/notifications/dispatch", () => ({ dispatchNotification: vi.fn(async () => ({ email: { ok: true, mode: "logged", attempts: 1 } })) }));
vi.mock("@/lib/portal/roles", async (orig) => ({ ...(await orig<typeof import("@/lib/portal/roles")>()), getCurrentUser: async () => h.user }));
vi.mock("@/lib/supabase/server", async () => {
  const { createClient: make } = await import("@supabase/supabase-js");
  return { createClient: async () => make(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: h.fetch } }) };
});
vi.mock("@/lib/supabase/admin", async () => {
  const { createClient: make } = await import("@supabase/supabase-js");
  return {
    createAdminClient: () => {
      const c = make(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: h.fetch } });
      (c.auth as unknown as { admin: unknown }).admin = { getUserById: async (id: string) => ({ data: { user: { email: `${id}@e2e.test` } }, error: null }) };
      // No storage service in the throwaway stack: record uploads, hand back a fake signed URL.
      Object.defineProperty(c, "storage", {
        value: { from: () => ({ upload: async (path: string) => { h.uploads.push(path); return { error: null }; }, createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://signed.example/${path}` }, error: null }) }) },
      });
      return c;
    },
  };
});

import { NextRequest } from "next/server";
import { PUT as initiateTransfer, POST as submitProof } from "@/app/api/payments/bank-transfer/proof/route";
import { GET as viewProof } from "@/app/admin/payments/[id]/proof/route";
import { decideBankTransferAction } from "@/app/admin/payments/verificationActions";
import { setPaymentMarketAction } from "@/app/admin/enquiries/[id]/marketActions";
import { activateBankAccount, createBankAccount, deactivateBankAccount, setDefaultBankAccount, setMarketPaymentsEnabled, updateBankAccount } from "./bankAccountsAdmin";
import { getActiveBankAccount } from "./bankAccounts";
import { decideBankTransfer } from "./bankTransferVerification";
import { finalizeVerifiedBankTransfer } from "./gatewaySync";
import { initiateGatewayCheckout } from "./checkoutService";
import { insertExchangeRate } from "./currency";

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) {
  throw new Error("Refusing to run: this E2E may only target a localhost database.");
}

const SUPER = "00000000-0000-4000-8000-0000000000b1";
const ADMIN2 = "00000000-0000-4000-8000-0000000000b2";
const STAFF = "00000000-0000-4000-8000-0000000000b3";
const FIN = "00000000-0000-4000-8000-0000000000b6"; // finance personnel (staff role) — verifies only with an explicit grant
const CLIENT = "00000000-0000-4000-8000-0000000000b4";
const CLIENT2 = "00000000-0000-4000-8000-0000000000b5";
const IBAN_A = "QA48CBQA000000000000TEST00001"; // fake test data
const IBAN_B = "QA19DOHB000000000000TEST00002"; // fake test data
const TODAY = new Date().toISOString().slice(0, 10); // the throwaway DB uses the real clock

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false }, global: { fetch: h.fetch } });
const sql = (q: string) => execSync("docker exec -i ordift-mig-check2 psql -U postgres -h 127.0.0.1 -v ON_ERROR_STOP=1 -At", { input: q }).toString();
const sqlFails = (q: string): string => { try { sql(q); return ""; } catch (e) { return String((e as { stderr?: Buffer }).stderr ?? e); } };
const as = (id: string, roles: string[]) => { h.user = { id, email: `${id}@e2e.test`, fullName: id, roles, accessStatus: "active" }; };
const must = <T extends { ok: boolean }>(r: T, label = ""): Extract<T, { ok: true }> => { if (!r.ok) throw new Error(`${label} expected ok, got ${JSON.stringify(r)}`); return r as Extract<T, { ok: true }>; };
const mustFail = <T extends { ok: boolean }>(r: T): string => { expect(r.ok).toBe(false); return (r as unknown as { error?: string }).error ?? ""; };

// 1x1 PNG — real magic bytes, so the server's content sniffing accepts it.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

let titleId = "";
let counter = 0;
let accountA = "";
let accountB = "";

// A real Crew Support enquiry (the target use case) priced at USD amountDue, in the Qatar market.
async function newReceivable(amountDue = 274.73) {
  const ref = `CSR-2026-B${Date.now().toString().slice(-8)}${++counter % 100}`;
  const { data, error } = await db().rpc("create_crew_support_request", {
    p_request: {
      user_id: CLIENT, reference_number: ref, requester_type: "photographer", requester_name: "Bright Test", requester_email: "bright@e2e.test", requester_phone: "+974000000", service_family: "photography",
      project_name: `BT ${ref}`, project_type: "Wedding", start_date: "2027-04-12", end_date: "2027-04-12", call_time: "10:00", finish_time: "21:00", location: "Doha — QA", on_site_contact: "Ama",
      urgency: "standard", service_details: { equipment: "requester_supplies" }, consent_accepted_at: new Date().toISOString(), submitted_at: new Date().toISOString(),
    },
    p_requirements: [{ operational_title_id: titleId, role_label: "Photographer", quantity: 1, responsibilities: "Coverage" }],
  });
  if (error) throw new Error(error.message);
  const ids = data as { request_id: string; enquiry_id: string };
  sql(`update public.enquiries set amount_due = ${amountDue}, amount_due_source = 'manual', payment_country = 'QA' where id = '${ids.enquiry_id}'`);
  return { requestId: ids.request_id, enquiryId: ids.enquiry_id, ref };
}

async function put(enquiryId: string, body: Record<string, unknown>) {
  as(CLIENT, ["client"]);
  const res = await initiateTransfer(new NextRequest("http://localhost/api/payments/bank-transfer/proof", { method: "PUT", body: JSON.stringify({ entityType: "enquiry", entityId: enquiryId, paymentType: "full", ...body }) }));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
async function initiate(enquiryId: string, amountUsd: number, paymentType = "full", rate = 3.64) {
  return put(enquiryId, { paymentType, amountUsd, quotedConvertedAmount: Math.round(amountUsd * rate * 100) / 100 });
}
async function upload(paymentId: string, opts: { user?: string; bytes?: Buffer; type?: string; bankReference?: string; transferDate?: string } = {}) {
  as(opts.user ?? CLIENT, ["client"]);
  const form = new FormData();
  form.append("file", new File([new Uint8Array(opts.bytes ?? PNG)], "receipt.png", { type: opts.type ?? "image/png" }));
  form.append("paymentId", paymentId);
  if (opts.bankReference) form.append("bankReference", opts.bankReference);
  if (opts.transferDate) form.append("transferDate", opts.transferDate);
  const res = await submitProof(new NextRequest("http://localhost/api/payments/bank-transfer/proof", { method: "POST", body: form }));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
// A payment that has been instructed and has proof submitted — the verifier's starting point.
async function submitted(amountDue = 274.73, payUsd = amountDue) {
  const r = await newReceivable(amountDue);
  const i = await initiate(r.enquiryId, payUsd, payUsd >= amountDue ? "full" : "partial");
  expect(i.status, JSON.stringify(i.body)).toBe(200);
  const paymentId = i.body.paymentId as string;
  expect((await upload(paymentId, { bankReference: "CLIENT-REF-1", transferDate: TODAY })).status).toBe(200);
  return { ...r, paymentId, expectedQar: i.body.convertedAmount as number };
}
const verifyInput = (over: Partial<Parameters<typeof decideBankTransfer>[0]["input"]> = {}) => ({
  decision: "approved", receivedAmount: 1000.02, receivedCurrency: "QAR", bankReference: `CBQ-${Date.now()}-${++counter}`, receivedDate: TODAY, independentCheck: true,
  internalNotes: "Checked online banking", clientMessage: "", acknowledgeExcess: false, ...over,
});
const decide = (paymentId: string, over: Partial<Parameters<typeof decideBankTransfer>[0]["input"]> = {}, verifierId = SUPER) =>
  decideBankTransfer({ paymentId, verifierId, today: TODAY, input: verifyInput(over) });
const payment = async (id: string) => (await db().from("payments").select("*").eq("id", id).single()).data as Record<string, unknown>;
const enquiry = async (id: string) => (await db().from("enquiries").select("*").eq("id", id).single()).data as Record<string, unknown>;
const count = async (table: string, f: Record<string, unknown>) => (await db().from(table).select("id", { count: "exact", head: true }).match(f)).count ?? 0;

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values ('${SUPER}','super@e2e.test'),('${ADMIN2}','admin2@e2e.test'),('${STAFF}','staff@e2e.test'),('${CLIENT}','client@e2e.test'),('${CLIENT2}','client2@e2e.test'),('${FIN}','fin@e2e.test') on conflict do nothing;
    insert into public.profiles (id, full_name, access_status) values ('${SUPER}','Super One','active'),('${ADMIN2}','Admin Two','active'),('${STAFF}','Staff Three','active'),('${CLIENT}','Client Four','active'),('${CLIENT2}','Client Five','active'),('${FIN}','Finance Six','active')
      on conflict (id) do update set access_status = 'active';
    insert into public.user_roles (user_id, role_id) select '${SUPER}', id from public.roles where slug = 'super_admin' on conflict do nothing;
    insert into public.user_roles (user_id, role_id) select '${ADMIN2}', id from public.roles where slug = 'admin' on conflict do nothing;
    insert into public.user_roles (user_id, role_id) select u, id from unnest(array['${STAFF}','${FIN}']::uuid[]) u, public.roles where slug = 'staff' on conflict do nothing;
  `);
  titleId = sql("select id from public.operational_titles where slug = 'photographer'").trim();
});

// ============================================================================
describe("Scenario A — receiving bank account governance", () => {
  it("A1 only a Super Admin can create an account; it is saved INACTIVE with a creator; the database refuses to activate it without a recorded confirmation", async () => {
    const input = { bankName: "Commercial Bank of Qatar", beneficiaryName: "Test Founder", accountNumber: "", iban: IBAN_A, swiftCode: "CBQAQAQA", currencyCode: "QAR", country: "QA", classification: "personal" };
    expect(mustFail(await createBankAccount({ input, actorUserId: ADMIN2 }))).toMatch(/Only a Super Admin/);
    const created = must(await createBankAccount({ input, actorUserId: SUPER }), "create");
    accountA = created.id;
    const row = (await db().from("bank_accounts").select("is_active, is_default, created_by, account_classification").eq("id", accountA).single()).data!;
    expect(row).toMatchObject({ is_active: false, is_default: false, created_by: SUPER, account_classification: "personal" });
    expect(await getActiveBankAccount("QA")).toBeNull(); // nothing is offered until activated
    expect(sqlFails(`update public.bank_accounts set is_active = true where id = '${accountA}'`)).toMatch(/bank_accounts_active_requires_confirmation/);
    expect(mustFail(await createBankAccount({ input: { ...input, iban: "QA00DOHB00001234567890ABCDEFG" }, actorUserId: SUPER }))).toMatch(/IBAN/);
  });

  it("A2 activating a PERSONAL account needs a written basis AND the explicit eligibility confirmation; only a Super Admin can do it", async () => {
    expect(mustFail(await activateBankAccount({ id: accountA, basis: "x".repeat(30), confirmedPersonalUse: true, makeDefault: true, actorUserId: ADMIN2 }))).toMatch(/Only a Super Admin/);
    expect(mustFail(await activateBankAccount({ id: accountA, basis: "short", confirmedPersonalUse: true, makeDefault: true, actorUserId: SUPER }))).toMatch(/basis/);
    expect(mustFail(await activateBankAccount({ id: accountA, basis: "Bank confirmed personal receipts are permitted (test)", confirmedPersonalUse: false, makeDefault: true, actorUserId: SUPER }))).toMatch(/personal account/);
    expect((await db().from("bank_accounts").select("is_active").eq("id", accountA).single()).data!.is_active).toBe(false);
    must(await activateBankAccount({ id: accountA, basis: "Bank confirmed personal receipts are permitted (test)", confirmedPersonalUse: true, makeDefault: true, actorUserId: SUPER }), "activate");
    const acct = await getActiveBankAccount("QA");
    expect(acct).toMatchObject({ id: accountA, classification: "personal", currencyCode: "QAR" });
    expect(await count("activity_log", { entity_id: accountA, action: "bank_account.activated" })).toBe(1);
  });

  it("A3 a live account can't be edited in place; the new Qatar corporate account becomes the default and the personal one is deactivated without touching history", async () => {
    expect(mustFail(await updateBankAccount({ id: accountA, input: { bankName: "Other", beneficiaryName: "X Y", accountNumber: "1234567", iban: "", swiftCode: "", currencyCode: "QAR", country: "QA", classification: "personal" }, actorUserId: SUPER }))).toMatch(/can't be edited in place/);
    const b = must(await createBankAccount({ input: { bankName: "Commercial Bank of Qatar", beneficiaryName: "Ordift Studios W.L.L (test)", accountNumber: "", iban: IBAN_B, swiftCode: "CBQAQAQA", currencyCode: "QAR", country: "QA", classification: "corporate" }, actorUserId: SUPER }), "create B");
    accountB = b.id;
    expect(mustFail(await setDefaultBankAccount({ id: accountB, actorUserId: SUPER }))).toMatch(/Only an active account/);
    must(await activateBankAccount({ id: accountB, basis: "Corporate account opened and confirmed by the bank (test)", confirmedPersonalUse: false, makeDefault: false, actorUserId: SUPER }), "activate B");
    expect((await getActiveBankAccount("QA"))?.id).toBe(accountA); // two active, A still the default
    must(await setDefaultBankAccount({ id: accountB, actorUserId: SUPER }), "default B");
    expect((await getActiveBankAccount("QA"))?.id).toBe(accountB);
    expect(sqlFails(`update public.bank_accounts set is_default = true where id = '${accountA}'`)).toMatch(/bank_accounts_default_requires_active|one_default|violates/);
    expect(mustFail(await deactivateBankAccount({ id: accountA, reason: "x", actorUserId: SUPER }))).toMatch(/why/);
    must(await deactivateBankAccount({ id: accountA, reason: "Replaced by the corporate account", actorUserId: SUPER }), "deactivate A");
    expect(await getActiveBankAccount("QA")).toMatchObject({ id: accountB, classification: "corporate" });
    // re-instate A as the active default for the next scenarios' historical-preservation test
    expect((await db().from("bank_accounts").select("is_active, deactivated_at").eq("id", accountA).single()).data).toMatchObject({ is_active: false });
  });

  it("A4 enabling a market is a separate Super Admin switch; Ghana is not managed here", async () => {
    expect(mustFail(await setMarketPaymentsEnabled({ country: "QA", enabled: true, actorUserId: ADMIN2 }))).toMatch(/Only a Super Admin/);
    expect(mustFail(await setMarketPaymentsEnabled({ country: "GH", enabled: false, actorUserId: SUPER }))).toMatch(/Ghana/);
    expect((await db().from("payment_country_config").select("is_active").eq("country", "QA").single()).data!.is_active).toBe(false);
  });

  it("A5 clients, staff and general admins can't read bank accounts through the API; only a Super Admin can", async () => {
    const rls = (uid: string) => sql(`begin; set local role authenticated; select set_config('request.jwt.claim.sub', '${uid}', true); select count(*) from public.bank_accounts; rollback;`).split("\n").filter((l) => /^\d+$/.test(l.trim())).pop();
    expect(rls(CLIENT)).toBe("0");
    expect(rls(STAFF)).toBe("0");
    expect(rls(ADMIN2)).toBe("0"); // a general admin can't read receiving accounts through the API either
    expect(Number(rls(SUPER))).toBeGreaterThan(0);
    expect(sqlFails(`begin; set local role authenticated; select set_config('request.jwt.claim.sub', '${SUPER}', true); update public.bank_accounts set bank_name = 'tamper'; rollback;`)).toMatch(/permission denied/);
  });
});

// ============================================================================
describe("Scenario B — instructions: market, receiving account, exact amount, no gateway", () => {
  let enquiryId = "";
  it("B1 nothing is offered until the market is enabled, an account is active/default and a QAR rate exists", async () => {
    enquiryId = (await newReceivable()).enquiryId;
    expect((await initiate(enquiryId, 274.73)).body.error).toBe("no-active-payment-config-for-country"); // market not enabled
    must(await setMarketPaymentsEnabled({ country: "QA", enabled: true, actorUserId: SUPER }), "enable QA");
    expect((await initiate(enquiryId, 274.73)).body.error).toBe("no-exchange-rate-set"); // no QAR rate yet
    // Account A is the one we want live for the personal→corporate history test below
    must(await activateBankAccount({ id: accountA, basis: "Re-activated for the historical-preservation test", confirmedPersonalUse: true, makeDefault: true, actorUserId: SUPER }), "re-activate A");
    must(await insertExchangeRate({ currencyCode: "QAR", rateToUsd: 3.64, reason: "E2E controlled test rate", actorUserId: SUPER }) as { ok: true }, "rate");
  });

  it("B2 the instruction fixes the exact QAR amount at the locked rate, issues a unique reference, and snapshots the receiving account", async () => {
    const r = await initiate(enquiryId, 274.73);
    expect(r.status).toBe(200);
    expect(r.body.convertedAmount).toBe(1000.02);
    expect(r.body.currencyCode).toBe("QAR");
    expect(String(r.body.recordId)).toMatch(/^PAY-/);
    const p = await payment(r.body.paymentId as string);
    expect(p).toMatchObject({ status: "pending", payment_method: "bank_transfer", provider: "bank_transfer", payment_currency: "QAR", receiving_bank_account_id: accountA });
    expect(Number(p.reference_amount_usd)).toBe(274.73);
    expect(Number(p.exchange_rate)).toBe(3.64);
    expect(p.exchange_rate_source).toBe("ordift");
    expect((p.receiving_account_snapshot as { iban: string; classification: string }).iban).toBe(IBAN_A);
    expect(await count("payment_obligations", {})).toBe(0);
    // the quotation/receivable is untouched by an instruction
    expect(Number((await enquiry(enquiryId)).amount_due)).toBe(274.73);
    expect(Number((await enquiry(enquiryId)).amount_paid ?? 0)).toBe(0);
  });

  it("B3 repeating the request reuses the one open instruction; a stale quote is refused with the fresh amount; a client-supplied country is ignored", async () => {
    const a = await initiate(enquiryId, 274.73);
    const b = await initiate(enquiryId, 274.73);
    expect(b.body.paymentId).toBe(a.body.paymentId);
    expect(await count("payments", { entity_id: enquiryId })).toBe(1);
    const stale = await put(enquiryId, { amountUsd: 274.73, quotedConvertedAmount: 999.0 });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ error: "rate_changed", convertedAmount: 1000.02 });
    const spoof = await put(enquiryId, { amountUsd: 274.73, quotedConvertedAmount: 1000.02, country: "GH" });
    expect(spoof.status).toBe(200); // GH in the body changes nothing: the entity's own market decides
    expect((spoof.body.receivingAccount as { country: string }).country).toBe("QA");
  });

  it("B4 an amount above the balance is refused", async () => {
    expect((await initiate(enquiryId, 999.0, "partial")).status).toBe(422);
  });

  it("B5 Qatar is never routed to the Ghana Paystack gateway; Ghana records are unaffected by the guard", async () => {
    const qa = await initiateGatewayCheckout({ entityType: "enquiry", entityId: enquiryId, paymentType: "full", country: "GH", userId: CLIENT, email: "client@e2e.test", callbackUrlBase: "http://localhost/x", quotedConvertedAmount: 1 });
    expect(qa).toEqual({ ok: false, error: "gateway-not-available-for-market" });
    sql(`update public.enquiries set payment_country = null where id = '${enquiryId}'`);
    const gh = await initiateGatewayCheckout({ entityType: "enquiry", entityId: enquiryId, paymentType: "full", country: "GH", userId: CLIENT, email: "client@e2e.test", callbackUrlBase: "http://localhost/x", quotedConvertedAmount: 1 });
    expect((gh as { error: string }).error).not.toBe("gateway-not-available-for-market"); // proceeds into the existing Ghana path (stops there: no GHS rate in this DB)
    sql(`update public.enquiries set payment_country = 'QA' where id = '${enquiryId}'`);
    // and the Ghana record gets no bank account offered (none active for GH)
    sql(`update public.enquiries set payment_country = null where id = '${enquiryId}'`);
    expect((await initiate(enquiryId, 274.73)).body.error).toBe("no-active-bank-account");
    sql(`update public.enquiries set payment_country = 'QA' where id = '${enquiryId}'`);
  });
});

// ============================================================================
describe("Scenario C — evidence never completes a payment", () => {
  it("C1 uploading proof moves it to awaiting verification only: nothing is paid, posted or created", async () => {
    const r = await newReceivable();
    const i = await initiate(r.enquiryId, 274.73);
    const id = i.body.paymentId as string;
    const up = await upload(id, { bankReference: "BANK-REF-9", transferDate: TODAY });
    expect(up.status).toBe(200);
    const p = await payment(id);
    expect(p).toMatchObject({ status: "awaiting_verification", client_bank_reference: "BANK-REF-9", client_transfer_date: TODAY, submitted_by: CLIENT });
    expect(String(p.proof_of_payment_asset_path)).toMatch(new RegExp(`^${id}/`));
    expect(p.amount_collected).toBeNull();
    expect(Number((await enquiry(r.enquiryId)).amount_paid ?? 0)).toBe(0);
    expect((await enquiry(r.enquiryId)).payment_status ?? "Pending").not.toBe("Paid");
    expect(await count("bank_transfer_verifications", { payment_id: id })).toBe(0);
    expect(await count("payment_obligations", {})).toBe(0);
    expect(await count("engagements", {})).toBe(0);
  });

  it("C2 only the owner can submit; a file whose content isn't an image/PDF is refused even if it claims to be one", async () => {
    const r = await newReceivable();
    const id = (await initiate(r.enquiryId, 274.73)).body.paymentId as string;
    expect((await upload(id, { user: CLIENT2 })).status).toBe(404);
    expect((await upload(id, { bytes: Buffer.from("not an image at all"), type: "image/png" })).status).toBe(415);
    expect((await payment(id)).status).toBe("pending");
    expect((await upload(id, { transferDate: "2099-01-01" })).status).toBe(422);
  });
});

// ============================================================================
describe("Scenario D — verification: every outcome, every safeguard", () => {
  it("D1 an approval needs the independent check, a bank reference and the right currency; the payer can't verify their own payment", async () => {
    const s = await submitted();
    expect(mustFail(await decide(s.paymentId, { independentCheck: false }))).toMatch(/independently checked/);
    expect(mustFail(await decide(s.paymentId, { bankReference: "" }))).toMatch(/bank/i);
    expect(mustFail(await decide(s.paymentId, { receivedCurrency: "USD", receivedAmount: 274.73 }))).toMatch(/currency received differs/);
    expect(mustFail(await decide(s.paymentId, {}, CLIENT))).toMatch(/Only a Super Admin or authorised Finance/); // the payer isn't a verifier at all
    // separation of duties: even an authorised verifier can't verify evidence THEY submitted on the client's behalf
    const own = await newReceivable();
    const inst = await initiate(own.enquiryId, 274.73);
    as(SUPER, ["super_admin"]);
    const form = new FormData();
    form.append("file", new File([new Uint8Array(PNG)], "receipt.png", { type: "image/png" }));
    form.append("paymentId", inst.body.paymentId as string);
    expect((await submitProof(new NextRequest("http://localhost/api/payments/bank-transfer/proof", { method: "POST", body: form }))).status).toBe(200);
    expect((await payment(inst.body.paymentId as string)).submitted_by).toBe(SUPER);
    expect(mustFail(await decide(inst.body.paymentId as string, { receivedAmount: inst.body.convertedAmount as number }, SUPER))).toMatch(/can't verify a payment you submitted/);
    const p = await payment(s.paymentId);
    expect(p.status).toBe("awaiting_verification");
    expect(await count("bank_transfer_verifications", { payment_id: s.paymentId })).toBe(0);
    expect(Number((await enquiry(s.enquiryId)).amount_paid ?? 0)).toBe(0);
  });

  it("D2 an exact transfer is posted once: receivable, status, receipt job, claim and activity — and a second approval or re-run adds nothing", async () => {
    const s = await submitted();
    const r = must(await decide(s.paymentId, { receivedAmount: s.expectedQar }), "approve");
    expect(r).toMatchObject({ decision: "approved", creditedReferenceUsd: 274.73, partial: false, warnings: [] });
    const p = await payment(s.paymentId);
    expect(p).toMatchObject({ status: "completed", settlement_currency: "QAR", reviewed_by: SUPER });
    expect(Number(p.amount_collected)).toBe(1000.02);
    const e = await enquiry(s.enquiryId);
    expect(Number(e.amount_paid)).toBe(274.73);
    expect(e.payment_status).toBe("Paid");
    const claim = (await db().from("payment_completion_claims").select("completed_at, entity_synced_at, receipt_dispatched_at").eq("payment_id", s.paymentId).eq("outcome", "completed").single()).data!;
    expect(claim.completed_at && claim.entity_synced_at && claim.receipt_dispatched_at).toBeTruthy();
    expect(await count("payment_receipt_jobs", { payment_id: s.paymentId })).toBe(1);
    expect(await count("activity_log", { entity_id: s.paymentId, action: "payment.completed" })).toBe(1);
    expect(await count("activity_log", { entity_id: s.paymentId, action: "payment.bank_transfer_verified" })).toBe(1);
    // duplicate posting is impossible
    expect(mustFail(await decide(s.paymentId, { receivedAmount: s.expectedQar }))).toMatch(/no longer awaiting verification/);
    expect((await finalizeVerifiedBankTransfer(s.paymentId)).outcome).toBe("already-handled");
    expect(Number((await enquiry(s.enquiryId)).amount_paid)).toBe(274.73);
    expect(await count("activity_log", { entity_id: s.paymentId, action: "payment.completed" })).toBe(1);
    // the Crew Support record itself is untouched, and no crew payable was created
    expect((await db().from("crew_support_requests").select("status").eq("id", s.requestId).single()).data!.status).toBe("received");
    expect(await count("payment_obligations", {})).toBe(0);
    expect(await count("engagements", {})).toBe(0);
    expect((await enquiry(s.enquiryId)).crm_stage).not.toBe("booked"); // a payment alone never books a Crew Support enquiry
  });

  it("D3 a part payment credits only what arrived, keeps the true outstanding, and the remainder can be paid and verified separately", async () => {
    const s = await submitted();
    const r = must(await decide(s.paymentId, { receivedAmount: 400 }), "partial");
    expect(r).toMatchObject({ partial: true, creditedReferenceUsd: 109.89 });
    const p = await payment(s.paymentId);
    expect(p).toMatchObject({ status: "completed", payment_type: "partial" });
    expect(Number(p.reference_amount_usd)).toBe(109.89);
    expect(Number(p.converted_amount)).toBe(400);
    const e = await enquiry(s.enquiryId);
    expect(Number(e.amount_paid)).toBe(109.89);
    expect(e.payment_status).toBe("Pending"); // not paid in full
    // the verification record keeps what was ORIGINALLY expected
    const v = (await db().from("bank_transfer_verifications").select("expected_amount, expected_reference_usd, received_amount, credited_reference_usd").eq("payment_id", s.paymentId).single()).data!;
    expect([Number(v.expected_amount), Number(v.expected_reference_usd), Number(v.received_amount), Number(v.credited_reference_usd)]).toEqual([1000.02, 274.73, 400, 109.89]);
    // pay the rest
    as(CLIENT, ["client"]);
    const rest = await initiate(s.enquiryId, 164.84, "balance");
    expect(rest.status).toBe(200);
    expect(rest.body.paymentId).not.toBe(s.paymentId);
    await upload(rest.body.paymentId as string);
    must(await decide(rest.body.paymentId as string, { receivedAmount: rest.body.convertedAmount as number }), "balance");
    const final = await enquiry(s.enquiryId);
    expect(Number(final.amount_paid)).toBe(274.73);
    expect(final.payment_status).toBe("Paid");
  });

  it("D4 more than requested is never silently credited: it needs an explicit acknowledgement, credits only the requested amount, and records the excess", async () => {
    const s = await submitted();
    expect(mustFail(await decide(s.paymentId, { receivedAmount: s.expectedQar + 50 }))).toMatch(/More than the requested amount arrived/);
    expect((await payment(s.paymentId)).status).toBe("awaiting_verification");
    const r = must(await decide(s.paymentId, { receivedAmount: s.expectedQar + 50, acknowledgeExcess: true }), "ack");
    expect(r).toMatchObject({ creditedReferenceUsd: 274.73, excessReceived: 50 });
    expect(Number((await enquiry(s.enquiryId)).amount_paid)).toBe(274.73);
    const v = (await db().from("bank_transfer_verifications").select("excess_received").eq("payment_id", s.paymentId).single()).data!;
    expect(Number(v.excess_received)).toBe(50);
  });

  it("D5 the receivable is never overpaid: crediting beyond what is still owed is refused and nothing is posted", async () => {
    const s = await submitted(274.73, 274.73);
    // another payment already covered most of the receivable
    sql(`insert into public.payments (entity_type, entity_id, user_id, reference_amount_usd, payment_currency, exchange_rate, exchange_rate_source, exchange_rate_locked_at, converted_amount, amount_collected, payment_type, payment_method, status, provider)
         values ('enquiry', '${s.enquiryId}', '${CLIENT}', 200, 'USD', 1, 'ordift', now(), 200, 200, 'deposit', 'bank_transfer', 'completed', 'manual')`);
    expect(mustFail(await decide(s.paymentId, { receivedAmount: s.expectedQar }))).toMatch(/exceed what the receivable still owes/);
    expect((await payment(s.paymentId)).status).toBe("awaiting_verification");
    expect(await count("bank_transfer_verifications", { payment_id: s.paymentId })).toBe(0);
  });

  it("D6 a bank credit can only be posted once per receiving account: the same bank reference can't approve a second payment", async () => {
    const a = await submitted();
    const b = await submitted();
    must(await decide(a.paymentId, { receivedAmount: a.expectedQar, bankReference: "DUP-REF-001" }), "first");
    expect(mustFail(await decide(b.paymentId, { receivedAmount: b.expectedQar, bankReference: "dup-ref-001 " }))).toMatch(/already been used/);
    expect((await payment(b.paymentId)).status).toBe("awaiting_verification");
    expect(Number((await enquiry(b.enquiryId)).amount_paid ?? 0)).toBe(0);
  });

  it("D7 two simultaneous approvals post exactly once", async () => {
    const s = await submitted();
    const results = await Promise.all([
      decide(s.paymentId, { receivedAmount: s.expectedQar, bankReference: "RACE-A-1" }),
      decide(s.paymentId, { receivedAmount: s.expectedQar, bankReference: "RACE-B-1" }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await count("bank_transfer_verifications", { payment_id: s.paymentId, decision: "approved" })).toBe(1);
    expect(Number((await enquiry(s.enquiryId)).amount_paid)).toBe(274.73);
    expect(await count("activity_log", { entity_id: s.paymentId, action: "payment.completed" })).toBe(1);
  });

  it("D8 request-more-information then resubmission; rejection with a client-safe message; both keep a full history and credit nothing", async () => {
    const s = await submitted();
    must(await decide(s.paymentId, { decision: "info_requested", clientMessage: "Please send the statement line showing the credit", internalNotes: "Amount looks right but no reference" }), "info");
    let p = await payment(s.paymentId);
    expect(p).toMatchObject({ status: "additional_info_required", client_visible_note: "Please send the statement line showing the credit" });
    expect(Number((await enquiry(s.enquiryId)).amount_paid ?? 0)).toBe(0);
    expect((await upload(s.paymentId, { bankReference: "FULL-STATEMENT-REF" })).status).toBe(200); // the client can respond
    p = await payment(s.paymentId);
    expect(p).toMatchObject({ status: "awaiting_verification", client_bank_reference: "FULL-STATEMENT-REF", client_visible_note: null });
    must(await decide(s.paymentId, { decision: "rejected", internalNotes: "No credit found in the account", clientMessage: "We couldn't find this transfer" }), "reject");
    p = await payment(s.paymentId);
    expect(p).toMatchObject({ status: "rejected", client_visible_note: "We couldn't find this transfer", review_notes: "No credit found in the account" });
    expect(Number((await enquiry(s.enquiryId)).amount_paid ?? 0)).toBe(0);
    const history = (await db().from("bank_transfer_verifications").select("decision").eq("payment_id", s.paymentId).order("decided_at")).data!.map((r) => r.decision);
    expect(history).toEqual(["info_requested", "rejected"]);
    // rejections and info requests need their reason/message
    const t = await submitted();
    expect(mustFail(await decide(t.paymentId, { decision: "rejected", internalNotes: "" }))).toMatch(/reason/);
    expect(mustFail(await decide(t.paymentId, { decision: "info_requested", clientMessage: "" }))).toMatch(/additional information/);
  });

  it("D9 verification records are append-only", async () => {
    const s = await submitted();
    must(await decide(s.paymentId, { receivedAmount: s.expectedQar }), "approve");
    expect(sqlFails(`begin; set local role authenticated; select set_config('request.jwt.claim.sub', '${SUPER}', true); delete from public.bank_transfer_verifications; rollback;`)).toMatch(/permission denied/);
    expect(sqlFails(`begin; set role service_role; update public.bank_transfer_verifications set received_amount = 1; rollback;`)).toMatch(/permission denied/);
    expect(sqlFails(`begin; set role service_role; delete from public.bank_transfer_verifications; rollback;`)).toMatch(/permission denied/);
  });
});

// ============================================================================
describe("Scenario E — who may verify (Super Admin or an explicit grant — never a general admin)", () => {
  const form = (s: { paymentId: string; expectedQar: number }) => {
    const f = new FormData();
    for (const [k, v] of Object.entries({ paymentId: s.paymentId, decision: "approved", receivedAmount: String(s.expectedQar), receivedCurrency: "QAR", bankReference: `ACT-${Date.now()}-${++counter}`, receivedDate: TODAY, independentCheck: "on", internalNotes: "ok" })) f.set(k, v);
    return f;
  };
  const grant = (extra = "") => sql(`insert into public.authority_grants (profile_id, authority, granted_by, reason ${extra ? ", " + extra.split("=")[0] : ""}) values ('${FIN}', 'finance.bank_transfer.verify', '${SUPER}', 'E2E grant' ${extra ? ", " + extra.split("=")[1] : ""})`);

  it("E1 staff, clients AND a general admin are refused — in the action and, independently, in the database function", async () => {
    const s = await submitted();
    for (const [id, roles] of [[STAFF, ["staff"]], [CLIENT, ["client"]], [ADMIN2, ["admin"]], [FIN, ["staff"]]] as [string, string[]][]) {
      as(id, roles);
      expect((await decideBankTransferAction(null as never, form(s)))?.ok, `${id} must be refused`).toBe(false);
    }
    expect((await payment(s.paymentId)).status).toBe("awaiting_verification");
    // bypassing the app entirely: the database function itself refuses an unauthorised verifier
    for (const id of [ADMIN2, STAFF, FIN]) expect(mustFail(await decide(s.paymentId, { receivedAmount: s.expectedQar }, id))).toMatch(/Only a Super Admin or authorised Finance/);
    expect(await count("bank_transfer_verifications", { payment_id: s.paymentId })).toBe(0);
  });

  it("E2 a named Finance person with the explicit grant can verify; an expired or revoked grant stops working immediately", async () => {
    grant();
    const s = await submitted();
    as(FIN, ["staff"]);
    expect((await decideBankTransferAction(null as never, form(s)))?.ok).toBe(true);
    expect((await payment(s.paymentId)).reviewed_by).toBe(FIN);
    expect(await count("activity_log", { entity_id: s.paymentId, action: "payment.bank_transfer_verified", actor_user_id: FIN })).toBe(1);
    sql(`update public.authority_grants set revoked_at = now(), revoked_by = '${SUPER}', revoked_reason = 'E2E' where profile_id = '${FIN}'`);
    const t = await submitted();
    as(FIN, ["staff"]);
    expect((await decideBankTransferAction(null as never, form(t)))?.ok).toBe(false);
    expect(mustFail(await decide(t.paymentId, { receivedAmount: t.expectedQar }, FIN))).toMatch(/Only a Super Admin or authorised Finance/);
    grant("expires_at=now() - interval '1 minute'");
    expect(mustFail(await decide(t.paymentId, { receivedAmount: t.expectedQar }, FIN))).toMatch(/Only a Super Admin or authorised Finance/);
    expect((await payment(t.paymentId)).status).toBe("awaiting_verification");
  });

  it("E3 the proof file opens only for Super Admin or a granted verifier — not a general admin — through a signed link, and each view is audited", async () => {
    const s = await submitted();
    const call = () => viewProof(new NextRequest(`http://localhost/admin/payments/${s.paymentId}/proof`), { params: Promise.resolve({ id: s.paymentId }) });
    for (const [id, roles] of [[STAFF, ["staff"]], [CLIENT, ["client"]], [ADMIN2, ["admin"]]] as [string, string[]][]) {
      as(id, roles);
      expect((await call()).status, id).toBe(403);
    }
    as(SUPER, ["super_admin"]);
    const ok = await call();
    expect(ok.status).toBe(302);
    expect(ok.headers.get("location")).toMatch(/^https:\/\/signed\.example\//);
    expect(await count("activity_log", { entity_id: s.paymentId, action: "payment.proof_viewed" })).toBe(1);
  });
});

// ============================================================================
describe("Scenario F — history is preserved when the receiving account changes", () => {
  it("F1 a payment issued against the personal account still verifies against it after the corporate account becomes the default and the personal one is deactivated", async () => {
    const s = await submitted(); // issued while A is the default
    const before = (await payment(s.paymentId)).receiving_account_snapshot as { iban: string; classification: string };
    expect(before).toMatchObject({ iban: IBAN_A, classification: "personal" });
    must(await setDefaultBankAccount({ id: accountB, actorUserId: SUPER }), "default B");
    must(await deactivateBankAccount({ id: accountA, reason: "Corporate account is now live", actorUserId: SUPER }), "deactivate A");
    // new instructions go to B …
    const next = await newReceivable();
    const i = await initiate(next.enquiryId, 274.73);
    expect((await payment(i.body.paymentId as string)).receiving_bank_account_id).toBe(accountB);
    expect(((await payment(i.body.paymentId as string)).receiving_account_snapshot as { classification: string }).classification).toBe("corporate");
    // … while the earlier payment is unchanged and still verifiable
    const after = await payment(s.paymentId);
    expect(after.receiving_bank_account_id).toBe(accountA);
    expect(after.receiving_account_snapshot).toEqual(before);
    must(await decide(s.paymentId, { receivedAmount: s.expectedQar }), "verify old");
    expect((await payment(s.paymentId)).status).toBe("completed");
    expect((await db().from("bank_accounts").select("is_active").eq("id", accountA).single()).data).toMatchObject({ is_active: false });
  });
});

// ============================================================================
describe("Scenario G — the rollback script refuses to destroy real bank-transfer data", () => {
  it("G1 down_0151 aborts while verifications/payments carry 0151 data", () => {
    const out = sqlFails(execSync("cat supabase/rollbacks/down_0151.sql").toString());
    expect(out).toMatch(/Refusing: bank_transfer_verifications has rows/);
  });
});

// ============================================================================
describe("Scenario H — switching a client's payment market while a Paystack attempt is unfinished (Bright's situation)", () => {
  it("H1 the open gateway attempt is left untouched; the switch needs an explicit acknowledgement and is audited; an open bank-transfer attempt blocks it", async () => {
    const r = await newReceivable();
    sql(`update public.enquiries set payment_country = null where id = '${r.enquiryId}'`);
    sql(`insert into public.payments (record_id, entity_type, entity_id, user_id, reference_amount_usd, payment_currency, exchange_rate, exchange_rate_source, exchange_rate_locked_at, converted_amount, payment_type, payment_method, status, provider, gateway_reference)
         values ('PAY-H1-OPEN', 'enquiry', '${r.enquiryId}', '${CLIENT}', 274.73, 'GHS', 11.0898, 'ordift', now(), 3046.70, 'full', 'gateway', 'pending', 'paystack', 'PAY-H1-OPEN')`);
    const form = (ack: boolean) => { const f = new FormData(); f.set("enquiryId", r.enquiryId); f.set("paymentCountry", "QA"); if (ack) f.set("acknowledgeOpenGatewayAttempt", "on"); return f; };
    as(ADMIN2, ["admin"]);
    expect((await setPaymentMarketAction(null as never, form(true)))?.ok).toBe(false); // only a Super Admin
    as(SUPER, ["super_admin"]);
    const refused = await setPaymentMarketAction(null as never, form(false));
    expect(refused?.ok).toBe(false);
    expect(JSON.stringify(refused)).toMatch(/PAY-H1-OPEN/);
    expect((await enquiry(r.enquiryId)).payment_country).toBeNull();
    expect((await setPaymentMarketAction(null as never, form(true)))?.ok).toBe(true);
    expect((await enquiry(r.enquiryId)).payment_country).toBe("QA");
    const gw = (await db().from("payments").select("status, converted_amount, payment_currency").eq("record_id", "PAY-H1-OPEN").single()).data!;
    expect(gw).toMatchObject({ status: "pending", payment_currency: "GHS" }); // untouched
    expect(await count("activity_log", { entity_id: r.enquiryId, action: "enquiry.payment_market_set" })).toBe(1);
    // the Qatar bank transfer can proceed alongside the unfinished gateway row — no duplicate is created by it
    const inst = await initiate(r.enquiryId, 274.73);
    expect(inst.status, JSON.stringify(inst.body)).toBe(200);
    expect(await count("payments", { entity_id: r.enquiryId })).toBe(2);
    // now an open bank-transfer attempt blocks a market change
    sql(`update public.enquiries set payment_country = 'QA' where id = '${r.enquiryId}'`);
    as(SUPER, ["super_admin"]);
    const f2 = new FormData(); f2.set("enquiryId", r.enquiryId); f2.set("paymentCountry", ""); f2.set("acknowledgeOpenGatewayAttempt", "on");
    expect(JSON.stringify(await setPaymentMarketAction(null as never, f2))).toMatch(/bank-transfer attempt is still open/);
  });
});
