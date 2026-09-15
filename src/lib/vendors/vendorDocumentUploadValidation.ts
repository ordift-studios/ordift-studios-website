// Vendor QA correction (2026-09-15) — pure, zero-DB-dependency helpers
// shared by the admin and self-service vendor document upload forms.
// Mirrors talentMediaUploadValidation.ts's established shape exactly:
// both constants MIRROR the vendor-documents Storage bucket's own
// configuration (migration 0122) rather than a second source of truth
// — they let the client check a selected file BEFORE spending a round
// trip requesting signed-upload authorization for something Storage
// would reject anyway. Storage itself remains the authority.

export const VENDOR_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024; // 10MB — matches the bucket's file_size_limit (10485760 bytes) exactly.

export const VENDOR_DOCUMENT_ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

export function isVendorDocumentMimeTypeAllowed(mimeType: string): boolean {
  return (VENDOR_DOCUMENT_ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
}

export type VendorDocumentFileValidationResult = { ok: true } | { ok: false; error: string };

export function validateVendorDocumentFile(file: { size: number; type: string }): VendorDocumentFileValidationResult {
  if (file.size > VENDOR_DOCUMENT_MAX_BYTES) {
    return { ok: false, error: "This file exceeds the 10MB upload limit. Please choose a smaller file." };
  }
  if (!isVendorDocumentMimeTypeAllowed(file.type)) {
    return { ok: false, error: "This file type is not supported. Please upload a PDF, JPEG, or PNG file." };
  }
  return { ok: true };
}

// Safe diagnostic fields only — see talentMediaUploadValidation.ts's
// identical comment on why @supabase/storage-js's StorageError shape
// never carries a signed URL, upload token, or raw Storage path here.
export type VendorDocumentUploadErrorDetails = { message?: string; status?: number; statusCode?: string };

export function describeVendorDocumentUploadError(error: VendorDocumentUploadErrorDetails): string {
  const message = (error.message ?? "").toLowerCase();
  if (error.status === 413 || /exceed|too large|maximum.*size/i.test(message)) {
    return "This file exceeds the 10MB upload limit. Please choose a smaller file.";
  }
  if (error.status === 415 || /mime|not supported|content.type/i.test(message)) {
    return "This file type is not supported. Please upload a PDF, JPEG, or PNG file.";
  }
  if (error.status === 401 || error.status === 403 || /expired|invalid.*token|unauthorized|jwt/i.test(message)) {
    return "Your upload authorization expired. Please try again.";
  }
  return "Upload failed. Please try again.";
}
