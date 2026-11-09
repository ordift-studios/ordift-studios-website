import { describe, expect, it } from "vitest";
import { makeZip } from "./zipFixture.testkit";
import { renderRegistrationSql, renderRollbackSql, renderVerificationSql, sha256Hex, validateRegistrationPlan, verifyMasterFiles, type ExistingMasterFacts, type RegistrationPlanInput } from "./masterRegistrationPlan";

const docx = makeZip("word/document.xml", "<w:document><w:body><w:p><w:r><w:t>OS-LGL-014 Client Service Terms. 12.1 The accepted quotation currency and amount are the payment obligation.</w:t></w:r></w:p></w:body></w:document>");
const pdf = new Uint8Array(Buffer.from("%PDF-1.4\nsynthetic test pdf"));
const plan = (o: Partial<RegistrationPlanInput> = {}): RegistrationPlanInput => ({ code: "OS-LGL-014", version: "1.1", docxPath: "masters-docx/OS-LGL-014/v1.1-final.docx", docxSha256: sha256Hex(docx), pdfPath: "masters-pdf/OS-LGL-014/v1.1-final.pdf", pdfSha256: sha256Hex(pdf), ...o });
const existing = (o: Partial<NonNullable<ExistingMasterFacts>> = {}): ExistingMasterFacts => ({
  masterExists: true, currentVersionId: "vB",
  versions: [{ id: "vA", version: "1.0", status: "approved", legacyCode: null, docxPath: null, docxSha256: null, pdfPath: null, pdfSha256: null }, { id: "vB", version: "1.0", status: "active", legacyCode: "OS-LGL-004", docxPath: null, docxSha256: null, pdfPath: null, pdfSha256: null }], ...o,
});
const errs = (i: RegistrationPlanInput, e: ExistingMasterFacts = existing()) => { const v = validateRegistrationPlan(i, e); return v.ok ? [] : v.errors; };

describe("validateRegistrationPlan", () => {
  it("accepts a well-formed higher version beside the two existing 1.0 rows", () => expect(validateRegistrationPlan(plan(), existing())).toMatchObject({ ok: true }));
  it("checks the version identifier: format, not already present, strictly higher than every existing version", () => {
    expect(errs(plan({ version: "1" }))[0]).toMatch(/major.minor/);
    expect(errs(plan({ version: "1.1.0" }))[0]).toMatch(/major.minor/);
    expect(errs(plan({ version: "1.0" })).join(" ")).toMatch(/already has a version 1.0/);
    expect(errs(plan({ version: "0.9" })).join(" ")).toMatch(/higher than every existing/);
    expect(errs(plan({ version: "1.1" }), existing({ versions: [...existing()!.versions, { id: "x", version: "1.1", status: "draft", legacyCode: null, docxPath: null, docxSha256: null, pdfPath: null, pdfSha256: null }] })).join(" ")).toMatch(/already has a version 1.1/);
    expect(errs(plan({ version: "1.10" }))).toEqual([]);                                   // 1.10 is higher than 1.9 (numeric, not text, comparison)
    expect(errs(plan({ version: "1.2" }), existing({ versions: [...existing()!.versions, { id: "y", version: "1.10", status: "draft", legacyCode: null, docxPath: null, docxSha256: null, pdfPath: null, pdfSha256: null }] })).join(" ")).toMatch(/higher than every existing/);
  });
  it("checks hashes: shape, case, distinct files, and not byte-identical to an existing master", () => {
    expect(errs(plan({ docxSha256: "abc" }))[0]).toMatch(/64 lower-case hex/);
    expect(errs(plan({ docxSha256: sha256Hex(docx).toUpperCase() }))[0]).toMatch(/lower-case/);
    expect(errs(plan({ pdfSha256: sha256Hex(docx) })).join(" ")).toMatch(/same SHA-256/);
    const withSame = existing({ versions: [{ id: "z", version: "1.0", status: "approved", legacyCode: null, docxPath: "masters-docx/OS-LGL-014/old.docx", docxSha256: sha256Hex(docx), pdfPath: null, pdfSha256: null }] });
    expect(errs(plan(), withSame).join(" ")).toMatch(/byte-identical/);
  });
  it("checks controlled-master references: paths in the right bucket folder, no traversal, never overwriting a stored master", () => {
    expect(errs(plan({ docxPath: "masters-docx/OS-LGL-014/../x.docx" }))[0]).toMatch(/storage path/);
    expect(errs(plan({ docxPath: "masters-docx/OS-LGL-021/a.docx" }))[0]).toMatch(/masters-docx\/OS-LGL-014/);
    expect(errs(plan({ pdfPath: "masters-pdf/OS-LGL-014/a.docx" }))[0]).toMatch(/masters-pdf/);
    expect(errs(plan({ docxPath: "masters-docx/OS-LGL-014/it's.docx" }))[0]).toMatch(/storage path/);
    const used = existing({ versions: [{ id: "z", version: "1.0", status: "approved", legacyCode: null, docxPath: "masters-docx/OS-LGL-014/v1.1-final.docx", docxSha256: "f".repeat(64), pdfPath: null, pdfSha256: null }] });
    expect(errs(plan(), used).join(" ")).toMatch(/already used/);
  });
  it("needs the master to exist; without existing facts it warns that the migration will enforce uniqueness itself", () => {
    expect(errs(plan(), existing({ masterExists: false })).join(" ")).toMatch(/does not exist/);
    const v = validateRegistrationPlan(plan(), null); expect(v.ok && v.warnings.join(" ")).toMatch(/migration itself refuses/);
  });
});

describe("verifyMasterFiles", () => {
  it("passes a file pair that matches the plan and has no review markers", () => expect(verifyMasterFiles(plan(), docx, pdf)).toMatchObject({ ok: true, markerCount: 0 }));
  it("REFUSES a master that still contains counsel-review markers and never cleans it", () => {
    const marked = makeZip("word/document.xml", "<w:document><w:body><w:p><w:r><w:t>OS-LGL-014 12.1 [COUNSEL] Currency wording to be decided.</w:t></w:r></w:p></w:body></w:document>");
    const r = verifyMasterFiles(plan({ docxSha256: sha256Hex(marked) }), marked, pdf);
    expect(r.ok).toBe(false); expect(!r.ok && r.markers).toEqual(["[COUNSEL]"]); expect(!r.ok && r.errors.join(" ")).toMatch(/Nothing is cleaned automatically/);
  });
  it("refuses a hash that does not match, a non-PDF, an unreadable Word file and the wrong document", () => {
    expect(verifyMasterFiles(plan({ docxSha256: "0".repeat(64) }), docx, pdf).ok).toBe(false);
    expect(verifyMasterFiles(plan(), docx, new Uint8Array([1, 2, 3, 4, 5, 6])).ok).toBe(false);
    const junk = new Uint8Array([1, 2, 3]); expect(verifyMasterFiles(plan({ docxSha256: sha256Hex(junk) }), junk, pdf).ok).toBe(false);
    const other = makeZip("word/document.xml", "<w:document><w:body><w:p><w:r><w:t>Some other agreement</w:t></w:r></w:p></w:body></w:document>");
    const r = verifyMasterFiles(plan({ docxSha256: sha256Hex(other) }), other, pdf); expect(!r.ok && r.errors.join(" ")).toMatch(/does not mention OS-LGL-014/);
  });
});

describe("rendered SQL", () => {
  const up = renderRegistrationSql(plan()), down = renderRollbackSql(plan()), check = renderVerificationSql(plan());
  it("the migration only INSERTS one draft row and one audit row: it updates and deletes nothing", () => {
    expect((up.match(/insert into public\.legal_document_versions/g) ?? []).length).toBe(1);
    expect((up.match(/insert into public\.activity_log/g) ?? []).length).toBe(1);
    expect(up).not.toMatch(/\bupdate\s+public\.|\bdelete\s+from|\btruncate|\bdrop\s|\balter\s/i);
    expect(up).toMatch(/'draft'/);
    expect(up).not.toMatch(/approved_by|approved_at|content_reference|document_hash|current_version_id\s*=|effective_date|activated_at/);   // none of the controlled columns is written
  });
  it("the migration refuses by itself: missing master, duplicate version, version not higher, reused hash or path, files not in the bucket", () => {
    for (const m of [/master .* does not exist/, /already has a version 1\.1/, /not higher than every existing version/, /hash or storage path is already recorded/, /must already be stored in the legal-masters bucket/]) expect(up).toMatch(m);
    expect(up.startsWith("-- PROPOSAL") && up.includes("begin;") && up.trim().endsWith("commit;")).toBe(true);
  });
  it("the audit entry records the fingerprints, the baseline at creation, and that no existing row was changed and nothing is approved or registered", () => {
    for (const m of [/'changedExistingRows', false/, /'approved', false/, /'registeredUnderContentReference', false/, /'currentVersionAtCreation', cur/, new RegExp(sha256Hex(docx)), new RegExp(sha256Hex(pdf))]) expect(up).toMatch(m);
  });
  it("the rollback deletes only the one untouched draft by id, refuses in every other state, keeps the creation audit and appends a rolled-back entry", () => {
    expect((down.match(/delete from/g) ?? []).length).toBe(1);
    expect(down).toMatch(/delete from public\.legal_document_versions where id = v\.id;/);
    expect(down).not.toMatch(/delete from public\.activity_log/);
    for (const m of [/not a draft/, /carries an approval, content reference, date or supersession/, /an agreement references this version/, /a master's current version|master''s current version/, /another version supersedes it/, /later audit event/, /no .* row with these fingerprints exists/]) expect(down).toMatch(m);
    expect(down).toMatch(/creation_rolled_back/);
  });
  it("the verification is read-only and fingerprints every other row", () => {
    expect(check).not.toMatch(/\b(insert|update|delete|drop|alter|truncate)\b/i);
    expect(check).toMatch(/existing_rows_fingerprint/); expect(check).toMatch(/files_in_bucket/); expect(check).toMatch(/HASH MISMATCH/);
  });
  it("refuses to render SQL for an invalid plan, so an unvalidated value can never reach a statement", () => {
    expect(() => renderRegistrationSql(plan({ version: "1.1'; drop table x; --" }))).toThrow(/invalid plan/);
    expect(() => renderRollbackSql(plan({ docxPath: "masters-docx/OS-LGL-014/a'b.docx" }))).toThrow(/invalid plan/);
    expect(() => renderVerificationSql(plan({ code: "OS-LGL-014' or 1=1" }))).toThrow(/invalid plan/);
  });
});
