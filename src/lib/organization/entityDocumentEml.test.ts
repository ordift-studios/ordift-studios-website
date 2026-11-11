// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

// Original e-mail (.eml) storage in the private entity vault: validated, stored unaltered under its SHA-256, recorded as message/rfc822, and served only as a download.
const h = vi.hoisted(() => ({ superAdmin: true, uploads: [] as { path: string; bytes: Buffer; opts: Record<string, unknown> }[], inserts: [] as Record<string, unknown>[], rows: [] as Record<string, unknown>[], signed: [] as { path: string; opts: unknown }[], docRow: null as Record<string, unknown> | null }));
vi.mock("@/lib/organization/authority", () => ({ isSuperAdminId: async () => h.superAdmin }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: (c: string) => (c === "id" ? { maybeSingle: async () => ({ data: h.docRow, error: null }) } : Promise.resolve({ data: h.rows, error: null })) }),
      insert: (row: Record<string, unknown>) => { h.inserts.push(row); return { select: () => ({ single: async () => ({ data: { id: "doc-new" }, error: null }) }) }; },
    }),
    storage: { from: () => ({ upload: async (path: string, bytes: Buffer, opts: Record<string, unknown>) => { h.uploads.push({ path, bytes, opts }); return { error: null }; }, createSignedUrl: async (path: string, _ttl: number, opts?: unknown) => { h.signed.push({ path, opts }); return { data: { signedUrl: "https://signed.example/x" }, error: null }; } }) },
  }),
}));
import { addVaultDocument } from "./entityRegistrations";
import { getEmployingEntityDocumentSignedUrl } from "./legalEntities";

const E = "11111111-1111-4111-8111-111111111101";
const eml = new TextEncoder().encode(["Received: from mail.provider.example by mx.example; Sun, 8 Nov 2026 15:42:01 +0300", "From: Provider Team <noreply@provider.example>", "Date: Sun, 8 Nov 2026 15:42:00 +0300", "Subject: Your order SYNTH-0001 is confirmed", "MIME-Version: 1.0", "", "Four payments. Zero interest.", ""].join("\r\n"));
const add = (over: Record<string, unknown> = {}) => addVaultDocument({ entityId: E, documentType: "other_financial_document", filename: "provider.eml", mimeType: "message/rfc822", bytes: eml, actorUserId: "u", ...over } as never);
beforeEach(() => { h.superAdmin = true; h.uploads = []; h.inserts = []; h.rows = []; h.signed = []; h.docRow = null; });

describe("original e-mail storage", () => {
  it("stores a real .eml byte for byte, records its SHA-256 and the message/rfc822 type", async () => {
    expect(await add()).toMatchObject({ ok: true, documentId: "doc-new", duplicateOf: null });
    expect(h.uploads).toHaveLength(1);
    expect(Buffer.compare(h.uploads[0].bytes, Buffer.from(eml))).toBe(0);                          // the original bytes, unaltered
    expect(h.uploads[0].opts).toMatchObject({ contentType: "message/rfc822", upsert: false });
    expect(h.inserts[0]).toMatchObject({ mime_type: "message/rfc822", document_type: "other_financial_document", original_filename: "provider.eml", size_bytes: eml.byteLength, file_sha256: createHash("sha256").update(eml).digest("hex") });
  });
  it("accepts the types browsers report for an .eml (empty, octet-stream) and stores them as message/rfc822", async () => {
    for (const t of ["", "application/octet-stream"]) { h.uploads = []; h.inserts = []; expect(await add({ mimeType: t })).toMatchObject({ ok: true }); expect(h.inserts[0].mime_type).toBe("message/rfc822"); }
  });
  it("refuses anything that is not a real message, a wrong reported type, the wrong document class, a continuation page, and non-Super-Admins", async () => {
    expect(await add({ bytes: new TextEncoder().encode("%PDF-1.7 not an e-mail") })).toMatchObject({ ok: false });
    expect(await add({ bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]) })).toMatchObject({ ok: false });
    expect(await add({ mimeType: "image/png" })).toMatchObject({ ok: false, error: expect.stringMatching(/different type of file/) });
    expect(await add({ documentType: "purchase_receipt" })).toMatchObject({ ok: false, error: expect.stringMatching(/Other financial supporting document/) });
    expect(await add({ continuationOf: { documentId: "x", pageNumber: 2, pageCount: 3 } })).toMatchObject({ ok: false });
    h.superAdmin = false; expect(await add()).toMatchObject({ ok: false });
    expect(h.uploads).toHaveLength(0); expect(h.inserts).toHaveLength(0);                           // nothing is stored on any refusal
  });
  it("a message/rfc822 type on a file that is NOT named .eml is still refused (no other file may use the e-mail type)", async () => {
    expect(await addVaultDocument({ entityId: E, documentType: "other_financial_document", filename: "notes.pdf", mimeType: "message/rfc822", bytes: eml, actorUserId: "u" } as never)).toMatchObject({ ok: false });
    expect(h.uploads).toHaveLength(0);
  });
  it("PDF, JPEG and PNG keep working exactly as before", async () => {
    expect(await addVaultDocument({ entityId: E, documentType: "other_financial_document", filename: "statement.pdf", mimeType: "application/pdf", bytes: new TextEncoder().encode("%PDF-1.7 synthetic"), actorUserId: "u" } as never)).toMatchObject({ ok: true });
    expect(h.inserts[0]).toMatchObject({ mime_type: "application/pdf" });
    expect(await addVaultDocument({ entityId: E, documentType: "other_financial_document", filename: "x.txt", mimeType: "text/plain", bytes: eml, actorUserId: "u" } as never)).toMatchObject({ ok: false });
  });
});

describe("serving a stored document", () => {
  it("an e-mail is served ONLY as a download (Content-Disposition: attachment); a PDF is served as before", async () => {
    h.docRow = { employing_entity_id: E, storage_path: `${E}/abc-provider.eml`, mime_type: "message/rfc822", original_filename: "provider.eml" };
    expect(await getEmployingEntityDocumentSignedUrl("doc-1", "u")).toBe("https://signed.example/x");
    expect(h.signed[0].opts).toEqual({ download: "provider.eml" });
    h.docRow = { employing_entity_id: E, storage_path: `${E}/abc-statement.pdf`, mime_type: "application/pdf", original_filename: "statement.pdf" };
    await getEmployingEntityDocumentSignedUrl("doc-2", "u");
    expect(h.signed[1].opts).toBeUndefined();
  });
});
