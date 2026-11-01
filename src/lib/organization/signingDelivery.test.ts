import { beforeEach, describe, expect, it, vi } from "vitest";

// Instructor signing-link destination. The pure decision (chooseSigningDelivery) and the resolver around the preference read; the account (login) email is never changed.
const h = vi.hoisted(() => ({ rows: [] as unknown[], error: null as unknown, throws: false }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ order: () => ({ order: () => ({ limit: async () => { if (h.throws) throw new Error("boom"); return { data: h.rows, error: h.error }; } }) }) }) }),
    }),
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: async () => undefined }));
vi.mock("@/lib/organization/authority", () => ({ authorizeWithSuperAdminOverride: async () => ({ ok: true }), PEOPLE_CAPABILITIES: { workforceAdminister: "x" } }));

import { chooseSigningDelivery, resolveInstructorSigningDelivery } from "./correspondenceEmail";

const ACCOUNT = "login.person@example.test";
const PREFERRED = "preferred.person@example.test";
const row = (email: string | null) => ({ id: "1", email, source: "staff_entered", evidence_note: "n", recorded_by: "u", created_at: "2026-11-01T00:00:00Z" });
beforeEach(() => { h.rows = []; h.error = null; h.throws = false; });

describe("chooseSigningDelivery (pure)", () => {
  it("uses a valid preferred email, labelled as preferred correspondence and masked", () => {
    const d = chooseSigningDelivery({ accountEmail: ACCOUNT, preference: PREFERRED });
    expect(d).toMatchObject({ ok: true, email: PREFERRED, source: "preferred_correspondence" });
    expect(d.ok && d.masked).toBe("p***n@e***.test");
    expect(d.ok && d.masked).not.toContain("preferred");
  });
  it("normalizes the preferred address (case, spaces)", () => {
    expect(chooseSigningDelivery({ accountEmail: ACCOUNT, preference: "  Preferred.Person@Example.test " })).toMatchObject({ ok: true, email: PREFERRED });
  });
  it("uses the account email when there is no preference (or it was cleared)", () => {
    expect(chooseSigningDelivery({ accountEmail: ACCOUNT, preference: null })).toMatchObject({ ok: true, email: ACCOUNT, source: "account_email" });
  });
  it("stops (no fallback) when a preference may exist but could not be read", () => {
    const d = chooseSigningDelivery({ accountEmail: ACCOUNT, preference: undefined });
    expect(d.ok).toBe(false);
    expect(JSON.stringify(d)).not.toContain(ACCOUNT);
  });
  it.each(["not-an-email", "two@example.test, other@example.test", "Name <a@example.test>", "a@b", "", "   "])("rejects an unusable preferred email %j without falling back", (bad) => {
    const d = chooseSigningDelivery({ accountEmail: ACCOUNT, preference: bad });
    expect(d.ok).toBe(false);
  });
  it("fails when there is no preference and no account email", () => {
    expect(chooseSigningDelivery({ accountEmail: null, preference: null }).ok).toBe(false);
    expect(chooseSigningDelivery({ accountEmail: "  ", preference: null }).ok).toBe(false);
  });
  it("a valid preference does not need an account email and never returns the account email", () => {
    const d = chooseSigningDelivery({ accountEmail: null, preference: PREFERRED });
    expect(d).toMatchObject({ ok: true, email: PREFERRED });
  });
});

describe("resolveInstructorSigningDelivery (reads the latest recorded preference)", () => {
  it("preferred exists -> used", async () => {
    h.rows = [row(PREFERRED)];
    expect(await resolveInstructorSigningDelivery("p1", ACCOUNT)).toMatchObject({ ok: true, email: PREFERRED, source: "preferred_correspondence" });
  });
  it("no record -> account email", async () => {
    h.rows = [];
    expect(await resolveInstructorSigningDelivery("p1", ACCOUNT)).toMatchObject({ ok: true, email: ACCOUNT, source: "account_email" });
  });
  it("latest record cleared -> account email", async () => {
    h.rows = [row(null)];
    expect(await resolveInstructorSigningDelivery("p1", ACCOUNT)).toMatchObject({ ok: true, email: ACCOUNT, source: "account_email" });
  });
  it("preference table unreadable (query error) -> fails safely, nothing resolved", async () => {
    h.error = { message: "relation does not exist" };
    const d = await resolveInstructorSigningDelivery("p1", ACCOUNT);
    expect(d.ok).toBe(false);
  });
  it("preference read throws -> fails safely", async () => {
    h.throws = true;
    expect((await resolveInstructorSigningDelivery("p1", ACCOUNT)).ok).toBe(false);
  });
  it("stored preference that fails validation -> fails safely, does not fall back to the account email", async () => {
    h.rows = [row("garbage")];
    const d = await resolveInstructorSigningDelivery("p1", ACCOUNT);
    expect(d.ok).toBe(false);
  });
});
