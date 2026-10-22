import { describe, expect, it } from "vitest";
import { extractDocxText, findUnresolvedReviewMarkers, readZipEntry } from "./docxText";
import { makeZip } from "./zipFixture.testkit";

const doc = (body: string) => `<w:document><w:body>${body}</w:body></w:document>`;

describe("docx text extraction", () => {
  it("reads word/document.xml from a deflated or stored zip entry and strips markup", () => {
    for (const m of [8, 0] as const) {
      const z = makeZip("word/document.xml", doc("<w:p><w:r><w:t>24.1 Instructor-caused claims.</w:t></w:r></w:p><w:p><w:r><w:t>A &amp; B</w:t></w:r></w:p>"), m);
      expect(extractDocxText(z)).toBe("24.1 Instructor-caused claims.\nA & B\n");
    }
  });
  it("returns null for a file that is not a docx", () => {
    expect(extractDocxText(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(readZipEntry(makeZip("other.xml", "x"), "word/document.xml")).toBeNull();
  });
});

describe("unresolved counsel-review markers", () => {
  it("finds the markers that blocked the draft", () => {
    const t = "24.1 [COUNSEL REVIEW] Consider protection.\n25.2 Cap. [COUNSEL DECISION REQUIRED] Determine a cap.\nCounsel Review Draft - not approved for instructor use";
    expect(findUnresolvedReviewMarkers(t).length).toBeGreaterThanOrEqual(4);
  });
  it("does not flag ordinary operative wording, including the legitimate phrase “counsel-approved”", () => {
    const t = "10.4 Moral rights. Any waiver applies only where legally permitted and counsel-approved.\n25.2 Cap. Any liability cap applies only if expressly selected in the applicable Schedule.\nAPPROVED - OFFICIAL MASTER";
    expect(findUnresolvedReviewMarkers(t)).toEqual([]);
  });
});
