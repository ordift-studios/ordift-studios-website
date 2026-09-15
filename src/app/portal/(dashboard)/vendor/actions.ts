"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { requestVendorDocumentUploadAuthorization, recordVendorDocument } from "@/lib/vendors/vendorDocuments";

export type ActionState = { ok: boolean; error?: string } | null;

// Self-service upload — deliberately separate from the admin-side
// upload actions (admin/organization/vendors/[vendorId]/actions.ts).
// Neither action ever accepts a different vendorId/profileId from the
// form, matching this codebase's established "self-service action
// never takes someone else's id from the form" convention (e.g.
// acknowledgeOwnPolicyAction, recordOwnFounderEmploymentTermsAction);
// the underlying vendorDocuments.ts functions independently re-check
// actorUserId === vendorProfileId regardless.
//
// Vendor QA correction (2026-09-15) — split into two thin actions
// around the direct-to-Storage signed-URL flow, same reason as the
// admin-side actions: a file passed through a single Server Action's
// FormData silently failed against Next.js's default 1MB body limit.
// See vendorDocuments.ts's header comment on requestVendorDocumentUploadAuthorization().

export type RequestOwnVendorDocumentUploadResult = { ok: true; signedUrl: string; token: string; path: string } | { ok: false; error: string };

export async function requestOwnVendorDocumentUploadAction(params: { originalFilename: string }): Promise<RequestOwnVendorDocumentUploadResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not authorized." };
  if (!params.originalFilename) return { ok: false, error: "Missing file." };
  return requestVendorDocumentUploadAuthorization({ vendorProfileId: user.id, originalFilename: params.originalFilename, actorUserId: user.id });
}

export async function recordOwnVendorDocumentUploadAction(params: { storagePath: string; documentType: string; notes?: string | null }): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not authorized." };
  if (!params.storagePath || !params.documentType) return { ok: false, error: "Missing upload details." };

  const result = await recordVendorDocument({ vendorProfileId: user.id, storagePath: params.storagePath, documentType: params.documentType, notes: params.notes ?? null, actorUserId: user.id });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/portal/vendor");
  return { ok: true };
}
