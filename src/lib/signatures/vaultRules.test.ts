import { describe, expect, it } from "vitest";
import { APPROVAL_MAX_HOURS, detectSignatureImage, isSha256Hex, validateApprovalInput, type ApprovalInput } from "./vaultRules";

const ok: ApprovalInput = { assetId: "a1", documentKind: "agreement", documentReference: "REF-1", documentSha256: "a".repeat(64), purpose: "Sign the framework agreement", recipient: "counterparty", placement: "last page, left", action: "apply once" };

describe("signature image detection", () => {
  it("recognises PNG and JPEG by their bytes, refuses everything else, empty and oversize", () => {
    expect(detectSignatureImage(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]))).toMatchObject({ ok: true, mime: "image/png" });
    expect(detectSignatureImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1]))).toMatchObject({ ok: true, mime: "image/jpeg" });
    expect(detectSignatureImage(Uint8Array.from([0x25, 0x50, 0x44, 0x46])).ok).toBe(false); // a PDF
    expect(detectSignatureImage(new Uint8Array(0)).ok).toBe(false);
    expect(detectSignatureImage(new Uint8Array(5 * 1024 * 1024 + 1)).ok).toBe(false);
  });
});

describe("approval input", () => {
  it("accepts a complete approval, normalises the hash and defaults only the lifetime", () => {
    const v = validateApprovalInput({ ...ok, documentSha256: "A".repeat(64) });
    expect(v.ok && v.value.documentSha256).toBe("a".repeat(64));
    expect(v.ok && v.value.hours).toBe(24);
  });
  it.each([
    ["short hash", { documentSha256: "abc" }], ["non-hex hash", { documentSha256: "g".repeat(64) }], ["no asset", { assetId: " " }], ["unknown kind", { documentKind: "poem" }],
    ["no reference", { documentReference: "" }], ["vague purpose", { purpose: "sign" }], ["no recipient", { recipient: "" }], ["no placement", { placement: "" }], ["no action", { action: "" }],
    ["too long a lifetime", { hours: APPROVAL_MAX_HOURS + 1 }], ["zero lifetime", { hours: 0 }], ["NaN lifetime", { hours: Number.NaN }],
  ])("rejects %s", (_n, bad) => { expect(validateApprovalInput({ ...ok, ...bad }).ok).toBe(false); });
  it("the hash check is exact", () => { expect(isSha256Hex("a".repeat(64))).toBe(true); expect(isSha256Hex("a".repeat(63))).toBe(false); expect(isSha256Hex("A".repeat(64))).toBe(false); });
});
