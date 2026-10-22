import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/lib/legal/fakeAdmin.testkit";

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb, superAdmin: true }));
vi.mock("@/lib/supabase/admin", async () => { const { fakeAdmin } = await import("@/lib/legal/fakeAdmin.testkit"); return { createAdminClient: () => fakeAdmin(h.db) }; });
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: async () => undefined }));
vi.mock("@/lib/organization/authority", () => ({ isSuperAdminId: async () => h.superAdmin }));

import { addEntitySignatory } from "./entityRegistrations";

const base = { entityId: "gh", fullName: "Myredlive Anim-Tetey", position: "Proprietor", authority: "As stated on the certificate", sourceDocumentId: "doc-file", actorUserId: "f" };

beforeEach(() => {
  h.superAdmin = true;
  h.db = makeFakeDb({
    employing_entity_documents: [
      { id: "doc-note", employing_entity_id: "gh", file_sha256: null, original_filename: null },
      { id: "doc-file", employing_entity_id: "gh", file_sha256: "a".repeat(64), original_filename: "certificate.pdf" },
      { id: "doc-qa", employing_entity_id: "qa", file_sha256: "b".repeat(64), original_filename: "qatar.pdf" },
    ],
    entity_signatories: [],
  });
});

describe("addEntitySignatory - authority must rest on a stored document", () => {
  it("records a signatory whose source document is a stored file of THIS entity", async () => {
    const r = await addEntitySignatory({ ...base, profileId: "founder-profile" });
    expect(r.ok).toBe(true);
    expect(h.db.tables.entity_signatories[0]).toMatchObject({ employing_entity_id: "gh", full_name: "Myredlive Anim-Tetey", source_document_id: "doc-file", profile_id: "founder-profile", recorded_by: "f" });
  });
  it("refuses a note-only record (no stored file or fingerprint) as evidence", async () => {
    const r = await addEntitySignatory({ ...base, sourceDocumentId: "doc-note" });
    expect(!r.ok && r.error).toContain("no stored file or fingerprint");
    expect(h.db.tables.entity_signatories).toEqual([]);
  });
  it("refuses another entity's document (the Qatar signatory basis is never borrowed) and missing wording", async () => {
    expect((await addEntitySignatory({ ...base, sourceDocumentId: "doc-qa" })).ok).toBe(false);
    expect((await addEntitySignatory({ ...base, authority: "" })).ok).toBe(false);
    expect((await addEntitySignatory({ ...base, position: "" })).ok).toBe(false);
  });
  it("refuses anyone but a Super Admin and refuses a duplicate", async () => {
    h.superAdmin = false;
    expect((await addEntitySignatory(base)).ok).toBe(false);
    h.superAdmin = true;
    expect((await addEntitySignatory(base)).ok).toBe(true);
    expect((await addEntitySignatory(base)).ok).toBe(false);
  });
});
