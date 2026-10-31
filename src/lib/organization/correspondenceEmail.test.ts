import { beforeEach, describe, expect, it, vi } from "vitest";

// A tiny in-memory stand-in for the admin client: only what correspondenceEmail.ts uses. It records every call so the tests can prove the AUTH account is never written.
const h = vi.hoisted(() => ({
  authorized: new Set<string>(),
  rows: [] as { id: string; profile_id: string; email: string | null; source: string; evidence_note: string; recorded_by: string; created_at: string }[],
  profiles: new Map<string, string | null>(),
  accountEmail: new Map<string, string>(),
  authWrites: [] as string[],
  inserts: [] as unknown[],
  logs: [] as { action: string; metadata: Record<string, unknown> }[],
  tableReadable: true,
  seq: 0,
}));

vi.mock("@/lib/organization/authority", () => ({
  PEOPLE_CAPABILITIES: { workforceAdminister: "people.workforce.administer" },
  authorizeWithSuperAdminOverride: async (id: string) => (h.authorized.has(id) ? { ok: true, actedAsOverride: false } : { ok: false }),
}));
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: async (e: { action: string; metadata: Record<string, unknown> }) => { h.logs.push({ action: e.action, metadata: e.metadata }); } }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: h.accountEmail.has(id) ? { email: h.accountEmail.get(id) } : null } }), updateUserById: async (id: string) => { h.authWrites.push(`updateUserById:${id}`); return { error: null }; }, createUser: async () => { h.authWrites.push("createUser"); return { error: null }; }, deleteUser: async () => { h.authWrites.push("deleteUser"); return { error: null }; } } },
    from: (table: string) => {
      if (table === "profiles") {
        const q = { _ids: [] as string[], select() { return q; }, eq(_c: string, v: string) { q._ids = [v]; return q; }, in(_c: string, v: string[]) { q._ids = v; return Promise.resolve({ data: v.filter((x) => h.profiles.has(x)).map((x) => ({ id: x, full_name: h.profiles.get(x) })) }); }, maybeSingle: async () => ({ data: h.profiles.has(q._ids[0]) ? { id: q._ids[0] } : null }) };
        return q;
      }
      if (table !== "profile_correspondence_emails") throw new Error(`unexpected table ${table}`);
      return {
        select() {
          let id = "";
          const chain = { eq(_c: string, v: string) { id = v; return chain; }, order() { return chain; }, limit: async (n: number) => (h.tableReadable ? { data: h.rows.filter((r) => r.profile_id === id).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, n), error: null } : { data: null, error: { message: "relation does not exist" } }) };
          return chain;
        },
        insert(row: Record<string, unknown>) {
          h.inserts.push(row);
          const rec = { id: `r${++h.seq}`, created_at: new Date(Date.UTC(2026, 10, 1, 0, 0, h.seq)).toISOString(), ...row } as (typeof h.rows)[number];
          h.rows.push(rec);
          return { select: () => ({ single: async () => ({ data: { id: rec.id }, error: null }) }) };
        },
      };
    },
  }),
}));

import { canAccessCorrespondenceEmail, getPreferredCorrespondenceEmail, loadContactEmailsForViewer, maskEmail, normalizeCorrespondenceEmail, resolveContactEmail, setCorrespondenceEmail, validateCorrespondenceEmail, validateEvidenceNote } from "./correspondenceEmail";

const ADMIN = "00000000-0000-4000-8000-0000000000a1", STAFF = "00000000-0000-4000-8000-0000000000a2", PERSON = "00000000-0000-4000-8000-0000000000b1";
const EVIDENCE = "Requested by the person by email; confirmed by call-back to the number on record.";
const set = (over: Partial<Parameters<typeof setCorrespondenceEmail>[0]> = {}) => setCorrespondenceEmail({ profileId: PERSON, email: "preferred.person@example.test", source: "person_request", evidenceNote: EVIDENCE, actorUserId: ADMIN, ...over });

beforeEach(() => {
  h.authorized = new Set([ADMIN]); h.rows = []; h.profiles = new Map([[PERSON, "Synthetic Person"], [ADMIN, "Synthetic Admin"]]); h.accountEmail = new Map([[PERSON, "account.person@example.test"]]);
  h.authWrites = []; h.inserts = []; h.logs = []; h.tableReadable = true; h.seq = 0;
});

describe("email-format validation", () => {
  it("accepts one plain address and lower-cases it", () => {
    expect(validateCorrespondenceEmail("  Sample.Person+tag@Example.TEST ")).toEqual({ ok: true, email: "sample.person+tag@example.test" });
    expect(normalizeCorrespondenceEmail(" A@B.CO ")).toBe("a@b.co");
  });
  it("rejects anything ambiguous instead of repairing it", () => {
    for (const bad of ["", "   ", "no-at-sign", "a@b", "a@@b.com", "a b@c.com", "a@b.c", "two@a.com,three@b.com", "two@a.com;three@b.com", "Name <n@a.com>", "\"q\"@a.com", ".lead@a.com", "trail.@a.com", "do..t@a.com", "a@-bad.com", "a@bad-.com", "a@b..com", `${"x".repeat(65)}@a.com`, `a@${"y".repeat(250)}.com`, "a@b.c0m"]) expect(validateCorrespondenceEmail(bad).ok, bad).toBe(false);
  });
});

describe("evidence-note privacy", () => {
  it("accepts a short reference", () => expect(validateEvidenceNote(EVIDENCE)).toEqual({ ok: true, note: EVIDENCE }));
  it("rejects a note that is too short, too long, or carries an address or a long number", () => {
    expect(validateEvidenceNote("short").ok).toBe(false);
    expect(validateEvidenceNote("x".repeat(501)).ok).toBe(false);
    expect(validateEvidenceNote("Confirmed with someone at private.person@example.test by email").ok).toBe(false);
    expect(validateEvidenceNote("Called him on 0200 000 0000 to confirm the request").ok).toBe(false);
    expect(validateEvidenceNote("Card ending 4111-1111-1111-1111 was shown as proof").ok).toBe(false);
    expect(validateEvidenceNote("Confirmed on 31 October at 3 pm by a call-back").ok).toBe(true);
  });
});

describe("masking and fallback", () => {
  it("masks an address for the shared audit log", () => {
    expect(maskEmail("samplename14@example.test")).toBe("s***4@e***.test");
    expect(maskEmail("ab@example.test")).toBe("a***@e***.test");
    expect(maskEmail(null)).toBeNull();
    expect(maskEmail("samplename14@example.test")).not.toContain("samplename");
  });
  it("uses the preference when recorded, otherwise the account email", () => {
    expect(resolveContactEmail("acct@x.test", "pref@x.test")).toEqual({ email: "pref@x.test", source: "preferred" });
    expect(resolveContactEmail("acct@x.test", null)).toEqual({ email: "acct@x.test", source: "account" });
    expect(resolveContactEmail("acct@x.test", "  ")).toEqual({ email: "acct@x.test", source: "account" });
    expect(resolveContactEmail(null, null)).toEqual({ email: null, source: "none" });
  });
});

describe("authorization", () => {
  it("only people-management authority can read or record; ordinary staff are refused and nothing is written", async () => {
    expect(await canAccessCorrespondenceEmail(ADMIN)).toBe(true);
    expect(await canAccessCorrespondenceEmail(STAFF)).toBe(false);
    expect(await set({ actorUserId: STAFF })).toEqual({ ok: false, error: "You are not authorized to record a correspondence email." });
    expect(h.inserts).toHaveLength(0);
    expect(h.logs).toHaveLength(0);
    expect(await loadContactEmailsForViewer(PERSON, STAFF)).toBeNull(); // an unauthorized viewer gets nothing at all
  });
});

describe("recording, changing, clearing (append-only)", () => {
  it("records, changes and clears as three separate entries, keeping every one", async () => {
    const a = await set(); expect(a).toMatchObject({ ok: true, action: "set" });
    const b = await set({ email: "second.address@example.test" }); expect(b).toMatchObject({ ok: true, action: "changed" });
    const c = await set({ email: null, evidenceNote: "The person asked for the account email to be used again." }); expect(c).toMatchObject({ ok: true, action: "cleared" });
    expect(h.rows.map((r) => r.email)).toEqual(["preferred.person@example.test", "second.address@example.test", null]); // nothing edited or removed
    expect(await getPreferredCorrespondenceEmail(PERSON)).toBeNull(); // the latest entry is a clear
    const view = await loadContactEmailsForViewer(PERSON, ADMIN);
    expect(view?.history.map((x) => x.action)).toEqual(["cleared", "changed", "set"]);
    expect(view?.preferred).toBeNull();
    expect(view?.effective).toEqual({ email: "account.person@example.test", source: "account" });
  });
  it("refuses an unchanged address, the account email itself, clearing nothing, an unknown person, a bad source and an invalid address or note", async () => {
    expect(await set()).toMatchObject({ ok: true });
    expect(await set()).toMatchObject({ ok: false });                                         // same as current
    expect(await set({ email: "ACCOUNT.person@example.test" })).toMatchObject({ ok: false }); // the account email: no preference needed
    expect(await set({ profileId: "00000000-0000-4000-8000-0000000000ff" })).toEqual({ ok: false, error: "That person was not found." });
    expect(await set({ source: "somebody" as never })).toMatchObject({ ok: false });
    expect(await set({ email: "not an address" })).toMatchObject({ ok: false });
    expect(await set({ email: "another@example.test", evidenceNote: "too short" })).toMatchObject({ ok: false });
    expect(h.rows).toHaveLength(1);
    h.rows = [];
    expect(await set({ email: null })).toMatchObject({ ok: false }); // nothing to clear
    expect(h.rows).toHaveLength(0);
  });
  it("an unreadable record (for example the migration is not applied) is UNKNOWN, never 'no preference', and nothing is written", async () => {
    h.tableReadable = false;
    expect(await getPreferredCorrespondenceEmail(PERSON)).toBeUndefined();
    expect(await set()).toMatchObject({ ok: false });
    expect(h.inserts).toHaveLength(0);
    const view = await loadContactEmailsForViewer(PERSON, ADMIN);
    expect(view).toMatchObject({ available: false, preferred: null, effective: { email: "account.person@example.test", source: "account" } });
  });
});

describe("audit-log masking and evidence privacy", () => {
  it("writes masked addresses and no evidence text to the shared audit log", async () => {
    await set({ email: "samplename14@example.test" });
    await set({ email: "another.person@example.test" });
    await set({ email: null, evidenceNote: "The person asked for the account email to be used again." });
    expect(h.logs.map((l) => l.action)).toEqual(["profile.correspondence_email_set", "profile.correspondence_email_changed", "profile.correspondence_email_cleared"]);
    const text = JSON.stringify(h.logs);
    for (const secret of ["samplename14", "another.person", "example.test", "confirmed by call-back", "asked for the account email"]) expect(text).not.toContain(secret);
    expect(h.logs[0].metadata).toMatchObject({ previous: null, current: "s***4@e***.test", source: "person_request", evidenceRecorded: true });
    expect(h.logs[1].metadata).toMatchObject({ previous: "s***4@e***.test" });
  });
  it("shows the full address only for the current preference; history addresses are masked", async () => {
    await set({ email: "first.person@example.test" });
    await set({ email: "second.person@example.test" });
    const view = await loadContactEmailsForViewer(PERSON, ADMIN);
    expect(view?.preferred?.email).toBe("second.person@example.test");
    expect(view?.history.every((x) => !x.maskedEmail || x.maskedEmail.includes("***"))).toBe(true);
    expect(JSON.stringify(view?.history)).not.toContain("first.person@");
  });
});

describe("the account (login) email is never touched", () => {
  it("no operation in the module writes to the Supabase Auth account", async () => {
    await set(); await set({ email: "changed.person@example.test" }); await set({ email: null, evidenceNote: "The person asked for the account email to be used again." });
    await loadContactEmailsForViewer(PERSON, ADMIN); await getPreferredCorrespondenceEmail(PERSON);
    expect(h.authWrites).toEqual([]);
    expect(h.accountEmail.get(PERSON)).toBe("account.person@example.test");
  });
});
