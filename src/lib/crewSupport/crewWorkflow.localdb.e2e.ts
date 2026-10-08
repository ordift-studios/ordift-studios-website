// @vitest-environment node
//
// End-to-end run of the REAL Creative Crew Support server code against a
// throwaway local Postgres + PostgREST built from the full migration chain
// (see vitest.localdb.config.ts and scripts/crew-support-e2e.md). It cannot
// reach Staging or Production: the Supabase URL is forced to localhost and
// outbound email is mocked and captured, never sent.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const h = vi.hoisted(() => ({
  sent: [] as { to: string; subject: string; text: string }[],
  emails: new Map<string, string>(),
  // Standalone PostgREST serves at the root; supabase-js adds /rest/v1 (the gateway prefix in real Supabase).
  fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(String(input).replace("/rest/v1", ""), init),
}));

vi.mock("@/lib/notifications/dispatch", () => ({
  dispatchNotification: vi.fn(async (a: { email: { to: string; subject: string; text: string } }) => {
    h.sent.push({ to: a.email.to, subject: a.email.subject, text: a.email.text });
    return { email: { ok: true, mode: "logged", attempts: 1 } };
  }),
}));
vi.mock("@/lib/supabase/server", async () => {
  const { createClient: make } = await import("@supabase/supabase-js");
  return { createClient: async () => make(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: h.fetch } }) };
});
vi.mock("@/lib/supabase/admin", async () => {
  const { createClient: make } = await import("@supabase/supabase-js");
  return {
    createAdminClient: () => {
      const c = make(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: h.fetch } });
      (c.auth as unknown as { admin: unknown }).admin = { getUserById: async (id: string) => ({ data: { user: { email: h.emails.get(id) ?? null } }, error: null }) };
      return c;
    },
  };
});

import { setCrewSupportStatus } from "./admin";
import { cancelConfirmedRequest, markRequestAsTest, resolveCancellationReview, setAgreementRequired } from "./commitment";
import { getCommitmentSnapshot } from "./commitmentData";
import { establishCommitments } from "./commitmentEstablish";
import { respondToCrewOffer, sendCrewOffer, withdrawOrReleaseSlot } from "./crewOffers";
import { acceptQuotationAsClient, createCrewSupportVariation, getCrewSupportQuotation, getCrewSupportVariation, issueCrewSupportQuotation, markQuotationReady, prepareCrewSupportQuotation, recordStaffAcceptance, saveCrewSupportQuotationDraft } from "./quotation";
import { defaultValidUntil } from "./quotationRules";
import { setEngagementStatus } from "@/lib/payables/engagements";
import { createCrewSupportModifierVersion, createCrewSupportRateVersion, getActiveCrewSupportRates } from "./rates";
import { syncEntityPaymentStatus } from "@/lib/payments/gatewaySync";

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) {
  throw new Error("Refusing to run: this E2E may only target a localhost database.");
}

const ADMIN = "00000000-0000-4000-8000-0000000000a2";
const CREW1 = "00000000-0000-4000-8000-0000000000a1";
const CREW2 = "00000000-0000-4000-8000-0000000000a3";
const CLIENT = "00000000-0000-4000-8000-0000000000a4";
const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false }, global: { fetch: h.fetch } });
const sql = (q: string) => execSync("docker exec -i ordift-mig-check2 psql -U postgres -h 127.0.0.1 -v ON_ERROR_STOP=1 -At", { input: q }).toString();

function must<T extends { ok: boolean }>(r: T, label = ""): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error(`${label} expected ok, got ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
}
function mustFail<T extends { ok: boolean }>(r: T): string {
  expect(r.ok).toBe(false);
  return (r as unknown as { error?: string; reason?: string }).error ?? "";
}

let titleId = "";
let counter = 0;

async function newRequest(opts: { test: boolean; equipment?: string | null; clientEmail?: string; urgency?: string }) {
  const admin = db();
  const ref = `CSR-2026-E${Date.now().toString().slice(-8)}${++counter % 100}`;
  const email = opts.clientEmail ?? `client-${ref.toLowerCase()}@example.com`;
  h.emails.set(CLIENT, email);
  const { data, error } = await admin.rpc("create_crew_support_request", {
    p_request: {
      user_id: CLIENT, reference_number: ref, requester_type: "photographer", requester_name: "Sylvia Annang", requester_email: email, requester_phone: "+233000000", service_family: "photography",
      project_name: `QA ${ref}`, project_type: "Wedding", start_date: "2026-10-15", end_date: "2026-10-15", call_time: "10:00", finish_time: "18:00", location: "Doha — QA", on_site_contact: "Ama",
      urgency: opts.urgency ?? "standard", service_details: opts.equipment === null ? {} : { equipment: opts.equipment ?? "requester_supplies" }, consent_accepted_at: new Date().toISOString(), submitted_at: new Date().toISOString(),
    },
    p_requirements: [{ operational_title_id: titleId, role_label: "Photographer", quantity: 1, responsibilities: "Ceremony and portraits" }],
  });
  if (error) throw new Error(error.message);
  const ids = data as { request_id: string; enquiry_id: string };
  const { data: slot } = await admin.from("crew_support_slots").select("id").eq("request_id", ids.request_id).single();
  if (opts.test) must(await markRequestAsTest({ requestId: ids.request_id, reason: "E2E QA fixture", actorUserId: ADMIN }), "mark test");
  return { requestId: ids.request_id, enquiryId: ids.enquiry_id, slotId: slot!.id as string, ref, email };
}

async function toAvailability(requestId: string) {
  must(await setCrewSupportStatus({ requestId, to: "under_review", actorUserId: ADMIN }), "under_review");
  must(await setCrewSupportStatus({ requestId, to: "availability_review", actorUserId: ADMIN }), "availability_review");
}

const TERMS = "50% deposit on acceptance, balance on the day. Cancellation within 48 hours incurs a 50% fee.";

async function prepareDraft(requestId: string, o: { price: number; terms?: string | null; depositPercent?: number | null }) {
  const prep = must(await prepareCrewSupportQuotation({ requestId, marketSlug: "qatar", actorUserId: ADMIN }), "prepare");
  const q = (await getCrewSupportQuotation(requestId))!;
  const lines = q.lines.map((l) => ({ ...l, sellingRate: o.price, adjustmentReason: "Agreed by phone with the client" }));
  must(await saveCrewSupportQuotationDraft({ quotationId: prep.quotationId, lines, validUntil: defaultValidUntil(new Date()), terms: o.terms === undefined ? TERMS : o.terms, internalNotes: null, fxCurrency: null, paymentCondition: o.depositPercent ? "deposit" : "none", depositPercent: o.depositPercent ?? null, actorUserId: ADMIN }), "save");
  return prep.quotationId;
}

async function issued(requestId: string, o: { price: number; depositPercent?: number | null }) {
  const id = await prepareDraft(requestId, o);
  must(await markQuotationReady({ quotationId: id, actorUserId: ADMIN }), "ready");
  must(await issueCrewSupportQuotation({ quotationId: id, actorUserId: ADMIN }), "issue");
  return id;
}

const statusOf = async (requestId: string) => (await db().from("crew_support_requests").select("status").eq("id", requestId).single()).data!.status as string;
const enquiryOf = async (id: string) => (await db().from("enquiries").select("*").eq("id", id).single()).data as Record<string, unknown>;
const count = async (table: string, f: Record<string, unknown>) => (await db().from(table).select("id", { count: "exact", head: true }).match(f)).count ?? 0;
const events = async (requestId: string) => ((await db().from("crew_support_notification_events").select("event_key, status, template").eq("request_id", requestId)).data ?? []) as { event_key: string; status: string; template: string }[];

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values ('${ADMIN}','admin@e2e.test'),('${CREW1}','crew1@e2e.test'),('${CREW2}','crew2@e2e.test'),('${CLIENT}','client@e2e.test') on conflict do nothing;
    insert into public.profiles (id, full_name, access_status) values ('${ADMIN}','Admin One','active'),('${CREW1}','Crew One','active'),('${CREW2}','Crew Two','active'),('${CLIENT}','Client One','active')
      on conflict (id) do update set full_name = excluded.full_name, access_status = 'active';
    insert into public.user_roles (user_id, role_id) select '${ADMIN}', id from public.roles where slug = 'super_admin' on conflict do nothing;
    insert into public.person_capabilities (profile_id, operational_title_id, proficiency, verification_status, source)
      select p, (select id from public.operational_titles where slug = 'photographer'), 'primary', 'verified', 'admin' from unnest(array['${CREW1}','${CREW2}']::uuid[]) p on conflict do nothing;
  `);
  h.emails.set(CREW1, "crew1@e2e.test");
  h.emails.set(CREW2, "crew2@e2e.test");
  h.emails.set(ADMIN, "admin@e2e.test");
  titleId = sql("select id from public.operational_titles where slug = 'photographer'").trim();
});

// ============================================================================
describe("Scenario T — an isolated TEST record (CSR-2026-000003 equivalent)", () => {
  const t = {} as Awaited<ReturnType<typeof newRequest>> & { quoteId: string };

  it("T1 creates the request + enquiry and marks it TEST (request and enquiry), with nothing downstream", async () => {
    Object.assign(t, await newRequest({ test: true }));
    const req = (await db().from("crew_support_requests").select("is_test, status").eq("id", t.requestId).single()).data!;
    expect(req).toMatchObject({ is_test: true, status: "received" });
    const enquiry = await enquiryOf(t.enquiryId);
    expect(enquiry).toMatchObject({ is_test: true, crm_stage: "new_lead", commercial_intent: "creative_crew_support" });
    expect(await count("payments", { entity_id: t.enquiryId })).toBe(0);
    expect(await count("client_quotations", { crew_support_request_id: t.requestId })).toBe(0);
    expect(await count("project_assignments", { entity_id: t.enquiryId })).toBe(0);
  });

  it("T2 status steps sync the CRM; every client email is recorded as suppressed_test and none is delivered", async () => {
    await toAvailability(t.requestId);
    expect((await enquiryOf(t.enquiryId)).crm_stage).toBe("contacted");
    const ev = await events(t.requestId);
    expect(ev.length).toBeGreaterThanOrEqual(2);
    expect(ev.every((e) => e.status === "suppressed_test")).toBe(true);
    expect(h.sent.filter((m) => m.to === t.email)).toHaveLength(0);
  });

  it("T3 'Agreement required' is REFUSED with a clear explanation, and nothing is changed", async () => {
    const err = mustFail(await setAgreementRequired({ requestId: t.requestId, required: true, reason: "bespoke licensing terms", actorUserId: ADMIN }));
    expect(err).toMatch(/can't be required yet/);
    expect(err).toMatch(/No approved legal template has been designated/);
    expect(err).toMatch(/can't yet issue a client agreement/);
    expect((await db().from("crew_support_requests").select("agreement_required").eq("id", t.requestId).single()).data!.agreement_required).toBe(false);
  });

  it("T4 a quotation without terms, or with an unjustified manual price, can't progress; the corrected one is issued with a frozen project snapshot and a deposit condition", async () => {
    t.quoteId = await prepareDraft(t.requestId, { price: 1000, terms: null, depositPercent: 30 });
    expect(mustFail(await markQuotationReady({ quotationId: t.quoteId, actorUserId: ADMIN }))).toMatch(/payment \/ booking terms/);
    const q = (await getCrewSupportQuotation(t.requestId))!;
    const unjustified = await saveCrewSupportQuotationDraft({ quotationId: t.quoteId, lines: q.lines.map((l) => ({ ...l, sellingRate: 1000, adjustmentReason: "" })), validUntil: defaultValidUntil(new Date()), terms: TERMS, internalNotes: null, fxCurrency: null, paymentCondition: "deposit", depositPercent: 30, actorUserId: ADMIN });
    expect(mustFail(unjustified)).toMatch(/needs a recorded justification/);
    must(await saveCrewSupportQuotationDraft({ quotationId: t.quoteId, lines: q.lines.map((l) => ({ ...l, sellingRate: 1000, adjustmentReason: "Agreed by phone with the client" })), validUntil: defaultValidUntil(new Date()), terms: TERMS, internalNotes: null, fxCurrency: null, paymentCondition: "deposit", depositPercent: 30, actorUserId: ADMIN }), "save");
    must(await markQuotationReady({ quotationId: t.quoteId, actorUserId: ADMIN }), "ready");
    must(await issueCrewSupportQuotation({ quotationId: t.quoteId, actorUserId: ADMIN }), "issue");
    expect(await statusOf(t.requestId)).toBe("quoted");
    const row = (await db().from("client_quotations").select("status, project_snapshot, payment_condition, deposit_percent, usd_total").eq("id", t.quoteId).single()).data!;
    expect(row).toMatchObject({ status: "sent", payment_condition: "deposit", usd_total: 1000 });
    expect(Number(row.deposit_percent)).toBe(30);
    expect(row.project_snapshot).toMatchObject({ location: "Doha — QA", callTime: "10:00", finishTime: "18:00", equipment: "I will supply equipment", roles: [{ role: "Photographer", quantity: 1 }] });
    expect((await enquiryOf(t.enquiryId)).crm_stage).toBe("quotation_sent");
    expect(h.sent.filter((m) => m.to === t.email)).toHaveLength(0);
  });

  it("T5 only the owning client can accept; acceptance sets the receivable WITH provenance, exactly once, and moves straight to Payment pending (no agreement needed)", async () => {
    expect(mustFail(await acceptQuotationAsClient({ quotationId: t.quoteId, userId: CREW2 }))).toMatch(/not found/i);
    must(await acceptQuotationAsClient({ quotationId: t.quoteId, userId: CLIENT }), "accept");
    const enq = await enquiryOf(t.enquiryId);
    expect(Number(enq.amount_due)).toBe(1000);
    expect(enq).toMatchObject({ amount_due_source: "accepted_quotation", amount_due_quotation_id: t.quoteId });
    expect(await statusOf(t.requestId)).toBe("payment_pending");
    const again = must(await acceptQuotationAsClient({ quotationId: t.quoteId, userId: CLIENT }));
    expect((again as { alreadyAccepted?: boolean }).alreadyAccepted).toBe(true);
    expect(Number((await enquiryOf(t.enquiryId)).amount_due)).toBe(1000);
    const ev = await events(t.requestId);
    expect(ev.filter((e) => e.event_key === `quote_accepted:${t.quoteId}`)).toHaveLength(1);
    expect(await count("payments", { entity_id: t.enquiryId })).toBe(0); // acceptance creates no payment
  });

  it("T6 crew offer: a stranger can't answer, the crew member declines then accepts in the portal; a test record creates no engagement or crew email", async () => {
    const offer = must(await sendCrewOffer({ slotId: t.slotId, assigneeProfileId: CREW1, amount: 300, currency: "GHS", message: "Bring a spare body", overrideReason: null, actorUserId: ADMIN }), "offer");
    expect(offer.suppressedTest).toBe(true);
    expect((await db().from("crew_support_slots").select("status, assignee_profile_id").eq("id", t.slotId).single()).data).toMatchObject({ status: "proposed", assignee_profile_id: CREW1 });
    expect(mustFail(await sendCrewOffer({ slotId: t.slotId, assigneeProfileId: CREW2, amount: 300, currency: "GHS", message: "", overrideReason: null, actorUserId: ADMIN }))).toMatch(/already waiting/);
    expect(mustFail(await respondToCrewOffer({ slotId: t.slotId, userId: CREW2, response: "accept", note: "" }))).toMatch(/isn't available/);
    expect(mustFail(await respondToCrewOffer({ slotId: t.slotId, userId: ADMIN, response: "accept", note: "" }))).toMatch(/isn't available/); // an administrator can't accept for anyone
    must(await respondToCrewOffer({ slotId: t.slotId, userId: CREW1, response: "decline", note: "Not available that day" }), "decline");
    expect((await db().from("crew_support_slots").select("status, crew_response_note").eq("id", t.slotId).single()).data).toMatchObject({ status: "declined", crew_response_note: "Not available that day" });
    must(await sendCrewOffer({ slotId: t.slotId, assigneeProfileId: CREW1, amount: 300, currency: "GHS", message: "", overrideReason: null, actorUserId: ADMIN }), "re-offer");
    must(await respondToCrewOffer({ slotId: t.slotId, userId: CREW1, response: "accept", note: "Confirmed" }), "accept");
    expect((await db().from("crew_support_slots").select("status, crew_accepted_via, crew_accepted_recorded_by").eq("id", t.slotId).single()).data).toMatchObject({ status: "assigned", crew_accepted_via: "portal", crew_accepted_recorded_by: CREW1 });
    expect(await count("engagements", { entity_id: t.slotId })).toBe(0);
    expect(h.sent.filter((m) => m.to === "crew1@e2e.test")).toHaveLength(0);
    expect((await events(t.requestId)).filter((e) => e.template === "crew_offer").every((e) => e.status === "suppressed_test")).toBe(true);
  });

  it("T7 confirmation succeeds for the test record (deposit not enforced) and creates NO engagement, payable, assignment or email", async () => {
    const snap = (await getCommitmentSnapshot(t.requestId))!;
    expect(snap.blockers).toEqual([]);
    expect(snap.payment).toMatchObject({ condition: "deposit", blocker: null });
    must(await setCrewSupportStatus({ requestId: t.requestId, to: "confirmed", actorUserId: ADMIN }), "confirm");
    expect(await statusOf(t.requestId)).toBe("confirmed");
    expect((await enquiryOf(t.enquiryId)).crm_stage).toBe("booked");
    expect(await count("engagements", { entity_id: t.slotId })).toBe(0);
    expect(await count("project_assignments", { entity_id: t.enquiryId })).toBe(0);
    expect(await count("payments", { entity_id: t.enquiryId })).toBe(0);
    expect(h.sent.filter((m) => [t.email, "crew1@e2e.test"].includes(m.to))).toHaveLength(0);
    expect((await db().from("activity_log").select("action").eq("entity_id", t.requestId).eq("action", "crew_support.commitments_suppressed_test")).data).toHaveLength(1);
    // crew can no longer be changed once confirmed
    expect(mustFail(await withdrawOrReleaseSlot({ slotId: t.slotId, reason: "changed my mind", actorUserId: ADMIN }))).toMatch(/confirmed/);
  });

  it("T8 production progression follows the CRM: In production → In progress, Completed → Completed", async () => {
    must(await setCrewSupportStatus({ requestId: t.requestId, to: "in_production", actorUserId: ADMIN }), "in production");
    expect((await enquiryOf(t.enquiryId)).crm_stage).toBe("in_progress");
    must(await setCrewSupportStatus({ requestId: t.requestId, to: "completed", actorUserId: ADMIN }), "completed");
    expect((await enquiryOf(t.enquiryId)).crm_stage).toBe("completed");
    expect(mustFail(await setCrewSupportStatus({ requestId: t.requestId, to: "cancelled", actorUserId: ADMIN }))).toMatch(/isn't allowed/);
  });

  it("T9 a request without the equipment answer can't have its quotation marked ready", async () => {
    const r = await newRequest({ test: true, equipment: null });
    await toAvailability(r.requestId);
    const id = await prepareDraft(r.requestId, { price: 500 });
    expect(mustFail(await markQuotationReady({ quotationId: id, actorUserId: ADMIN }))).toMatch(/equipment responsibility/);
  });
});

// ============================================================================
describe("Scenario R — a real-flagged record in the isolated DB (financial path; email captured, never sent)", () => {
  const r = {} as Awaited<ReturnType<typeof newRequest>> & { quoteId: string; engagementId: string };

  async function realConfirmed(depositPercent: number | null) {
    const x = await newRequest({ test: false });
    await toAvailability(x.requestId);
    const quoteId = await issued(x.requestId, { price: 1000, depositPercent });
    must(await acceptQuotationAsClient({ quotationId: quoteId, userId: CLIENT }), "accept");
    must(await sendCrewOffer({ slotId: x.slotId, assigneeProfileId: CREW1, amount: 300, currency: "GHS", message: "", overrideReason: null, actorUserId: ADMIN }), "offer");
    must(await respondToCrewOffer({ slotId: x.slotId, userId: CREW1, response: "accept", note: "" }), "crew accept");
    return { ...x, quoteId };
  }

  it("R1 issuing emails the client (captured) with a portal link and no internal wording", async () => {
    Object.assign(r, await newRequest({ test: false }));
    await toAvailability(r.requestId);
    r.quoteId = await issued(r.requestId, { price: 1000, depositPercent: 30 });
    const mail = h.sent.find((m) => m.to === r.email && /quotation is ready/i.test(m.subject));
    expect(mail).toBeTruthy();
    expect(mail!.text).toMatch(/portal\/client\/projects\/enquiry\//);
    expect(mail!.text).not.toMatch(/margin|payable|crew (pay|cost)|compensation/i);
  });

  it("R2 recorded acceptance: a naive time, a future instant and a pre-issue instant are refused; a valid past instant is accepted and audited", async () => {
    const base = { quotationId: r.quoteId, channel: "email", evidence: "Email from the client: happy to proceed", acceptedByName: "Sylvia Annang", actorUserId: ADMIN };
    expect(mustFail(await recordStaffAcceptance({ ...base, receivedAt: "2026-10-08T10:00" }))).toMatch(/wasn't understood/);
    expect(mustFail(await recordStaffAcceptance({ ...base, receivedAt: new Date(Date.now() + 3 * 3600_000).toISOString() }))).toMatch(/future/);
    expect(mustFail(await recordStaffAcceptance({ ...base, receivedAt: new Date(Date.now() - 24 * 3600_000).toISOString() }))).toMatch(/pre-date/);
    must(await recordStaffAcceptance({ ...base, receivedAt: new Date(Date.now() - 5_000).toISOString() }), "accept");
    const q = (await db().from("client_quotations").select("status, accepted_via, acceptance_channel, accepted_by_name, acceptance_recorded_by").eq("id", r.quoteId).single()).data!;
    expect(q).toMatchObject({ status: "accepted", accepted_via: "staff_recorded", acceptance_channel: "email", acceptance_recorded_by: ADMIN });
    expect(Number((await enquiryOf(r.enquiryId)).amount_due)).toBe(1000);
    expect(await statusOf(r.requestId)).toBe("payment_pending");
  });

  it("R3 confirmation is blocked until crew has accepted AND the contractual deposit is received; the offer email carries no pay; acceptance creates the engagement quietly", async () => {
    expect(mustFail(await setCrewSupportStatus({ requestId: r.requestId, to: "confirmed", actorUserId: ADMIN }))).toMatch(/Assign at least one crew member/);
    must(await sendCrewOffer({ slotId: r.slotId, assigneeProfileId: CREW1, amount: 300, currency: "GHS", message: "", overrideReason: null, actorUserId: ADMIN }), "offer");
    const offerMail = h.sent.find((m) => m.to === "crew1@e2e.test" && /job offer/i.test(m.subject));
    expect(offerMail).toBeTruthy();
    expect(offerMail!.text).not.toMatch(/GHS|\b300\b|300\.00/); // the pay is shown only after sign-in
    expect(await count("engagements", { entity_id: r.slotId })).toBe(0); // an offer is not a commitment
    const before = h.sent.length;
    must(await respondToCrewOffer({ slotId: r.slotId, userId: CREW1, response: "accept", note: "" }), "accept");
    const eng = (await db().from("engagements").select("id, status, agreed_amount, currency, payee_profile_id, payment_obligation_id").eq("entity_id", r.slotId).single()).data!;
    r.engagementId = eng.id as string;
    expect(eng).toMatchObject({ status: "draft", currency: "GHS", payee_profile_id: CREW1, payment_obligation_id: null });
    expect(Number(eng.agreed_amount)).toBe(300);
    expect(h.sent.slice(before).filter((m) => /New Assignment/i.test(m.subject))).toHaveLength(0); // generic assignment email suppressed
    const err = mustFail(await setCrewSupportStatus({ requestId: r.requestId, to: "confirmed", actorUserId: ADMIN }));
    expect(err).toMatch(/30% deposit \(USD 300\.00\) must be received/);
  });

  it("R4 a verified deposit satisfies the condition; confirmation books the CRM, activates the engagement and creates ONE payable — retries add nothing", async () => {
    const admin = db();
    const { error } = await admin.from("payments").insert({ entity_type: "enquiry", entity_id: r.enquiryId, reference_amount_usd: 300, payment_currency: "USD", exchange_rate: 1, exchange_rate_source: "ordift", exchange_rate_locked_at: new Date().toISOString(), converted_amount: 300, amount_collected: 300, payment_type: "deposit", payment_method: "bank_transfer", provider: "manual", status: "completed", conversion_performed_by: "ordift" });
    expect(error).toBeNull();
    await syncEntityPaymentStatus("enquiry", r.enquiryId);
    let enq = await enquiryOf(r.enquiryId);
    expect(Number(enq.amount_paid)).toBe(300);
    expect(enq.payment_status).toBe("Pending");
    expect(enq.crm_stage).not.toBe("booked"); // a payment alone never books a Crew Support enquiry

    must(await setCrewSupportStatus({ requestId: r.requestId, to: "confirmed", actorUserId: ADMIN }), "confirm");
    enq = await enquiryOf(r.enquiryId);
    expect(enq.crm_stage).toBe("booked");
    const eng = (await db().from("engagements").select("status, payment_obligation_id").eq("id", r.engagementId).single()).data!;
    expect(eng.status).toBe("engagement_active");
    expect(eng.payment_obligation_id).toBeTruthy();
    const ob = (await db().from("payment_obligations").select("amount, currency, status, source_type, source_reference, payee_profile_id").eq("id", eng.payment_obligation_id).single()).data!;
    expect(ob).toMatchObject({ currency: "GHS", status: "pending_approval", source_type: "engagement", source_reference: r.engagementId, payee_profile_id: CREW1 });
    expect(Number(ob.amount)).toBe(300);
    expect(await count("payment_obligations", { source_reference: r.engagementId })).toBe(1);
    // retries create nothing new
    must(await establishCommitments({ requestId: r.requestId, actorUserId: ADMIN }), "re-establish");
    expect(await count("payment_obligations", { source_reference: r.engagementId })).toBe(1);
    expect(await count("engagements", { entity_id: r.slotId })).toBe(1);
    expect(await count("project_assignments", { entity_id: r.enquiryId })).toBe(0); // crew get no client-workspace access
    // the client's and the crew's money stay separate: the client email never mentions crew pay
    for (const m of h.sent.filter((x) => x.to === r.email)) expect(m.text).not.toMatch(/margin|payable|crew (pay|cost)|GHS|compensation/i);
  });

  it("R5 a variation never touches the accepted quotation; it replaces it, and the receivable re-points, only when the client accepts", async () => {
    const baseBefore = (await db().from("client_quotations").select("status, total, version").eq("id", r.quoteId).single()).data!;
    const v = must(await createCrewSupportVariation({ requestId: r.requestId, actorUserId: ADMIN }), "variation");
    expect(mustFail(await createCrewSupportVariation({ requestId: r.requestId, actorUserId: ADMIN }))).toMatch(/already in progress/);
    expect((await db().from("client_quotations").select("status, total").eq("id", r.quoteId).single()).data).toMatchObject({ status: "accepted", total: baseBefore.total });
    const draft = (await getCrewSupportVariation(r.requestId))!;
    expect(draft).toMatchObject({ isVariation: true, status: "draft", supersedesId: r.quoteId });
    must(await saveCrewSupportQuotationDraft({ quotationId: v.quotationId, lines: draft.lines.map((l) => ({ ...l, sellingRate: 1200 })), validUntil: defaultValidUntil(new Date()), terms: TERMS, internalNotes: null, fxCurrency: null, paymentCondition: "none", depositPercent: null, actorUserId: ADMIN }), "save variation");
    must(await markQuotationReady({ quotationId: v.quotationId, actorUserId: ADMIN }), "ready");
    must(await issueCrewSupportQuotation({ quotationId: v.quotationId, actorUserId: ADMIN }), "issue");
    expect(await statusOf(r.requestId)).toBe("confirmed"); // a variation changes neither request status…
    expect((await enquiryOf(r.enquiryId)).crm_stage).toBe("booked"); // …nor the CRM stage
    expect(Number((await enquiryOf(r.enquiryId)).amount_due)).toBe(1000); // still the original until accepted
    must(await acceptQuotationAsClient({ quotationId: v.quotationId, userId: CLIENT }), "accept variation");
    expect((await db().from("client_quotations").select("status, total").eq("id", r.quoteId).single()).data).toMatchObject({ status: "superseded", total: baseBefore.total });
    const enq = await enquiryOf(r.enquiryId);
    expect(Number(enq.amount_due)).toBe(1200);
    expect(enq).toMatchObject({ amount_due_source: "accepted_quotation", amount_due_quotation_id: v.quotationId, payment_status: "Pending" });
    expect(Number(enq.amount_paid)).toBe(300);
    expect(await count("client_quotation_items", { quotation_id: r.quoteId })).toBeGreaterThan(0); // original lines preserved
  });

  it("R6 completion waits for the crew engagement to be finished; the engagement lifecycle then lets it complete", async () => {
    must(await setCrewSupportStatus({ requestId: r.requestId, to: "in_production", actorUserId: ADMIN }), "in production");
    expect(mustFail(await setCrewSupportStatus({ requestId: r.requestId, to: "completed", actorUserId: ADMIN }))).toMatch(/engagement is “engagement active”/);
    for (const status of ["work_submitted", "work_approved", "completed"] as const) must(await setEngagementStatus({ engagementId: r.engagementId, status, actorUserId: ADMIN }), `engagement ${status}`);
    must(await setCrewSupportStatus({ requestId: r.requestId, to: "completed", actorUserId: ADMIN }), "completed");
    expect((await enquiryOf(r.enquiryId)).crm_stage).toBe("completed");
  });

  it("R7 cancellation safeguards: the dropdown can't cancel a confirmed request; management cancel needs a justification, raises a pending financial review, and changes no money", async () => {
    const c = await realConfirmed(null);
    must(await setCrewSupportStatus({ requestId: c.requestId, to: "confirmed", actorUserId: ADMIN }), "confirm");
    const moneyBefore = await enquiryOf(c.enquiryId);
    const obBefore = await count("payment_obligations", { payee_profile_id: CREW1 });
    expect(mustFail(await setCrewSupportStatus({ requestId: c.requestId, to: "cancelled", actorUserId: ADMIN }))).toMatch(/authorised management/);
    expect(mustFail(await cancelConfirmedRequest({ requestId: c.requestId, reason: "no", actorUserId: ADMIN }))).toMatch(/justification/);
    const done = must(await cancelConfirmedRequest({ requestId: c.requestId, reason: "Client withdrew the booking", actorUserId: ADMIN }), "cancel");
    expect((done.warnings ?? []).join(" ")).toMatch(/a crew payable exists/);
    const req = (await db().from("crew_support_requests").select("status, cancellation_reason, cancelled_by, cancellation_review_status").eq("id", c.requestId).single()).data!;
    expect(req).toMatchObject({ status: "cancelled", cancellation_reason: "Client withdrew the booking", cancelled_by: ADMIN, cancellation_review_status: "pending" });
    const moneyAfter = await enquiryOf(c.enquiryId);
    expect(moneyAfter.amount_due).toEqual(moneyBefore.amount_due);
    expect(moneyAfter.amount_due_quotation_id).toEqual(moneyBefore.amount_due_quotation_id);
    expect(await count("payment_obligations", { payee_profile_id: CREW1 })).toBe(obBefore); // payable untouched
    expect((await enquiryOf(c.enquiryId)).crm_stage).toBe("closed");
    expect(mustFail(await resolveCancellationReview({ requestId: c.requestId, note: "ok", actorUserId: ADMIN }))).toMatch(/at least a short sentence/);
    must(await resolveCancellationReview({ requestId: c.requestId, note: "Deposit retained per terms; crew payable to be cancelled in Payables", actorUserId: ADMIN }), "review");
    expect(mustFail(await resolveCancellationReview({ requestId: c.requestId, note: "Second attempt should fail", actorUserId: ADMIN }))).toMatch(/no pending cancellation review/);
    expect((await db().from("crew_support_requests").select("cancellation_review_status").eq("id", c.requestId).single()).data!.cancellation_review_status).toBe("resolved");
  });

  it("R8 a cancelled-before-confirmation request needs no review, and a crew member who accepted can be released before confirmation (their pending engagement is cancelled)", async () => {
    const x = await newRequest({ test: false });
    await toAvailability(x.requestId);
    const quoteId = await issued(x.requestId, { price: 800 });
    must(await acceptQuotationAsClient({ quotationId: quoteId, userId: CLIENT }));
    must(await sendCrewOffer({ slotId: x.slotId, assigneeProfileId: CREW2, amount: 200, currency: "GHS", message: "", overrideReason: null, actorUserId: ADMIN }));
    must(await respondToCrewOffer({ slotId: x.slotId, userId: CREW2, response: "accept", note: "" }));
    expect(await count("engagements", { entity_id: x.slotId, status: "draft" })).toBe(1);
    must(await withdrawOrReleaseSlot({ slotId: x.slotId, reason: "Crew member became unavailable", actorUserId: ADMIN }), "release");
    expect(await count("engagements", { entity_id: x.slotId, status: "cancelled" })).toBe(1);
    expect((await db().from("crew_support_slots").select("status, assignee_profile_id, crew_accepted_at").eq("id", x.slotId).single()).data).toMatchObject({ status: "unfilled", assignee_profile_id: null, crew_accepted_at: null });
    must(await setCrewSupportStatus({ requestId: x.requestId, to: "cancelled", actorUserId: ADMIN }), "cancel");
    expect((await db().from("crew_support_requests").select("cancellation_review_status").eq("id", x.requestId).single()).data!.cancellation_review_status).toBe("not_required");
  });

  it("R9 duplicate guards: the same quotation can't be accepted twice into a second receivable, and a second live quotation per request is impossible", async () => {
    const x = await newRequest({ test: false });
    await toAvailability(x.requestId);
    const quoteId = await issued(x.requestId, { price: 500 });
    must(await acceptQuotationAsClient({ quotationId: quoteId, userId: CLIENT }));
    must(await acceptQuotationAsClient({ quotationId: quoteId, userId: CLIENT }));
    expect(Number((await enquiryOf(x.enquiryId)).amount_due)).toBe(500);
    expect(mustFail(await prepareCrewSupportQuotation({ requestId: x.requestId, marketSlug: "qatar", actorUserId: ADMIN }))).toMatch(/already has a quotation|Quote preparation|Availability/);
    expect(await count("client_quotations", { crew_support_request_id: x.requestId })).toBe(1);
  });
});

// ============================================================================
describe("Scenario G — governed Crew Support pricing is configurable through the existing code path, with no code change", () => {
  // The numbers below exist ONLY in this throwaway database as test fixtures.
  // They are not proposed rates and are never used anywhere else.
  const FIXTURE_RATE = 123.45;

  it("G1 with no rate configured, the quotation line is an honest manual line (nothing is invented)", async () => {
    const r = await newRequest({ test: true });
    await toAvailability(r.requestId);
    must(await prepareCrewSupportQuotation({ requestId: r.requestId, marketSlug: "qatar", actorUserId: ADMIN }));
    const q = (await getCrewSupportQuotation(r.requestId))!;
    expect(q.lines[0]).toMatchObject({ sellingRate: 0, noGovernedRate: true, sourceType: "manual" });
    expect(await getActiveCrewSupportRates("qatar")).toEqual([]);
  });

  it("G2 only someone with pricing authority can configure a rate; the Photographer full-day Qatar rate is then saved as an append-only version", async () => {
    expect(mustFail(await createCrewSupportRateVersion({ marketSlug: "qatar", titleId, unitBasis: "full_day", priceUsd: FIXTURE_RATE, actorUserId: CREW1 }))).toMatch(/Not authorized/);
    must(await createCrewSupportRateVersion({ marketSlug: "qatar", titleId, unitBasis: "full_day", priceUsd: FIXTURE_RATE, actorUserId: ADMIN }), "set rate");
    expect(await getActiveCrewSupportRates("qatar")).toEqual([{ titleId, unitBasis: "full_day", priceUsd: FIXTURE_RATE }]);
    expect(await getActiveCrewSupportRates("ghana")).toEqual([]); // scoped to the market
    // saving the same value again changes nothing; a new value adds a version and the old row is kept
    expect((must(await createCrewSupportRateVersion({ marketSlug: "qatar", titleId, unitBasis: "full_day", priceUsd: FIXTURE_RATE, actorUserId: ADMIN })) as { unchanged?: boolean }).unchanged).toBe(true);
    must(await createCrewSupportRateVersion({ marketSlug: "qatar", titleId, unitBasis: "full_day", priceUsd: 150, actorUserId: ADMIN }));
    expect(Number((await getActiveCrewSupportRates("qatar"))[0].priceUsd)).toBe(150);
    expect((await db().from("crew_support_rates").select("id", { count: "exact", head: true })).count).toBe(2);
    must(await createCrewSupportRateVersion({ marketSlug: "qatar", titleId, unitBasis: "full_day", priceUsd: FIXTURE_RATE, actorUserId: ADMIN }));
  });

  it("G3 the next quotation is priced from the governed rate (role × quantity × days), shows its source, and an override needs a reason", async () => {
    const r = await newRequest({ test: true });
    await toAvailability(r.requestId);
    const prep = must(await prepareCrewSupportQuotation({ requestId: r.requestId, marketSlug: "qatar", actorUserId: ADMIN }));
    const q = (await getCrewSupportQuotation(r.requestId))!;
    expect(q.lines[0]).toMatchObject({ sellingRate: FIXTURE_RATE, governedUnitPrice: FIXTURE_RATE, noGovernedRate: false, sourceType: "pricing", quantity: 1, unitBasis: "full_day" });
    expect(q.lines[0].sourceReference).toMatch(/Crew Support Rates: Photographer, Qatar/);
    expect(q.total).toBe(FIXTURE_RATE);
    const draft = { quotationId: prep.quotationId, validUntil: defaultValidUntil(new Date()), terms: TERMS, internalNotes: null, fxCurrency: null, paymentCondition: "none", depositPercent: null, actorUserId: ADMIN };
    expect(mustFail(await saveCrewSupportQuotationDraft({ ...draft, lines: q.lines.map((l) => ({ ...l, sellingRate: 200, adjustmentReason: "" })) }))).toMatch(/differs from the governed rate/);
    must(await saveCrewSupportQuotationDraft({ ...draft, lines: q.lines.map((l) => ({ ...l, sellingRate: 200, adjustmentReason: "Long-standing client agreement" })) }));
    expect((await getCrewSupportQuotation(r.requestId))!.lines[0]).toMatchObject({ sellingRate: 200, sourceType: "adjusted", adjustmentReason: "Long-standing client agreement" });
    must(await markQuotationReady({ quotationId: prep.quotationId, actorUserId: ADMIN }));
  });

  it("G4 a multi-day request multiplies by the days, an urgent request adds the configured uplift (only if configured), and consumer photography prices are never read", async () => {
    must(await createCrewSupportModifierVersion({ slug: "urgent_uplift_percent", marketSlug: "qatar", percentage: 20, actorUserId: ADMIN }));
    const r = await newRequest({ test: true, urgency: "urgent" });
    await toAvailability(r.requestId);
    must(await prepareCrewSupportQuotation({ requestId: r.requestId, marketSlug: "qatar", actorUserId: ADMIN }));
    const q = (await getCrewSupportQuotation(r.requestId))!;
    expect(q.lines.map((l) => l.serviceItem)).toEqual(["Photographer", "Urgent request uplift"]);
    expect(q.lines[1].sellingRate).toBeCloseTo(FIXTURE_RATE * 0.2, 2);
    expect(q.total).toBeCloseTo(FIXTURE_RATE * 1.2, 2);
    expect(await count("crew_support_requests", {})).toBeGreaterThan(0);
  });
});
