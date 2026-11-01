// @vitest-environment node
//
// SIGNATURE VAULT (migration 0179) against the REAL schema (throwaway local Postgres + PostgREST). SYNTHETIC data only: the "signature" is random bytes behind a PNG header.
// Only the private storage bucket is stubbed in memory. Needs a FRESH scratch DB each run (the audit tables are append-only), with 0177-0179 applied and the private PostgREST restarted after applying:
//   E2E_DB=p4_e2e E2E_SUPABASE_URL=http://127.0.0.1:54997 npx vitest run --config vitest.localdb.config.ts src/lib/signatures/vault.localdb.e2e.ts
import { createHash, randomBytes } from "node:crypto";
import { execSync } from "node:child_process";
import { beforeAll, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  agent: null as unknown,
  files: {} as Record<string, Uint8Array>,
  logs: [] as { action: string; metadata: Record<string, unknown> }[],
  fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const undici = await import("undici");
    (h as { agent: unknown }).agent ??= new undici.Agent({ keepAliveTimeout: 1, keepAliveMaxTimeout: 1 });
    return (await undici.fetch(String(input).replace("/rest/v1", ""), { ...(init as object), dispatcher: (h as { agent: unknown }).agent as import("undici").Dispatcher })) as unknown as Response;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: vi.fn(async (e: { action: string; metadata: Record<string, unknown> }) => { h.logs.push({ action: e.action, metadata: e.metadata }); }) }));
vi.mock("@/lib/supabase/admin", async () => {
  const { createClient: make } = await import("@supabase/supabase-js");
  return {
    createAdminClient: () => {
      const real = make(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: h.fetch } });
      return new Proxy(real, {
        get(target, prop) {
          if (prop === "storage") {
            return {
              from: (bucket: string) => ({
                download: async (path: string) => { const f = h.files[`${bucket}:${path}`]; return f ? { data: new Blob([f as BlobPart]), error: null } : { data: null, error: { message: "missing" } }; },
                upload: async (path: string, body: Buffer) => { if (h.files[`${bucket}:${path}`]) return { error: { message: "exists" } }; h.files[`${bucket}:${path}`] = new Uint8Array(body); return { error: null }; },
              }),
            };
          }
          return Reflect.get(target, prop, target);
        },
      });
    },
  };
});

import { approveSignatureUse, loadOwnVault, recordSignedResult, registerSignatureAsset, revokeSignatureApproval, revokeSignatureAsset, useApprovedSignature } from "./vault";

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) throw new Error("Refusing to run: this E2E may only target a localhost database.");

const OWNER = "00000000-0000-4000-8000-000000000b01";
const OTHER_SUPER = "00000000-0000-4000-8000-000000000b02";
const STAFF = "00000000-0000-4000-8000-000000000b03";
const sql = (q: string) => execSync(process.env.E2E_DB ? `docker exec -i ordift-mig-check2 psql -U supabase_admin -h 127.0.0.1 -d ${process.env.E2E_DB} -X -q -v ON_ERROR_STOP=1 -At` : "docker exec -i ordift-mig-check2 psql -U postgres -h 127.0.0.1 -v ON_ERROR_STOP=1 -At", { input: q }).toString().trim();
const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(600)]);
const DOC_A = Buffer.from("SYNTHETIC UNSIGNED DOCUMENT A - " + randomBytes(8).toString("hex"));
const DOC_B = Buffer.from("SYNTHETIC UNSIGNED DOCUMENT B - " + randomBytes(8).toString("hex"));
const terms = (assetId: string, doc: Buffer, extra: Record<string, unknown> = {}) => ({ assetId, documentKind: "agreement", documentReference: "SYNTHETIC-AGR-1", documentSha256: sha(doc), purpose: "Synthetic test of one approved placement.", recipient: "synthetic.counterparty@example.test", placement: "Signature block, last page, left", action: "Apply the owner's handwritten signature once", ...extra });
const events = (approval: string) => sql(`select string_agg(event_type || ':' || coalesce(detail->>'reason',''), ',' order by occurred_at, id) from public.signature_vault_events where approval_id='${approval}'`);
let assetId = "";

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values ('${OWNER}','owner@vault.test'),('${OTHER_SUPER}','other@vault.test'),('${STAFF}','staff@vault.test') on conflict do nothing;
    insert into public.profiles (id, full_name, access_status) values ('${OWNER}','Synthetic Owner','active'),('${OTHER_SUPER}','Synthetic Other Super','active'),('${STAFF}','Synthetic Staff','active') on conflict (id) do nothing;
    insert into public.user_roles (user_id, role_id) select u, r.id from public.roles r, unnest(array['${OWNER}','${OTHER_SUPER}']::uuid[]) u where r.slug in ('admin','super_admin') on conflict do nothing;
    insert into public.user_roles (user_id, role_id) select '${STAFF}', r.id from public.roles r where r.slug = 'staff' on conflict do nothing;
  `);
});

describe("registration is owner-only and grants no permission", () => {
  it("staff cannot register; a non-image is refused; the owner registers (restricted, automatic use off) and no approval exists", async () => {
    expect((await registerSignatureAsset({ actorUserId: STAFF, label: "Staff attempt", bytes: PNG })).ok).toBe(false);
    expect((await registerSignatureAsset({ actorUserId: OWNER, label: "Not an image", bytes: Buffer.from("hello") })).ok).toBe(false);
    const r = await registerSignatureAsset({ actorUserId: OWNER, label: "Synthetic handwritten signature", bytes: PNG });
    expect(r.ok).toBe(true);
    assetId = (r as { assetId: string }).assetId;
    expect(sql(`select restricted::text||','||automatic_use::text||','||status||','||(owner_profile_id='${OWNER}')::text||','||(file_sha256='${sha(PNG)}')::text from public.signature_assets where id='${assetId}'`)).toBe("true,false,active,true,true");
    expect(sql(`select count(*) from public.signature_use_approvals where asset_id='${assetId}'`)).toBe("0");
    expect(Object.keys(h.files).some((k) => k.startsWith("signature-vault:assets/"))).toBe(true);
  });
  it("the database refuses automatic use, a different registrant, deletion and any edit other than revocation", () => {
    const base = (cols: string, vals: string) => `insert into public.signature_assets (owner_profile_id, registered_by, label, storage_path, file_sha256, mime_type, size_bytes${cols}) values ('${OWNER}','${OWNER}','Direct insert','p/${randomBytes(4).toString("hex")}','${sha("x")}','image/png',10${vals})`;
    expect(() => sql(base(", automatic_use", ", true"))).toThrow();
    expect(() => sql(base(", restricted", ", false"))).toThrow();
    expect(() => sql(`insert into public.signature_assets (owner_profile_id, registered_by, label, storage_path, file_sha256, mime_type, size_bytes) values ('${OWNER}','${OTHER_SUPER}','Other registrant','p/q','${sha("y")}','image/png',10)`)).toThrow();
    expect(() => sql(`delete from public.signature_assets where id='${assetId}'`)).toThrow();
    expect(() => sql(`update public.signature_assets set label='Renamed' where id='${assetId}'`)).toThrow();
    expect(() => sql(`update public.signature_assets set automatic_use=true where id='${assetId}'`)).toThrow();
    expect(() => sql(`update public.signature_assets set file_sha256='${sha("swap")}' where id='${assetId}'`)).toThrow();
  });
  it("no signed-in or anonymous role can read or write the vault tables, and the bucket has no policy for them", () => {
    for (const t of ["signature_assets", "signature_use_approvals", "signature_vault_events"]) for (const role of ["authenticated", "anon"]) for (const priv of ["select", "insert", "update", "delete"]) expect(sql(`select has_table_privilege('${role}','public.${t}','${priv}')`), `${role} ${priv} ${t}`).toBe("f");
    expect(sql(`select has_function_privilege('authenticated','public.consume_signature_approval(uuid,text,uuid,text)','execute') or has_function_privilege('anon','public.consume_signature_approval(uuid,text,uuid,text)','execute')`)).toBe("f");
    expect(sql(`select count(*) from pg_policies where schemaname='storage' and tablename='objects' and (qual ilike '%signature-vault%' or with_check ilike '%signature-vault%')`)).toBe("0");
    expect(sql(`select public::text from storage.buckets where id='signature-vault'`)).toBe("false");
  });
});

describe("approval: explicit, document-specific, bound to the hash", () => {
  it("only the owner can approve; every term is required; a hash must be a full SHA-256; at most 72 hours", async () => {
    expect((await approveSignatureUse({ actorUserId: OTHER_SUPER, input: terms(assetId, DOC_A) })).ok).toBe(false);     // incorrect owner: another Super Admin
    expect((await approveSignatureUse({ actorUserId: STAFF, input: terms(assetId, DOC_A) })).ok).toBe(false);          // not a Super Admin
    for (const bad of [{ documentSha256: "abc" }, { purpose: "short" }, { recipient: "" }, { placement: "" }, { action: "" }, { hours: 73 }, { hours: 0 }, { documentKind: "poem" }]) expect((await approveSignatureUse({ actorUserId: OWNER, input: terms(assetId, DOC_A, bad) })).ok, JSON.stringify(bad)).toBe(false);
    expect(sql(`select count(*) from public.signature_use_approvals`)).toBe("0");
  });
  it("the database refuses a long-lived approval, a back-dated one, other owner's asset, and edits to approval terms", () => {
    const ins = (exp: string, owner = OWNER) => `insert into public.signature_use_approvals (asset_id, owner_profile_id, approved_by, document_kind, document_reference, document_sha256, purpose, recipient, placement, action, expires_at) values ('${assetId}','${owner}','${owner}','agreement','REF-DIRECT','${sha("d")}','Direct insert test purpose','r@example.test','block','apply once', ${exp})`;
    expect(() => sql(ins("now() + interval '73 hours'"))).toThrow();
    expect(() => sql(ins("now() - interval '1 hour'"))).toThrow();
    expect(() => sql(ins("now() + interval '1 hour'", OTHER_SUPER))).toThrow();
  });
});

describe("use: single-use, exact document, owner only, unexpired, unrevoked", () => {
  let approval = "";
  it("an altered document is refused and does NOT spend the approval", async () => {
    const a = await approveSignatureUse({ actorUserId: OWNER, input: terms(assetId, DOC_A) });
    expect(a.ok).toBe(true);
    approval = (a as { approvalId: string }).approvalId;
    const altered = await useApprovedSignature({ actorUserId: OWNER, approvalId: approval, unsignedBytes: Buffer.concat([DOC_A, Buffer.from(" ")]) });
    expect(altered.ok).toBe(false);
    const otherDoc = await useApprovedSignature({ actorUserId: OWNER, approvalId: approval, unsignedBytes: DOC_B }); // approval for one document never carries to another
    expect(otherDoc.ok).toBe(false);
    expect(sql(`select status from public.signature_use_approvals where id='${approval}'`)).toBe("approved");
    expect(events(approval)).toBe("approval_granted:,use_refused:document_changed,use_refused:document_changed");
  });
  it("another owner or staff cannot use it (and the refusal is audited)", async () => {
    expect((await useApprovedSignature({ actorUserId: OTHER_SUPER, approvalId: approval, unsignedBytes: DOC_A })).ok).toBe(false);
    expect((await useApprovedSignature({ actorUserId: STAFF, approvalId: approval, unsignedBytes: DOC_A })).ok).toBe(false);
    expect((await useApprovedSignature({ actorUserId: OWNER, approvalId: "00000000-0000-4000-8000-0000000000ff", unsignedBytes: DOC_A })).ok).toBe(false); // unknown approval: nothing to use
    expect(sql(`select status from public.signature_use_approvals where id='${approval}'`)).toBe("approved");
    expect(events(approval)).toContain("use_refused:wrong_owner");
  });
  it("the exact document by the owner works ONCE: the unsigned copy is preserved first, the image returns in memory unchanged, and a second use is refused", async () => {
    const used = await useApprovedSignature({ actorUserId: OWNER, approvalId: approval, unsignedBytes: DOC_A });
    expect(used.ok).toBe(true);
    if (!used.ok) return;
    expect(sha(used.image)).toBe(sha(PNG));
    expect(used.placement).toBe("Signature block, last page, left");
    expect(Buffer.from(h.files[`signature-vault:unsigned/${approval}/${sha(DOC_A)}.bin`]).equals(DOC_A)).toBe(true);        // the unsigned version is preserved
    expect(sql(`select status || ',' || (unsigned_storage_path is not null)::text from public.signature_use_approvals where id='${approval}'`)).toBe("used,true");
    expect((await useApprovedSignature({ actorUserId: OWNER, approvalId: approval, unsignedBytes: DOC_A })).ok).toBe(false);   // reuse
    expect(events(approval)).toContain("use_granted:");
    expect(events(approval)).toContain("use_refused:approval_already_used");
  });
  it("approval terms and the used state can no longer be edited; the signed result is recorded exactly once with the unsigned original intact", async () => {
    for (const q of [`update public.signature_use_approvals set document_sha256='${sha("z")}' where id='${approval}'`, `update public.signature_use_approvals set expires_at=expires_at + interval '1 hour' where id='${approval}'`, `update public.signature_use_approvals set status='approved', used_at=null, used_by=null, unsigned_storage_path=null where id='${approval}'`, `delete from public.signature_use_approvals where id='${approval}'`]) expect(() => sql(q), q).toThrow();
    const signed = Buffer.concat([DOC_A, Buffer.from("|SYNTHETIC-SIGNED")]);
    expect((await recordSignedResult({ actorUserId: OTHER_SUPER, approvalId: approval, signedBytes: signed })).ok).toBe(false);
    const r = await recordSignedResult({ actorUserId: OWNER, approvalId: approval, signedBytes: signed });
    expect(r).toEqual({ ok: true, signedSha256: sha(signed) });
    expect((await recordSignedResult({ actorUserId: OWNER, approvalId: approval, signedBytes: Buffer.from("again") })).ok).toBe(false);
    expect(sql(`select signed_document_sha256 from public.signature_use_approvals where id='${approval}'`)).toBe(sha(signed));
    expect(Buffer.from(h.files[`signature-vault:unsigned/${approval}/${sha(DOC_A)}.bin`]).equals(DOC_A)).toBe(true);
  });
  it("two simultaneous attempts on one fresh approval: exactly one succeeds", async () => {
    const a = (await approveSignatureUse({ actorUserId: OWNER, input: terms(assetId, DOC_B, { documentReference: "SYNTHETIC-AGR-2" }) })) as { approvalId: string };
    const res = await Promise.all([1, 2, 3, 4].map(() => useApprovedSignature({ actorUserId: OWNER, approvalId: a.approvalId, unsignedBytes: DOC_B })));
    expect(res.filter((x) => x.ok).length).toBe(1);
  });
});

describe("expiry and revocation", () => {
  it("an expired approval is refused (and audited)", async () => {
    const id = sql(`insert into public.signature_use_approvals (asset_id, owner_profile_id, approved_by, document_kind, document_reference, document_sha256, purpose, recipient, placement, action, expires_at) values ('${assetId}','${OWNER}','${OWNER}','letter','SYNTHETIC-LTR-1','${sha(DOC_A)}','Synthetic expiry test purpose','r@example.test','block','apply once', now() + interval '2 seconds') returning id`).split("\n")[0];
    await new Promise((r) => setTimeout(r, 2600));
    expect((await useApprovedSignature({ actorUserId: OWNER, approvalId: id, unsignedBytes: DOC_A })).ok).toBe(false);
    expect(events(id)).toBe("use_refused:approval_expired");
    expect(sql(`select status from public.signature_use_approvals where id='${id}'`)).toBe("approved"); // nothing was consumed
  });
  it("a revoked approval is refused; only the owner can revoke it", async () => {
    const a = (await approveSignatureUse({ actorUserId: OWNER, input: terms(assetId, DOC_A, { documentReference: "SYNTHETIC-AGR-3" }) })) as { approvalId: string };
    expect((await revokeSignatureApproval({ actorUserId: OTHER_SUPER, approvalId: a.approvalId, reason: "not mine to revoke" })).ok).toBe(false);
    expect((await revokeSignatureApproval({ actorUserId: OWNER, approvalId: a.approvalId, reason: "Changed my mind about this document" })).ok).toBe(true);
    expect((await useApprovedSignature({ actorUserId: OWNER, approvalId: a.approvalId, unsignedBytes: DOC_A })).ok).toBe(false);
    expect(events(a.approvalId)).toContain("use_refused:approval_revoked");
    expect((await revokeSignatureApproval({ actorUserId: OWNER, approvalId: a.approvalId, reason: "Revoking twice" })).ok).toBe(false);
  });
  it("revoking the asset revokes its open approvals, blocks new ones, and the revoked asset is frozen", async () => {
    const open = (await approveSignatureUse({ actorUserId: OWNER, input: terms(assetId, DOC_A, { documentReference: "SYNTHETIC-AGR-4" }) })) as { approvalId: string };
    expect((await revokeSignatureAsset({ actorUserId: OTHER_SUPER, assetId, reason: "not mine to revoke" })).ok).toBe(false);
    const r = await revokeSignatureAsset({ actorUserId: OWNER, assetId, reason: "Replacing this signature image" });
    expect(r.ok && r.approvalsRevoked).toBeGreaterThanOrEqual(1);
    expect((await useApprovedSignature({ actorUserId: OWNER, approvalId: open.approvalId, unsignedBytes: DOC_A })).ok).toBe(false);
    expect((await approveSignatureUse({ actorUserId: OWNER, input: terms(assetId, DOC_A, { documentReference: "SYNTHETIC-AGR-5" }) })).ok).toBe(false);
    expect(sql(`select count(*) from public.signature_use_approvals where asset_id='${assetId}' and status='approved'`)).toBe("0");
    expect(() => sql(`update public.signature_assets set status='active', revoked_at=null, revoked_by=null, revoked_reason=null where id='${assetId}'`)).toThrow();
  });
});

describe("audit and visibility", () => {
  it("the audit log is append-only and nothing logged contains the image or a full document hash", () => {
    expect(() => sql(`update public.signature_vault_events set detail='{}'::jsonb`)).toThrow();
    expect(() => sql(`delete from public.signature_vault_events`)).toThrow();
    const types = sql(`select string_agg(distinct event_type, ',' order by event_type) from public.signature_vault_events`);
    for (const t of ["asset_registered", "approval_granted", "use_granted", "use_refused", "signed_result_recorded", "approval_revoked", "asset_revoked"]) expect(types).toContain(t);
    const text = JSON.stringify(h.logs);
    expect(text).not.toContain(PNG.toString("base64").slice(0, 40));
    expect(text).not.toContain(sha(DOC_A));
    expect(h.logs.map((l) => l.action)).toEqual(expect.arrayContaining(["signature_vault.asset_registered", "signature_vault.approval_granted", "signature_vault.signature_used", "signature_vault.asset_revoked"]));
  });
  it("the owner's own view never carries the image or a URL, and a non-owner sees nothing", async () => {
    const own = await loadOwnVault(OWNER);
    expect(own?.assets.length).toBeGreaterThan(0);
    expect(JSON.stringify(own)).not.toMatch(/https?:\/\/|token|storage_path|base64/i);
    expect(await loadOwnVault(STAFF)).toBeNull();
    expect((await loadOwnVault(OTHER_SUPER))?.assets).toEqual([]);
  });
});
