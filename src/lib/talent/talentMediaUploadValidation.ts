// Ordift Talent — Media upload validation + diagnostics (2026-09-09).
// Pure, zero-DB-dependency helpers shared by TalentMediaUpload.tsx
// (initial upload) and TalentMediaItemControls.tsx (Replace) —
// deliberately the one place both components' file-checking and
// error-translation logic lives, so the two stay identical rather than
// drifting.
//
// Both constants below MIRROR the existing talent-media Storage
// bucket's own configuration exactly (migration 0072) — they do not
// change or duplicate-as-a-second-source-of-truth the actual limit;
// they let the client check a selected file BEFORE spending a round
// trip requesting signed-upload authorization for something Storage
// would reject anyway. Storage itself remains the authority — these
// checks are a UX improvement, not a new enforcement boundary.
export const TALENT_MEDIA_MAX_BYTES = 25 * 1024 * 1024; // 25MB — matches the bucket's file_size_limit (26214400 bytes) exactly.

export const TALENT_MEDIA_ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "video/mp4"] as const;

export function isTalentMediaMimeTypeAllowed(mimeType: string): boolean {
  return (TALENT_MEDIA_ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
}

export type TalentMediaFileValidationResult = { ok: true } | { ok: false; error: string };

// Checked client-side, before ever calling requestTalentMediaUploadAction()
// — a specific, immediate message rather than a wasted round trip
// followed by a generic Storage-level rejection. Size is checked
// before type deliberately (an oversized file is the more common real
// case, per the actual Production failure this was written for).
export function validateTalentMediaFile(file: { size: number; type: string }): TalentMediaFileValidationResult {
  if (file.size > TALENT_MEDIA_MAX_BYTES) {
    return { ok: false, error: "This file exceeds the 25MB upload limit. Please choose a smaller file." };
  }
  if (!isTalentMediaMimeTypeAllowed(file.type)) {
    return { ok: false, error: "This file type is not supported. Please upload a JPEG, PNG, WebP, or MP4 file." };
  }
  return { ok: true };
}

// Safe diagnostic fields only. @supabase/storage-js's StorageError
// shape (confirmed by reading its type declarations before writing
// this) never carries a signed URL, upload token, or raw Storage path
// on `message`/`status`/`statusCode` — those live only in the request
// itself, never in the error object uploadToSignedUrl() returns. This
// type intentionally has no field for anything beyond these three.
export type TalentMediaUploadErrorDetails = { message?: string; status?: number; statusCode?: string };

// Translates a real uploadToSignedUrl() failure into a specific,
// friendly message where identifiable from these safe fields alone —
// otherwise a safe generic fallback. This is a backstop: with
// validateTalentMediaFile() now checked first, a genuine size/MIME
// rejection from Storage itself should be rare, but Storage remains
// the authority on its own limits (e.g. a config change mid-session),
// and other causes (an expired signed token, a network failure) can
// still occur here regardless of client-side validation.
export function describeTalentMediaUploadError(error: TalentMediaUploadErrorDetails, context: "upload" | "replace"): string {
  const message = (error.message ?? "").toLowerCase();
  const fallback =
    context === "replace"
      ? "Upload failed. The existing media was not changed. Please try again."
      : "Upload failed. Please try again.";

  if (error.status === 413 || /exceed|too large|maximum.*size/i.test(message)) {
    return "This file exceeds the 25MB upload limit. Please choose a smaller file.";
  }
  if (error.status === 415 || /mime|not supported|content.type/i.test(message)) {
    return "This file type is not supported. Please upload a JPEG, PNG, WebP, or MP4 file.";
  }
  if (error.status === 401 || error.status === 403 || /expired|invalid.*token|unauthorized|jwt/i.test(message)) {
    return "Your upload authorization expired. Please try again.";
  }
  return fallback;
}
