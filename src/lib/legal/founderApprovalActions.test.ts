import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "./fakeAdmin.testkit";
import { makeZip } from "./zipFixture.testkit";

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb, authorized: true, logged: [] as { action: string; entityId: string; metadata: Record<string, unknown> }[] }));
vi.mock("@/lib/supabase/admin", async () => { const { fakeAdmin: make } = await import("./fakeAdmin.testkit"); return { createAdminClient: () => make(h.db) }; });
vi.mock("@/lib/admin/activityLog", () => ({
  logActivity: async (e: { action: string; entityId: string; metadata: Record<string, unknown>; actorUserId: string }) => {
    h.logged.push(e); h.db.tables.activity_log ??= [];
    h.db.tables.activity_log.push({ id: `l${h.logged.length}`, action: e.action, entity_id: e.entityId, metadata: e.metadata, actor_user_id: e.actorUserId, created_at: `2026-11-20T10:00:0${h.logged.length}Z` });
  },
}));
vi.mock("@/lib/organization/authority", () => ({ authorizeWithSuperAdminOverride: async () => ({ ok: h.authorized, actedAsOverride: false }), GOVERNANCE_CAPABILITIES: { contractAdminister: "x" } }));

import { loadFounderApproval, loadFounderApprovalView, recordFounderApproval, startLegalReview } from "./founderApprovalActions";
import { registerControlledMaster } from "./masterRegistryActions";
import type { FounderApprovalInput } from "./founderApproval";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const docx = makeZip("word/document.xml", "<w:document><w:body><w:p><w:r><w:t>12.1 The accepted quotation currency and amount are the payment obligation.</w:t></w:r></w:p></w:body></w:document>");
const dirty = makeZip("word/document.xml", "<w:document><w:body><w:p><w:r><w:t>12.1 [COUNSEL DECISION REQUIRED] Determine the cap.</w:t></w:r></w:p></w:body></w:document>");
const pdf = new Uint8Array([37, 80, 68, 70, 1, 1, 1]);
const FOUNDER = "founder-1";
const row11 = (o: Record<string, unknown> = {}) => ({ id: "v11", master_id: "m14", version: "1.1", status: "legal_review", approved_by: null, approved_at: null, effective_date: null, legacy_code: null, content_reference: null, document_hash: null,
  master_docx_storage_path: "masters-docx/OS-LGL-014/v1.1.docx", master_docx_sha256: sha(docx), master_pdf_storage_path: "masters-pdf/OS-LGL-014/v1.1.pdf", master_pdf_sha256: sha(pdf), created_at: "2026-11-10T08:00:00Z", ...o });
const seed = (o: Record<string, unknown> = {}, storage?: Record<string, Uint8Array>) => {
  h.db = makeFakeDb({
    legal_document_versions: [
      { id: "vA", master_id: "m14", version: "1.0", status: "approved", approved_by: "Legal Counsel", approved_at: null, effective_date: null, legacy_code: null, created_at: "2026-09-08T01:36:30Z" },
      { id: "vB", master_id: "m14", version: "1.0", status: "active", approved_by: "Management", approved_at: null, effective_date: "2025-01-01", legacy_code: "OS-LGL-004", created_at: "2026-09-08T01:36:31Z" },
      row11(o),
    ],
    legal_document_masters: [{ id: "m14", canonical_code: "OS-LGL-014", title: "Client Service Terms & General Booking Agreement", current_version_id: "vB" }],
    founder_identities: [{ id: "f1", profile_id: FOUNDER, status: "active" }], profiles: [{ id: FOUNDER, member_number: "INT0001" }], legal_suite_provenance_documents: [], activity_log: [],
  }, storage ?? { "masters-docx/OS-LGL-014/v1.1.docx": docx, "masters-pdf/OS-LGL-014/v1.1.pdf": pdf });
  h.db.writes.length = 0;
};
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const DAY = daysAgo(2);
const input = (o: Partial<FounderApprovalInput> = {}): FounderApprovalInput => ({
  consultationDate: DAY, startTime: "10:00", endTime: "11:20", timezone: "Asia/Qatar", counselName: "Counsel Name", counselFirm: "Not stated", identityCheckNote: "Called back on a number taken from an independent source.",
  recommendations: "Counsel recommended rewording clause 12.3 and adding a minors consent line.", amendments: "Clause 12.3 reworded; L6 consent line added.", conclusion: "content_subject_to_recorded_amendments", conclusionNote: "Content subject to those two changes.",
  counselAskedToSeeFinalText: false, reconfirmationNote: "", reviewedDraftSha256: "f".repeat(64), textRelation: "reviewed_text_with_recorded_amendments", typedHashPrefix: sha(docx).slice(0, 12), statementAccepted: true, typedSentence: "approve OS-LGL-014 1.1", ...o,
});
const versionRow = (id: string) => h.db.tables.legal_document_versions.find((r) => r.id === id)!;
const registered = async () => { seed(); expect((await registerControlledMaster({ versionId: "v11", actorUserId: FOUNDER })).ok).toBe(true); h.db.writes.length = 0; };

beforeEach(() => { h.authorized = true; h.logged = []; seed(); });

describe("recordFounderApproval", () => {
  it("records the Founder approval: stamps the real time, labels the approver honestly, stores the full review record, and never activates", async () => {
    await registered();
    const r = await recordFounderApproval({ versionId: "v11", input: input(), actorUserId: FOUNDER });
    expect(r.ok).toBe(true);
    const v = versionRow("v11");
    expect(v.status).toBe("approved");
    expect(String(v.approved_at)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(v.approved_by).toBe(`Founder, on advice of counsel (telephone consultation ${DAY})`);
    expect(v.effective_date).toBeNull(); expect(v.activated_at).toBeUndefined();
    expect(h.db.tables.legal_document_masters[0].current_version_id).toBe("vB");               // the baseline stays current; nothing is activated
    const rec = await loadFounderApproval("v11");
    expect(rec?.actorLabel).toBe("member INT0001");
    const m = rec!.metadata as Record<string, any>;
    expect(m.basis).toBe("founder_approval_on_counsel_advice_telephone_review");
    expect(m.notCounselIssuedWrittenApproval).toBe(true);
    expect(m.consultation).toMatchObject({ mode: "telephone_consultation", date: DAY, counselName: "Counsel Name", recordedBy: "founder" });
    expect(m.advice.recommendations).toMatch(/rewording clause 12.3/);
    expect(m.document).toMatchObject({ version: "1.1", docxSha256: sha(docx), documentHash: sha(docx), reviewedDraftSha256: "f".repeat(64) });
    expect(m.confirmation).toMatchObject({ statementAccepted: true, typedHashPrefix: sha(docx).slice(0, 12), typedSentence: "approve OS-LGL-014 1.1" });
    expect(m).toMatchObject({ activated: false, issued: false, published: false });
    expect(JSON.stringify(m.otherVersionsAtApproval)).toMatch(/historical_placeholder/);      // the placeholder is named as such
    expect(JSON.stringify(m.otherVersionsAtApproval)).toMatch(/active_baseline/);
    expect(h.db.tables.activity_log.some((a) => a.action === "legal.master_version.status_changed")).toBe(true);
  });

  it("refuses everyone but the active Founder: a non-Founder Super Admin, someone without authority, and a missing Founder identity", async () => {
    await registered();
    expect((await recordFounderApproval({ versionId: "v11", input: input(), actorUserId: "someone-else" })).ok).toBe(false);
    h.authorized = false;
    expect((await recordFounderApproval({ versionId: "v11", input: input(), actorUserId: FOUNDER })).ok).toBe(false);
    h.authorized = true; h.db.tables.founder_identities = [];
    const r = await recordFounderApproval({ versionId: "v11", input: input(), actorUserId: FOUNDER });
    expect(r.ok === false && r.error).toMatch(/No active Founder identity/);
    expect(versionRow("v11").status).toBe("legal_review");
  });

  it("refuses the wrong lifecycle state, the baseline, the placeholder and the legacy row", async () => {
    seed({ status: "draft" }); expect((await recordFounderApproval({ versionId: "v11", input: input(), actorUserId: FOUNDER }) as { error: string }).error).toMatch(/Start the legal review first/);
    await registered();
    for (const id of ["vA", "vB"]) { const r = await recordFounderApproval({ versionId: id, input: input(), actorUserId: FOUNDER }); expect(r.ok).toBe(false); }
    expect(versionRow("vA").approved_at).toBeNull(); expect(versionRow("vB").status).toBe("active");
  });

  it("refuses an unregistered master, a master with review markers, and a stored file that no longer matches", async () => {
    seed(); expect((await recordFounderApproval({ versionId: "v11", input: input(), actorUserId: FOUNDER }) as { error: string }).error).toMatch(/not registered/);
    seed({}, { "masters-docx/OS-LGL-014/v1.1.docx": dirty, "masters-pdf/OS-LGL-014/v1.1.pdf": pdf }); versionRow("v11").master_docx_sha256 = sha(dirty);
    expect((await registerControlledMaster({ versionId: "v11", actorUserId: FOUNDER })).ok).toBe(false);
    await registered();
    h.db.storage["masters-docx/OS-LGL-014/v1.1.docx"] = makeZip("word/document.xml", "<w:document><w:body><w:p><w:r><w:t>altered after registration</w:t></w:r></w:p></w:body></w:document>");
    const r = await recordFounderApproval({ versionId: "v11", input: input(), actorUserId: FOUNDER });
    expect(r.ok === false && r.error).toMatch(/HARD STOP/);
    expect(versionRow("v11").status).toBe("legal_review");
  });

  it("refuses an invalid review record and leaves the version untouched", async () => {
    await registered();
    for (const o of [{ consultationDate: "2999-01-01" }, { conclusion: "amendments_needed_before_use" }, { typedSentence: "approve" }, { statementAccepted: false }, { typedHashPrefix: "123456789012" }, { textRelation: "different_text" }] as Partial<FounderApprovalInput>[]) {
      const r = await recordFounderApproval({ versionId: "v11", input: input(o), actorUserId: FOUNDER });
      expect(r.ok).toBe(false);
    }
    expect(versionRow("v11").status).toBe("legal_review"); expect(versionRow("v11").approved_at).toBeNull(); expect(versionRow("v11").approved_by).toBeNull();
    expect(h.db.tables.activity_log.filter((a) => a.action === "legal.master_version.founder_approval_recorded")).toHaveLength(0);
  });

  it("is set once: a second approval is refused", async () => {
    await registered();
    expect((await recordFounderApproval({ versionId: "v11", input: input(), actorUserId: FOUNDER })).ok).toBe(true);
    const again = await recordFounderApproval({ versionId: "v11", input: input(), actorUserId: FOUNDER });
    expect(again.ok === false && again.error).toMatch(/only a version in legal review|already on record/);
  });

  it("if the review record cannot be written, the approval is reversed and nothing is left behind", async () => {
    await registered();
    h.db.failInsert = new Set(["activity_log"]);
    const r = await recordFounderApproval({ versionId: "v11", input: input(), actorUserId: FOUNDER });
    expect(r.ok === false && r.error).toMatch(/reversed/);
    h.db.failInsert = undefined;
    const v = versionRow("v11");
    expect(v.status).toBe("legal_review"); expect(v.approved_at).toBeNull(); expect(v.approved_by).toBeNull();
  });
});

describe("startLegalReview", () => {
  it("moves a draft into legal review for the Founder only, and nothing else", async () => {
    seed({ status: "draft" });
    expect((await startLegalReview({ versionId: "v11", actorUserId: "someone-else" })).ok).toBe(false);
    expect((await startLegalReview({ versionId: "v11", actorUserId: FOUNDER })).ok).toBe(true);
    expect(versionRow("v11").status).toBe("legal_review"); expect(versionRow("v11").approved_at).toBeNull();
    expect((await startLegalReview({ versionId: "v11", actorUserId: FOUNDER })).ok).toBe(false);          // not a draft any more
    expect((await startLegalReview({ versionId: "vB", actorUserId: FOUNDER })).ok).toBe(false);           // the active legacy row
  });
});

describe("loadFounderApprovalView", () => {
  it("lists the baseline, the historical placeholder and the target, and tells the Founder what is outstanding", async () => {
    seed({ status: "draft" });
    const v = await loadFounderApprovalView("v11", FOUNDER);
    expect(v.found && v.versions.map((x) => x.role).sort()).toEqual(["active_baseline", "historical_placeholder", "target"]);
    expect(v.found && v.preconditions.filter((p) => !p.ok).map((p) => p.key)).toEqual(["in_review", "registered", "markers", "integrity"]);
    expect(v.found && v.founder).toEqual({ hasActiveFounder: true, viewerIsFounder: true });
    const other = await loadFounderApprovalView("v11", "someone-else");
    expect(other.found && other.founder.viewerIsFounder).toBe(false);
  });
});
