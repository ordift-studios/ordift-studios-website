import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "./fakeAdmin.testkit";
import { storeTestEvidence } from "./approvalEvidence.testkit";
import { makeZip } from "./zipFixture.testkit";

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb, authorized: true, logged: [] as { action: string; entityId: string; metadata: Record<string, unknown>; actorUserId: string }[] }));
vi.mock("@/lib/supabase/admin", async () => {
  const { fakeAdmin: make } = await import("./fakeAdmin.testkit");
  return { createAdminClient: () => make(h.db) };
});
vi.mock("@/lib/admin/activityLog", () => ({
  logActivity: async (e: { action: string; entityId: string; metadata: Record<string, unknown>; actorUserId: string }) => {
    h.logged.push(e);
    h.db.tables.activity_log ??= [];
    h.db.tables.activity_log.push({ id: `a${h.logged.length}`, action: e.action, entity_id: e.entityId, metadata: e.metadata, actor_user_id: e.actorUserId, created_at: `2026-10-30T10:00:0${h.logged.length}Z` });
  },
}));
vi.mock("@/lib/organization/authority", () => ({ authorizeWithSuperAdminOverride: async () => ({ ok: h.authorized, actedAsOverride: false }), GOVERNANCE_CAPABILITIES: { contractAdminister: "x" } }));

import { activateMasterVersion, attestHistoricalApproval, registerControlledMaster } from "./masterRegistryActions";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const cleanDocx = makeZip("word/document.xml", "<w:document><w:body><w:p><w:r><w:t>24.1 Instructor-caused claims. The Instructor shall provide proportionate protection.</w:t></w:r></w:p></w:body></w:document>");
const dirtyDocx = makeZip("word/document.xml", "<w:document><w:body><w:p><w:r><w:t>25.2 Cap. [COUNSEL DECISION REQUIRED] Determine a cap.</w:t></w:r></w:p></w:body></w:document>");
const pdf = new Uint8Array([37, 80, 68, 70, 1, 2, 3]);

const version = (o: Record<string, unknown> = {}) => ({
  id: "v1", master_id: "m1", status: "approved", approved_by: "Legal Counsel", approved_at: null, effective_date: null, content_reference: null, document_hash: null,
  master_docx_storage_path: "masters-docx/OS-LGL-010/a.docx", master_docx_sha256: sha(cleanDocx), master_pdf_storage_path: "masters-pdf/OS-LGL-010/a.pdf", master_pdf_sha256: sha(pdf), created_at: "2026-09-08T01:36:30Z", ...o,
});
const input = { approvalDate: "2026-09-05", counselName: "Counsel Name", counselFirm: "Firm LLP", evidenceKind: "counsel_email", evidenceReference: "Email of 5 Sep 2026 approving the legal suite, filed in the legal archive", evidenceDocumentId: "", coversDocumentCodes: ["OS-LGL-010"] };

beforeEach(async () => {
  h.authorized = true; h.logged = [];
  h.db = makeFakeDb({ legal_document_versions: [version()], legal_document_masters: [{ id: "m1", canonical_code: "OS-LGL-010", title: "Instructor / Workshop Facilitator Agreement", current_version_id: "v1" }], legal_suite_provenance_documents: [], activity_log: [] }, { "masters-docx/OS-LGL-010/a.docx": cleanDocx, "masters-pdf/OS-LGL-010/a.pdf": pdf });
  input.evidenceDocumentId = await storeTestEvidence("v1", "u1");
  h.db.writes.length = 0; // setup writes are not part of what each test asserts
});

describe("attestHistoricalApproval", () => {
  it("records an audited attestation without touching the registry's own columns", async () => {
    const r = await attestHistoricalApproval({ versionId: "v1", input, actorUserId: "u1" });
    expect(r).toEqual({ ok: true, approvalDate: "2026-09-05" });
    const ev = h.db.tables.activity_log[0];
    expect(ev).toMatchObject({ action: "legal.master_version.approval_attested", entity_id: "v1", actor_user_id: "u1" });
    expect(ev.metadata).toMatchObject({ approvalDate: "2026-09-05", counselName: "Counsel Name", documentCode: "OS-LGL-010", basis: "administrator_attestation_system_has_not_inspected_the_evidence" });
    expect(h.db.writes.filter((w) => w.table === "legal_document_versions")).toEqual([]);
  });
  it("refuses an unauthorised user, the Addendum date, evidence that does not name the document, and a version that already has a stamp", async () => {
    h.authorized = false;
    expect((await attestHistoricalApproval({ versionId: "v1", input, actorUserId: "u2" })).ok).toBe(false);
    h.authorized = true;
    const addendum = await attestHistoricalApproval({ versionId: "v1", input: { ...input, approvalDate: "2026-10-11" }, actorUserId: "u1" });
    expect(addendum.ok).toBe(false);
    expect((await attestHistoricalApproval({ versionId: "v1", input: { ...input, coversDocumentCodes: ["OS-LGL-001"] }, actorUserId: "u1" })).ok).toBe(false);
    h.db.tables.legal_document_versions[0].approved_at = "2026-09-04T00:00:00Z";
    expect((await attestHistoricalApproval({ versionId: "v1", input, actorUserId: "u1" })).ok).toBe(false);
    expect(h.db.tables.activity_log).toEqual([]);
  });
  it("requires stored evidence, refuses a second attestation, and refuses to report success if the audit write fails", async () => {
    expect((await attestHistoricalApproval({ versionId: "v1", input: { ...input, evidenceDocumentId: "" }, actorUserId: "u1" })).ok).toBe(false);
    expect((await attestHistoricalApproval({ versionId: "v1", input: { ...input, evidenceDocumentId: "not-stored" }, actorUserId: "u1" })).ok).toBe(false);
    expect((await attestHistoricalApproval({ versionId: "v1", input, actorUserId: "u1" })).ok).toBe(true);
    const again = await attestHistoricalApproval({ versionId: "v1", input: { ...input, approvalDate: "2026-09-06" }, actorUserId: "u1" });
    expect(!again.ok && again.error).toContain("already on record");
    expect(h.db.tables.activity_log.length).toBe(1);
  });
});

describe("registerControlledMaster", () => {
  it("re-hashes the stored files, checks the clauses and writes the reference once", async () => {
    const r = await registerControlledMaster({ versionId: "v1", actorUserId: "u1" });
    expect(r.ok).toBe(true);
    const row = h.db.tables.legal_document_versions[0];
    expect(row.document_hash).toBe(sha(cleanDocx));
    expect(String(row.content_reference)).toContain(`legal-masters:masters-docx/OS-LGL-010/a.docx@sha256:${sha(cleanDocx)}`);
    expect(h.db.tables.activity_log.at(-1)).toMatchObject({ action: "legal.master_version.content_registered", metadata: { unresolvedMarkers: 0 } });
    expect((await registerControlledMaster({ versionId: "v1", actorUserId: "u1" })).ok).toBe(false); // set-once
  });
  it("HARD STOP when a stored file no longer matches its recorded checksum; nothing is written", async () => {
    h.db.tables.legal_document_versions[0].master_pdf_sha256 = "0".repeat(64);
    const r = await registerControlledMaster({ versionId: "v1", actorUserId: "u1" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("HARD STOP");
    expect(h.db.writes).toEqual([]);
  });
  it("refuses a master that still contains counsel-review markers", async () => {
    h.db.storage["masters-docx/OS-LGL-010/a.docx"] = dirtyDocx;
    h.db.tables.legal_document_versions[0].master_docx_sha256 = sha(dirtyDocx);
    const r = await registerControlledMaster({ versionId: "v1", actorUserId: "u1" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("unresolved counsel-review marker");
    expect(h.db.writes).toEqual([]);
  });
  it("refuses without authority", async () => {
    h.authorized = false;
    expect((await registerControlledMaster({ versionId: "v1", actorUserId: "u2" })).ok).toBe(false);
  });
});

describe("activateMasterVersion", () => {
  const prepare = async () => {
    await attestHistoricalApproval({ versionId: "v1", input, actorUserId: "u1" });
    await registerControlledMaster({ versionId: "v1", actorUserId: "u1" });
    h.db.writes.length = 0;
  };
  it("refuses until the approval date is verified, the master registered and the clause check clean", async () => {
    const r = await activateMasterVersion({ versionId: "v1", effectiveDate: "2026-09-05", backdatedReason: "Effective from the approval date.", actorUserId: "u1" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors?.length).toBeGreaterThanOrEqual(2);
    expect(h.db.writes).toEqual([]);
  });
  it("sets the effective date (approval date, with a stated reason because it is in the past) and activates at the real time", async () => {
    await prepare();
    const r = await activateMasterVersion({ versionId: "v1", effectiveDate: "2026-09-05", backdatedReason: "Effective from counsel's approval date, as decided by the Founder.", actorUserId: "u1" });
    expect(r.ok).toBe(true);
    const row = h.db.tables.legal_document_versions[0];
    expect(row.effective_date).toBe("2026-09-05");
    expect(row.status).toBe("active");
    expect(typeof row.activated_at).toBe("string");
    expect(String(row.activated_at).slice(0, 10)).toBe(new Date().toISOString().slice(0, 10)); // the real activation time, never back-dated
    expect(row.approved_at).toBeNull(); // the registry's own approval stamp is never altered
  });
  it("refuses an effective date earlier than the verified approval date, or in the past without a reason", async () => {
    await prepare();
    expect((await activateMasterVersion({ versionId: "v1", effectiveDate: "2026-09-01", backdatedReason: "Because I said so, for testing.", actorUserId: "u1" })).ok).toBe(false);
    expect((await activateMasterVersion({ versionId: "v1", effectiveDate: "2026-09-05", actorUserId: "u1" })).ok).toBe(false);
    expect(h.db.tables.legal_document_versions[0].status).toBe("approved");
  });
});

describe("failure handling: no false success, no half-finished state", () => {
  it("an attestation whose audit write fails is refused and leaves nothing behind", async () => {
    h.db.failInsert = new Set(["activity_log"]);
    const r = await attestHistoricalApproval({ versionId: "v1", input, actorUserId: "u1" });
    expect(!r.ok && r.error).toContain("nothing was saved");
    expect(h.db.tables.activity_log).toEqual([]);
  });
  it("a registration whose audit write fails is reversed: the reference is not left behind", async () => {
    h.db.failInsert = new Set(["activity_log"]);
    const r = await registerControlledMaster({ versionId: "v1", actorUserId: "u1" });
    expect(r.ok).toBe(false);
    const row = h.db.tables.legal_document_versions[0];
    expect(row.content_reference).toBeNull();
    expect(row.document_hash).toBeNull();
  });
  it("activation re-verifies the stored master: a file altered after registration stops the activation", async () => {
    await attestHistoricalApproval({ versionId: "v1", input, actorUserId: "u1" });
    await registerControlledMaster({ versionId: "v1", actorUserId: "u1" });
    h.db.storage["masters-docx/OS-LGL-010/a.docx"] = dirtyDocx; // altered after registration
    const r = await activateMasterVersion({ versionId: "v1", effectiveDate: "2026-09-05", backdatedReason: "Effective from counsel's approval date, as decided.", actorUserId: "u1" });
    expect(!r.ok && r.error).toContain("HARD STOP");
    expect(h.db.tables.legal_document_versions[0]).toMatchObject({ status: "approved", effective_date: null });
  });
  it("activation of a version that is not the master's current version, or twice, is refused", async () => {
    await attestHistoricalApproval({ versionId: "v1", input, actorUserId: "u1" });
    await registerControlledMaster({ versionId: "v1", actorUserId: "u1" });
    h.db.tables.legal_document_masters[0].current_version_id = "other";
    expect((await activateMasterVersion({ versionId: "v1", effectiveDate: "2026-09-05", backdatedReason: "Effective from counsel's approval date, as decided.", actorUserId: "u1" })).ok).toBe(false);
    h.db.tables.legal_document_masters[0].current_version_id = "v1";
    expect((await activateMasterVersion({ versionId: "v1", effectiveDate: "2026-09-05", backdatedReason: "Effective from counsel's approval date, as decided.", actorUserId: "u1" })).ok).toBe(true);
    expect((await activateMasterVersion({ versionId: "v1", effectiveDate: "2026-09-05", backdatedReason: "Effective from counsel's approval date, as decided.", actorUserId: "u1" })).ok).toBe(false);
  });
});

describe("the registry itself refuses to activate a version with no approval date on record", () => {
  it("transitionLegalDocumentVersionStatus -> active needs a stamp or an attestation", async () => {
    const { transitionLegalDocumentVersionStatus } = await import("./masterRegistry");
    const refused = await transitionLegalDocumentVersionStatus({ versionId: "v1", toStatus: "active", actorUserId: "u1" });
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.error).toContain("no verified approval date");
    expect(h.db.tables.legal_document_versions[0].status).toBe("approved");
    await attestHistoricalApproval({ versionId: "v1", input, actorUserId: "u1" });
    expect((await transitionLegalDocumentVersionStatus({ versionId: "v1", toStatus: "active", actorUserId: "u1" })).ok).toBe(true);
  });
});
