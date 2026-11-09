import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({ user: null as null | { id: string }, staff: true, tables: {} as Record<string, Row[]>, failAudit: false, writes: [] as { table: string; op: string; values: Row }[] }));
vi.mock("@/lib/portal/roles", () => ({ getCurrentUser: async () => h.user, isStaffOrAdmin: () => h.staff }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (table: string) => {
  const f: ((r: Row) => boolean)[] = []; let mode = "select"; let payload: Row = {}; let head = false;
  const rows = () => (h.tables[table] ??= []);
  const run = () => {
    if (mode === "insert") { if (table === "activity_log" && h.failAudit) return { data: null, error: { message: "boom" }, count: null }; rows().push({ id: `r${rows().length + 1}`, created_at: new Date().toISOString(), ...payload }); h.writes.push({ table, op: "insert", values: payload }); return { data: null, error: null, count: null }; }
    const m = rows().filter((r) => f.every((p) => p(r)));
    if (mode === "update") { m.forEach((r) => Object.assign(r, payload)); h.writes.push({ table, op: "update", values: payload }); return { data: m[0] ?? null, error: null, count: m.length }; }
    return { data: head ? null : m, error: null, count: m.length };
  };
  const q: Record<string, unknown> = {
    select: (_c?: string, o?: { head?: boolean }) => { if (mode === "update") { mode = "update"; } head = Boolean(o?.head); return q; },
    insert: (v: Row) => { mode = "insert"; payload = v; return Promise.resolve(run()); },
    update: (v: Row) => { mode = "update"; payload = v; return q; },
    eq: (c: string, v: unknown) => { f.push((r) => r[c] === v); return q; }, is: (c: string, v: unknown) => { f.push((r) => (r[c] ?? null) === v); return q; },
    gte: (c: string, v: string) => { f.push((r) => String(r[c]) >= v); return q; }, limit: () => q,
    maybeSingle: async () => { const r = run(); const d = Array.isArray(r.data) ? r.data[0] ?? null : r.data; return { data: d, error: null }; },
    then: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res),
  };
  return q;
} }) }));

import { findPossibleExistingClients, linkEnquiryToExistingClientAsStaff, searchClientsForStaff } from "./staffClientLookup";

const contact = (o: Row) => ({ status: "active", preferred_name: null, phones: [], organisations: null, contact_emails: [], ...o });
beforeEach(() => {
  h.user = { id: "staff1" }; h.staff = true; h.failAudit = false; h.writes = [];
  h.tables = {
    contacts: [
      contact({ id: "c1", full_name: "Jane Mensah-Doe", phones: ["+233 24 400 1234"], organisations: { name: "Accra Events Ltd" }, contact_emails: [{ email: "jane.doe@gmail.com", is_primary: true, is_shared: false, removed_at: null }], organisation_id: "o1", notes: "PRIVATE NOTE", job_title: "CEO" }),
      contact({ id: "c2", full_name: "Kofi Mensah", contact_emails: [{ email: "info@kofi.example", is_primary: true, is_shared: true, removed_at: null }] }),
      contact({ id: "c3", full_name: "Mensah Retired", status: "inactive" }),
    ],
    enquiries: [{ id: "e1", contact_id: "c1" }, { id: "e2", contact_id: "c1" }, { id: "e9", contact_id: null, organisation_id: null }, { id: "e8", contact_id: "c2", organisation_id: null }],
    activity_log: [],
  };
});

describe("searchClientsForStaff: authorization", () => {
  it("refuses a signed-out user, a user who is not staff or admin (for example a client), and a different actor id", async () => {
    h.user = null; expect((await searchClientsForStaff({ actorUserId: "staff1", query: "mensah" })).ok).toBe(false);
    h.user = { id: "staff1" }; h.staff = false; expect((await searchClientsForStaff({ actorUserId: "staff1", query: "mensah" })).ok).toBe(false);
    h.staff = true; expect((await searchClientsForStaff({ actorUserId: "someone-else", query: "mensah" })).ok).toBe(false);
    expect(h.writes).toEqual([]);                                                      // nothing was read into an audit entry, nothing written
  });
});

describe("searchClientsForStaff: results", () => {
  it("returns only the minimal shape: no notes, job title, full email or phone, and never an inactive client", async () => {
    const r = await searchClientsForStaff({ actorUserId: "staff1", query: "mensah" });
    expect(r.ok && r.results.map((x) => x.contactId).sort()).toEqual(["c1", "c2"]);
    const j = JSON.stringify(r);
    expect(j).not.toMatch(/PRIVATE NOTE|CEO|jane\.doe@gmail\.com|2334001234|44001234|info@kofi|c3|Retired/);
    expect(r.ok && r.results.find((x) => x.contactId === "c1")).toMatchObject({ displayName: "Jane Mensah-Doe", organisationName: "Accra Events Ltd", maskedEmail: "j•••@gmail.com", maskedPhone: "•••• 234", earlierEnquiries: 2 });
  });
  it("finds by exact personal email and by phone, never by a shared address, and refuses short or partial input", async () => {
    expect((await searchClientsForStaff({ actorUserId: "staff1", query: "jane.doe@gmail.com" }) as { results: unknown[] }).results).toHaveLength(1);
    expect((await searchClientsForStaff({ actorUserId: "staff1", query: "0244001234" }) as { results: unknown[] }).results).toHaveLength(1);
    expect((await searchClientsForStaff({ actorUserId: "staff1", query: "info@kofi.example" }) as { results: unknown[] }).results).toHaveLength(0);
    for (const bad of ["ab", "1234", "jane@"]) expect((await searchClientsForStaff({ actorUserId: "staff1", query: bad })).ok).toBe(false);
  });
});

describe("searchClientsForStaff: audit and limits", () => {
  it("records every lookup (kind, count, query length) and never the query text or any result", async () => {
    await searchClientsForStaff({ actorUserId: "staff1", query: "jane.doe@gmail.com" });
    const a = h.tables.activity_log.at(-1)!; expect(a).toMatchObject({ action: "directory.staff_lookup", actor_user_id: "staff1", entity_type: "client_directory" });
    expect(a.metadata).toEqual({ kind: "email", resultCount: 1, moreMatches: false, queryLength: 18 });
    expect(JSON.stringify(a)).not.toMatch(/jane|gmail|Mensah/i);
  });
  it("shows nothing when the audit entry cannot be written (fail closed)", async () => {
    h.failAudit = true; const r = await searchClientsForStaff({ actorUserId: "staff1", query: "mensah" });
    expect(r.ok).toBe(false); expect(JSON.stringify(r)).not.toMatch(/Jane/);
  });
  it("allows 20 lookups a minute per person and then refuses", async () => {
    for (let i = 0; i < 20; i++) h.tables.activity_log.push({ id: `x${i}`, action: "directory.staff_lookup", actor_user_id: "staff1", created_at: new Date().toISOString() });
    const r = await searchClientsForStaff({ actorUserId: "staff1", query: "mensah" }); expect(r.ok === false && r.error).toMatch(/Too many lookups/);
    h.tables.activity_log = h.tables.activity_log.map((x) => ({ ...x, created_at: new Date(Date.now() - 120_000).toISOString() }));
    expect((await searchClientsForStaff({ actorUserId: "staff1", query: "mensah" })).ok).toBe(true);
    expect(h.tables.activity_log.filter((x) => x.actor_user_id === "other").length).toBe(0);
  });
});

describe("findPossibleExistingClients (duplicate prevention while recording an enquiry)", () => {
  it("finds an existing client by the typed email or phone, with a masked message", async () => {
    const r = await findPossibleExistingClients({ actorUserId: "staff1", email: "jane.doe@gmail.com", phone: null });
    expect(r.ok && r.matches.map((m) => m.contactId)).toEqual(["c1"]); expect(r.ok && r.message).toMatch(/j•••@gmail\.com/); expect(JSON.stringify(r)).not.toMatch(/jane\.doe@gmail/);
  });
  it("finds nothing for a new person, ignores an unusable value, and is for staff only", async () => {
    expect((await findPossibleExistingClients({ actorUserId: "staff1", email: "new@x.example", phone: "0200000000" }) as { matches: unknown[] }).matches).toEqual([]);
    expect((await findPossibleExistingClients({ actorUserId: "staff1", email: null, phone: "12" }) as { matches: unknown[] }).matches).toEqual([]);
    h.staff = false; expect((await findPossibleExistingClients({ actorUserId: "staff1", email: "jane.doe@gmail.com", phone: null })).ok).toBe(false);
  });
});

describe("linkEnquiryToExistingClientAsStaff", () => {
  it("links an unlinked enquiry to an existing active client, writing exactly the two link columns, and audits it", async () => {
    const r = await linkEnquiryToExistingClientAsStaff({ actorUserId: "staff1", enquiryId: "e9", contactId: "c1" });
    expect(r.ok).toBe(true);
    expect(h.writes.find((w) => w.table === "enquiries")?.values).toEqual({ contact_id: "c1", organisation_id: "o1" });
    expect(h.tables.activity_log.at(-1)).toMatchObject({ action: "directory.staff_linked_enquiry", entity_id: "e9" });
  });
  it("refuses an inactive or unknown client, an already-linked enquiry, and anyone who is not staff; changes nothing", async () => {
    expect((await linkEnquiryToExistingClientAsStaff({ actorUserId: "staff1", enquiryId: "e9", contactId: "c3" })).ok).toBe(false);
    expect((await linkEnquiryToExistingClientAsStaff({ actorUserId: "staff1", enquiryId: "e9", contactId: "nope" })).ok).toBe(false);
    expect((await linkEnquiryToExistingClientAsStaff({ actorUserId: "staff1", enquiryId: "e8", contactId: "c1" }) as { error: string }).error).toMatch(/already linked/);
    h.staff = false; expect((await linkEnquiryToExistingClientAsStaff({ actorUserId: "staff1", enquiryId: "e9", contactId: "c1" })).ok).toBe(false);
    expect(h.writes.filter((w) => w.table === "enquiries")).toEqual([]);
  });
  it("reverses the link if the audit entry cannot be written", async () => {
    h.failAudit = true;
    const r = await linkEnquiryToExistingClientAsStaff({ actorUserId: "staff1", enquiryId: "e9", contactId: "c1" });
    expect(r.ok === false && r.error).toMatch(/reversed/); expect(h.tables.enquiries.find((e) => e.id === "e9")).toMatchObject({ contact_id: null });
  });
});
