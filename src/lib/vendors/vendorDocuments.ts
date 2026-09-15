import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { canManageOnboarding } from "@/lib/organization/onboarding";

// Vendor Completion Phase (2026-09-15) — against public.vendor_documents
// (migration 0122). Shape and authorization pattern deliberately copy
// legalEntities.ts's addEmployingEntityDocument()/
// listEmployingEntityDocuments()/getEmployingEntityDocumentSignedUrl(),
// the established precedent for "restricted evidence file + private
// Storage bucket + signed URL" in this codebase — extended here with
// review status/reviewer/expiry/supersession (the legal_document_versions
// shape) since vendor evidence genuinely needs a review lifecycle that
// legal-entity documents don't.
//
// Deliberately NOT reused from src/lib/payables/projectFiles.ts —
// that module's ownership/relationship semantics (engagement-scoped
// deliverable work product, gated by modulesForRelationship().files,
// which is explicitly FALSE for vendor) are the wrong shape for
// onboarding evidence owned directly by the vendor's profile, not by
// an engagement.
//
// Dual-actor authorization throughout: the admin client bypasses RLS
// entirely (as it does everywhere in this codebase), so this
// application-layer check — staff/admin (canManageOnboarding), OR the
// vendor acting on their own profile — is the real enforcement point,
// matching the same "createAdminClient() bypasses RLS" discipline
// already documented on legalEntities.ts's restricted reads.

const DOCUMENT_BUCKET = "vendor-documents";
const SIGNED_URL_TTL_SECONDS = 300;

async function canAccessVendorDocuments(vendorProfileId: string, actorUserId: string): Promise<boolean> {
  if (actorUserId === vendorProfileId) return true;
  return canManageOnboarding(actorUserId);
}

export type VendorDocument = {
  id: string;
  vendorProfileId: string;
  documentType: string;
  notes: string | null;
  status: string;
  uploadedBy: string;
  uploadedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  expiresAt: string | null;
  supersedesId: string | null;
};

const SELECT = "id, vendor_profile_id, document_type, notes, status, uploaded_by, uploaded_at, reviewed_by, reviewed_at, expires_at, supersedes_id";

function mapRow(r: {
  id: string;
  vendor_profile_id: string;
  document_type: string;
  notes: string | null;
  status: string;
  uploaded_by: string;
  uploaded_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  expires_at: string | null;
  supersedes_id: string | null;
}): VendorDocument {
  return {
    id: r.id,
    vendorProfileId: r.vendor_profile_id,
    documentType: r.document_type,
    notes: r.notes,
    status: r.status,
    uploadedBy: r.uploaded_by,
    uploadedAt: r.uploaded_at,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
    expiresAt: r.expires_at,
    supersedesId: r.supersedes_id,
  };
}

export async function listVendorDocuments(vendorProfileId: string, actorUserId: string): Promise<VendorDocument[]> {
  if (!(await canAccessVendorDocuments(vendorProfileId, actorUserId))) return [];
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("vendor_documents")
    .select(SELECT)
    .eq("vendor_profile_id", vendorProfileId)
    .order("uploaded_at", { ascending: false });
  if (error) {
    console.error("[vendors] failed to load vendor_documents", error.message);
    return [];
  }
  return (data ?? []).map(mapRow);
}

export async function uploadVendorDocument(params: {
  vendorProfileId: string;
  documentType: string;
  file: File;
  notes?: string | null;
  expiresAt?: string | null;
  supersedesId?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; documentId: string } | { ok: false; error: string }> {
  if (!(await canAccessVendorDocuments(params.vendorProfileId, params.actorUserId))) {
    return { ok: false, error: "Not authorized to upload a document for this vendor." };
  }
  const documentType = params.documentType.trim();
  if (!documentType) return { ok: false, error: "A document type is required." };

  const admin = createAdminClient();
  const path = `${params.vendorProfileId}/${crypto.randomUUID()}-${params.file.name}`;
  const buffer = Buffer.from(await params.file.arrayBuffer());
  const { error: uploadError } = await admin.storage.from(DOCUMENT_BUCKET).upload(path, buffer, { contentType: params.file.type });
  if (uploadError) {
    console.error("[vendors] failed to upload vendor document", uploadError.message);
    return { ok: false, error: "Failed to upload the file." };
  }

  const { data, error } = await admin
    .from("vendor_documents")
    .insert({
      vendor_profile_id: params.vendorProfileId,
      document_type: documentType,
      storage_path: path,
      notes: params.notes ?? null,
      expires_at: params.expiresAt ?? null,
      supersedes_id: params.supersedesId ?? null,
      uploaded_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "File uploaded but the document record failed to save." };

  await logActivity({
    actorUserId: params.actorUserId,
    action: "vendor_document.uploaded",
    entityType: "user",
    entityId: params.vendorProfileId,
    metadata: { documentId: data.id, documentType, supersedesId: params.supersedesId ?? null },
  });

  return { ok: true, documentId: data.id };
}

export async function getVendorDocumentSignedUrl(documentId: string, actorUserId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: row } = await admin.from("vendor_documents").select("vendor_profile_id, storage_path").eq("id", documentId).maybeSingle();
  if (!row) return null;
  if (!(await canAccessVendorDocuments(row.vendor_profile_id, actorUserId))) return null;

  const { data, error } = await admin.storage.from(DOCUMENT_BUCKET).createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;

  await logActivity({
    actorUserId,
    action: "vendor_document.viewed",
    entityType: "user",
    entityId: row.vendor_profile_id,
    metadata: { documentId },
  });
  return data.signedUrl;
}

// Staff/admin-only — a vendor must never be able to mark their own
// evidence "approved" (also enforced independently by the
// vendor_documents RLS update policy; this is the app-layer boundary
// since createAdminClient() bypasses that RLS).
export async function reviewVendorDocument(params: {
  documentId: string;
  status: "approved" | "rejected";
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageOnboarding(params.actorUserId))) {
    return { ok: false, error: "Not authorized to review vendor documents." };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin.from("vendor_documents").select("vendor_profile_id").eq("id", params.documentId).maybeSingle();
  if (!existing) return { ok: false, error: "Document not found." };

  const now = new Date().toISOString();
  const { error } = await admin
    .from("vendor_documents")
    .update({ status: params.status, reviewed_by: params.actorUserId, reviewed_at: now })
    .eq("id", params.documentId);
  if (error) {
    console.error("[vendors] failed to review vendor_document", error.message);
    return { ok: false, error: "Failed to record the review." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "vendor_document.reviewed",
    entityType: "user",
    entityId: existing.vendor_profile_id,
    metadata: { documentId: params.documentId, status: params.status },
  });

  return { ok: true };
}
