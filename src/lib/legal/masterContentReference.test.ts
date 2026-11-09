import { describe, expect, it } from "vitest";
import { deriveMasterContentReference } from "./masterContentReference";

const base = { code: "OS-LGL-014", docxPath: "masters-docx/OS-LGL-014/a.docx", docxSha256: "a".repeat(64), pdfPath: "masters-pdf/OS-LGL-014/a.pdf", pdfSha256: "b".repeat(64) };

describe("deriveMasterContentReference", () => {
  it("is built from the stored files and their fingerprints only; the version label is informational and is not part of the reference", () => {
    const a = deriveMasterContentReference({ ...base, version: "1.0" });
    const b = deriveMasterContentReference({ ...base, version: "1.1" });
    expect(a).toEqual(b);
    expect(a.contentReference).toBe(`legal-masters:${base.docxPath}@sha256:${base.docxSha256};pdf:${base.pdfPath}@sha256:${base.pdfSha256}`);
    expect(a.documentHash).toBe(base.docxSha256);
  });
  it("differs when the stored Word file differs, which is what separates 1.1 from 1.0", () => {
    const v10 = deriveMasterContentReference({ ...base, version: "1.0" });
    const v11 = deriveMasterContentReference({ ...base, version: "1.1", docxPath: "masters-docx/OS-LGL-014/b.docx", docxSha256: "c".repeat(64) });
    expect(v11.contentReference).not.toBe(v10.contentReference);
    expect(v11.documentHash).not.toBe(v10.documentHash);
  });
});
