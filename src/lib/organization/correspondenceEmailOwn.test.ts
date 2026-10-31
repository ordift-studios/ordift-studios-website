import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The signed-in person's OWN view (portal card). The loader must use the request-scoped (row-level-security) client with the SESSION user's id, select the address only,
// and never touch the service-role client; the card must be read-only.
const h = vi.hoisted(() => ({
  calls: [] as { table: string; select: string; eq: [string, string][]; order: string[]; limit: number }[],
  rows: [] as { email: string | null }[],
  failWith: null as { message: string } | null,
  adminUsed: 0,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      const call = { table, select: "", eq: [] as [string, string][], order: [] as string[], limit: -1 };
      h.calls.push(call);
      const q = { select(c: string) { call.select = c; return q; }, eq(c: string, v: string) { call.eq.push([c, v]); return q; }, order(c: string) { call.order.push(c); return q; }, limit: async (n: number) => { call.limit = n; return h.failWith ? { data: null, error: h.failWith } : { data: h.rows, error: null }; } };
      return q;
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => { h.adminUsed++; throw new Error("the service-role client must not be used for the person's own view"); } }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: async () => undefined }));
vi.mock("@/lib/organization/authority", () => ({ PEOPLE_CAPABILITIES: { workforceAdminister: "people.workforce.administer" }, authorizeWithSuperAdminOverride: async () => ({ ok: false }) }));

import { loadOwnContactEmails } from "./correspondenceEmail";
import { OwnContactEmailsCard } from "../../app/portal/(dashboard)/OwnContactEmailsCard";

const ME = { id: "00000000-0000-4000-8000-0000000000b1", email: "account.me@example.test" };
beforeEach(() => { h.calls = []; h.rows = []; h.failWith = null; h.adminUsed = 0; });

describe("loadOwnContactEmails: session identity, row-level security, minimal columns", () => {
  it("reads only the session user's rows through the request-scoped client, selecting the address only", async () => {
    h.rows = [{ email: "preferred.me@example.test" }];
    const r = await loadOwnContactEmails(ME);
    expect(r).toEqual({ accountEmail: "account.me@example.test", preferredEmail: "preferred.me@example.test", available: true });
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]).toMatchObject({ table: "profile_correspondence_emails", select: "email", eq: [["profile_id", ME.id]], limit: 1 });
    expect(h.calls[0].order).toEqual(["created_at", "id"]);
    expect(h.calls[0].select).not.toMatch(/evidence|recorded_by|source|created_at|id\b.*,/);
    expect(h.adminUsed).toBe(0);                                         // never the service-role client
  });
  it("falls back to the account email wording: no row, or a cleared preference, is 'no preference'", async () => {
    expect(await loadOwnContactEmails(ME)).toEqual({ accountEmail: "account.me@example.test", preferredEmail: null, available: true });
    h.rows = [{ email: null }];
    expect(await loadOwnContactEmails(ME)).toMatchObject({ preferredEmail: null, available: true });
  });
  it("an unreadable record is 'not available', never presented as 'no preference'", async () => {
    h.failWith = { message: "relation does not exist" };
    expect(await loadOwnContactEmails(ME)).toEqual({ accountEmail: "account.me@example.test", preferredEmail: null, available: false });
  });
  it("uses the id it is given (the session user's) and nothing else: another person's id is only ever asked for if the caller passes it, so the pages pass the session user", async () => {
    await loadOwnContactEmails({ id: "00000000-0000-4000-8000-0000000000c9", email: null });
    expect(h.calls[0].eq).toEqual([["profile_id", "00000000-0000-4000-8000-0000000000c9"]]);
  });
});

describe("OwnContactEmailsCard: read-only rendering", () => {
  const html = (emails: Parameters<typeof OwnContactEmailsCard>[0]["emails"]) => renderToStaticMarkup(createElement(OwnContactEmailsCard, { emails }));
  it("shows the two labelled addresses", () => {
    const x = html({ accountEmail: "account.me@example.test", preferredEmail: "preferred.me@example.test", available: true });
    expect(x).toContain("Account Email — Used for Login");
    expect(x).toContain("account.me@example.test");
    expect(x).toContain("Preferred Correspondence Email — Used for Communication");
    expect(x).toContain("preferred.me@example.test");
  });
  it("uses the fallback wording when there is no preference, and 'not available' when the record cannot be read", () => {
    expect(html({ accountEmail: "account.me@example.test", preferredEmail: null, available: true })).toContain("Not set (Ordift uses your account email)");
    expect(html({ accountEmail: "account.me@example.test", preferredEmail: null, available: false })).toContain("Not available yet");
    expect(html({ accountEmail: null, preferredEmail: null, available: true })).toContain("—");
  });
  it("has no form, input, button or link: nobody can change a credential or a preference here", () => {
    const x = html({ accountEmail: "account.me@example.test", preferredEmail: "preferred.me@example.test", available: true });
    expect(x).not.toMatch(/<(form|input|textarea|select|button|a)[\s>]/i);
    expect(x).not.toMatch(/evidence|history|recorded by|source/i);       // no evidence note, history or provenance
    expect(x).toContain("To change your preferred correspondence email, please contact Ordift");
  });
});
