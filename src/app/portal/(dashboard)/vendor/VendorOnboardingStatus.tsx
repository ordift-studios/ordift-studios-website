"use client";

import { useState, useRef } from "react";
import type { StaffOnboarding } from "@/lib/organization/onboarding";
import type { ResolvedRequirement } from "@/lib/organization/onboardingRequirements";
import type { VendorDocument } from "@/lib/vendors/vendorDocuments";
import { createClient } from "@/lib/supabase/client";
import { validateVendorDocumentFile, describeVendorDocumentUploadError } from "@/lib/vendors/vendorDocumentUploadValidation";
import { requestOwnVendorDocumentUploadAction, recordOwnVendorDocumentUploadAction } from "./actions";

// Same bucket-name-as-a-local-constant convention as
// TalentMediaUpload.tsx/VendorDetailWorkspace.tsx's admin upload form.
const VENDOR_DOCUMENT_BUCKET = "vendor-documents";

const STAGE_LABELS: Record<string, string> = {
  proposed: "Proposed",
  approved: "Approved",
  invited: "Invited",
  profile: "Profile",
  payment_setup: "Payment Setup",
  engagement_assigned: "Engagement Assigned",
  active: "Active (onboarding complete)",
};

const STATUS_STYLES: Record<string, string> = {
  satisfied: "bg-green-100 text-green-800",
  waived: "bg-black/5 text-ordift-ink-muted",
  not_applicable: "bg-black/5 text-ordift-ink-muted",
  deferred: "bg-amber-100 text-amber-800",
  pending: "bg-red-50 text-red-700",
};

// Vendor QA correction (2026-09-15) — direct-to-Storage signed-URL
// upload; see VendorDetailWorkspace.tsx's admin-side UploadDocumentForm
// for the full rationale (same pattern, same reason).
function UploadForm() {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const documentTypeRef = useRef<HTMLInputElement>(null);

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    const file = fileInputRef.current?.files?.[0];
    const documentType = documentTypeRef.current?.value.trim() ?? "";
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    if (!documentType) {
      setError("A document type is required.");
      return;
    }
    const fileValidation = validateVendorDocumentFile(file);
    if (!fileValidation.ok) {
      setError(fileValidation.error);
      return;
    }

    setUploading(true);

    const authorization = await requestOwnVendorDocumentUploadAction({ originalFilename: file.name });
    if (!authorization.ok) {
      setError(authorization.error);
      setUploading(false);
      return;
    }

    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from(VENDOR_DOCUMENT_BUCKET)
      .uploadToSignedUrl(authorization.path, authorization.token, file, { contentType: file.type });
    if (uploadError) {
      console.error("[vendors] upload to storage failed", { message: uploadError.message, status: uploadError.status, statusCode: uploadError.statusCode });
      setError(describeVendorDocumentUploadError({ message: uploadError.message, status: uploadError.status, statusCode: uploadError.statusCode }));
      setUploading(false);
      return;
    }

    const recorded = await recordOwnVendorDocumentUploadAction({ storagePath: authorization.path, documentType });
    if (!recorded || !recorded.ok) {
      setError(recorded?.error ?? "Failed to save the document record.");
      setUploading(false);
      return;
    }

    setUploading(false);
    setSuccess(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (documentTypeRef.current) documentTypeRef.current.value = "";
  }

  return (
    <form onSubmit={handleUpload} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 font-sans text-caption text-ordift-ink-muted">
        Document type
        <input ref={documentTypeRef} name="documentType" required placeholder="e.g. company_registration" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      </label>
      <label className="flex flex-col gap-1 font-sans text-caption text-ordift-ink-muted">
        File
        <input ref={fileInputRef} name="file" type="file" required className="font-sans text-body-small" />
      </label>
      <button type="submit" disabled={uploading} className="font-sans text-caption font-semibold px-3 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {uploading ? "Uploading…" : "Upload"}
      </button>
      {success && <p className="font-sans text-caption text-green-700 w-full">Uploaded.</p>}
      {error && <p className="font-sans text-caption text-red-700 w-full">{error}</p>}
    </form>
  );
}

export function VendorOnboardingStatus({
  onboarding,
  resolvedRequirements,
  documents,
}: {
  vendorId: string;
  onboarding: StaffOnboarding | null;
  resolvedRequirements: ResolvedRequirement[];
  documents: VendorDocument[];
}) {
  if (!onboarding) {
    return (
      <section className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-2">Onboarding</h2>
        <p className="font-sans text-body-small text-ordift-ink-muted">
          Onboarding has not started yet. Ordift Studios will begin this once your engagement is confirmed.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
      <h2 className="font-serif font-medium text-body text-ordift-ink">Onboarding</h2>
      <p className="font-sans text-body-small text-ordift-ink">
        Stage: <strong>{STAGE_LABELS[onboarding.stage] ?? onboarding.stage}</strong>
      </p>

      {resolvedRequirements.length > 0 && (
        <ul className="space-y-2">
          {resolvedRequirements.map((r) => (
            <li key={r.requirementKey} className="flex items-center justify-between gap-2 rounded-lg border border-black/10 p-3">
              <span className="font-sans text-body-small text-ordift-ink">{r.label}</span>
              <span className={`px-2 py-0.5 rounded-full font-sans text-caption whitespace-nowrap ${STATUS_STYLES[r.status] ?? "bg-black/5"}`}>
                {r.status.replace(/_/g, " ")}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div>
        <h3 className="font-sans text-body-small font-semibold text-ordift-ink mb-2">Documents</h3>
        <UploadForm />
        {documents.length > 0 && (
          <ul className="space-y-1 mt-3">
            {documents.map((d) => (
              <li key={d.id} className="font-sans text-caption text-ordift-ink-muted">
                {d.documentType} — {d.status.replace(/_/g, " ")} (uploaded {new Date(d.uploadedAt).toLocaleDateString()})
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
