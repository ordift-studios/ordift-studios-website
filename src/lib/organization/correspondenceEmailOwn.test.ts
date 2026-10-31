import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The signed-in person's OWN view (portal card). The loader must call ONLY the parameterless database function public.my_correspondence_email() through the request-scoped
// client (the person's own session), never read the table, never touch the service-role client; the card must be read-only.
const h = vi.hoisted(() => ({
  rpcCalls: [] as { fn: string; args: unknown[] }[],
  fromCalls: 0,
  result: null as string | null,
  failWith: null as { message: string } | null,
  adminUsed: 0,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (fn: string, ...args: unknown[]) => { h.rpcCalls.push({ fn, args }); return h.failWith ? { data: null, error: h.failWith } : { data: h.result, error: null }; },
    from: () => { h.fromCalls++; throw new Error("the table must not be read directly"); },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => { h.adminUsed++; throw new Error("the service-role client must not be used for the person's own view"); } }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: async () => undefined }));
vi.mock("@/lib/organization/authority", () => ({ PEOPLE_CAPABILITIES: { workforceAdminister: "people.workforce.administer" }, authorizeWithSuperAdminOverride: async () => ({ ok: false }) }));

import { loadOwnContactEmails } from "./correspondenceEmail";
import { OwnContactEmailsCard } from "../../app/portal/(dashboard)/OwnContactEmailsCard";

const ME = { email: "account.me@example.test" };
beforeEach(() => { h.rpcCalls = []; h.fromCalls = 0; h.result = null; h.failWith = null; h.adminUsed = 0; });

describe("loadOwnContactEmails: one parameterless function, the caller's own session, nothing else", () => {
  it("calls only my_correspondence_email() with no arguments, and never reads the table or uses the service-role client", async () => {
    h.result = "preferred.me@example.test";
    const r = await loadOwnContactEmails(ME);
    expect(r).toEqual({ accountEmail: "account.me@example.test", preferredEmail: "preferred.me@example.test", available: true });
    expect(h.rpcCalls).toEqual([{ fn: "my_correspondence_email", args: [] }]);   // no parameter: nobody else's record can be requested
    expect(h.fromCalls).toBe(0);                                                  // no direct table read (so no evidence note, recorded-by or history can be selected)
    expect(h.adminUsed).toBe(0);
  });
  it("falls back to the account email wording: no value, or a blank/cleared preference, is 'no preference'", async () => {
    expect(await loadOwnContactEmails(ME)).toEqual({ accountEmail: "account.me@example.test", preferredEmail: null, available: true });
    h.result = "   ";
    expect(await loadOwnContactEmails(ME)).toMatchObject({ preferredEmail: null, available: true });
  });
  it("an unreadable record (for example the function does not exist yet) is 'not available', never presented as 'no preference'", async () => {
    h.failWith = { message: "function does not exist" };
    expect(await loadOwnContactEmails(ME)).toEqual({ accountEmail: "account.me@example.test", preferredEmail: null, available: false });
  });
  it("returns the session user's account email as given and nothing about anyone else", async () => {
    expect(await loadOwnContactEmails({ email: null })).toEqual({ accountEmail: null, preferredEmail: null, available: true });
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
