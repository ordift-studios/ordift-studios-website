import { describe, expect, it } from "vitest";
import {
  VENDOR_DOCUMENT_MAX_BYTES,
  VENDOR_DOCUMENT_ALLOWED_MIME_TYPES,
  isVendorDocumentMimeTypeAllowed,
  validateVendorDocumentFile,
  describeVendorDocumentUploadError,
} from "./vendorDocumentUploadValidation";

// Vendor QA correction (2026-09-15). Pure, zero-DB-dependency — real
// executed assertions, matching this codebase's convention for pure
// functions (see talentMediaUploadValidation's own precedent).

describe("validateVendorDocumentFile — pure, real assertions", () => {
  it("accepts a real-sized PDF within the 10MB bucket limit", () => {
    expect(validateVendorDocumentFile({ size: 2 * 1024 * 1024, type: "application/pdf" })).toEqual({ ok: true });
  });

  it("rejects a file exceeding VENDOR_DOCUMENT_MAX_BYTES with a specific message, checked before MIME type", () => {
    const result = validateVendorDocumentFile({ size: VENDOR_DOCUMENT_MAX_BYTES + 1, type: "not/allowed" });
    expect(result).toEqual({ ok: false, error: "This file exceeds the 10MB upload limit. Please choose a smaller file." });
  });

  it("rejects a disallowed MIME type with a specific message", () => {
    const result = validateVendorDocumentFile({ size: 1024, type: "application/zip" });
    expect(result).toEqual({ ok: false, error: "This file type is not supported. Please upload a PDF, JPEG, or PNG file." });
  });

  it("VENDOR_DOCUMENT_ALLOWED_MIME_TYPES matches the vendor-documents Storage bucket's own configuration exactly (migration 0122)", () => {
    expect(VENDOR_DOCUMENT_ALLOWED_MIME_TYPES).toEqual(["application/pdf", "image/jpeg", "image/png"]);
    for (const type of VENDOR_DOCUMENT_ALLOWED_MIME_TYPES) {
      expect(isVendorDocumentMimeTypeAllowed(type)).toBe(true);
    }
    expect(isVendorDocumentMimeTypeAllowed("video/mp4")).toBe(false);
  });
});

describe("describeVendorDocumentUploadError — pure, real assertions", () => {
  it("translates a 413/size-exceeded error to the specific size message", () => {
    expect(describeVendorDocumentUploadError({ status: 413 })).toBe("This file exceeds the 10MB upload limit. Please choose a smaller file.");
    expect(describeVendorDocumentUploadError({ message: "Maximum file size exceeded" })).toBe("This file exceeds the 10MB upload limit. Please choose a smaller file.");
  });

  it("translates a 415/MIME error to the specific type message", () => {
    expect(describeVendorDocumentUploadError({ status: 415 })).toBe("This file type is not supported. Please upload a PDF, JPEG, or PNG file.");
  });

  it("translates a 401/403/expired-token error to an authorization-expired message", () => {
    expect(describeVendorDocumentUploadError({ status: 401 })).toBe("Your upload authorization expired. Please try again.");
    expect(describeVendorDocumentUploadError({ message: "JWT expired" })).toBe("Your upload authorization expired. Please try again.");
  });

  it("falls back to a generic message for an unrecognized error", () => {
    expect(describeVendorDocumentUploadError({ message: "network failure" })).toBe("Upload failed. Please try again.");
  });
});
