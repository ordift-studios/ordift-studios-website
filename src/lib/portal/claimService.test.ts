// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// Portal claim service: authorization, what is stored, what is audited, and what a stranger is told. The database functions are replaced by recording stand-ins (their own rules are rehearsed against a real
// database in rehearse_portal_claims.sh). Synthetic data only.
type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  user: null as null | { id: string; roles: string[] }, limited: false, rpcCalls: [] as { name: string; args: Row }[], rpcResult: {} as Record<string, unknown>, rpcError: null as null | { message: string },
  audit: [] as Row[], failAudit: false, system: [] as Row[],
  tables: { enquiries: [] as Row[], contact_emails: [] as Row[] } as Record<string, Row[]>,
}));
vi.mock("@/lib/portal/roles", () => ({
  getCurrentUser: async () => h.user,
  hasRole: (u: { roles: string[] } | null, r: string) => u?.roles.includes(r) ?? false,
  isStaffOrAdmin: (u: { roles: string[] } | null) => Boolean(u && ["staff", "admin", "super_admin"].some((r) => u.roles.includes(r))),
  isSuperAdmin: (u: { roles: string[] } | null) => u?.roles.includes("super_admin") ?? false,
}));
vi.mock("@/lib/shared/rateLimit", () => ({ checkRateLimit: async () => ({ allowed: !h.limited }) }));
vi.mock("@/lib/shared/env", () => ({ siteUrl: () => "https://lab.example.test" }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivityAsSystem: async (a: Row) => { h.system.push(a); } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({
  rpc: async (name: string, args: Row) => { h.rpcCalls.push({ name, args }); return { data: h.rpcResult[name] ?? null, error: h.rpcError }; },
  from: (table: string) => {
    const f: ((r: Row) => boolean)[] = []; let head = false; let insertRow: Row | null = null;
    const run = () => {
      if (insertRow) { if (table === "activity_log") { if (h.failAudit) return { data: null, error: { message: "boom" }, count: null }; h.audit.push(insertRow); } return { data: null, error: null, count: null }; }
      const m = (h.tables[table] ?? []).filter((r) => f.every((p) => p(r))); return { data: head ? null : m, error: null, count: m.length };
    };
    const q: Record<string, unknown> = {
      select: (_c?: string, o?: { head?: boolean }) => { head = Boolean(o?.head); return q; }, insert: (v: Row) => { insertRow = v; return Promise.resolve(run()); },
      eq: (c: string, v: unknown) => { f.push((r) => r[c] === v); return q; }, neq: (c: string, v: unknown) => { f.push((r) => r[c] !== v); return q; },
      ilike: (c: string, v: string) => { f.push((r) => String(r[c] ?? "").toLowerCase() === v.toLowerCase()); return q; },
      is: (c: string, v: unknown) => { f.push((r) => (r[c] ?? null) === v); return q; }, not: (c: string, _op: string, v: unknown) => { f.push((r) => (r[c] ?? null) !== v); return q; },
      limit: () => q, order: () => q, maybeSingle: async () => { const r = run(); return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: null }; },
      then: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res),
    };
    return q;
  } }) }));
import { attemptClaim, createClaimInvitation, releasePortalOwnership, revokeClaimInvitation } from "./claimService";
import { hashCode, hashToken } from "./claims";

const staff = { id: "staff-1", roles: ["staff"] }; const client = { id: "client-1", roles: ["client"] }; const sa = { id: "sa-1", roles: ["super_admin"] };
const enq = (o: Row = {}) => ({ id: "e1", reference_number: "ENQ-2026-000001", full_name: "Ama Mensah", email: "ama@example.test", user_id: null, contact_id: "c1", ...o });
const create = (o: Partial<Parameters<typeof createClaimInvitation>[0]> = {}) => createClaimInvitation({ actorUserId: "staff-1", enquiryId: "e1", channel: "whatsapp", note: "", expiresInDays: 3, ...o });
beforeEach(() => {
  h.user = staff; h.limited = false; h.rpcCalls = []; h.rpcError = null; h.audit = []; h.system = []; h.failAudit = false;
  h.rpcResult = { create_portal_claim: { outcome: "created", claim_id: "claim-1" }, revoke_portal_claim: { outcome: "revoked", enquiry_id: "e1" }, release_enquiry_ownership: { outcome: "released" } };
  h.tables = { enquiries: [enq()], contact_emails: [] };
});

describe("createClaimInvitation", () => {
  it("refuses a client, a signed-out visitor, and an actor id that is not the signed-in person, without touching the database", async () => {
    h.user = client; expect((await create()).ok).toBe(false); h.user = null; expect((await create()).ok).toBe(false); h.user = staff; expect((await create({ actorUserId: "someone-else" })).ok).toBe(false);
    expect(h.rpcCalls).toEqual([]);
  });
  it("stores only HASHES: the database receives the hash of the token and of the token+code, never either in clear, and the link and code are returned once", async () => {
    const r = await create(); expect(r.ok).toBe(true); if (!r.ok) return;
    const token = r.link.split("/portal/claim/")[1]; const call = h.rpcCalls[0]; expect(call.name).toBe("create_portal_claim");
    expect(call.args.p_token_hash).toBe(hashToken(token)); expect(call.args.p_code_hash).toBe(hashCode(token, r.code));
    expect(JSON.stringify(call.args)).not.toContain(token); expect(JSON.stringify(call.args)).not.toContain(r.code);
    expect(r.invitationText).toContain(r.link); expect(r.invitationText).not.toContain(r.code); expect(r.codeText).toContain(r.code);
    expect(JSON.stringify(h.audit)).not.toContain(token); expect(JSON.stringify(h.audit)).not.toContain(r.code);
  });
  it("audits the creation (who, how, when it expires, how risky) before returning anything", async () => {
    await create({ channel: "telephone", note: "spoke to her" }); expect(h.audit[0]).toMatchObject({ actor_user_id: "staff-1", action: "enquiry.portal_claim_created", entity_id: "e1" });
    expect(h.audit[0].metadata).toMatchObject({ claimId: "claim-1", channel: "telephone", riskLevel: "normal", noteGiven: true });
  });
  it("if the audit entry cannot be written the invitation is revoked and NO link or code is returned", async () => {
    h.failAudit = true; const r = await create(); expect(r.ok).toBe(false); expect(JSON.stringify(r)).not.toMatch(/portal\/claim|\d{6}/);
    expect(h.rpcCalls.map((c) => c.name)).toEqual(["create_portal_claim", "revoke_portal_claim"]); expect(h.rpcCalls[1].args).toMatchObject({ p_claim: "claim-1", p_reason: "audit_failed" });
  });
  it("tells staff to take more care for a shared mailbox, a placeholder email and look-alike records, but still issues nothing automatically", async () => {
    h.tables.contact_emails = [{ email: "ama@example.test", is_shared: true, removed_at: null }]; h.tables.enquiries.push(enq({ id: "e2", user_id: "other-account" }));
    const r = await create(); expect(r.ok && r.risk.level).toBe("elevated"); expect(r.ok && r.risk.reasons.join(" ")).toMatch(/SHARED mailbox/); expect(r.ok && r.risk.reasons.join(" ")).toMatch(/do not assume/);
    h.tables.enquiries = [enq({ email: "enq-2026-000001@no-email.invalid" })]; h.tables.contact_emails = []; const p = await create(); expect(p.ok && p.risk.reasons.join(" ")).toMatch(/no real email/);
  });
  it("refuses an owned project, an open invitation, a bad channel and an over-long note", async () => {
    h.tables.enquiries = [enq({ user_id: "u1" })]; expect((await create()).ok).toBe(false);
    h.tables.enquiries = [enq()]; h.rpcResult.create_portal_claim = { outcome: "open_claim_exists" }; const o = await create(); expect(!o.ok && o.error).toMatch(/already open/);
    expect((await create({ channel: "carrier-pigeon" })).ok).toBe(false); expect((await create({ note: "x".repeat(301) })).ok).toBe(false);
  });
  it("is rate limited", async () => { h.limited = true; expect((await create()).ok).toBe(false); expect(h.rpcCalls).toEqual([]); });
});

describe("attemptClaim", () => {
  const T = "A".repeat(43);
  const attempt = (o: Partial<Parameters<typeof attemptClaim>[0]> = {}) => attemptClaim({ claimerUserId: "client-1", token: T, codeInput: "123456", ...o });
  beforeEach(() => { h.user = client; h.rpcResult.attempt_portal_claim = { outcome: "claimed", enquiry_id: "e1", claim_id: "claim-1" }; });
  it("needs the person to be signed in as themselves", async () => { h.user = null; expect((await attempt()).outcome).toBe("not_signed_in"); h.user = client; expect((await attempt({ claimerUserId: "other" })).outcome).toBe("not_signed_in"); expect(h.rpcCalls).toEqual([]); });
  it("refuses a malformed link or code before any database call", async () => {
    expect((await attempt({ token: "short" })).outcome).toBe("not_found"); expect((await attempt({ codeInput: "12ab" })).outcome).toBe("invalid_input"); expect(h.rpcCalls).toEqual([]);
  });
  it("sends the database the HASHES of the link and of link+code and the signed-in person's own id, and audits a success", async () => {
    const r = await attempt({ codeInput: " 123 456 " }); expect(r).toMatchObject({ ok: true, outcome: "claimed", enquiryId: "e1" });
    expect(h.rpcCalls[0].args).toEqual({ p_token_hash: hashToken(T), p_code_hash: hashCode(T, "123456"), p_claimer: "client-1" });
    expect(h.system[0]).toMatchObject({ actorUserId: "client-1", action: "enquiry.portal_claim_succeeded", entityId: "e1" });
  });
  it("a wrong code says how many tries are left, is audited as a failure, and reveals nothing about the project", async () => {
    h.rpcResult.attempt_portal_claim = { outcome: "bad_code", attempts_left: 3, enquiry_id: "e1", claim_id: "claim-1" }; const r = await attempt();
    expect(r).toMatchObject({ ok: false, outcome: "bad_code", attemptsLeft: 3 }); expect(r.enquiryId).toBeUndefined(); expect(r.message).toMatch(/3 tries/); expect(JSON.stringify(r)).not.toMatch(/e1|ENQ/);
    expect(h.system[0]).toMatchObject({ action: "enquiry.portal_claim_failed" }); expect(h.system[0].metadata).toMatchObject({ outcome: "bad_code", attemptsLeft: 3 });
  });
  it("a staff account is refused with a plain explanation, an unknown, expired, revoked or already-used link all read the same, and none returns a project id", async () => {
    h.rpcResult.attempt_portal_claim = { outcome: "not_eligible", reason: "staff_account", enquiry_id: "e1" }; const s = await attempt(); expect(s.ok).toBe(false); expect(s.message).toMatch(/staff account/); expect(s.enquiryId).toBeUndefined();
    const msgs = new Set<string>(); for (const o of ["not_found", "expired", "revoked", "already_claimed", "already_owned"]) { h.rpcResult.attempt_portal_claim = { outcome: o, enquiry_id: "e1" }; const r = await attempt(); expect(r.ok).toBe(false); expect(r.enquiryId).toBeUndefined(); msgs.add(r.message); }
    expect(msgs.size).toBe(1);
  });
  it("pressing twice as the owner is recognised, not treated as a failure", async () => { h.rpcResult.attempt_portal_claim = { outcome: "already_yours", enquiry_id: "e1" }; expect(await attempt()).toMatchObject({ ok: true, enquiryId: "e1" }); });
  it("is rate limited per person, and the limit itself is audited", async () => { h.limited = true; const r = await attempt(); expect(r.outcome).toBe("rate_limited"); expect(h.rpcCalls).toEqual([]); expect(h.system[0].metadata).toMatchObject({ reason: "rate_limited" }); });
  it("a database error gives a calm message and never claims anything", async () => { h.rpcError = { message: "boom" }; const r = await attempt(); expect(r.ok).toBe(false); expect(r.enquiryId).toBeUndefined(); });
});

describe("revoke and release", () => {
  it("revoking needs staff, is audited, and a closed invitation is reported as no longer open", async () => {
    h.user = client; expect((await revokeClaimInvitation({ actorUserId: "client-1", claimId: "c", reason: "x" })).ok).toBe(false);
    h.user = staff; expect((await revokeClaimInvitation({ actorUserId: "staff-1", claimId: "claim-1", reason: "changed mind" })).ok).toBe(true); expect(h.system.at(-1)).toMatchObject({ action: "enquiry.portal_claim_revoked", entityId: "e1" });
    h.rpcResult.revoke_portal_claim = { outcome: "claimed" }; expect((await revokeClaimInvitation({ actorUserId: "staff-1", claimId: "claim-1", reason: "x" })).ok).toBe(false);
  });
  it("releasing ownership is for a Super Admin only, needs a written reason, refuses while money is involved, and is audited", async () => {
    h.user = staff; expect((await releasePortalOwnership({ actorUserId: "staff-1", enquiryId: "e1", reason: "Wrong person claimed this." })).ok).toBe(false); expect(h.rpcCalls).toEqual([]);
    h.user = sa; expect((await releasePortalOwnership({ actorUserId: "sa-1", enquiryId: "e1", reason: "short" })).ok).toBe(false); expect(h.rpcCalls).toEqual([]);
    h.rpcError = { message: "payments_exist" }; const p = await releasePortalOwnership({ actorUserId: "sa-1", enquiryId: "e1", reason: "Wrong person claimed this." }); expect(!p.ok && p.error).toMatch(/payment/); expect(h.system).toEqual([]);
    h.rpcError = null; expect((await releasePortalOwnership({ actorUserId: "sa-1", enquiryId: "e1", reason: "Wrong person claimed this." })).ok).toBe(true); expect(h.system[0]).toMatchObject({ action: "enquiry.portal_ownership_released" });
  });
});
