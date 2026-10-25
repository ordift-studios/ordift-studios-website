import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "./fakeAdmin.testkit";

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb, authorized: true }));
vi.mock("@/lib/supabase/admin", async () => { const { fakeAdmin } = await import("./fakeAdmin.testkit"); return { createAdminClient: () => fakeAdmin(h.db) }; });
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: async () => undefined }));
vi.mock("@/lib/organization/authority", () => ({ authorizeWithSuperAdminOverride: async () => ({ ok: h.authorized, actedAsOverride: false }), GOVERNANCE_CAPABILITIES: { contractAdminister: "x" } }));

import { attestHistoricalApproval } from "./masterRegistryActions";
import { checkEvidenceText, listApprovalEvidence, loadVerifiedEvidence, storeApprovalEvidence } from "./approvalEvidence";

const enc = (t: string) => new TextEncoder().encode(t);
const GOOD = "Email from counsel, 5 September 2026: I approve OS-LGL-010, the Instructor / Workshop Facilitator Agreement.";
const base = { versionId: "v1", description: "Counsel's email of 5 September 2026", actorUserId: "u1" };
const input = { approvalDate: "2026-09-18", counselName: "Counsel Name", counselFirm: "Firm LLP", evidenceKind: "counsel_email", evidenceReference: "Original kept in the legal archive, email thread", evidenceDocumentId: "", coversDocumentCodes: ["OS-LGL-010"], identityCheck: { method: "call_back_independent_number", checkedOn: "2026-09-20", note: "The Founder called the firm on a number taken from the Bar register and spoke to counsel." } };

beforeEach(() => {
  h.authorized = true;
  h.db = makeFakeDb({
    legal_document_versions: [{ id: "v1", master_id: "m1", status: "approved", approved_at: null, created_at: "2026-09-08T01:36:30Z" }, { id: "v2", master_id: "m2", status: "approved", approved_at: null, created_at: "2026-09-08T01:36:30Z" }],
    legal_document_masters: [{ id: "m1", canonical_code: "OS-LGL-010", title: "Instructor / Workshop Facilitator Agreement", current_version_id: "v1" }, { id: "m2", canonical_code: "OS-LGL-001", title: "Personal Portrait Agreement", current_version_id: "v2" }],
    legal_suite_provenance_documents: [], activity_log: [],
  });
});

describe("approval evidence is stored and fingerprinted by the server", () => {
  it("stores a text file, computes and verifies the SHA-256 itself, and reports what the text does and does not show", async () => {
    const r = await storeApprovalEvidence({ ...base, filename: "counsel-email.txt", bytes: enc(GOOD), counselName: "Samuel Kwame Kumi Esq." });
    expect(r.ok && r.item.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(r.ok && r.verifiedByReread).toBe(true);
    expect(r.ok && r.text).toMatchObject({ checked: true, mentionsDocument: true, mentionsCounsel: false, datesFound: ["5 September 2026"] }); // surname not in text: visible
    expect(h.db.tables.legal_suite_provenance_documents[0]).toMatchObject({ release_version: "approval-evidence", created_by: "u1" });
  });
  it("a PDF is stored and fingerprinted but honestly reported as not machine-read", async () => {
    const r = await storeApprovalEvidence({ ...base, filename: "letter.pdf", bytes: new Uint8Array([37, 80, 68, 70, 45, 49, 10, 1]) });
    expect(r.ok && r.text).toMatchObject({ checked: false });
  });
  it("refuses unsupported or disguised files, empty descriptions and unauthorised users", async () => {
    expect((await storeApprovalEvidence({ ...base, filename: "chat.png", bytes: new Uint8Array([137, 80, 78, 71]) })).ok).toBe(false);
    expect((await storeApprovalEvidence({ ...base, filename: "fake.pdf", bytes: enc("not a pdf") })).ok).toBe(false);
    expect((await storeApprovalEvidence({ ...base, filename: "x.txt", bytes: new Uint8Array([0, 1, 2]) })).ok).toBe(false);
    expect((await storeApprovalEvidence({ ...base, description: "x", filename: "x.txt", bytes: enc(GOOD) })).ok).toBe(false);
    h.authorized = false;
    expect((await storeApprovalEvidence({ ...base, filename: "x.txt", bytes: enc(GOOD) })).ok).toBe(false);
    expect(h.db.tables.legal_suite_provenance_documents).toEqual([]);
  });
  it("an identical file is not stored twice, and evidence is scoped to its own document", async () => {
    const a = await storeApprovalEvidence({ ...base, filename: "a.txt", bytes: enc(GOOD) });
    const b = await storeApprovalEvidence({ ...base, filename: "a-again.txt", bytes: enc(GOOD) });
    expect(b.ok && b.duplicate).toBe(true);
    expect(h.db.tables.legal_suite_provenance_documents.length).toBe(1);
    expect(await listApprovalEvidence("v2")).toEqual([]); // not visible for another document's version
    expect((await loadVerifiedEvidence("v2", a.ok ? a.item.id : "", null)).ok).toBe(false);
  });
  it("text checks only report matches; they never name an approver or pick the approval date", () => {
    const t = checkEvidenceText("Meeting notes 2026-09-05 about OS-LGL-014 only", "OS-LGL-010", "Instructor / Workshop Facilitator Agreement", null);
    expect(t).toMatchObject({ mentionsDocument: false, mentionsCounsel: null, datesFound: ["2026-09-05"] });
  });
});

describe("the attestation depends on that stored evidence", () => {
  it("is refused with no evidence, evidence that does not name the document, or a stored file that was altered afterwards", async () => {
    expect((await attestHistoricalApproval({ versionId: "v1", input, actorUserId: "u1" })).ok).toBe(false); // description alone
    const wrong = await storeApprovalEvidence({ ...base, filename: "other.txt", bytes: enc("Counsel approved OS-LGL-014 on 5 September 2026.") });
    const r1 = await attestHistoricalApproval({ versionId: "v1", input: { ...input, evidenceDocumentId: wrong.ok ? wrong.item.id : "" }, actorUserId: "u1" });
    expect(!r1.ok && r1.error).toContain("does not mention OS-LGL-010");
    const good = await storeApprovalEvidence({ ...base, filename: "good.txt", bytes: enc(GOOD) });
    const goodId = good.ok ? good.item.id : "";
    const path = good.ok ? good.item.storagePath : "";
    h.db.storage[path] = enc(GOOD + " tampered");
    const r2 = await attestHistoricalApproval({ versionId: "v1", input: { ...input, evidenceDocumentId: goodId }, actorUserId: "u1" });
    expect(!r2.ok && r2.error).toContain("HARD STOP");
    expect(h.db.tables.activity_log).toEqual([]);
    h.db.storage[path] = enc(GOOD);
    expect((await attestHistoricalApproval({ versionId: "v1", input: { ...input, evidenceDocumentId: goodId }, actorUserId: "u1" })).ok).toBe(true);
  });
  it("the recorded attestation links the evidence file, server fingerprint, claimed date and what the system could read - not just the claim", async () => {
    const good = await storeApprovalEvidence({ ...base, filename: "good.txt", bytes: enc(GOOD) });
    await attestHistoricalApproval({ versionId: "v1", input: { ...input, evidenceDocumentId: good.ok ? good.item.id : "" }, actorUserId: "u1" });
    const meta = h.db.tables.activity_log[0].metadata as Record<string, unknown>;
    expect(meta).toMatchObject({ evidenceDocumentId: good.ok ? good.item.id : "", evidenceSha256: good.ok ? good.item.sha256 : "", claimedApprovalDate: "2026-09-18", documentCode: "OS-LGL-010", counselName: "Counsel Name", basis: "administrator_attestation_system_has_not_inspected_the_evidence" });
    expect(meta.evidenceCheck).toMatchObject({ checked: true, mentionsDocument: true });
    expect(h.db.tables.activity_log[0].actor_user_id).toBe("u1");
  });
});
