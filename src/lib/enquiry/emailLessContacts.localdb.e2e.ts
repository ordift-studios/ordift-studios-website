// @vitest-environment node
//
// A client without an email address, on the REAL schema (throwaway local Postgres + PostgREST). SYNTHETIC data only.
// Proves: an enquiry staff recorded from WhatsApp (placeholder email, a phone number) becomes a directory contact with the number only; the placeholder is
// never copied; nothing is sent, no account is made, nothing money-related changes; duplicates are reviewed, never merged; the last way to reach a person is protected.
// Run: supabase/proposals/e2e_scratch.sh, then E2E_SUPABASE_URL=http://127.0.0.1:54997 npx vitest run --config vitest.localdb.config.ts src/lib/enquiry/emailLessContacts.localdb.e2e.ts
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
vi.mock("@/lib/portal/roles", async (orig) => ({ ...(await orig<typeof import("@/lib/portal/roles")>()), getCurrentUser: async () => h.current }));
vi.mock("@/lib/supabase/admin", async () => {
  const { createClient: make } = await import("@supabase/supabase-js");
  return { createAdminClient: () => make(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: h.fetch } }) };
});
vi.mock("@/lib/supabase/server", async () => {
  const { createClient: make } = await import("@supabase/supabase-js");
  return { createClient: async () => make(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: h.fetch } }) };
});

import { addContactEmail, createContact, createContactFromRecord, getContactDetail, getRecordLinkContext, removeContactEmail, updateContact } from "@/lib/directory/directory";
import { createStaffEnquiry } from "@/lib/enquiry/staffIntakeService";

const sql = (q: string) => execSync("docker exec -i ordift-mig-check2 psql -U supabase_admin -h 127.0.0.1 -d p4_e2e -X -q -At -v ON_ERROR_STOP=1", { input: q }).toString().trim();
const U = (n: number) => `00000000-0000-4000-8000-0000000000${n.toString(16).padStart(2, "0")}`;
const founder = { id: U(0xd3), email: "founder@e2e.test", fullName: "Founder", roles: ["admin", "super_admin"], accessStatus: "active" };
const PHONE = "+97400000001"; // synthetic, not a real number
const counts = () => sql(`select (select count(*) from auth.users)||'/'||(select count(*) from public.payments)||'/'||(select count(*) from public.payment_obligations)||'/'||(select count(*) from public.email_send_failures)||'/'||(select count(*) from public.client_quotations)||'/'||(select count(*) from public.profiles)`);

async function whatsappEnquiry(name: string, phone: string): Promise<{ id: string; reference: string }> {
  h.current = founder;
  const r = await createStaffEnquiry({ actorUserId: founder.id, input: { service: "photography", channel: "whatsapp", receivedAt: new Date().toISOString(), fullName: name, email: "", phone, details: "Synthetic WhatsApp enquiry", allowStatusEmails: false }, confirmedDifferentClient: true });
  if (!r.ok) throw new Error(r.error);
  return { id: r.id, reference: r.reference };
}

beforeAll(() => {
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) throw new Error("Refusing to run against a non-local database");
  sql(`
  set session_replication_role = replica;
  insert into auth.users (id,email) values ('${U(0xd3)}','founder@e2e.test') on conflict do nothing;
  insert into public.profiles (id, full_name, access_status) values ('${U(0xd3)}','Founder','active') on conflict do nothing;
  insert into public.user_roles (user_id, role_id) select '${U(0xd3)}', r.id from public.roles r where r.slug in ('admin','super_admin') on conflict do nothing;
  `);
});

describe("an enquiry recorded from WhatsApp with no email address", () => {
  it("carries the reserved placeholder, which the directory treats as no email", async () => {
    const e = await whatsappEnquiry("Synthetic Clientone", PHONE);
    const email = sql(`select email from public.enquiries where id='${e.id}'`);
    expect(email).toMatch(/@no-email\.invalid$/);
    h.current = founder;
    const ctx = await getRecordLinkContext(founder.id, { type: "enquiry", id: e.id });
    expect(ctx?.reach).toEqual({ hasEmail: false, hasPhone: true, phone: PHONE });
  });

  it("creates a contact from the phone number only, links it, and copies no placeholder", async () => {
    const e = await whatsappEnquiry("Synthetic Clienttwo", "+97400000002");
    const before = counts();
    const enquiryBefore = sql(`select crm_stage||'|'||coalesce(payment_country,'-')||'|'||coalesce(amount_due::text,'-') from public.enquiries where id='${e.id}'`);
    h.current = founder;
    const r = await createContactFromRecord({ subject: { type: "enquiry", id: e.id }, organisationId: null, confirmedDistinct: false, actorUserId: founder.id });
    expect(r).toMatchObject({ ok: true });
    if (!r.ok) return;
    expect(sql(`select count(*) from public.contact_emails where contact_id='${r.contactId}'`)).toBe("0");
    expect(sql(`select phones::text from public.contacts where id='${r.contactId}'`)).toBe("{97400000002}");
    expect(sql(`select count(*) from public.contacts where phones::text ilike '%invalid%'`)).toBe("0");
    expect(sql(`select count(*) from public.contact_emails where email ilike '%invalid%'`)).toBe("0");
    // linked, nothing else on the enquiry moved
    expect(sql(`select contact_id from public.enquiries where id='${e.id}'`)).toBe(r.contactId);
    expect(sql(`select crm_stage||'|'||coalesce(payment_country,'-')||'|'||coalesce(amount_due::text,'-') from public.enquiries where id='${e.id}'`)).toBe(enquiryBefore);
    // no account, no payment, no obligation, no failed-email row, no quotation, no profile created
    expect(counts()).toBe(before);
    const d = await getContactDetail(founder.id, r.contactId);
    expect(d?.emails).toEqual([]);
    expect(d?.accountSuggestions).toEqual([]);
  });

  it("an email can be added later through the ordinary edit path", async () => {
    const e = await whatsappEnquiry("Synthetic Clientthree", "+97400000003");
    h.current = founder;
    const r = await createContactFromRecord({ subject: { type: "enquiry", id: e.id }, organisationId: null, confirmedDistinct: false, actorUserId: founder.id });
    if (!r.ok) throw new Error(r.error);
    expect(await addContactEmail({ contactId: r.contactId, email: "clientthree@e2e.test", actorUserId: founder.id })).toEqual({ ok: true });
    expect(sql(`select count(*) from public.contact_emails where contact_id='${r.contactId}' and removed_at is null and is_primary`)).toBe("1");
  });
});

describe("minimum contactability", () => {
  it("refuses a contact with neither an email nor a phone, and a typed placeholder", async () => {
    h.current = founder;
    const none = await createContact({ fullName: "Synthetic Nobody", emails: [], phones: [], confirmedDistinct: false, actorUserId: founder.id });
    expect(none).toMatchObject({ ok: false });
    expect(none.ok === false && none.error).toMatch(/at least one way to reach/);
    const ph = await createContact({ fullName: "Synthetic Placeholder", emails: ["enq-2026-000010@no-email.invalid"], phones: [], confirmedDistinct: false, actorUserId: founder.id });
    expect(ph.ok === false && ph.error).toMatch(/reserved placeholder/);
    expect(sql(`select count(*) from public.contacts where full_name in ('Synthetic Nobody','Synthetic Placeholder')`)).toBe("0");
  });

  it("accepts an email only, and an email plus a phone", async () => {
    h.current = founder;
    expect(await createContact({ fullName: "Synthetic Emailonly", emails: ["emailonly@e2e.test"], phones: [], confirmedDistinct: false, actorUserId: founder.id })).toMatchObject({ ok: true });
    expect(await createContact({ fullName: "Synthetic Both", emails: ["both@e2e.test"], phones: ["+97400000009"], confirmedDistinct: false, actorUserId: founder.id })).toMatchObject({ ok: true });
  });

  it("will not remove the last way to reach someone, but still lets unrelated details change", async () => {
    h.current = founder;
    const c = await createContact({ fullName: "Synthetic Phoneonly", emails: [], phones: ["+97400000010"], confirmedDistinct: false, actorUserId: founder.id });
    if (!c.ok) throw new Error(c.error);
    const blocked = await updateContact({ contactId: c.id, fullName: "Synthetic Phoneonly", phones: [], status: "active", actorUserId: founder.id });
    expect(blocked.ok === false && blocked.error).toMatch(/only way to reach/);
    expect(await updateContact({ contactId: c.id, fullName: "Synthetic Phoneonly Renamed", phones: ["+97400000010"], status: "active", actorUserId: founder.id })).toEqual({ ok: true });

    const e = await createContact({ fullName: "Synthetic Emailonly Two", emails: ["emailonly2@e2e.test"], phones: [], confirmedDistinct: false, actorUserId: founder.id });
    if (!e.ok) throw new Error(e.error);
    const emailId = sql(`select id from public.contact_emails where contact_id='${e.id}' and removed_at is null`);
    const rm = await removeContactEmail({ contactId: e.id, emailId, actorUserId: founder.id });
    expect(rm.ok === false && rm.error).toMatch(/only way to reach/);
    expect(sql(`select count(*) from public.contact_emails where contact_id='${e.id}' and removed_at is null`)).toBe("1");
  });
});

describe("telephone handling and records that carry both an email and a phone", () => {
  it("refuses an invalid telephone number with a clear message and creates nothing", async () => {
    h.current = founder;
    const bad = await createContact({ fullName: "Synthetic Badphone", emails: [], phones: ["12"], confirmedDistinct: false, actorUserId: founder.id });
    expect(bad.ok === false && bad.error).toMatch(/not a valid phone number/);
    expect(sql(`select count(*) from public.contacts where full_name='Synthetic Badphone'`)).toBe("0");
  });

  it("a record with a real email and a phone yields a contact holding both, the email is the primary personal address, and nothing else moves", async () => {
    const e = await whatsappEnquiry("Synthetic Bothperson", "+97400000040");
    sql(`update public.enquiries set email='bothperson@e2e.test' where id='${e.id}'`);
    h.current = founder;
    const before = counts();
    const r = await createContactFromRecord({ subject: { type: "enquiry", id: e.id }, organisationId: null, confirmedDistinct: false, actorUserId: founder.id });
    if (!r.ok) throw new Error(r.error);
    expect(sql(`select email||'|'||is_primary||'|'||is_shared from public.contact_emails where contact_id='${r.contactId}' and removed_at is null`)).toBe("bothperson@e2e.test|true|false");
    expect(sql(`select phones::text from public.contacts where id='${r.contactId}'`)).toBe("{97400000040}");
    expect(counts()).toBe(before);
  });

  it("an email-only contact is created without a phone and nothing is merged with an existing person", async () => {
    h.current = founder;
    const total = sql(`select count(*) from public.contacts`);
    expect(await createContact({ fullName: "Synthetic Mailonly", emails: ["mailonly@e2e.test"], phones: [], confirmedDistinct: false, actorUserId: founder.id })).toMatchObject({ ok: true });
    expect(Number(sql(`select count(*) from public.contacts`))).toBe(Number(total) + 1);
    // the same personal address again is refused, pointing at the existing contact, and creates nothing
    const again = await createContact({ fullName: "Synthetic Mailonly Twin", emails: ["mailonly@e2e.test"], phones: [], confirmedDistinct: true, actorUserId: founder.id });
    expect(again.ok === false && again.error).toMatch(/already uses this personal email/);
    expect(Number(sql(`select count(*) from public.contacts`))).toBe(Number(total) + 1);
  });
});

describe("duplicates are reviewed, never merged", () => {
  it("the same number with the same name is flagged for review; confirming creates a separate contact; a different name is not blocked", async () => {
    const first = await whatsappEnquiry("Synthetic Dupe Person", "+97400000020");
    h.current = founder;
    const a = await createContactFromRecord({ subject: { type: "enquiry", id: first.id }, organisationId: null, confirmedDistinct: false, actorUserId: founder.id });
    expect(a).toMatchObject({ ok: true });
    const second = await whatsappEnquiry("Synthetic Dupe Person", "+974 0000 0020");
    const b = await createContactFromRecord({ subject: { type: "enquiry", id: second.id }, organisationId: null, confirmedDistinct: false, actorUserId: founder.id });
    expect(b.ok === false && b.error).toMatch(/looks like the same person/);
    expect(sql(`select count(*) from public.contacts where full_name='Synthetic Dupe Person'`)).toBe("1");
    const confirmed = await createContactFromRecord({ subject: { type: "enquiry", id: second.id }, organisationId: null, confirmedDistinct: true, actorUserId: founder.id });
    expect(confirmed).toMatchObject({ ok: true });
    expect(sql(`select count(*) from public.contacts where full_name='Synthetic Dupe Person'`)).toBe("2");
    const third = await whatsappEnquiry("Synthetic Shared Line", "+97400000020");
    expect(await createContactFromRecord({ subject: { type: "enquiry", id: third.id }, organisationId: null, confirmedDistinct: false, actorUserId: founder.id })).toMatchObject({ ok: true });
  });
});

describe("a record with neither an email nor a phone", () => {
  it("is refused with a clear reason instead of creating an unreachable contact", async () => {
    // the staff form itself refuses a record with neither, so reach this state the way a legacy record could: clear the number afterwards
    const e = await whatsappEnquiry("Synthetic Nothing", "+97400000030");
    sql(`update public.enquiries set phone = null where id='${e.id}'`);
    h.current = founder;
    const ctx = await getRecordLinkContext(founder.id, { type: "enquiry", id: e.id });
    expect(ctx?.reach).toMatchObject({ hasEmail: false, hasPhone: false });
    const r = await createContactFromRecord({ subject: { type: "enquiry", id: e.id }, organisationId: null, confirmedDistinct: false, actorUserId: founder.id });
    expect(r.ok === false && r.error).toMatch(/no email address or telephone/);
  });
});
