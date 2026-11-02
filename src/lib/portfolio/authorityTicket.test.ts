import { beforeEach, describe, expect, it, vi } from "vitest";

// The helper never makes an ordinary administrator write unavailable by itself, in any release order, and never lets an irreversible action proceed without a ticket.
const state = { enabled: false, user: { id: "u1" } as { id: string } | null, rpc: { error: null as null | { code?: string; message: string } }, throwIt: false, calls: [] as unknown[] };
vi.mock("./authorityTicketGate", () => ({ get AUTHORITY_TICKETS_ENABLED() { return state.enabled; } }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    if (state.throwIt) throw new Error("boom");
    return { auth: { getUser: async () => ({ data: { user: state.user } }) }, rpc: async (fn: string, args: unknown) => { state.calls.push([fn, args]); return { error: state.rpc.error }; } };
  },
}));
import { authorityTicket, mintTicket } from "./authorityTicket";

const U = { id: "u1" } as never;
beforeEach(() => { state.enabled = false; state.user = { id: "u1" }; state.rpc.error = null; state.throwIt = false; state.calls = []; vi.spyOn(console, "warn").mockImplementation(() => {}); });

describe("ordinary actions", () => {
  it("switch off: nothing is requested and the write goes ahead", async () => {
    expect(await authorityTicket(U, "file_hold:placed", "f1")).toEqual({ ok: true }); expect(state.calls).toEqual([]);
  });
  it("switch on: a ticket is requested for exactly this action and record", async () => {
    state.enabled = true;
    expect(await authorityTicket(U, "internal_review:approved", "F1")).toEqual({ ok: true });
    expect(state.calls).toEqual([["portfolio_authority_ticket", { p_purpose: "internal_review:approved", p_target: "F1" }]]);
  });
  for (const [label, err] of [["database not ready (function missing, PostgREST)", { code: "PGRST202", message: "Could not find the function public.portfolio_authority_ticket" }], ["database not ready (42883)", { code: "42883", message: "function does not exist" }], ["one-time-link session", { message: "sign in with your password or a second factor to confirm this action (a one-time-link session is not accepted)" }], ["not an administrator", { message: "only the Founder or an authorised executive admin may do this" }], ["any other failure", { message: "something else" }]] as const) {
    it(`switch on, ${label}: the write is still attempted (the database decides: observe allows it, enforce refuses it)`, async () => {
      state.enabled = true; state.rpc.error = err;
      expect(await authorityTicket(U, "declare_people", "F1")).toEqual({ ok: true });
    });
  }
  it("switch on, no session or a different user: the write is still attempted", async () => {
    state.enabled = true; state.user = null; expect(await authorityTicket(U, "declare_people", "F1")).toEqual({ ok: true });
    state.user = { id: "someone-else" }; expect(await authorityTicket(U, "declare_people", "F1")).toEqual({ ok: true });
  });
  it("switch on, the request itself throws: the write is still attempted", async () => {
    state.enabled = true; state.throwIt = true; expect(await authorityTicket(U, "declare_people", "F1")).toEqual({ ok: true });
  });
  it("what is logged when a ticket is not obtained names only the kind of action and the reason", async () => {
    state.enabled = true; state.rpc.error = { message: "token eyJ-secret-looking" };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await authorityTicket(U, "declare_people", "F1");
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain("declare_people"); expect(logged).not.toContain("eyJ"); expect(logged).not.toContain("u1");
  });
});

describe("irreversible actions are strict in every mode, whatever the switch says", () => {
  for (const purpose of ["erase_record", "erase_grant", "purge_log", "retention_policy"]) {
    it(`${purpose}: a ticket is requested even with the switch off, and no ticket means no action`, async () => {
      state.enabled = false; state.rpc.error = { message: "this action needs a second-factor sign-in" };
      const r = await authorityTicket(U, purpose, "x");
      expect(state.calls.length).toBe(1); expect(r.ok).toBe(false);
      expect(!r.ok && r.error).toMatch(/second-factor/);
    });
  }
  it("refused with a plain message when the database cannot be reached, when the session is wrong, and when the step is not installed", async () => {
    state.rpc.error = { code: "PGRST202", message: "Could not find the function" }; let r = await authorityTicket(U, "erase_record", "x"); expect(!r.ok && r.error).toMatch(/not available yet/);
    state.rpc.error = null; state.user = null; r = await authorityTicket(U, "erase_record", "x"); expect(!r.ok && r.error).toMatch(/sign-in could not be confirmed/);
    state.user = { id: "u1" }; state.throwIt = true; r = await authorityTicket(U, "purge_log", "x"); expect(r.ok).toBe(false);
  });
  it("proceeds only when a ticket was actually issued", async () => {
    expect(await authorityTicket(U, "erase_record", "x")).toEqual({ ok: true });
  });
});

describe("the reason is read correctly", () => {
  it("the real one-time-link refusal (whose text also mentions a second factor) is reported as a one-time-link session, not as a missing second factor", async () => {
    state.rpc.error = { message: "sign in with your password or a second factor to confirm this action (a one-time-link session is not accepted)" };
    expect(await mintTicket(U, "declare_people", "x")).toEqual({ ok: false, why: "one_time_link" });
    state.rpc.error = { message: "this action needs a second-factor sign-in" };
    expect(await mintTicket(U, "erase_record", "x")).toEqual({ ok: false, why: "second_factor" });
    state.rpc.error = { message: "confirm your second factor again: it must have been completed in the last 15 minutes" };
    expect(await mintTicket(U, "erase_record", "x")).toEqual({ ok: false, why: "second_factor" });
  });
});

describe("the ticket-path check", () => {
  it("mints regardless of the switch and reports the reason when it cannot", async () => {
    state.enabled = false; expect(await mintTicket(U, "declare_people", "ticket-check")).toEqual({ ok: true });
    state.rpc.error = { message: "this action needs a second-factor sign-in" }; expect(await mintTicket(U, "erase_record", "ticket-check")).toEqual({ ok: false, why: "second_factor" });
  });
});
