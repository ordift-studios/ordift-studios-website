import { describe, expect, it } from "vitest";
import {
  TALENT_MEDIA_MAX_BYTES,
  TALENT_MEDIA_ALLOWED_MIME_TYPES,
  isTalentMediaMimeTypeAllowed,
  validateTalentMediaFile,
  describeTalentMediaUploadError,
} from "./talentMediaUploadValidation";

// Talent Media upload diagnostics + validation (2026-09-09) — real,
// executable tests (this module is pure, no DB/React dependency).
// Written after a genuine Production Replace failure whose exact
// Storage-level cause was undiagnosable because the client discarded
// uploadError entirely — these tests exist specifically to prove the
// fix for that gap.

describe("TALENT_MEDIA_MAX_BYTES / TALENT_MEDIA_ALLOWED_MIME_TYPES", () => {
  it("matches the existing talent-media bucket's own configuration exactly — 25MB, four types", () => {
    expect(TALENT_MEDIA_MAX_BYTES).toBe(26214400); // 25 * 1024 * 1024, same as migration 0072's file_size_limit
    expect(TALENT_MEDIA_ALLOWED_MIME_TYPES).toEqual(["image/jpeg", "image/png", "image/webp", "video/mp4"]);
  });
});

describe("isTalentMediaMimeTypeAllowed", () => {
  it("accepts every allowed type", () => {
    for (const t of TALENT_MEDIA_ALLOWED_MIME_TYPES) expect(isTalentMediaMimeTypeAllowed(t)).toBe(true);
  });
  it("rejects an unsupported type", () => {
    expect(isTalentMediaMimeTypeAllowed("application/pdf")).toBe(false);
    expect(isTalentMediaMimeTypeAllowed("")).toBe(false);
  });
});

describe("validateTalentMediaFile", () => {
  it("rejects a file over 25MB with the exact specified message", () => {
    const result = validateTalentMediaFile({ size: TALENT_MEDIA_MAX_BYTES + 1, type: "image/jpeg" });
    expect(result).toEqual({ ok: false, error: "This file exceeds the 25MB upload limit. Please choose a smaller file." });
  });

  it("rejects an unsupported MIME type with the exact specified message", () => {
    const result = validateTalentMediaFile({ size: 1024, type: "application/pdf" });
    expect(result).toEqual({ ok: false, error: "This file type is not supported. Please upload a JPEG, PNG, WebP, or MP4 file." });
  });

  it("checks size before type — an oversized, wrong-type file still gets the size message", () => {
    const result = validateTalentMediaFile({ size: TALENT_MEDIA_MAX_BYTES + 1, type: "application/pdf" });
    expect(result).toEqual({ ok: false, error: "This file exceeds the 25MB upload limit. Please choose a smaller file." });
  });

  it("accepts a file exactly at the 25MB boundary", () => {
    expect(validateTalentMediaFile({ size: TALENT_MEDIA_MAX_BYTES, type: "image/png" })).toEqual({ ok: true });
  });

  it("accepts every allowed type under the size limit", () => {
    for (const t of TALENT_MEDIA_ALLOWED_MIME_TYPES) {
      expect(validateTalentMediaFile({ size: 1024, type: t })).toEqual({ ok: true });
    }
  });
});

describe("describeTalentMediaUploadError", () => {
  it("identifies a size-limit-shaped Storage error from status", () => {
    expect(describeTalentMediaUploadError({ status: 413 }, "upload")).toBe("This file exceeds the 25MB upload limit. Please choose a smaller file.");
  });
  it("identifies a size-limit-shaped Storage error from message text alone", () => {
    expect(describeTalentMediaUploadError({ message: "The object exceeded the maximum allowed size" }, "replace")).toBe(
      "This file exceeds the 25MB upload limit. Please choose a smaller file."
    );
  });

  it("identifies a MIME-type-shaped Storage error", () => {
    expect(describeTalentMediaUploadError({ status: 415 }, "upload")).toBe("This file type is not supported. Please upload a JPEG, PNG, WebP, or MP4 file.");
    expect(describeTalentMediaUploadError({ message: "mime type text/plain is not supported" }, "upload")).toBe(
      "This file type is not supported. Please upload a JPEG, PNG, WebP, or MP4 file."
    );
  });

  it("identifies an expired/invalid-authorization-shaped Storage error", () => {
    expect(describeTalentMediaUploadError({ status: 401 }, "upload")).toBe("Your upload authorization expired. Please try again.");
    expect(describeTalentMediaUploadError({ status: 403 }, "replace")).toBe("Your upload authorization expired. Please try again.");
    expect(describeTalentMediaUploadError({ message: "JWT expired" }, "upload")).toBe("Your upload authorization expired. Please try again.");
  });

  it("falls back to a safe generic message, worded per context, for an unidentifiable error", () => {
    expect(describeTalentMediaUploadError({ message: "network request failed" }, "upload")).toBe("Upload failed. Please try again.");
    expect(describeTalentMediaUploadError({}, "replace")).toBe("Upload failed. The existing media was not changed. Please try again.");
  });

  it("never echoes the raw error message into the returned string — every possible output is one of the fixed, pre-written safe messages", () => {
    const possibleOutputs = new Set([
      "This file exceeds the 25MB upload limit. Please choose a smaller file.",
      "This file type is not supported. Please upload a JPEG, PNG, WebP, or MP4 file.",
      "Your upload authorization expired. Please try again.",
      "Upload failed. Please try again.",
      "Upload failed. The existing media was not changed. Please try again.",
    ]);
    const sensitiveShapedInputs = [
      { message: "https://xyz.supabase.co/storage/v1/object/upload/sign/talent-media/abc?token=eyJhbGciOi..." },
      { message: "signed url rejected", statusCode: "SomeInternalCode" },
    ];
    for (const input of sensitiveShapedInputs) {
      const output = describeTalentMediaUploadError(input, "upload");
      expect(possibleOutputs.has(output)).toBe(true);
      expect(output).not.toContain("http");
      expect(output).not.toContain("token");
    }
  });
});
